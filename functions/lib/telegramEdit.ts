import { Env, RelayEndpoint, fetchMediaBlob, relayUrl, queuePrompt } from "./comfy";
import {
  sendTelegramMessage,
  editTelegramMessage,
  sendTelegramChatAction,
  deleteTelegramMessage,
  escapeHtml,
  forceReplyMarkup,
  inlineKeyboard,
  sendTelegramMedia,
} from "./telegram";

/* ------------------------------------------------------------------ */
/* Types & constants                                                   */
/* ------------------------------------------------------------------ */

export type EditImageRole = "scene" | "person";

export interface EditStagedImage {
  /** telegram file_id (re-downloadable at run time, survives session TTL) */
  fileId: string;
  fileUniqueId: string;
  kind: "photo" | "document";
  role: EditImageRole;
  /** pixel size when Telegram reports it (photos & image documents do) */
  width?: number;
  height?: number;
  fileSize?: number;
  /** caption seen on the message that staged this image (informational) */
  caption?: string;
}

export interface EditSession {
  images: EditStagedImage[];
  /** an edit prompt is being awaited as a reply */
  waitingPrompt?: 1;
  /** last successfully used prompt (for rerun) */
  lastPrompt?: string;
  updatedAt: number;
}

export const EDIT_CAP = 3;
export const EDIT_SESSION_TTL = 3600;
const keyFor = (chatId: string | number) => `tg:${chatId}:edit`;

/* ------------------------------------------------------------------ */
/* Session storage (KV)                                                */
/* ------------------------------------------------------------------ */

export async function getEditSession(
  env: Env,
  chatId: string | number
): Promise<EditSession | null> {
  if (!env.TELEGRAM_SETTINGS) return null;
  try {
    const raw = await env.TELEGRAM_SETTINGS.get(keyFor(chatId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EditSession;
    return Array.isArray(parsed.images) ? parsed : null;
  } catch {
    return null;
  }
}

async function putSession(
  env: Env,
  chatId: string | number,
  session: EditSession
): Promise<boolean> {
  if (!env.TELEGRAM_SETTINGS) return false;
  await env.TELEGRAM_SETTINGS.put(
    keyFor(chatId),
    JSON.stringify({ ...session, updatedAt: Date.now() }),
    { expirationTtl: EDIT_SESSION_TTL }
  );
  return true;
}

/**
 * Stages an image into the session (read → merge by file_unique_id → write).
 * Telegram delivers webhook updates serially per bot, so interleaving risk is
 * small; the merge still guards against rapid-fire re-delivery duplicates.
 */
export async function stageTelegramImage(
  env: Env,
  chatId: string | number,
  staged: Omit<EditStagedImage, "role">
): Promise<{
  session: EditSession;
  added: boolean;
  persisted: boolean;
  reason?: "duplicate" | "full";
}> {
  const session = (await getEditSession(env, chatId)) ?? { images: [], updatedAt: 0 };
  if (session.images.some((i) => i.fileUniqueId === staged.fileUniqueId)) {
    return { session, added: false, persisted: true, reason: "duplicate" };
  }
  if (session.images.length >= EDIT_CAP) {
    return { session, added: false, persisted: true, reason: "full" };
  }
  // First image = scene (the card's Image 1), everything after = person.
  const role: EditImageRole = session.images.length === 0 ? "scene" : "person";
  session.images.push({ ...staged, role });
  const persisted = await putSession(env, chatId, session);
  return { session, added: true, persisted, reason: persisted ? undefined : "full" };
}

/**
 * Makes image #index the scene (Image 1); all others become people.
 */
export async function setSceneIndex(
  env: Env,
  chatId: string | number,
  index: number
): Promise<EditSession | null> {
  const session = await getEditSession(env, chatId);
  if (!session || index < 0 || index >= session.images.length) return session;
  const images = session.images.map((img, i) => ({
    ...img,
    role: i === index ? ("scene" as EditImageRole) : ("person" as EditImageRole),
  }));
  const next: EditSession = { ...session, images };
  await putSession(env, chatId, next);
  return next;
}

export async function setEditWaitingPrompt(
  env: Env,
  chatId: string | number,
  waiting: boolean
): Promise<void> {
  const session = await getEditSession(env, chatId);
  if (!session) return;
  if (waiting) session.waitingPrompt = 1;
  else delete session.waitingPrompt;
  await putSession(env, chatId, session);
}

export async function saveEditLastPrompt(
  env: Env,
  chatId: string | number,
  prompt: string
): Promise<void> {
  const session = await getEditSession(env, chatId);
  if (!session) return;
  await putSession(env, chatId, { ...session, lastPrompt: prompt });
}

export async function clearEditSession(env: Env, chatId: string | number): Promise<boolean> {
  if (!env.TELEGRAM_SETTINGS) return false;
  await env.TELEGRAM_SETTINGS.delete(keyFor(chatId));
  return true;
}

/** Loads the session or persists a fresh empty one (so staging works next). */
export async function ensureEditSession(
  env: Env,
  chatId: string | number
): Promise<EditSession> {
  const existing = await getEditSession(env, chatId);
  if (existing) return existing;
  const fresh: EditSession = { images: [], updatedAt: Date.now() };
  await putSession(env, chatId, fresh);
  return fresh;
}

/* ------------------------------------------------------------------ */
/* Guide & status text                                                 */
/* ------------------------------------------------------------------ */

export function roleSummary(images: EditStagedImage[]): string {
  const scene = images.filter((i) => i.role === "scene").length;
  const person = images.filter((i) => i.role === "person").length;
  return `${scene} scene · ${person} person${person === 1 ? "" : "s"}`;
}

export const EDIT_GUIDE_TEXT = [
  `✂️ <b>Identity Edit</b> — edit a photo or add characters.`,
  ``,
  `<b>Who goes where</b>`,
  `• Image 1 = the base/scene photo — the image that gets edited, or the background.`,
  `• Image 2 = a person/character photo — their face is brought into the scene.`,
  `• Up to <b>${EDIT_CAP} people</b>: send each extra person as one more message; they are added one pass at a time.`,
  ``,
  `<b>How to prompt</b> <i>(tips from the model card)</i>`,
  `• Say how much of them is visible: <code>full body</code>, <code>sitting astride</code> — otherwise it copies the head-and-shoulders crop of the reference.`,
  `• Name the outfit explicitly: <code>wearing an emerald green silk dress</code> — clothing otherwise carries over from the reference photo.`,
  `• Say where each person goes: <code>on the left of the field</code>, <code>in the foreground</code> — so they don't replace earlier people.`,
  ``,
  `<b>Examples</b>`,
  `• One photo (editor mode): <i>"Change the dress to emerald green silk, keep the exact facial identity, hairstyle and lighting."</i>`,
  `• Two photos: <i>"Full body, the character walks beside her on the left, wearing a navy wool coat, natural lighting."</i>`,
].join("\n");

export function editHomeText(session: EditSession): string {
  const n = session.images.length;
  const header = [
    `✂️ <b>Identity Edit</b>`,
    `🖼️ <b>${n}/${EDIT_CAP} staged</b> (${roleSummary(session.images)})`,
    ``,
  ];
  const perImage = session.images.map((img, i) => {
    const role = img.role === "scene" ? "🖼️ Scene (Image 1)" : "🧑 Person";
    const size = img.width && img.height ? ` · ${img.width}×${img.height}` : "";
    const cap = img.caption ? ` · 📝 "<i>${escapeHtml(img.caption.slice(0, 60))}</i>"` : "";
    return `${i + 1}. ${role}${size}${cap}`;
  });
  const footer =
    n === 0
      ? [`Send your <b>base photo</b> first (1 = scene/base), then people.`, `Send 1–${EDIT_CAP} photos, then tap ✍️ to write the prompt.`]
      : [
          `Send more photos${n < EDIT_CAP ? "" : ` (max ${EDIT_CAP} reached)`}, or tap <b>✍️ Write prompt &amp; run</b>.`,
        ];
  return [...header, ...perImage, ``, ...footer].join("\n");
}

export type KbRow = [string, string][];

export function editHomeMarkup(hasImages: boolean): Record<string, any> {
  const rows: KbRow[] = [];
  if (hasImages) {
    rows.push([["✍️ Write prompt & run", "edit:prompt"]]);
    rows.push([["🎭 Change roles", "edit:roles"], ["🗑 Clear photos", "edit:clear"]]);
  }
  rows.push([["📖 Guide", "edit:guide"]]);
  rows.push([["✖️ Exit /edit", "edit:exit"]]);
  return inlineKeyboard(rows);
}

export function rolePickerMarkup(session: EditSession): Record<string, any> {
  const rows: KbRow[] = session.images.map((img, i) => [
    [
      img.role === "scene" ? `✅ Scene — Photo ${i + 1}` : `🧑 Person — Photo ${i + 1}`,
      `edit:role:${i}`,
    ],
  ]);
  rows.push([["⬅️ Back", "edit:refresh"]]);
  return inlineKeyboard(rows);
}

export function rolePickerText(session: EditSession): string {
  const lines = session.images.map(
    (img, i) =>
      `${i + 1}. <b>${img.role === "scene" ? "Scene / Image 1" : "Person"}</b>${
        img.width && img.height ? ` — ${img.width}×${img.height}` : ""
      }`
  );
  return [
    `🎭 <b>Who goes where</b>`,
    ``,
    ...lines,
    ``,
    `Tap a photo to make it the <b>scene</b> (Image 1 — the one that gets edited); the rest become <b>people</b> (Image 2+).`,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Telegram file intake                                                */
/* ------------------------------------------------------------------ */

const TELEGRAM_API = "https://api.telegram.org";

/** Downloads a Telegram file by id (≤20MB — bot API cap). */
export async function getTelegramFileBlob(token: string, fileId: string): Promise<Blob> {
  const infoRes = await fetch(`${TELEGRAM_API}/bot${token}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const info = await infoRes.json().catch(() => null);
  const filePath = info?.result?.file_path;
  if (!info?.ok || !filePath) {
    throw new Error(`Telegram getFile failed (${info?.description || infoRes.status}).`);
  }
  const blobRes = await fetch(`${TELEGRAM_API}/file/bot${token}/${filePath}`);
  if (!blobRes.ok) throw new Error(`Telegram file download failed (${blobRes.status}).`);
  return await blobRes.blob();
}

/* ------------------------------------------------------------------ */
/* Relay upload (per-run cache keyed by file_unique_id / pass)          */
/* ------------------------------------------------------------------ */

const relayNameCache = new Map<string, string>();

export async function uploadToRelay(
  endpoint: RelayEndpoint,
  blob: Blob,
  cacheKey?: string,
  filenameHint?: string
): Promise<string> {
  if (cacheKey) {
    const cached = relayNameCache.get(cacheKey);
    if (cached) return cached;
  }
  const form = new FormData();
  form.append("overwrite", "true");
  form.append("image", blob, filenameHint || `tg_edit_${Date.now().toString(36)}.png`);
  const res = await fetch(relayUrl(endpoint, "/upload/image"), {
    method: "POST",
    headers: endpoint.headers,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Relay /upload/image failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data?.name) throw new Error("Relay upload returned no file name.");
  if (cacheKey) relayNameCache.set(cacheKey, data.name as string);
  return data.name as string;
}

function clearPassCache(): void {
  for (const key of Array.from(relayNameCache.keys())) {
    if (key.startsWith("pass_")) relayNameCache.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/* Output resolution — match the scene photo, ≤1.5 MP, snapped to /8   */
/* ------------------------------------------------------------------ */

const MAX_EDIT_MP = 1.5;

export function editResolution(
  session: EditSession
): { width: number; height: number } {
  const scene = session.images.find((i) => i.role === "scene");
  if (!scene?.width || !scene?.height || scene.width < 16 || scene.height < 16) {
    return { width: 1024, height: 1024 };
  }
  const snap = (v: number) => Math.max(8, Math.round(v / 8) * 8);
  const mp = (scene.width * scene.height) / 1_000_000;
  if (mp <= MAX_EDIT_MP) return { width: snap(scene.width), height: snap(scene.height) };
  const scale = Math.sqrt(MAX_EDIT_MP / mp);
  return { width: snap(scene.width * scale), height: snap(scene.height * scale) };
}

/* ------------------------------------------------------------------ */
/* Krea2 identity-edit graph                                           */
/* ------------------------------------------------------------------ */
/* Node map mirrors the web studio / krea2-identity-edit-api.json:
 *   29 SaveImage | 53 KSampler | 54 VAEDecode | 55 UNET | 56 CLIP | 57 VAE
 *   71 LoRA | 72 LoadImage(scene) | 73 VAEEncode | 79 Krea2EditModelPatch
 *   82 EmptySD3LatentImage | 84/85 Krea2EditGroundedEncode
 * Two-image mode additionally appends 90 (LoadImage person) + 92 (VAEEncode)
 * and wires image_b / source_latent_b / source_image_b.                  */

interface EditNode {
  inputs: Record<string, any>;
  class_type: string;
  _meta?: Record<string, any>;
}
type EditGraph = Record<string, EditNode>;

function baseEditGraph(): EditGraph {
  const g: EditGraph = {
    "29": {
      inputs: { filename_prefix: "tg_krea2_edit", images: ["54", 0] },
      class_type: "SaveImage",
      _meta: { title: "Save Image", cnr_id: "comfy-core" },
    },
    "53": {
      inputs: {
        seed: 423516491587350,
        steps: 8,
        cfg: 1,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1,
        model: ["79", 0],
        positive: ["84", 0],
        negative: ["85", 0],
        latent_image: ["82", 0],
      },
      class_type: "KSampler",
      _meta: { title: "KSampler", cnr_id: "comfy-core" },
    },
    "54": {
      inputs: { samples: ["53", 0], vae: ["57", 0] },
      class_type: "VAEDecode",
      _meta: { title: "VAE Decode", cnr_id: "comfy-core" },
    },
    "55": {
      inputs: { unet_name: "Kroma (Krea-2).safetensors", weight_dtype: "default" },
      class_type: "UNETLoader",
      _meta: { title: "Load Diffusion Model", cnr_id: "comfy-core" },
    },
    "56": {
      inputs: { clip_name: "qwen3vl_4b_bf16.safetensors", type: "krea2", device: "default" },
      class_type: "CLIPLoader",
      _meta: { title: "Load CLIP", cnr_id: "comfy-core" },
    },
    "57": {
      inputs: { vae_name: "qwen_image_vae.safetensors" },
      class_type: "VAELoader",
      _meta: { title: "Load VAE", cnr_id: "comfy-core" },
    },
    "71": {
      inputs: {
        lora_name: "conradlocke.krea2-identity-edit.safetensors",
        strength_model: 1,
        model: ["55", 0],
      },
      class_type: "LoraLoaderModelOnly",
      _meta: { title: "Load LoRA", cnr_id: "comfy-core" },
    },
    "72": {
      inputs: { image: "" },
      class_type: "LoadImage",
      _meta: { title: "Image 1 (scene)", cnr_id: "comfy-core" },
    },
    "73": {
      inputs: { pixels: ["72", 0], vae: ["57", 0] },
      class_type: "VAEEncode",
      _meta: { title: "VAE Encode (scene)", cnr_id: "comfy-core" },
    },
    "79": {
      inputs: {
        ref_boost: 2,
        ref_boost_a: 1,
        fit_mode: "fit",
        model: ["71", 0],
        source_latent: ["73", 0],
        source_image: ["72", 0],
        vae: ["57", 0],
        target_latent: ["82", 0],
      },
      class_type: "Krea2EditModelPatch",
      _meta: { title: "Krea2 Edit (source patch)", cnr_id: "comfyui-krea2edit" },
    },
    "82": {
      inputs: { width: 1024, height: 1024, batch_size: 1 },
      class_type: "EmptySD3LatentImage",
      _meta: { title: "EmptySD3LatentImage", cnr_id: "comfy-core" },
    },
    "84": {
      inputs: {
        prompt: "",
        grounding_px: 768,
        system_prompt: "",
        clip: ["56", 0],
        image: ["72", 0],
      },
      class_type: "Krea2EditGroundedEncode",
      _meta: { title: "grounded encode (positive)", cnr_id: "comfyui-krea2edit" },
    },
    "85": {
      inputs: {
        prompt: "",
        grounding_px: 768,
        system_prompt: "",
        clip: ["56", 0],
        image: ["72", 0],
      },
      class_type: "Krea2EditGroundedEncode",
      _meta: { title: "negative (leave empty)", cnr_id: "comfyui-krea2edit" },
    },
  };
  return g;
}

export interface EditGraphOptions {
  sceneFilename: string;
  refFilename?: string;
  prompt: string;
  systemPrompt?: string;
  groundingPx?: number;
  refBoost?: number; // person (Image 2)
  refBoostScene?: number; // scene (Image 1)
  placementRef?: string;
  placementScene?: string;
  steps?: number;
  cfg?: number;
  seed: number;
  width: number;
  height: number;
}

function buildKrea2EditGraph(opts: EditGraphOptions): EditGraph {
  const graph = baseEditGraph();
  const clamp = (v: any, min: number, max: number) =>
    Math.max(min, Math.min(max, Number(v) || 0));

  graph["72"].inputs.image = opts.sceneFilename;
  graph["84"].inputs.prompt = opts.prompt || "";
  graph["84"].inputs.grounding_px = clamp(opts.groundingPx ?? 768, 256, 1024);
  graph["84"].inputs.system_prompt = opts.systemPrompt ?? "";
  graph["85"].inputs.grounding_px = graph["84"].inputs.grounding_px;
  graph["79"].inputs.ref_boost = clamp(opts.refBoost ?? 2, 0, 12);
  graph["79"].inputs.ref_boost_a = clamp(opts.refBoostScene ?? 1, 0, 12);
  graph["71"].inputs.strength_model = 1;
  graph["53"].inputs.seed = Math.abs(Math.floor(opts.seed)) || 0;
  graph["53"].inputs.steps = Math.max(1, Math.min(64, Math.round(opts.steps ?? 8)));
  graph["53"].inputs.cfg = opts.cfg ?? 1;
  graph["82"].inputs.width = clamp(opts.width, 256, 4096);
  graph["82"].inputs.height = clamp(opts.height, 256, 4096);

  if (opts.refFilename) {
    graph["90"] = {
      inputs: { image: opts.refFilename },
      class_type: "LoadImage",
      _meta: { title: "Image 2 (person)", cnr_id: "comfy-core" },
    };
    graph["92"] = {
      inputs: { pixels: ["90", 0], vae: ["57", 0] },
      class_type: "VAEEncode",
      _meta: { title: "VAE Encode (person)", cnr_id: "comfy-core" },
    };
    graph["79"].inputs.source_latent_b = ["92", 0];
    graph["79"].inputs.source_image_b = ["90", 0];
    graph["84"].inputs.image_b = ["90", 0];
    graph["85"].inputs.image_b = ["90", 0];
    graph["79"].inputs.ref_position = opts.placementRef ?? "beside";
    graph["79"].inputs.ref_position_a = opts.placementScene ?? "aligned";
  }

  return graph;
}

/* ------------------------------------------------------------------ */
/* Runner: single edit + multi-pass chain                              */
/* ------------------------------------------------------------------ */

interface EditOutputRef {
  filename: string;
  subfolder: string;
  type: string;
}

/** Local history poll (comfy.ts's pollForCompletion is typed to BotWorkflow). */
async function pollEditRun(
  endpoint: RelayEndpoint,
  promptId: string,
  maxWaitMs = 240_000,
  intervalMs = 1500
): Promise<EditOutputRef[]> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const res = await fetch(relayUrl(endpoint, `/history/${promptId}`), {
        method: "GET",
        headers: endpoint.headers,
        cf: { cacheTtl: 0 },
      });
      if (!res.ok) continue;
      const history = await res.json();
      const entry = history?.[promptId];
      if (!entry) continue;

      const found: EditOutputRef[] = [];
      const outputs = entry.outputs ?? {};
      const nodeIds = outputs["29"] ? ["29"] : Object.keys(outputs);
      for (const id of nodeIds) {
        const out = outputs[id];
        if (Array.isArray(out?.images)) {
          for (const img of out.images) {
            found.push({
              filename: img.filename,
              subfolder: img.subfolder || "",
              type: img.type || "output",
            });
          }
        }
      }
      if (found.length > 0) return found;
    } catch {
      // transient — keep polling
    }
  }
  throw new Error(`Edit timed out after ${Math.round(maxWaitMs / 1000)}s.`);
}

export interface EditRunOptions {
  endpoint: RelayEndpoint;
  chatId: number;
  prompt: string;
  /** status message edited between passes */
  statusMessageId?: number;
  seed?: number;
}

/**
 * Executes the identity-edit flow for the current session:
 *   1 image  → single-image edit (editor mode)
 *   2 images → scene + one person
 *   3 images → two chained passes (previous output becomes next scene)
 * Delivers the final image(s) with a caption + result keyboard.
 */
export async function runEditFlow(env: Env, chatId: number, run: EditRunOptions): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN!;
  const session = await getEditSession(env, chatId);
  if (!session || session.images.length === 0) {
    await sendTelegramMessage(
      token,
      chatId,
      `🤷 <b>No photos staged.</b> Send 1–${EDIT_CAP} photos first (type <code>/edit</code> for the guide).`,
      { parseMode: "HTML" }
    );
    return;
  }

  const scene = session.images.find((i) => i.role === "scene") ?? session.images[0];
  const persons = session.images.filter((i) => i.role === "person" && i !== scene);

  const seed = Math.abs(Math.floor(run.seed ?? Math.random() * 281474976710656));
  const prompt = run.prompt.trim() || "keep the identity, natural lighting";
  const resolution = editResolution(session);
  const passes = persons.length > 0 ? persons.length : 1;

  try {
    let lastOutput: { ref: EditOutputRef; blob: Blob } | null = null;

    for (let p = 0; p < passes; p++) {
      const person = persons.length > 0 ? persons[p] : undefined;
      const label =
        persons.length > 0 ? `Pass ${p + 1}/${persons.length}` : "Editing your photo";

      await sendTelegramChatAction(token, chatId, "upload_photo").catch(() => {});
      if (run.statusMessageId) {
        await editTelegramMessage(
          token,
          chatId,
          run.statusMessageId,
          persons.length > 0
            ? `⏳ <b>Identity edit</b> · ${escapeHtml(label)}${person ? " — bringing in the next person" : ""} · rendering…`
            : `⏳ <b>Identity edit</b> · rendering…`,
          { parseMode: "HTML" }
        ).catch(() => {});
      }

      // 1. Scene source: pass 0 = user's staged scene; later passes = chained output.
      const sceneBlob =
        p === 0
          ? await getTelegramFileBlob(token, scene.fileId)
          : lastOutput
          ? lastOutput.blob
          : await getTelegramFileBlob(token, scene.fileId);

      // 2. Person reference for this pass.
      let refName: string | undefined;
      if (person) {
        const refBlob = await getTelegramFileBlob(token, person.fileId);
        refName = await uploadToRelay(
          run.endpoint,
          refBlob,
          person.fileUniqueId,
          `tg_ref_${p}.png`
        );
      }

      // 3. Scene upload: pass 0 caches by file_unique_id (cheap reruns);
      //    chained passes upload fresh bytes every time.
      const sceneName = await uploadToRelay(
        run.endpoint,
        sceneBlob,
        p === 0 ? scene.fileUniqueId : undefined,
        p === 0 ? "tg_scene.png" : undefined
      );

      // 4. Build & queue. Scene aligned, each person beside; grounding 768 is
      //    the card's default.
      //    Pass prompts: pass 0 uses the user's prompt verbatim; later passes
      //    prefix an "add person" instruction since the reference is new.
      const passPrompt =
        persons.length > 0 && p > 0
          ? `Add person ${p + 1}: ${prompt} Preserve the exact facial identity of the person; do not change the existing people.`
          : prompt;

      const graph = buildKrea2EditGraph({
        sceneFilename: sceneName,
        refFilename: refName,
        prompt: passPrompt,
        groundingPx: 768,
        refBoost: refName ? 2.5 : 2,
        refBoostScene: 1,
        placementRef: refName ? "beside" : undefined,
        placementScene: refName ? "aligned" : undefined,
        steps: 8,
        cfg: 1,
        seed,
        width: resolution.width,
        height: resolution.height,
      });

      const promptId = await queuePrompt(
        run.endpoint,
        graph,
        `tg_edit_${chatId}_${Date.now()}_${p}`
      );
      const outputs = await pollEditRun(run.endpoint, promptId);
      const outRef = outputs[0];
      if (!outRef) throw new Error("Edit produced no output.");

      const blob = await fetchMediaBlob(run.endpoint, outRef);
      lastOutput = { ref: outRef, blob };

      if (p < passes - 1) {
        await editTelegramMessage(
          token,
          chatId,
          run.statusMessageId!,
          `✅ Pass ${p + 1} done — adding the next person…`,
          { parseMode: "HTML" }
        ).catch(() => {});
      }
    }

    // Final delivery
    if (lastOutput) {
      const caption = [
        `✂️ <b>Identity Edit</b>${persons.length > 0 ? ` · ${persons.length} pass${persons.length > 1 ? "es" : ""}` : ""} · seed <code>${escapeHtml(String(seed))}</code>`,
        `<i>${escapeHtml(prompt.slice(0, 300))}</i>`,
      ].join("\n");
      const kb: KbRow[] = [
        [["🔁 Rerun", "edit:rerun"]],
        [["✍️ New prompt", "edit:prompt"]],
        [["🗑 Clear photos", "edit:clear"]],
      ];
      await sendTelegramMedia(
        token,
        chatId,
        lastOutput.blob,
        lastOutput.ref.filename,
        caption,
        { parseMode: "HTML", replyMarkup: inlineKeyboard(kb) }
      );
      if (run.statusMessageId) {
        await deleteTelegramMessage(token, chatId, run.statusMessageId).catch(() => {});
      }
    }
    await saveEditLastPrompt(env, chatId, prompt);
  } catch (err: any) {
    const msg = String(err?.message || "Unknown error").slice(0, 300);
    const failText = `❌ <b>Identity edit failed</b>\n<code>${escapeHtml(msg)}</code>`;
    if (run.statusMessageId) {
      await editTelegramMessage(token, chatId, run.statusMessageId, failText, {
        parseMode: "HTML",
      }).catch(() => {});
    } else {
      await sendTelegramMessage(token, chatId, failText, { parseMode: "HTML" }).catch(() => {});
    }
  } finally {
    // Pass-cache entries must never straddle runs (stale chained uploads).
    clearPassCache();
  }
}

/* ------------------------------------------------------------------ */
/* Facade: session bootstrap / status send                             */
/* ------------------------------------------------------------------ */

export async function startEditSession(
  env: Env,
  chatId: number,
  session: EditSession | null
): Promise<EditSession> {
  const s = session ?? (await ensureEditSession(env, chatId));
  const token = env.TELEGRAM_BOT_TOKEN!;
  await sendTelegramMessage(token, chatId, editHomeText(s), {
    parseMode: "HTML",
    replyMarkup: editHomeMarkup(s.images.length > 0),
  });
  return s;
}

/**
 * Enters prompt mode: explains what to reply with and flags the session so
 * the next reply message is treated as the edit prompt.
 */
export async function requestEditPrompt(
  env: Env,
  chatId: number,
  session: EditSession | null
): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN!;
  const s = session ?? (await ensureEditSession(env, chatId));
  if (s.images.length === 0) {
    await sendTelegramMessage(
      token,
      chatId,
      `🖼️ <b>Stage a photo first</b>\nSend 1–${EDIT_CAP} photos, then tap ✍️ again.`,
      { parseMode: "HTML", replyMarkup: editHomeMarkup(false) }
    );
    return;
  }
  await sendTelegramMessage(
    token,
    chatId,
    [
      `✍️ <b>Describe the edit</b> — send it as a reply.`,
      ``,
      `<i>Reminders:</i> say <code>full body</code> when showing a person in full, name the outfit explicitly, and say where each character goes (left / right / foreground).`,
    ].join("\n"),
    {
      parseMode: "HTML",
      replyMarkup: forceReplyMarkup("Describe the edit… (full body, outfit, placement)"),
    }
  );
  await setEditWaitingPrompt(env, chatId, true);
}
