import {
  Env,
  getRelayEndpoint,
  queuePrompt,
  pollForCompletion,
  fetchMediaBlob,
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
} from "./telegram";
import {
  PromptBatchPayload,
  resolveBatch,
} from "./promptTemplate";

const clamp = (s: string, max = 150) =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;

/**
 * Runs a batch queue of prompts sequentially (one after another),
 * updating Telegram status and sending each rendered image as it completes.
 */
export async function runBatchQueue(
  env: Env,
  chatId: number,
  token: string,
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

  // 1. Send initial batch confirmation message
  const initialText = [
    `📦 <b>Batch Queued: ${batch.total} image${batch.total > 1 ? "s" : ""}</b>`,
    `🎨 <b>Model:</b> ${escapeHtml(wf.displayName)}`,
    `📐 <b>Ratio:</b> ${escapeHtml(ratio.id)} <i>(${ratio.width}×${ratio.height})</i>`,
    ``,
    `⏳ <i>Starting sequential generation (1-by-1)...</i>`,
  ].join("\n");

  const statusId = await sendTelegramMessage(token, chatId, initialText, {
    parseMode: "HTML",
  }).catch(() => undefined);

  let successCount = 0;
  let failCount = 0;

  // 2. Process each prompt sequentially
  for (let i = 0; i < batch.total; i++) {
    const itemNum = i + 1;
    const promptText = batch.resolvedPrompts[i];
    const seed = generateRandomSeed();

    // Update status board for current item
    if (statusId) {
      await editTelegramMessage(
        token,
        chatId,
        statusId,
        [
          `⏳ <b>[${itemNum}/${batch.total}] Rendering...</b>`,
          `🎨 ${escapeHtml(wf.displayName)} · 📐 ${escapeHtml(ratio.id)}`,
          `<i>"${escapeHtml(clamp(promptText, 200))}"</i>`,
        ].join("\n"),
        { parseMode: "HTML" }
      ).catch(() => {});
      await sendTelegramChatAction(token, chatId, "upload_photo");
    }

    try {
      const effective = getEffectivePromptSettings(stored, wf);
      const negative = wf.supportsNegativePrompt
        ? batch.negativeOverride ?? effective.negative
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

      // Save as lastRun for quick regeneration
      await setLastRun(env, chatId, {
        positive: promptText,
        negative: batch.negativeOverride,
        workflowId: wf.id,
        ratio: ratio.id,
        seed,
      });

      const caption = [
        `<b>[${itemNum}/${batch.total}]</b> · 🎨 ${escapeHtml(wf.displayName)} · 📐 ${escapeHtml(ratio.id)} · seed <code>${escapeHtml(seed)}</code>`,
        `<i>${escapeHtml(clamp(promptText, 300))}</i>`,
      ].join("\n");

      for (const ref of mediaRefs) {
        const blob = await fetchMediaBlob(endpoint, ref);
        await sendTelegramMedia(token, chatId, blob, ref.filename, caption, {
          parseMode: "HTML",
        });
      }

      successCount++;
    } catch (err: any) {
      failCount++;
      const errMsg = err?.message || "Unknown error";
      await sendTelegramMessage(
        token,
        chatId,
        `⚠️ <b>[${itemNum}/${batch.total}] Generation failed</b>\n<code>${escapeHtml(clamp(errMsg, 250))}</code>`,
        { parseMode: "HTML" }
      ).catch(() => {});
    }
  }

  // 3. Final completion summary
  const summaryText = [
    failCount === 0 ? `✅ <b>Batch complete!</b>` : `⚠️ <b>Batch finished with issues</b>`,
    `🎨 <b>Model:</b> ${escapeHtml(wf.displayName)} · 📐 ${escapeHtml(ratio.id)}`,
    `📊 <b>Delivered:</b> ${successCount}/${batch.total} images.`,
  ].join("\n");

  if (statusId) {
    await editTelegramMessage(token, chatId, statusId, summaryText, {
      parseMode: "HTML",
    }).catch(async () => {
      await sendTelegramMessage(token, chatId, summaryText, { parseMode: "HTML" });
    });
  } else {
    await sendTelegramMessage(token, chatId, summaryText, { parseMode: "HTML" });
  }
}
