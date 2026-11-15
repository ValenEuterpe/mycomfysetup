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

export interface StoredBatchState {
  batchId: string;
  chatId: number;
  secret: string;
  status: "running" | "cancelled" | "completed";
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
    // Retain state for up to 2 hours
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
  if (!state || state.status !== "running") {
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
 * back to /api/telegram. This ensures each step runs within a fresh 100-second
 * execution budget on Cloudflare Pages Functions, bypassing serverless timeouts.
 */
export async function triggerNextBatchStep(
  env: Env,
  origin: string,
  chatId: number,
  batchId: string,
  secret: string
): Promise<void> {
  try {
    const url = new URL(`${origin}/api/telegram`);
    url.searchParams.set("batch_step", "1");
    url.searchParams.set("chat_id", String(chatId));
    url.searchParams.set("batch_id", batchId);
    url.searchParams.set("secret", secret);

    const headers: Record<string, string> = {
      "User-Agent": "LocalImageGen-BatchWorker/1.0",
    };
    if (env.TELEGRAM_WEBHOOK_SECRET?.trim()) {
      headers["X-Telegram-Bot-Api-Secret-Token"] = env.TELEGRAM_WEBHOOK_SECRET.trim();
    }

    await fetch(url.toString(), {
      method: "POST",
      headers,
    });
  } catch (err) {
    console.error("[telegramBatch] triggerNextBatchStep error:", err);
  }
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
    `⏳ <i>Starting generation (1-by-1)...</i>`,
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
  };

  await saveBatchState(env, chatId, state);

  // 2. Launch step 0
  await processBatchStep(env, origin, chatId, batchId, token);
}

/**
 * Processes a single prompt item in the batch, delivers the result to Telegram,
 * and triggers the next step via self-chaining.
 */
export async function processBatchStep(
  env: Env,
  origin: string,
  chatId: number,
  batchId: string,
  token: string
): Promise<void> {
  const state = await getBatchState(env, chatId);

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

  // Check if all items have been processed
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

    // Check if user cancelled while this prompt was polling
    const freshCheck = await getBatchState(env, chatId);
    if (!freshCheck || freshCheck.status === "cancelled") {
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

  // Check cancellation again
  const postCheck = await getBatchState(env, chatId);
  if (!postCheck || postCheck.status === "cancelled") {
    await clearBatchState(env, chatId);
    return;
  }

  // Advance index and persist updated state
  state.currentIndex = itemIndex + 1;
  state.updatedAt = Date.now();
  await saveBatchState(env, chatId, state);

  // If there are more items, trigger the next step in a fresh request context!
  if (state.currentIndex < state.total) {
    await triggerNextBatchStep(env, origin, chatId, batchId, state.secret);
  } else {
    // Done! Process final summary
    await processBatchStep(env, origin, chatId, batchId, token);
  }
}
