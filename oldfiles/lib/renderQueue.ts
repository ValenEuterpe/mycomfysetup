/**
 * The render queue.
 *
 * Why this exists: /api/generate used to post straight to ComfyUI, which accepts
 * everything instantly and then renders one job at a time. With more than one
 * user that meant a pile of jobs on one GPU and a UI stuck on "rendering on the
 * GPU" with no hint that anything was ahead of you. Now a request becomes a row
 * here first, and only reaches ComfyUI when a slot is free.
 *
 * How it drains without a daemon: Vercel has no long-running process, so nothing
 * can sit and wait for the GPU. Instead every authenticated request pumps the
 * queue once — status polls, job listings, session checks. Whoever is on the site
 * moves the queue along, for everyone. The claim is atomic (`for update skip
 * locked`), so simultaneous pumps can't dispatch the same job or exceed the
 * concurrency cap.
 *
 * The consequence worth knowing: with nobody on the site at all, nothing
 * dispatches. Rows persist and resume the moment anyone shows up, which is the
 * behaviour we want — jobs survive closing the tab. `reapStale` puts an outer
 * bound on it so a row abandoned for a day doesn't surface later and render.
 *
 * Server-side only: this reaches Supabase with the service-role key and ComfyUI
 * with COMFY_URL.
 *
 * One precondition, enforced by the callers: every row's `user_id` is a real
 * `app_users` uuid. The owner-sentinel and demo-mode users have no uuid and no
 * profile row, so they can't be queued — `/api/generate` dispatches directly for
 * them, which is exactly what the app did before this queue existed. That
 * invariant is why the refund below can always be applied without checking
 * whether the user has a counter to refund.
 */

import { extractVideoFile, getComfyQueue, getHistory, queuePrompt } from "@/lib/comfy";
import { isSupabaseConfigured, supabaseInsert, supabasePatch, supabaseRpc, supabaseSelect } from "@/lib/supabase";
import { buildI2VWorkflow, buildT2IWorkflow, buildT2VWorkflow } from "@/lib/workflows";
import { refundGeneration } from "@/lib/quota";

const TABLE = "aieditor_render_queue";

/**
 * Whether renders are queued at all.
 *
 * The queue is a database table, so without Supabase there is nowhere to put a
 * job. Rather than refusing to render, the app falls back to dispatching straight
 * to ComfyUI — which is exactly what it did before this queue existed.
 *
 * That keeps AUTH_DEMO_MODE (documented as the local UI-work escape hatch, and
 * explicitly database-free) working, and follows the rule the rest of this app
 * already holds to: an unmigrated or unreachable database degrades a feature, it
 * does not stop the studio rendering. See the notes in lib/promptLog.ts and
 * lib/auth.ts.
 *
 * What is lost on that path: the concurrency cap, queue positions, resume across
 * refresh, and history. All of which need somewhere to persist a row. It is a
 * local-development path, not a deployment one.
 */
export function queueEnabled(): boolean {
  return isSupabaseConfigured();
}

export type RenderStatus = "queued" | "dispatched" | "done" | "error" | "cancelled";

export type RenderRow = {
  id: string;
  user_id: string;
  status: RenderStatus;
  prompt: string | null;
  negative_prompt?: string | null;
  pruned: boolean;
  type: string;
  aspect_ratio: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  fast: boolean;
  image_filename: string | null;
  workflow_params?: WorkflowParams | null;
  comfy_prompt_id: string | null;
  video_filename: string | null;
  video_subfolder: string | null;
  video_type: string | null;
  error: string | null;
  /**
   * Why the last dispatch attempt failed. Unlike `error` this is not terminal and
   * survives a requeue, so a job that bounced twice before succeeding still says
   * so. Added in 005; null on rows written before it.
   */
  last_error: string | null;
  attempts: number;
  created_at: string;
  dispatched_at: string | null;
  requeued_at: string | null;
  finished_at: string | null;
};

export type WorkflowParams = {
  model?: "anima" | "basb" | string;
  seed?: number;
  steps?: number;
  cfg?: number;
  samplerName?: string;
  scheduler?: string;
  denoise?: number;
};

const ROW_SELECT =
  "id,user_id,status,prompt,negative_prompt,pruned,type,aspect_ratio,width,height,duration_seconds,fast," +
  "image_filename,workflow_params,comfy_prompt_id,video_filename,video_subfolder,video_type,error,last_error," +
  "attempts,created_at,dispatched_at,requeued_at,finished_at";

/**
 * How many renders may be on the GPU at once. One card, one render — raising this
 * past what the hardware can actually hold concurrently just recreates the
 * problem the queue was built to solve.
 */
export function maxConcurrent(): number {
  const raw = Number(process.env.MAX_CONCURRENT_RENDERS);
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
}

/**
 * A dispatched job with no result after this long is treated as lost.
 *
 * ComfyUI serves /history from an in-memory dict, so if it restarts mid-render
 * the prompt id simply disappears and the status poll would otherwise spin
 * forever. This is the ceiling that turns that into an error the UI can show.
 * Generous, because a 15s render at 20 steps on a busy card is genuinely slow.
 *
 * Since 005 this is only the last resort — `reconcileInFlight` catches the common
 * cases in about a minute by asking ComfyUI what it actually has.
 */
const DISPATCH_TIMEOUT_MS = 45 * 60 * 1000;

/**
 * How long a row may sit `dispatched` with no ComfyUI id before we conclude it
 * never got there.
 *
 * The window between claiming a row and writing its `comfy_prompt_id` is two
 * network calls wide. A serverless function killed inside it leaves a row that is
 * in-flight as far as the cap is concerned and unknown to the GPU — which, at a
 * concurrency of one, wedges the entire queue. Long enough that a slow but
 * healthy dispatch isn't yanked out from under itself.
 */
const UNIDENTIFIED_DISPATCH_MS = 90 * 1000;

/**
 * Grace period before a dispatched row is checked against ComfyUI's live queue.
 *
 * ComfyUI needs a moment after accepting a prompt before it appears in /queue, so
 * checking immediately would see a legitimate job as missing and requeue it into
 * a loop.
 */
const COMFY_VERIFY_GRACE_MS = 60 * 1000;

/** A queued row nobody ever came back for. Bounded so it can't dispatch days later. */
const QUEUED_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** Dispatch attempts before a job is failed rather than returned to the queue. */
const MAX_ATTEMPTS = 3;

/**
 * Marks a job id as a raw ComfyUI prompt id rather than a queue row id.
 *
 * Only ever seen on the no-database path, where there is no row to key on. A
 * uuid can't collide with it, so /api/status can tell the two apart from the id
 * alone.
 */
export const DIRECT_PREFIX = "direct:";

export function isDirectId(id: string): boolean {
  return id.startsWith(DIRECT_PREFIX);
}

export function directPromptId(id: string): string {
  return id.slice(DIRECT_PREFIX.length);
}

// --- Enqueue --------------------------------------------------------------

export type EnqueueInput = {
  userId: string;
  prompt: string;
  negativePrompt?: string;
  type: "t2v" | "i2v" | "t2i" | "film";
  /** Display label — a preset, or `auto (928x448)`. */
  aspectRatio: string;
  width: number;
  height: number;
  durationSeconds: number | null;
  fast: boolean;
  imageFilename?: string;
  workflowParams?: WorkflowParams;
};

/** Longest prompt stored. Beyond this it's truncated, not rejected. */
const MAX_PROMPT_CHARS = 4000;

/**
 * Accept a render. Nothing is sent anywhere — the row is the acceptance.
 *
 * Throws on failure, unlike most of this module: the user is waiting on this
 * request and a queue we couldn't write to means their job does not exist. That
 * has to surface, not be swallowed.
 */
export async function enqueueRender(input: EnqueueInput): Promise<RenderRow> {
  const payload: Record<string, any> = {
    user_id: input.userId,
    status: "queued",
    prompt: input.prompt.slice(0, MAX_PROMPT_CHARS),
    negative_prompt: input.negativePrompt ? input.negativePrompt.slice(0, MAX_PROMPT_CHARS) : null,
    type: input.type,
    aspect_ratio: input.aspectRatio,
    width: input.width,
    height: input.height,
    duration_seconds: input.durationSeconds,
    fast: input.fast,
    image_filename: input.imageFilename ?? null,
  };
  if (input.workflowParams) {
    payload.workflow_params = input.workflowParams;
  }

  let rows: RenderRow[] | null;
  try {
    rows = await supabaseInsert<RenderRow[]>(`${TABLE}?select=${ROW_SELECT}`, payload);
  } catch (err) {
    // If workflow_params column does not exist yet on an unmigrated database, retry without it
    if (payload.workflow_params) {
      delete payload.workflow_params;
      const fallbackSelect = ROW_SELECT.replace(",workflow_params", "");
      rows = await supabaseInsert<RenderRow[]>(`${TABLE}?select=${fallbackSelect}`, payload);
    } else {
      throw err;
    }
  }

  const row = rows?.[0];
  if (!row) throw new Error("Couldn't add your render to the queue.");
  return row;
}

// --- Reads ----------------------------------------------------------------

/**
 * One row by id. Returns null when it doesn't exist *or* isn't this user's —
 * callers get no way to tell those apart, so a guessed id leaks nothing.
 */
export async function getRenderForUser(id: string, userId: string): Promise<RenderRow | null> {
  try {
    const rows = await supabaseSelect<RenderRow[]>(
      `${TABLE}?select=${ROW_SELECT}` +
        `&id=eq.${encodeURIComponent(id)}` +
        `&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    );
    return rows?.[0] ?? null;
  } catch (err) {
    console.error("[renderQueue] row lookup failed (has 004 been run?):", err);
    return null;
  }
}

/**
 * This user's unfinished jobs, oldest first — what a page needs on mount to pick
 * up where it left off after a refresh or a closed tab.
 */
export async function listActiveRenders(userId: string): Promise<RenderRow[] | null> {
  try {
    return (await supabaseSelect<RenderRow[]>(
      `${TABLE}?select=${ROW_SELECT}` +
        `&user_id=eq.${encodeURIComponent(userId)}` +
        `&status=in.(queued,dispatched)&order=created_at.asc`,
    )) ?? [];
  } catch (err) {
    console.error("[renderQueue] active list failed (has 004 been run?):", err);
    return null;
  }
}

/** Newest first, and capped — a heavy user shouldn't be able to blow up a page. */
export const HISTORY_LIMIT = 200;

/** This user's renders, newest first, for their own history page and for /admin. */
export async function listRenders(
  userId: string,
  limit: number = HISTORY_LIMIT,
): Promise<RenderRow[] | null> {
  try {
    return (
      (await supabaseSelect<RenderRow[]>(
        `${TABLE}?select=${ROW_SELECT}` +
          `&user_id=eq.${encodeURIComponent(userId)}` +
          `&order=created_at.desc&limit=${limit}`,
      )) ?? []
    );
  } catch (err) {
    console.error("[renderQueue] history list failed (has 004 been run?):", err);
    return null;
  }
}

export async function pruneUserPrompts(userId: string): Promise<number> {
  if (!queueEnabled()) return 0;
  try {
    const updated = await supabasePatch<RenderRow[]>(
      `${TABLE}?user_id=eq.${encodeURIComponent(userId)}&pruned=eq.false&select=id`,
      { prompt: null, negative_prompt: null, pruned: true },
    );
    return updated?.length ?? 0;
  } catch (err) {
    console.error("[renderQueue] pruneUserPrompts failed:", err);
    return 0;
  }
}

export type QueuePosition = { ahead: number; total: number };

/**
 * Where a queued job stands. `ahead` counts only waiting jobs, so a render
 * already on the GPU isn't "ahead" of you — it's in progress. The UI shows
 * `ahead + 1` of `total`.
 */
export async function queuePosition(id: string): Promise<QueuePosition | null> {
  try {
    const rows = await supabaseRpc<QueuePosition[]>("aieditor_queue_position", { p_id: id });
    return rows?.[0] ?? null;
  } catch (err) {
    console.error("[renderQueue] position lookup failed:", err);
    return null;
  }
}

// --- Writes ---------------------------------------------------------------

async function patchRow(id: string, patch: Record<string, unknown>): Promise<RenderRow | null> {
  try {
    const rows = await supabasePatch<RenderRow[]>(
      `${TABLE}?id=eq.${encodeURIComponent(id)}&select=${ROW_SELECT}`,
      patch,
    );
    return rows?.[0] ?? null;
  } catch (err) {
    console.error("[renderQueue] update failed:", err);
    return null;
  }
}

/**
 * Fail a job, and give the render back.
 *
 * The refund is the reason this is one function rather than a status write at
 * each call site: charging happens at enqueue, so every terminal failure owes
 * the user their allowance back, and it must not be possible to add a failure
 * path that forgets.
 *
 * The refund is unconditional. A sentinel id (owner, demo) matches no profile
 * row, so the underlying update is a no-op for exactly the users who have no
 * counter — no caller has to know which kind of user it is holding.
 */
export async function failRender(id: string, message: string, userId: string): Promise<RenderRow | null> {
  const row = await patchRow(id, {
    status: "error",
    error: message.slice(0, 500),
    finished_at: new Date().toISOString(),
  });

  await refundGeneration(userId);
  return row;
}

/** Record a finished render and where its video lives. */
async function completeRender(
  id: string,
  file: { filename: string; subfolder: string; type: string },
): Promise<RenderRow | null> {
  return patchRow(id, {
    status: "done",
    video_filename: file.filename,
    video_subfolder: file.subfolder,
    video_type: file.type,
    finished_at: new Date().toISOString(),
  });
}

/**
 * Withdraw a job that hasn't been sent yet, and refund it.
 *
 * Filtered on `status=eq.queued`, so this is a no-op the instant a job reaches
 * the GPU — there is no way to cancel a render that is already burning time. A
 * null return therefore means "too late", not "failed".
 */
export async function cancelRender(id: string, userId: string): Promise<RenderRow | null> {
  try {
    const rows = await supabasePatch<RenderRow[]>(
      `${TABLE}?id=eq.${encodeURIComponent(id)}` +
        `&user_id=eq.${encodeURIComponent(userId)}` +
        `&status=eq.queued&select=${ROW_SELECT}`,
      { status: "cancelled", finished_at: new Date().toISOString() },
    );
    const row = rows?.[0] ?? null;
    if (row) await refundGeneration(userId);
    return row;
  } catch (err) {
    console.error("[renderQueue] cancel failed:", err);
    return null;
  }
}

// --- Dispatch -------------------------------------------------------------

/** Rebuild the ComfyUI workflow from the stored row. */
function workflowFor(row: RenderRow) {
  if (!row.width || !row.height) {
    throw new Error("Queue row is missing its output geometry.");
  }

  const dimensions = { width: row.width, height: row.height };

  if (row.type === "t2i") {
    return buildT2IWorkflow({
      prompt: row.prompt ?? "",
      negativePrompt: row.negative_prompt ?? undefined,
      dimensions,
      model: row.workflow_params?.model,
      seed: row.workflow_params?.seed,
      steps: row.workflow_params?.steps,
      cfg: row.workflow_params?.cfg,
      samplerName: row.workflow_params?.samplerName,
      scheduler: row.workflow_params?.scheduler,
      denoise: row.workflow_params?.denoise,
    });
  }

  if (!row.duration_seconds) {
    throw new Error("Queue row is missing its output geometry.");
  }

  const common = {
    prompt: row.prompt ?? "",
    dimensions,
    durationSeconds: row.duration_seconds,
    fast: row.fast,
  };

  if (row.type === "i2v") {
    if (!row.image_filename) throw new Error("Queue row is missing its source image.");
    return buildI2VWorkflow({ ...common, imageFilename: row.image_filename });
  }
  return buildT2VWorkflow(common);
}

/**
 * Send a render to ComfyUI immediately, bypassing the queue.
 *
 * Only for the no-database path — see `queueEnabled`. Returns ComfyUI's prompt
 * id, which the caller uses in place of a queue row id. Throws, because the user
 * is waiting on it.
 */
export async function dispatchDirect(input: EnqueueInput): Promise<string> {
  const dimensions = { width: input.width, height: input.height };

  let workflow: Record<string, any>;
  if (input.type === "t2i") {
    workflow = buildT2IWorkflow({
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      dimensions,
      model: input.workflowParams?.model,
      seed: input.workflowParams?.seed,
      steps: input.workflowParams?.steps,
      cfg: input.workflowParams?.cfg,
      samplerName: input.workflowParams?.samplerName,
      scheduler: input.workflowParams?.scheduler,
      denoise: input.workflowParams?.denoise,
    });
  } else if (input.type === "i2v") {
    workflow = buildI2VWorkflow({
      prompt: input.prompt,
      dimensions,
      durationSeconds: input.durationSeconds ?? 6,
      imageFilename: input.imageFilename ?? "",
      fast: input.fast,
    });
  } else {
    workflow = buildT2VWorkflow({
      prompt: input.prompt,
      dimensions,
      durationSeconds: input.durationSeconds ?? 6,
      fast: input.fast,
    });
  }

  const result = await queuePrompt(workflow);
  if (!result.prompt_id) throw new Error("ComfyUI accepted the job but returned no id.");
  return result.prompt_id;
}

/**
 * Status of a directly-dispatched render, read straight from ComfyUI.
 *
 * The no-database counterpart to `resolveRender`. No row exists, so there is
 * nothing to record — the answer is computed fresh each poll.
 *
 * Never throws, for the same reason resolveRender doesn't: a ComfyUI that can't
 * be reached right now is not a failed render. Reporting it as one would end the
 * client's poll on a blip and abandon a job that is very likely still going.
 */
export async function resolveDirect(
  promptId: string,
): Promise<{ status: "pending" | "done" | "error"; videoUrl: string | null; error: string | null }> {
  try {
    const history = await getHistory(promptId);
    const entry = history?.[promptId];
    if (!entry) return { status: "pending", videoUrl: null, error: null };

    const file = extractVideoFile(entry);
    if (file) {
      const params = new URLSearchParams({
        filename: file.filename,
        subfolder: file.subfolder,
        type: file.type,
      });
      return { status: "done", videoUrl: `/api/video?${params.toString()}`, error: null };
    }

    const failed =
      entry.status?.status_str === "error" ||
      (entry.status?.completed === false &&
        Array.isArray(entry.status?.messages) &&
        entry.status.messages.some((m: any) => m[0] === "execution_error"));

    if (failed) {
      return { status: "error", videoUrl: null, error: "Generation failed on the ComfyUI server." };
    }

    return { status: "pending", videoUrl: null, error: null };
  } catch (err) {
    console.error("[renderQueue] direct status check failed:", err);
    return { status: "pending", videoUrl: null, error: null };
  }
}

/** Rows we believe are on the GPU right now. */
async function listDispatched(): Promise<RenderRow[]> {
  try {
    return (
      (await supabaseSelect<RenderRow[]>(
        `${TABLE}?select=${ROW_SELECT}&status=eq.dispatched&order=dispatched_at.asc`,
      )) ?? []
    );
  } catch (err) {
    console.error("[renderQueue] in-flight list failed:", err);
    return [];
  }
}

/** Hand a row back to the queue, recording why. Keeps its place in line. */
async function releaseRow(id: string, reason: string): Promise<boolean> {
  try {
    await supabaseRpc<RenderRow[]>("aieditor_release_render", { p_id: id });
    // Best-effort annotation; the release itself is what matters.
    await patchRow(id, { last_error: reason.slice(0, 500) });
    return true;
  } catch (err) {
    console.error("[renderQueue] release failed:", err);
    // The row is still 'dispatched' and still holding a slot. Recording why at
    // least makes it visible in /admin instead of silently wedging the queue.
    await patchRow(id, {
      last_error: `Release failed after: ${reason}`.slice(0, 500),
    });
    return false;
  }
}

/**
 * Reclaim slots held by rows that aren't really rendering.
 *
 * Two distinct situations, and conflating them was a bug worth spelling out.
 *
 * A job that has *finished* is also absent from ComfyUI's live queue — it moved to
 * /history. It looks identical to a lost job from /queue alone, but the row still
 * holds a concurrency slot, because the claim counts every `dispatched` row. And
 * until 005 nothing marked it `done` except a poll from its own owner, so a user
 * who closed their tab left a completed render occupying the GPU slot
 * indefinitely. That is a stall with a finished video sitting on the box.
 *
 * So an absent job is *collected* first and only declared lost if history has
 * nothing either. Collecting settles the row, frees the slot, and delivers the
 * video — for any user, not just one who is watching.
 *
 * The other situation is a genuine phantom: a serverless function killed between
 * claiming and recording the ComfyUI id, a failed release after a failed dispatch,
 * or ComfyUI restarting and losing its in-memory queue. With a concurrency of one,
 * a single phantom blocks every future dispatch permanently.
 *
 * Checks, cheapest first:
 *  1. No ComfyUI id past UNIDENTIFIED_DISPATCH_MS — it never got there.
 *  2. Past the hard ceiling — the backstop, applied even if ComfyUI is down.
 *  3. Not in ComfyUI's live queue — collect it from history if it's there,
 *     otherwise (past the grace period) treat it as lost.
 *
 * Returns how many slots were freed. Never throws: an unreachable ComfyUI skips
 * the live checks entirely rather than failing everyone's renders on a blip.
 */
export async function reconcileInFlight(): Promise<number> {
  if (!queueEnabled()) return 0;

  const rows = await listDispatched();
  if (rows.length === 0) return 0;

  const now = Date.now();
  let freed = 0;

  const ageOf = (row: RenderRow) => {
    const at = row.dispatched_at ? Date.parse(row.dispatched_at) : NaN;
    return Number.isFinite(at) ? now - at : 0;
  };

  // Fetched once for the whole sweep, and only when some row actually has an id
  // worth checking — this must not add a ComfyUI round trip to every request when
  // there is nothing in flight.
  let live: { running: string[]; pending: string[] } | null = null;
  if (rows.some((row) => row.comfy_prompt_id)) {
    try {
      live = await getComfyQueue();
    } catch (err) {
      // Unreachable ComfyUI is not evidence a job is lost.
      console.error("[renderQueue] couldn't read ComfyUI's queue, skipping verification:", err);
    }
  }

  for (const row of rows) {
    const age = ageOf(row);

    // 1. Claimed, but never made it to ComfyUI.
    if (!row.comfy_prompt_id) {
      if (age <= UNIDENTIFIED_DISPATCH_MS) continue;

      const reason = "Dispatch never reached the render server (no job id was recorded).";
      if (row.attempts >= MAX_ATTEMPTS) {
        await failRender(row.id, reason, row.user_id);
      } else {
        await releaseRow(row.id, reason);
      }
      freed += 1;
      continue;
    }

    // 2. Hard ceiling, before the live lookup so a very old row is cleared even
    //    when ComfyUI can't be reached at all.
    if (age > DISPATCH_TIMEOUT_MS) {
      await failRender(
        row.id,
        "The render server stopped responding for this job. Nothing was produced — your render has been given back.",
        row.user_id,
      );
      freed += 1;
      continue;
    }

    if (!live) continue;

    // Still on the GPU or waiting on it: nothing to do.
    if (live.running.includes(row.comfy_prompt_id) || live.pending.includes(row.comfy_prompt_id)) continue;

    // Absent from the live queue. Overwhelmingly the common reason is that it
    // finished, so collect it before assuming the worst. Done regardless of age,
    // because a result in history is conclusive at any age — and the sooner it is
    // recorded, the sooner the slot is free for the next person.
    const settled = await resolveRender(row);
    if (settled.status !== "dispatched") {
      freed += 1;
      continue;
    }

    // Not in the live queue, and history has no outcome for it. Given the grace
    // period for ComfyUI to register a freshly accepted prompt, it's gone.
    if (age <= COMFY_VERIFY_GRACE_MS) continue;

    const reason = "The render server no longer has this job (it may have restarted).";
    if (row.attempts >= MAX_ATTEMPTS) {
      await failRender(row.id, reason, row.user_id);
    } else {
      await releaseRow(row.id, reason);
    }
    freed += 1;
  }

  if (freed > 0) {
    console.warn(`[renderQueue] reconciled ${freed} in-flight row(s).`);
  }

  return freed;
}

/**
 * Move jobs onto the GPU, up to the concurrency cap.
 *
 * Safe to call from anywhere, concurrently, on every request: each claim either
 * returns exactly one row or nothing at all, so simultaneous callers can't
 * dispatch the same job or overshoot the cap.
 *
 * Reconciles stuck rows first, then fills every free slot rather than one per
 * request. Filling one at a time meant a queue could only drain as fast as
 * requests happened to arrive, which with the cap raised above 1 left the GPU
 * idle while jobs waited.
 *
 * Returns the first row dispatched, for callers that want to report it. Never
 * throws: it runs alongside requests that have their own job to do, and a queue
 * hiccup must not turn someone else's status check into an error.
 */
export async function pumpQueue(): Promise<RenderRow | null> {
  if (!queueEnabled()) return null;

  // Do this before the cap is consulted, or a phantom row keeps the gate shut.
  await reconcileInFlight();

  let first: RenderRow | null = null;

  // Bounded by the cap: every iteration either dispatches or stops, so this can't
  // spin. The +1 lets a single failed dispatch be followed by one more attempt on
  // the next job rather than ending the sweep.
  for (let i = 0; i < maxConcurrent() + 1; i++) {
    const claimed = await claimNext();
    if (!claimed) break;

    const dispatched = await dispatchClaimed(claimed);
    if (dispatched && !first) first = dispatched;
  }

  return first;
}

/** One atomic claim. Null when the queue is empty or every slot is busy. */
async function claimNext(): Promise<RenderRow | null> {
  try {
    const rows = await supabaseRpc<RenderRow[]>("aieditor_claim_next_render", {
      p_max_concurrent: maxConcurrent(),
    });
    return rows?.[0] ?? null;
  } catch (err) {
    // The likeliest cause is that 004/005 haven't been run, or PostgREST hasn't
    // reloaded its schema cache and can't see the function — which looks exactly
    // like a wedged queue from the outside. /api/admin/queue probes for this
    // explicitly rather than leaving it in a log.
    console.error("[renderQueue] claim failed (have 004 and 005 been run?):", err);
    return null;
  }
}

/** Send a claimed row to ComfyUI, or hand it back. */
async function dispatchClaimed(claimed: RenderRow): Promise<RenderRow | null> {
  try {
    const result = await queuePrompt(workflowFor(claimed));
    if (!result.prompt_id) {
      // Accepted but unidentifiable: we could never match it to an output, so
      // treat it as a failed dispatch rather than leaving a row that can only
      // ever time out.
      throw new Error("The render server accepted the job but returned no id.");
    }
    return await patchRow(claimed.id, {
      comfy_prompt_id: result.prompt_id,
      last_error: null,
    });
  } catch (err: any) {
    const message = err?.message ?? "Failed to reach the render server.";

    // A malformed row can never succeed, so retrying it would keep one slot
    // cycling on a job that is already broken. Fail it outright.
    const permanent = message.includes("Queue row is missing");

    if (!permanent && claimed.attempts < MAX_ATTEMPTS) {
      console.error(`[renderQueue] dispatch attempt ${claimed.attempts} failed, requeuing:`, message);
      await releaseRow(claimed.id, message);
      return null;
    }

    console.error("[renderQueue] dispatch failed permanently:", message);
    await failRender(claimed.id, message, claimed.user_id);
    return null;
  }
}

// --- Resolve --------------------------------------------------------------

/**
 * Ask ComfyUI whether a dispatched job has finished, and record the answer.
 *
 * Only touches rows in `dispatched`; anything else is already settled and is
 * returned untouched. Never throws — a status check that can't reach ComfyUI
 * leaves the row alone and reports it as still rendering, which is very likely
 * true.
 */
export async function resolveRender(row: RenderRow): Promise<RenderRow> {
  if (row.status !== "dispatched") return row;

  // The lost-render guard. Checked before asking ComfyUI, because the case this
  // exists for is precisely the one where ComfyUI has forgotten the job and will
  // answer "nothing here" forever.
  const dispatchedAt = row.dispatched_at ? Date.parse(row.dispatched_at) : NaN;
  if (Number.isFinite(dispatchedAt) && Date.now() - dispatchedAt > DISPATCH_TIMEOUT_MS) {
    const failed = await failRender(
      row.id,
      "The render server stopped responding for this job. Nothing was produced — your render has been given back.",
      row.user_id,
    );
    return failed ?? row;
  }

  if (!row.comfy_prompt_id) return row;

  try {
    const history = await getHistory(row.comfy_prompt_id);
    const entry = history?.[row.comfy_prompt_id];
    if (!entry) return row;

    const file = extractVideoFile(entry);
    if (file) {
      return (await completeRender(row.id, file)) ?? row;
    }

    // No file, and ComfyUI is reporting a failure: the GPU tried and couldn't.
    const failedOnBox =
      entry.status?.status_str === "error" ||
      (entry.status?.completed === false &&
        Array.isArray(entry.status?.messages) &&
        entry.status.messages.some((m: any) => m[0] === "execution_error"));

    if (failedOnBox) {
      const failed = await failRender(row.id, "Generation failed on the ComfyUI server.", row.user_id);
      return failed ?? row;
    }

    // Present in history with no output and no error: still working.
    return row;
  } catch (err) {
    console.error("[renderQueue] status check failed:", err);
    return row;
  }
}

// --- Client-facing shape --------------------------------------------------

export type RenderView = {
  id: string;
  status: RenderStatus;
  prompt: string | null;
  negativePrompt?: string | null;
  workflowParams?: WorkflowParams | null;
  pruned: boolean;
  type: string;
  aspectRatio: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  fast: boolean;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
  /** Streamed through /api/video, never a direct ComfyUI URL. */
  videoUrl: string | null;
  /** Present only while queued: 1-based place in line, and how many are waiting. */
  position?: number;
  queueTotal?: number;
};

/**
 * The URL the browser plays. /api/video is unchanged and still does the
 * fetching — this only assembles its query.
 */
export function videoUrlFor(row: RenderRow): string | null {
  if (row.status !== "done" || !row.video_filename) return null;
  const params = new URLSearchParams({
    filename: row.video_filename,
    subfolder: row.video_subfolder ?? "",
    type: row.video_type ?? "output",
  });
  return `/api/video?${params.toString()}`;
}

/**
 * Row to client view. Queue position is looked up only for rows that have one,
 * so a page of finished history costs no extra queries.
 */
export async function toView(row: RenderRow): Promise<RenderView> {
  const view: RenderView = {
    id: row.id,
    status: row.status,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt ?? null,
    workflowParams: row.workflow_params ?? null,
    pruned: row.pruned,
    type: row.type,
    aspectRatio: row.aspect_ratio,
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds,
    fast: row.fast,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    error: row.error,
    videoUrl: videoUrlFor(row),
  };

  if (row.status === "queued") {
    const position = await queuePosition(row.id);
    if (position) {
      view.position = position.ahead + 1;
      view.queueTotal = position.total;
    }
  }

  return view;
}

/**
 * A view for a directly-dispatched render, which has no row behind it.
 *
 * The no-database path still has to answer /api/status in the same shape, so the
 * client needs no branch of its own. The id carries the `DIRECT_PREFIX` so a
 * later status call knows to ask ComfyUI rather than look for a row.
 *
 * `dispatched` rather than `queued`, because it genuinely went straight to the
 * GPU — there is no queue to hold a position in.
 */
export function directView(
  promptId: string,
  input: Pick<EnqueueInput, "prompt" | "type" | "aspectRatio" | "width" | "height" | "durationSeconds" | "fast" | "negativePrompt" | "workflowParams">,
  resolved?: { status: "pending" | "done" | "error"; videoUrl: string | null; error: string | null },
): RenderView {
  return {
    id: `${DIRECT_PREFIX}${promptId}`,
    status: resolved?.status === "done" ? "done" : resolved?.status === "error" ? "error" : "dispatched",
    prompt: input.prompt,
    negativePrompt: input.negativePrompt ?? null,
    workflowParams: input.workflowParams ?? null,
    pruned: false,
    type: input.type,
    aspectRatio: input.aspectRatio,
    width: input.width,
    height: input.height,
    durationSeconds: input.durationSeconds,
    fast: input.fast,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    error: resolved?.error ?? null,
    videoUrl: resolved?.videoUrl ?? null,
  };
}

// --- Reaper ---------------------------------------------------------------

/**
 * Sweep up rows nobody is watching.
 *
 * The request-driven pump is the mechanism that drains the queue; this is only a
 * backstop for rows whose owner never came back. On Vercel's free tier cron runs
 * once a day with up to an hour of drift, so it cannot be load-bearing and isn't
 * treated as such.
 *
 * Three cases, in order:
 * - Anything `reconcileInFlight` can free by asking ComfyUI what it actually has.
 *   Cheapest and most accurate, so it goes first.
 * - `dispatched` past the hard timeout — usually a ComfyUI restart, which loses
 *   the job from its in-memory history. Failed, and refunded.
 * - `queued` past a day — abandoned. Cancelled rather than dispatched, so it
 *   can't suddenly render long after anyone cares.
 *
 * Ends with a pump, so a sweep that frees a slot also starts the next job rather
 * than leaving the GPU idle until someone loads a page.
 */
export async function reapStale(): Promise<{ reconciled: number; failed: number; expired: number }> {
  if (!queueEnabled()) return { reconciled: 0, failed: 0, expired: 0 };

  const now = Date.now();
  let failed = 0;
  let expired = 0;

  const reconciled = await reconcileInFlight();

  try {
    const cutoff = new Date(now - DISPATCH_TIMEOUT_MS).toISOString();
    const stale = await supabaseSelect<RenderRow[]>(
      `${TABLE}?select=${ROW_SELECT}&status=eq.dispatched&dispatched_at=lt.${cutoff}`,
    );
    for (const row of stale ?? []) {
      // Individually, so one bad row doesn't abort the sweep — and via failRender
      // so each one is refunded.
      await failRender(
        row.id,
        "The render server stopped responding for this job. Nothing was produced — your render has been given back.",
        row.user_id,
      );
      failed += 1;
    }
  } catch (err) {
    console.error("[renderQueue] reaping dispatched rows failed:", err);
  }

  try {
    const cutoff = new Date(now - QUEUED_TIMEOUT_MS).toISOString();
    const abandoned = await supabaseSelect<RenderRow[]>(
      `${TABLE}?select=${ROW_SELECT}&status=eq.queued&created_at=lt.${cutoff}`,
    );
    for (const row of abandoned ?? []) {
      await patchRow(row.id, {
        status: "cancelled",
        error: "Expired after waiting more than a day.",
        finished_at: new Date().toISOString(),
      });
      await refundGeneration(row.user_id);
      expired += 1;
    }
  } catch (err) {
    console.error("[renderQueue] expiring queued rows failed:", err);
  }

  // Freeing a slot is only half the job.
  if (reconciled > 0 || failed > 0) await pumpQueue();

  return { reconciled, failed, expired };
}

// --- Diagnostics ----------------------------------------------------------

/**
 * Everything /admin needs to answer "why isn't the queue moving?".
 *
 * Built because the first real wedge was undiagnosable from the outside: rows
 * piled up in `queued`, ComfyUI sat idle, and every explanation — a phantom
 * in-flight row, an unmigrated database, a PostgREST schema cache that can't see
 * the claim function — produced identical symptoms and only a swallowed server
 * log to tell them apart.
 */
export type QueueDiagnostics = {
  /** Row counts by status. */
  counts: Record<string, number>;
  /** Every unfinished row, newest last, with its diagnostic fields. */
  active: RenderRow[];
  /**
   * Owner and priority rank per active row, keyed by queue row id. `rank` is null
   * for a default user, which is the normal case — the panel shows that as
   * "default" rather than inventing a number.
   */
  owners: Record<string, { username: string | null; rank: number | null }>;
  maxConcurrent: number;
  /** How many rows we believe are on the GPU. Compare with `comfy`. */
  inFlight: number;
  /**
   * In-flight rows ComfyUI has never heard of, and which are old enough that it
   * would have registered them by now. These are the ones genuinely holding a
   * slot for nothing.
   *
   * Computed here rather than in the UI because it needs the grace period and the
   * reconciler's rules to be right, and a panel that infers it from
   * `inFlight > 0 && comfy is empty` cries wolf: a *finished* job is also absent
   * from the live queue, which is exactly the false alarm this replaces.
   */
  blocked: number;
  /**
   * In-flight rows absent from ComfyUI but too recent to judge — it hasn't
   * registered them yet. Normal, and resolves on its own.
   */
  settling: number;
  /** What ComfyUI says it has, or an error if it couldn't be reached. */
  comfy: { running: string[]; pending: string[]; error: string | null };
  /**
   * Whether each RPC the queue depends on is actually callable, with the real
   * error text when it isn't. This is what distinguishes "migration not run" and
   * "PostgREST hasn't reloaded its schema" from a genuine logic problem.
   */
  rpcs: { name: string; ok: boolean; error: string | null }[];
};

/** Call each queue RPC harmlessly and report whether it worked. */
async function probeRpcs(): Promise<QueueDiagnostics["rpcs"]> {
  // A uuid that cannot match a row, so every probe is a no-op that still proves
  // the function exists and is callable.
  const nil = "00000000-0000-0000-0000-000000000000";

  const probes: { name: string; run: () => Promise<unknown> }[] = [
    // p_max_concurrent: 0 can never claim anything.
    { name: "aieditor_claim_next_render", run: () => supabaseRpc("aieditor_claim_next_render", { p_max_concurrent: 0 }) },
    { name: "aieditor_release_render", run: () => supabaseRpc("aieditor_release_render", { p_id: nil }) },
    { name: "aieditor_queue_position", run: () => supabaseRpc("aieditor_queue_position", { p_id: nil }) },
    { name: "aieditor_requeue_render", run: () => supabaseRpc("aieditor_requeue_render", { p_id: nil }) },
    { name: "aieditor_queue_stats", run: () => supabaseRpc("aieditor_queue_stats", {}) },
    { name: "aieditor_refund_generation", run: () => supabaseRpc("aieditor_refund_generation", { p_id: "diagnostic-probe" }) },
    // Priority list (007). Read-only probes: listing is harmless, and normalising
    // is a no-op on an already-dense list.
    { name: "aieditor_queue_with_priority", run: () => supabaseRpc("aieditor_queue_with_priority", {}) },
    { name: "aieditor_priority_members", run: () => supabaseRpc("aieditor_priority_members", {}) },
    { name: "aieditor_users_with_priority", run: () => supabaseRpc("aieditor_users_with_priority", {}) },
    { name: "aieditor_normalize_priority_ranks", run: () => supabaseRpc("aieditor_normalize_priority_ranks", {}) },
  ];

  const results: QueueDiagnostics["rpcs"] = [];
  for (const probe of probes) {
    try {
      await probe.run();
      results.push({ name: probe.name, ok: true, error: null });
    } catch (err: any) {
      results.push({ name: probe.name, ok: false, error: String(err?.message ?? err).slice(0, 300) });
    }
  }
  return results;
}

export async function queueDiagnostics(): Promise<QueueDiagnostics> {
  const counts: Record<string, number> = {};
  let active: RenderRow[] = [];

  try {
    const stats = await supabaseRpc<{ status: string; count: number }[]>("aieditor_queue_stats", {});
    // Defensive: an RPC that returns nothing yields null, not an array.
    for (const row of stats ?? []) counts[row.status] = row.count;
  } catch (err) {
    console.error("[renderQueue] stats failed:", err);
  }

  try {
    active =
      (await supabaseSelect<RenderRow[]>(
        `${TABLE}?select=${ROW_SELECT}&status=in.(queued,dispatched)&order=created_at.asc&limit=100`,
      )) ?? [];
  } catch (err) {
    console.error("[renderQueue] active list failed:", err);
  }

  // Who each waiting job belongs to, and their rank if they have one — the
  // queue's order is otherwise unexplainable from the panel.
  const owners: QueueDiagnostics["owners"] = {};
  try {
    const rows = await supabaseRpc<
      { id: string; username: string | null; rank: number | null }[]
    >("aieditor_queue_with_priority", {});
    for (const row of rows ?? []) {
      owners[row.id] = { username: row.username, rank: row.rank };
    }
  } catch (err) {
    // Cosmetic. The table still renders, just without owner or rank columns.
    console.error("[renderQueue] owner lookup failed (has 007 been run?):", err);
  }

  // Reordered to match the claim: ranked users first by rank, then everyone else
  // oldest-first. Done here rather than in SQL so the panel's order stays right
  // even if the owner lookup above is what failed — with no ranks known this
  // degrades to plain FIFO, which is what the queue does when nobody is ranked.
  const rankOf = (row: RenderRow) => owners[row.id]?.rank ?? null;
  active.sort((a, b) => {
    const ra = rankOf(a);
    const rb = rankOf(b);
    if (ra !== rb) {
      if (ra === null) return 1;
      if (rb === null) return -1;
      return ra - rb;
    }
    return Date.parse(a.created_at) - Date.parse(b.created_at);
  });

  let comfy: QueueDiagnostics["comfy"] = { running: [], pending: [], error: null };
  try {
    const live = await getComfyQueue();
    comfy = { ...live, error: null };
  } catch (err: any) {
    comfy = { running: [], pending: [], error: String(err?.message ?? err).slice(0, 300) };
  }

  const dispatched = active.filter((row) => row.status === "dispatched");

  // A row is only "blocked" if ComfyUI is reachable and denies knowing it, *and*
  // enough time has passed that it would have registered it. Anything newer is
  // still settling. A finished-but-uncollected row is neither: it appears here
  // for one reconcile at most, then becomes `done`.
  const now = Date.now();
  const unknownToComfy = (row: RenderRow) =>
    row.comfy_prompt_id !== null &&
    !comfy.running.includes(row.comfy_prompt_id) &&
    !comfy.pending.includes(row.comfy_prompt_id);
  const ageOf = (row: RenderRow) => {
    const at = row.dispatched_at ? Date.parse(row.dispatched_at) : NaN;
    return Number.isFinite(at) ? now - at : 0;
  };

  const suspect = comfy.error === null ? dispatched.filter(unknownToComfy) : [];

  return {
    counts,
    active,
    owners,
    maxConcurrent: maxConcurrent(),
    inFlight: dispatched.length,
    blocked: suspect.filter((row) => ageOf(row) > COMFY_VERIFY_GRACE_MS).length,
    settling: suspect.filter((row) => ageOf(row) <= COMFY_VERIFY_GRACE_MS).length,
    comfy,
    rpcs: await probeRpcs(),
  };
}

/**
 * Put one row back in line, by hand, from /admin.
 *
 * The manual override for a job the automatic reconciler won't touch — including a
 * `dispatched` row that ComfyUI genuinely still has, which is why this is a
 * deliberate operator action rather than something the pump does. Resets attempts,
 * keeps the row's place in line.
 */
export async function requeueRender(id: string): Promise<RenderRow | null> {
  try {
    const rows = await supabaseRpc<RenderRow[]>("aieditor_requeue_render", { p_id: id });
    return rows?.[0] ?? null;
  } catch (err) {
    console.error("[renderQueue] manual requeue failed (has 005 been run?):", err);
    return null;
  }
}

/** Kill one row from /admin, refunding its render. */
export async function failRenderAsAdmin(id: string): Promise<RenderRow | null> {
  const rows = await supabaseSelect<RenderRow[]>(
    `${TABLE}?select=${ROW_SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`,
  ).catch(() => [] as RenderRow[]);

  const row = rows?.[0];
  if (!row) return null;

  return failRender(row.id, "Cancelled by an administrator.", row.user_id);
}
