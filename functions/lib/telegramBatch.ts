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
    };
    if (env.TELEGRAM_WEBHOOK_SECRET?.trim()) {
      headers["X-Telegram-Bot-Api-Secret-Token"] = env.TELEGRAM_WEBHOOK_SECRET.trim();
    }

    const res = await fetch(url.toString(), {
      method: "POST",
      headers,
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
        [["▶️ Resume Queue", "batch:resume"]],
        [["🛑 Cancel Queue", "batch:cancel"]],
      ]);

      await sendTelegramMessage(token, chatId, pausedNotice, {
        parseMode: "HTML",
        replyMarkup: resumeMarkup,
      }).catch(() => {});
    }
  } catch (err: any) {
    console.error("[telegramBatch] triggerNextBatchStep error:", err);
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

  await processBatchStep(env, origin, chatId, state.batchId, token);
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
  await processBatchStep(env, origin, chatId, batchId, token);
}

/**
 * Processes multiple prompt items within an adaptive time budget (up to 55s or 4 images),
 * delivering results to Telegram, and chaining to the next step. If Cloudflare's
 * recursion hop limit approaches (hop >= 13), it cleanly pauses with a one-tap Resume
 * button to prevent 503 errors.
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

  // Adaptive execution loop: process multiple images within safe 55s window
  const stepStartTime = Date.now();
  const MAX_STEP_TIME_MS = 55_000;
  const MAX_IMAGES_PER_STEP = 4;
  let imagesInThisStep = 0;

  while (state.currentIndex < state.total && imagesInThisStep < MAX_IMAGES_PER_STEP) {
    // Check cancellation before each image
    const liveCheck = await getBatchState(env, chatId);
    if (!liveCheck || liveCheck.status === "cancelled") {
      await clearBatchState(env, chatId);
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
      const postPollCheck = await getBatchState(env, chatId);
      if (!postPollCheck || postPollCheck.status === "cancelled") {
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

    // Advance index and persist state
    state.currentIndex = itemIndex + 1;
    state.updatedAt = Date.now();
    await saveBatchState(env, chatId, state);
    imagesInThisStep++;

    // Check if time budget is exhausted
    const elapsed = Date.now() - stepStartTime;
    if (elapsed >= MAX_STEP_TIME_MS) {
      break;
    }
  }

  // If all items finished, render summary and clear
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

  // Advance hop counter
  state.hopCount = (state.hopCount || 0) + 1;
  state.updatedAt = Date.now();
  await saveBatchState(env, chatId, state);

  // Safety checkpoint: if Cloudflare subrequest recursion limit is near (hop >= 13),
  // pause cleanly with a one-click Resume button instead of crashing with 503.
  if (state.hopCount >= 13) {
    state.status = "paused";
    await saveBatchState(env, chatId, state);

    const checkpointText = [
      `⏳ <b>Batch Checkpoint [${state.currentIndex}/${state.total}]</b>`,
      `🎨 <b>Model:</b> ${escapeHtml(wf.displayName)} · 📐 <b>Ratio:</b> ${escapeHtml(ratio.id)}`,
      `📊 Successfully delivered ${state.successCount} images.`,
      ``,
      `<i>Cloudflare serverless safety checkpoint reached.</i>`,
      `Tap below to seamlessly continue the next set of images!`,
    ].join("\n");

    const resumeMarkup = inlineKeyboard([
      [["▶️ Continue Queue", "batch:resume"]],
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
