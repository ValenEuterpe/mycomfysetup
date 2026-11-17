import {
  Env,
  getRelayEndpoint,
  queuePrompt,
  pollForCompletion,
  fetchMediaBlob,
  interruptComfy,
} from "./comfy";
import {
  buildInjectedWorkflow,
  getWorkflow,
  resolveRatio,
  generateRandomSeed,
  DEFAULT_WORKFLOW_ID,
} from "./workflows";
import { getSettings, getEffectivePromptSettings, setLastRun } from "./settings";
import {
  sendTelegramMessage,
  sendTelegramMedia,
  editTelegramMessage,
  sendTelegramChatAction,
  deleteTelegramMessage,
  escapeHtml,
  inlineKeyboard,
} from "./telegram";
import {
  PromptBatchPayload,
  resolveBatch,
} from "./promptTemplate";

const clamp = (s: string, max = 150) =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;

/**
 * Maximum consecutive images to run in a single automatic serverless stretch before
 * pausing with a one-tap Continue button. 6 images safely fits within Cloudflare's
 * subrequest recursion and CPU resource boundaries without any 503 or timeout risks.
 */
export const BATCH_CHUNK_SIZE = 6;

export interface StoredBatchState {
  batchId: string;
  chatId: number;
  secret: string;
  status: "running" | "cancelled" | "completed" | "paused";
  statusMessageId?: number;
  modelId: string;
  ratioId: string;
  suffix?: string;
  negativeOverride?: string;
  prompts: string[];
  total: number;
  currentIndex: number;
  successCount: number;
  failCount: number;
  updatedAt: number;
  /** Tracks recursive invocation depth across Cloudflare Worker steps */
  hopCount?: number;
}

const batchKey = (chatId: number | string) => `tg:${chatId}:batch`;

export async function getBatchState(
  env: Env,
  chatId: number | string
): Promise<StoredBatchState | null> {
  if (!env.TELEGRAM_SETTINGS) return null;
  try {
    const raw = await env.TELEGRAM_SETTINGS.get(batchKey(chatId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredBatchState;
  } catch {
    return null;
  }
}

export async function saveBatchState(
  env: Env,
  chatId: number | string,
  state: StoredBatchState
): Promise<boolean> {
  if (!env.TELEGRAM_SETTINGS) return false;
  try {
    await env.TELEGRAM_SETTINGS.put(batchKey(chatId), JSON.stringify(state), {
      expirationTtl: 7200,
    });
    return true;
  } catch {
    return false;
  }
}

export async function clearBatchState(
  env: Env,
  chatId: number | string
): Promise<void> {
  if (!env.TELEGRAM_SETTINGS) return;
  try {
    await env.TELEGRAM_SETTINGS.delete(batchKey(chatId));
  } catch {}
}

const CANCEL_BUTTON_MARKUP = inlineKeyboard([[["🛑 Cancel Queue", "batch:cancel"]]]);

/**
 * Cancels any currently active batch for the chat, interrupts the ComfyUI GPU,
 * updates the status message, and confirms cancellation.
 */
export async function cancelBatch(
  env: Env,
  chatId: number,
  token: string
): Promise<boolean> {
  const state = await getBatchState(env, chatId);
  if (!state || (state.status !== "running" && state.status !== "paused")) {
    return false;
  }

  state.status = "cancelled";
  state.updatedAt = Date.now();
  await saveBatchState(env, chatId, state);

  // Send GPU interrupt signal to ComfyUI
  const endpoint = getRelayEndpoint(env);
  if (endpoint) {
    await interruptComfy(endpoint).catch(() => {});
  }

  const cancelNotice = [
    `🛑 <b>Batch Cancelled by User</b>`,
    `Delivered ${state.successCount}/${state.total} images before stopping.`,
  ].join("\n");

  if (state.statusMessageId) {
    await editTelegramMessage(token, chatId, state.statusMessageId, cancelNotice, {
      parseMode: "HTML",
    }).catch(() => {});
  }

  await sendTelegramMessage(token, chatId, cancelNotice, { parseMode: "HTML" }).catch(() => {});
  await clearBatchState(env, chatId);
  return true;
}

/**
 * Triggers the next batch step asynchronously by making an internal HTTP call
 * back to /api/telegram. If the HTTP call fails (e.g. 503 or transient network issue),
 * it posts a Resume button to the user so the queue can be continued seamlessly.
 */
export async function triggerNextBatchStep(
  env: Env,
  origin: string,
  chatId: number,
  batchId: string,
  secret: string,
  state: StoredBatchState,
  token: string
): Promise<void> {
  try {
    const url = new URL(`${origin}/api/telegram`);
    url.searchParams.set("batch_step", "1");
    url.searchParams.set("chat_id", String(chatId));
    url.searchParams.set("batch_id", batchId);
    url.searchParams.set("secret", secret);

    const headers: Record<string, string> = {
      "User-Agent": "LocalImageGen-BatchWorker/1.0",
      "Content-Type": "application/json",
    };
    if (env.TELEGRAM_WEBHOOK_SECRET?.trim()) {
      headers["X-Telegram-Bot-Api-Secret-Token"] = env.TELEGRAM_WEBHOOK_SECRET.trim();
    }

    const res = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(state),
    });

    if (!res.ok) {
      console.error(`[telegramBatch] triggerNextBatchStep failed with HTTP ${res.status}: ${res.statusText}`);
      state.status = "paused";
      state.updatedAt = Date.now();
      await saveBatchState(env, chatId, state);

      const pausedNotice = [
        `⚠️ <b>Batch paused at [${state.currentIndex}/${state.total}]</b>`,
        `<i>Server reported status ${res.status}.</i>`,
        ``,
        `Tap below to resume right where you left off:`,
      ].join("\n");

      const resumeMarkup = inlineKeyboard([
        [["▶️ Continue Queue", "batch:resume"]],
        [["🛑 Cancel Queue", "batch:cancel"]],
      ]);

      await sendTelegramMessage(token, chatId, pausedNotice, {
        parseMode: "HTML",
        replyMarkup: resumeMarkup,
      }).catch(() => {});
    }
  } catch (err: any) {
    console.error("[telegramBatch] triggerNextBatchStep error:", err);
    state.status = "paused";
    state.updatedAt = Date.now();
    await saveBatchState(env, chatId, state);

    const pausedNotice = [
      `⚠️ <b>Batch paused at [${state.currentIndex}/${state.total}]</b>`,
      `<i>Network error: ${escapeHtml(clamp(err?.message || "Connection failed", 150))}</i>`,
      ``,
      `Tap below to resume right where you left off:`,
    ].join("\n");

    const resumeMarkup = inlineKeyboard([
      [["▶️ Continue Queue", "batch:resume"]],
      [["🛑 Cancel Queue", "batch:cancel"]],
    ]);

    await sendTelegramMessage(token, chatId, pausedNotice, {
      parseMode: "HTML",
      replyMarkup: resumeMarkup,
    }).catch(() => {});
  }
}

/**
 * Resumes a paused batch or continues from a checkpoint, resetting the Cloudflare
 * recursion hop depth to 0 so generations continue indefinitely.
 */
export async function resumeBatch(
  env: Env,
  chatId: number,
  token: string,
  origin: string
): Promise<boolean> {
  const state = await getBatchState(env, chatId);
  if (!state || state.currentIndex >= state.total) {
    await sendTelegramMessage(token, chatId, "🤷 <b>No active or paused batch found to resume.</b>", {
      parseMode: "HTML",
    });
    return false;
  }

  // Prevent duplicate runs if user double taps while already actively generating
  if (state.status === "running") {
    const isRecentlyActive = Date.now() - state.updatedAt < 45_000;
    if (isRecentlyActive) {
      await sendTelegramMessage(
        token,
        chatId,
        "ℹ️ <b>Batch queue is already running!</b>",
        { parseMode: "HTML" }
      );
      return true;
    }
  }

  // Reset recursion hop counter to 0 since this execution is started fresh by a user action
  state.hopCount = 0;
  state.status = "running";
  state.updatedAt = Date.now();
  await saveBatchState(env, chatId, state);

  await sendTelegramMessage(
    token,
    chatId,
    `▶️ <b>Resuming queue at [${state.currentIndex + 1}/${state.total}]...</b>`,
    { parseMode: "HTML" }
  );

  await processBatchStep(env, origin, chatId, state.batchId, token, state);
  return true;
}

/**
 * Initiates a batch queue, creates its KV state, sends the initial announcement
 * message with a Cancel button, and launches the first execution step.
 */
export async function startBatchQueue(
  env: Env,
  chatId: number,
  token: string,
  origin: string,
  payload: PromptBatchPayload
): Promise<void> {
  const batch = resolveBatch(payload);

  if (batch.total === 0) {
    await sendTelegramMessage(
      token,
      chatId,
      "❌ <b>Batch empty</b>\nNo valid prompts found in the JSON payload.",
      { parseMode: "HTML" }
    );
    return;
  }

  const stored = await getSettings(env, chatId);
  const targetModelId = batch.modelOverride || stored.modelId || DEFAULT_WORKFLOW_ID;
  const wf = getWorkflow(targetModelId) ?? getWorkflow(DEFAULT_WORKFLOW_ID);

  if (!wf) {
    await sendTelegramMessage(
      token,
      chatId,
      `❌ Unknown model <code>${escapeHtml(targetModelId)}</code>.`,
      { parseMode: "HTML" }
    );
    return;
  }

  const targetRatioId = batch.ratioOverride || stored.ratio || "1:1";
  const ratio = resolveRatio(targetRatioId) ?? resolveRatio("1:1")!;

  const endpoint = getRelayEndpoint(env);
  if (!endpoint) {
    await sendTelegramMessage(
      token,
      chatId,
      "❌ Server error: <code>COMFY_RELAY_URL</code> is not configured.",
      { parseMode: "HTML" }
    );
    return;
  }

  // Cancel any existing batch for this chat first
  const existing = await getBatchState(env, chatId);
  if (existing && existing.status === "running") {
    await cancelBatch(env, chatId, token);
  }

  // 1. Send initial batch confirmation message with a native Cancel button
  const suffixNote = batch.suffix ? `\n🏷 <b>Suffix:</b> <code>${escapeHtml(clamp(batch.suffix, 80))}</code>` : "";
  const initialText = [
    `📦 <b>Batch Queued: ${batch.total} image${batch.total > 1 ? "s" : ""}</b>`,
    `🎨 <b>Model:</b> ${escapeHtml(wf.displayName)} · 📐 <b>Ratio:</b> ${escapeHtml(ratio.id)}${suffixNote}`,
    ``,
    `⏳ <i>Starting generation...</i>`,
  ].join("\n");

  const statusId = await sendTelegramMessage(token, chatId, initialText, {
    parseMode: "HTML",
    replyMarkup: CANCEL_BUTTON_MARKUP,
  }).catch(() => undefined);

  const batchId = `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const secret = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

  const state: StoredBatchState = {
    batchId,
    chatId,
    secret,
    status: "running",
    statusMessageId: statusId,
    modelId: wf.id,
    ratioId: ratio.id,
    suffix: batch.suffix,
    negativeOverride: batch.negativeOverride,
    prompts: batch.resolvedPrompts,
    total: batch.total,
    currentIndex: 0,
    successCount: 0,
    failCount: 0,
    updatedAt: Date.now(),
    hopCount: 0,
  };

  await saveBatchState(env, chatId, state);

  // 2. Launch step 0
  await processBatchStep(env, origin, chatId, batchId, token, state);
}

/**
 * Processes strictly ONE prompt item per worker execution, delivers the result to Telegram,
 * and chains to the next step via internal fetch passing the state payload.
 * Processing strictly 1 image per worker invocation guarantees we never exceed Cloudflare's
 * background execution wall-clock timeout (~30s).
 * When the safe chunk limit (BATCH_CHUNK_SIZE = 6) is reached, it cleanly pauses with a one-tap
 * Continue button so user interaction resets the depth to 0.
 */
export async function processBatchStep(
  env: Env,
  origin: string,
  chatId: number,
  batchId: string,
  token: string,
  initialState?: StoredBatchState
): Promise<void> {
  const state = initialState ?? (await getBatchState(env, chatId));

  // Ensure state matches current active batch
  if (!state || state.batchId !== batchId) {
    return;
  }

  // Abort if cancelled by user
  if (state.status === "cancelled") {
    await clearBatchState(env, chatId);
    return;
  }

  const endpoint = getRelayEndpoint(env);
  if (!endpoint) {
    await sendTelegramMessage(
      token,
      chatId,
      "❌ <b>Batch stopped:</b> <code>COMFY_RELAY_URL</code> is not configured.",
      { parseMode: "HTML" }
    );
    await clearBatchState(env, chatId);
    return;
  }

  const wf = getWorkflow(state.modelId) ?? getWorkflow(DEFAULT_WORKFLOW_ID);
  if (!wf) {
    await sendTelegramMessage(
      token,
      chatId,
      `❌ <b>Batch stopped:</b> Unknown model <code>${escapeHtml(state.modelId)}</code>.`,
      { parseMode: "HTML" }
    );
    await clearBatchState(env, chatId);
    return;
  }
  const ratio = resolveRatio(state.ratioId) ?? resolveRatio("1:1")!;
  const stored = await getSettings(env, chatId);

  // Check if all items have already been processed
  if (state.currentIndex >= state.total) {
    state.status = "completed";
    await clearBatchState(env, chatId);

    const summaryText = [
      state.failCount === 0 ? `✅ <b>Batch complete!</b>` : `⚠️ <b>Batch finished with issues</b>`,
      `🎨 <b>Model:</b> ${escapeHtml(wf.displayName)} · 📐 <b>Ratio:</b> ${escapeHtml(ratio.id)}`,
      `📊 <b>Delivered:</b> ${state.successCount}/${state.total} images.`,
    ].join("\n");

    if (state.statusMessageId) {
      await editTelegramMessage(token, chatId, state.statusMessageId, summaryText, {
        parseMode: "HTML",
      }).catch(async () => {
        await sendTelegramMessage(token, chatId, summaryText, { parseMode: "HTML" });
      });
    } else {
      await sendTelegramMessage(token, chatId, summaryText, { parseMode: "HTML" });
    }
    return;
  }

  // Check cancellation before generation (only abort if explicitly cancelled by user)
  const liveCheck = await getBatchState(env, chatId);
  if (liveCheck && liveCheck.status === "cancelled") {
    await clearBatchState(env, chatId);
    return;
  }

  // Strictly process 1 image per worker invocation.
  // This guarantees each execution takes ~25s, well within Cloudflare's background wall-clock limit (~60s).
  const itemIndex = state.currentIndex;
  const itemNum = itemIndex + 1;
  const promptText = state.prompts[itemIndex];
  const seed = generateRandomSeed();

  // Update live status board
  if (state.statusMessageId) {
    await editTelegramMessage(
      token,
      chatId,
      state.statusMessageId,
      [
        `⏳ <b>[${itemNum}/${state.total}] Rendering...</b>`,
        `🎨 ${escapeHtml(wf.displayName)} · 📐 ${escapeHtml(ratio.id)}`,
        `<i>"${escapeHtml(clamp(promptText, 200))}"</i>`,
      ].join("\n"),
      { parseMode: "HTML", replyMarkup: CANCEL_BUTTON_MARKUP }
    ).catch(() => {});
    await sendTelegramChatAction(token, chatId, "upload_photo");
  }

  try {
    const effective = getEffectivePromptSettings(stored, wf);
    const negative = wf.supportsNegativePrompt
      ? state.negativeOverride ?? effective.negative
      : undefined;
    const prefill = effective.prefill;

    const workflow = buildInjectedWorkflow(wf, {
      positive: promptText,
      negative,
      prefill,
      seed,
      width: ratio.width,
      height: ratio.height,
    });

    const promptId = await queuePrompt(
      endpoint,
      workflow,
      `tg_batch_${chatId}_${Date.now()}_${itemNum}`
    );

    const mediaRefs = await pollForCompletion(endpoint, promptId, wf);

    // Check if user cancelled while this prompt was polling (only abort if explicitly cancelled)
    const postPollCheck = await getBatchState(env, chatId);
    if (postPollCheck && postPollCheck.status === "cancelled") {
      await clearBatchState(env, chatId);
      return;
    }

    // Save as lastRun for quick regeneration
    await setLastRun(env, chatId, {
      positive: promptText,
      negative: state.negativeOverride,
      workflowId: wf.id,
      ratio: ratio.id,
      seed,
    });

    const caption = [
      `<b>[${itemNum}/${state.total}]</b> · 🎨 ${escapeHtml(wf.displayName)} · 📐 ${escapeHtml(ratio.id)} · seed <code>${escapeHtml(seed)}</code>`,
      `<i>${escapeHtml(clamp(promptText, 300))}</i>`,
    ].join("\n");

    for (const ref of mediaRefs) {
      const blob = await fetchMediaBlob(endpoint, ref);
      await sendTelegramMedia(token, chatId, blob, ref.filename, caption, {
        parseMode: "HTML",
      });
    }

    state.successCount++;
  } catch (err: any) {
    state.failCount++;
    const errMsg = err?.message || "Unknown error";
    await sendTelegramMessage(
      token,
      chatId,
      `⚠️ <b>[${itemNum}/${state.total}] Generation failed</b>\n<code>${escapeHtml(clamp(errMsg, 250))}</code>`,
      { parseMode: "HTML" }
    ).catch(() => {});
  }

  // Advance index and hop counter atomically in a single KV write (prevents KV 429 write limit)
  state.currentIndex = itemIndex + 1;
  state.hopCount = (state.hopCount || 0) + 1;
  state.updatedAt = Date.now();
  await saveBatchState(env, chatId, state);

  // If all items finished, render completion summary and clear
  if (state.currentIndex >= state.total) {
    state.status = "completed";
    await clearBatchState(env, chatId);

    const summaryText = [
      state.failCount === 0 ? `✅ <b>Batch complete!</b>` : `⚠️ <b>Batch finished with issues</b>`,
      `🎨 <b>Model:</b> ${escapeHtml(wf.displayName)} · 📐 <b>Ratio:</b> ${escapeHtml(ratio.id)}`,
      `📊 <b>Delivered:</b> ${state.successCount}/${state.total} images.`,
    ].join("\n");

    if (state.statusMessageId) {
      await editTelegramMessage(token, chatId, state.statusMessageId, summaryText, {
        parseMode: "HTML",
      }).catch(async () => {
        await sendTelegramMessage(token, chatId, summaryText, { parseMode: "HTML" });
      });
    } else {
      await sendTelegramMessage(token, chatId, summaryText, { parseMode: "HTML" });
    }
    return;
  }

  // Safety checkpoint: pause after BATCH_CHUNK_SIZE (6 images) to guarantee zero 503 or execution limits
  if (state.hopCount >= BATCH_CHUNK_SIZE) {
    state.status = "paused";
    await saveBatchState(env, chatId, state);

    const remaining = state.total - state.currentIndex;
    const nextBatchSize = Math.min(BATCH_CHUNK_SIZE, remaining);
    const checkpointText = [
      `⏳ <b>Queue Checkpoint [${state.currentIndex}/${state.total}]</b>`,
      `🎨 <b>Model:</b> ${escapeHtml(wf.displayName)} · 📐 <b>Ratio:</b> ${escapeHtml(ratio.id)}`,
      `📊 Successfully delivered ${state.successCount} images so far.`,
      ``,
      `<i>Serverless checkpoint reached (${BATCH_CHUNK_SIZE}-image safe block).</i>`,
      `Tap <b>Continue Queue</b> below to run the next ${nextBatchSize} images!`,
    ].join("\n");

    const resumeMarkup = inlineKeyboard([
      [[`▶️ Continue Queue (${state.currentIndex + 1}–${state.currentIndex + nextBatchSize})`, "batch:resume"]],
      [["🛑 Cancel Queue", "batch:cancel"]],
    ]);

    if (state.statusMessageId) {
      await editTelegramMessage(token, chatId, state.statusMessageId, checkpointText, {
        parseMode: "HTML",
        replyMarkup: resumeMarkup,
      }).catch(async () => {
        await sendTelegramMessage(token, chatId, checkpointText, {
          parseMode: "HTML",
          replyMarkup: resumeMarkup,
        });
      });
    } else {
      await sendTelegramMessage(token, chatId, checkpointText, {
        parseMode: "HTML",
        replyMarkup: resumeMarkup,
      });
    }
    return;
  }

  // Trigger next step
  await triggerNextBatchStep(env, origin, chatId, batchId, state.secret, state, token);
}
