import {
  Env,
  getRelayEndpoint,
  queuePrompt,
  pollForCompletion,
  fetchMediaBlob,
} from "../lib/comfy";
import {
  buildInjectedWorkflow,
  getWorkflow,
  listWorkflows,
  listRatios,
  resolveRatio,
  generateRandomSeed,
  DEFAULT_WORKFLOW_ID,
} from "../lib/workflows";
import {
  getSettings,
  saveSettings,
  resetSettings,
  setAwaiting,
  getAwaiting,
  setLastRun,
  getLastRun,
  ChatSettings,
  LastRun,
} from "../lib/settings";
import {
  sendTelegramMessage,
  sendTelegramMedia,
  editTelegramMessage,
  answerTelegramCallback,
  sendTelegramChatAction,
  deleteTelegramMessage,
  escapeHtml,
  forceReplyMarkup,
  inlineKeyboard,
} from "../lib/telegram";

interface TelegramUser {
  id?: number;
  is_bot?: boolean;
}

interface TelegramUpdate {
  message?: {
    chat?: { id?: number };
    message_id?: number;
    text?: string;
    from?: TelegramUser;
    reply_to_message?: { from?: TelegramUser };
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: TelegramUser;
    message?: { chat?: { id?: number }; message_id?: number };
  };
}

const clamp = (s: string, max = 60) =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;

type KbRow = [string, string][];

const WRITE_PROMPT_ROW: KbRow = [["✍️ Write prompt", "ask:prompt"]];
const OPEN_SETTINGS_ROW: KbRow = [["🎛 Open settings", "panel"]];
const HOME_ROWS: KbRow[] = [WRITE_PROMPT_ROW, OPEN_SETTINGS_ROW];
const RESULT_ROWS: KbRow[] = [
  [
    ["🔁 Regenerate", "run:last"],
    ["🎛 Settings", "panel"],
  ],
];

const PANEL_ROWS: KbRow[] = [
  WRITE_PROMPT_ROW,
  [["🎨 Model — ▸", "pick:model"]],
  [["📐 Ratio — ▸", "pick:ratio"]],
  [
    ["✨ Edit prefill", "edit:prefill"],
    ["🚫 Edit negative", "edit:negative"],
  ],
  [["♻️ Reset all", "reset"]],
];

async function warnNoKV(token: string, chatId: number, env: Env): Promise<void> {
  if (env.TELEGRAM_SETTINGS) return;
  await sendTelegramMessage(
    token,
    chatId,
    "⚠️ <b>Settings persistence unavailable.</b>\nThe <code>TELEGRAM_SETTINGS</code> KV binding is missing on this deployment — chosen values apply only for this session. See the project README to enable persistent storage.",
    { parseMode: "HTML" }
  );
}

function panelText(s: ChatSettings): string {
  const model = getWorkflow(s.modelId) ?? getWorkflow(DEFAULT_WORKFLOW_ID);
  const ratio = resolveRatio(s.ratio);
  const prefillLabel = s.prefill
    ? `<code>${escapeHtml(clamp(s.prefill))}</code>`
    : "<i>off</i>";
  const negativeLabel = s.negative
    ? `<code>${escapeHtml(clamp(s.negative))}</code>`
    : "<i>off</i>";
  return [
    `🎛 <b>Bot Settings</b>`,
    `<i>Your choices apply to every generation until you change them.</i>`,
    ``,
    `🎨 <b>Model</b>: ${escapeHtml(model?.displayName ?? s.modelId)}`,
    `📐 <b>Ratio</b>: ${escapeHtml(s.ratio)}${ratio ? ` <i>(${ratio.width}×${ratio.height})</i>` : ""}`,
    `✨ <b>Prefill</b>: ${prefillLabel}`,
    `🚫 <b>Negative</b>: ${negativeLabel}`,
    ``,
    `✍️ Send any text to generate instantly with these settings.`,
  ].join("\n");
}

async function sendPanel(env: Env, chatId: number, token: string): Promise<void> {
  const s = await getSettings(env, chatId);
  await sendTelegramMessage(token, chatId, panelText(s), {
    parseMode: "HTML",
    replyMarkup: inlineKeyboard(PANEL_ROWS),
  });
}

function modelPickerMarkup(currentId: string): Record<string, any> {
  const rows: KbRow[] = listWorkflows().map((m) => [
    [`${m.id === currentId ? "✅" : "🎨"} ${m.name}`, `pick:model:${m.id}`],
  ]);
  rows.push(OPEN_SETTINGS_ROW);
  return inlineKeyboard(rows);
}

function ratioPickerMarkup(currentId: string): Record<string, any> {
  const options = listRatios();
  const rows: KbRow[] = [];
  for (let i = 0; i < options.length; i += 2) {
    const a = options[i];
    const b = options[i + 1];
    const row: KbRow = [
      [
        `${a.id === currentId ? "✅" : "📐"} ${a.id} · ${a.width}×${a.height}`,
        `pick:ratio:${a.id}`,
      ],
    ];
    if (b) {
      row.push([
        `${b.id === currentId ? "✅" : "📐"} ${b.id} · ${b.width}×${b.height}`,
        `pick:ratio:${b.id}`,
      ]);
    }
    rows.push(row);
  }
  rows.push(OPEN_SETTINGS_ROW);
  return inlineKeyboard(rows);
}

async function sendModelPicker(env: Env, chatId: number, token: string): Promise<void> {
  const s = await getSettings(env, chatId);
  await sendTelegramMessage(
    token,
    chatId,
    `🎨 <b>Choose a model</b>\n<i>Saved for future generations.</i>`,
    { parseMode: "HTML", replyMarkup: modelPickerMarkup(s.modelId) }
  );
}

async function sendRatioPicker(env: Env, chatId: number, token: string): Promise<void> {
  const s = await getSettings(env, chatId);
  await sendTelegramMessage(
    token,
    chatId,
    `📐 <b>Choose an aspect ratio</b>\n<i>Saved for future generations. ~1 megapixel base.</i>`,
    { parseMode: "HTML", replyMarkup: ratioPickerMarkup(s.ratio) }
  );
}

async function beginFieldEdit(
  env: Env,
  chatId: number,
  token: string,
  field: "prefill" | "negative"
): Promise<void> {
  const s = await getSettings(env, chatId);
  const current = field === "prefill" ? s.prefill : s.negative;
  const title =
    field === "prefill"
      ? `✨ <b>Anima prefill</b>`
      : `🚫 <b>Anima negative prompt</b>`;
  await sendTelegramMessage(
    token,
    chatId,
    [
      title,
      ``,
      `Current: ${current ? `<code>${escapeHtml(clamp(current))}</code>` : "<i>off</i>"}`,
      ``,
      `Send a replacement as a reply.`,
      `• <code>reset</code> — restore workflow default`,
      `• <code>(clear)</code> — turn it off`,
    ].join("\n"),
    {
      parseMode: "HTML",
      replyMarkup: forceReplyMarkup(
        field === "prefill"
          ? "new prefill (or: reset / (clear))"
          : "new negative (or: reset / (clear))"
      ),
    }
  );
  await setAwaiting(env, chatId, field);
}

async function applyFieldInput(
  env: Env,
  chatId: number,
  token: string,
  field: "prefill" | "negative",
  text: string
): Promise<void> {
  const defaults = getWorkflow(DEFAULT_WORKFLOW_ID);
  let value: string;
  if (/^\(?reset\)?$/i.test(text)) {
    value =
      (field === "prefill" ? defaults?.prefillDefault : defaults?.negativeDefault) ?? "";
  } else if (/^\(?clear\)?$/i.test(text) || /^(none|off|-)$/i.test(text)) {
    value = "";
  } else {
    value = text.slice(0, 1000).trim();
  }
  const persisted = await saveSettings(env, chatId, { [field]: value });
  if (!persisted) await warnNoKV(token, chatId, env);
  const label = field === "prefill" ? `✨ <b>Prefill</b>` : `🚫 <b>Negative</b>`;
  await sendTelegramMessage(
    token,
    chatId,
    `${label} updated: ${value ? `<code>${escapeHtml(clamp(value))}</code>` : "<i>off</i>"}`,
    { parseMode: "HTML", replyMarkup: inlineKeyboard(HOME_ROWS) }
  );
}

interface RunOptions {
  positive: string;
  negativeOverride?: string;
  modelId?: string;
  stored: ChatSettings;
  seed?: string;
}

async function runGeneration(
  env: Env,
  chatId: number,
  token: string,
  run: RunOptions
): Promise<void> {
  const wf = getWorkflow(run.modelId || run.stored.modelId || DEFAULT_WORKFLOW_ID);
  if (!wf) {
    await sendTelegramMessage(
      token,
      chatId,
      `❌ Unknown model <code>${escapeHtml(run.modelId || run.stored.modelId)}</code>. Try <code>/models</code>.`,
      { parseMode: "HTML" }
    );
    return;
  }

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

  const positive = run.positive.trim();
  if (!positive) {
    await sendTelegramMessage(token, chatId, "❌ Empty prompt — describe something!", {
      parseMode: "HTML",
    });
    return;
  }

  const ratio = resolveRatio(run.stored.ratio) ?? resolveRatio("1:1")!;
  const seed = run.seed || generateRandomSeed();
  const negative =
    wf.supportsNegativePrompt ? run.negativeOverride ?? run.stored.negative : undefined;

  const statusId = await sendTelegramMessage(
    token,
    chatId,
    `⏳ <b>Queuing</b> · 🎨 ${escapeHtml(wf.displayName)} · 📐 ${escapeHtml(ratio.id)}`,
    { parseMode: "HTML" }
  ).catch(() => undefined);

  try {
    const workflow = buildInjectedWorkflow(wf, {
      positive,
      negative,
      prefill: run.stored.prefill,
      seed,
      width: ratio.width,
      height: ratio.height,
    });
    const promptId = await queuePrompt(
      endpoint,
      workflow,
      `tg_${chatId}_${Date.now()}`
    );

    if (statusId) {
      await editTelegramMessage(
        token,
        chatId,
        statusId,
        `🎨 <b>Rendering</b> · ${escapeHtml(wf.displayName)} · ${escapeHtml(ratio.id)} · <i>usually 30–90 s</i>`,
        { parseMode: "HTML" }
      );
    }

    const mediaRefs = await pollForCompletion(endpoint, promptId, wf);

    const runRecord: LastRun = {
      positive,
      negative: run.negativeOverride,
      workflowId: wf.id,
      ratio: run.stored.ratio,
      seed,
    };
    await setLastRun(env, chatId, runRecord);

    if (statusId) await sendTelegramChatAction(token, chatId, "upload_photo");

    const caption = [
      `<b>${escapeHtml(wf.displayName)}</b> · 📐 ${escapeHtml(ratio.id)} · seed <code>${escapeHtml(seed)}</code>`,
      `<i>${escapeHtml(clamp(positive, 300))}</i>`,
    ].join("\n");

    let first = true;
    for (const ref of mediaRefs) {
      const blob = await fetchMediaBlob(endpoint, ref);
      await sendTelegramMedia(token, chatId, blob, ref.filename, first ? caption : undefined, {
        parseMode: "HTML",
        replyMarkup: first ? inlineKeyboard(RESULT_ROWS) : undefined,
      });
      first = false;
    }

    if (statusId) await deleteTelegramMessage(token, chatId, statusId);
  } catch (err: any) {
    const msg = err?.message || "Unknown error";
    const failText = `❌ <b>Generation failed</b>\n<code>${escapeHtml(clamp(msg, 300))}</code>`;
    if (statusId) {
      await editTelegramMessage(token, chatId, statusId, failText, {
        parseMode: "HTML",
        replyMarkup: inlineKeyboard([OPEN_SETTINGS_ROW]),
      }).catch(() => {});
    } else {
      await sendTelegramMessage(token, chatId, failText, { parseMode: "HTML" }).catch(
        () => {}
      );
    }
  }
}

async function generateFromText(
  env: Env,
  chatId: number,
  token: string,
  positive: string,
  overrides: { modelId?: string; negativeOverride?: string } = {}
): Promise<void> {
  const stored = await getSettings(env, chatId);
  await runGeneration(env, chatId, token, {
    positive,
    negativeOverride: overrides.negativeOverride,
    modelId: overrides.modelId,
    stored,
  });
}

function parseGenerationCommand(
  text: string
): { modelId?: string; positive: string; negative?: string } {
  const body = text.replace(/^\/gen\b/i, "").trim();
  const first = body.split(/\s+/)[0]?.toLowerCase();
  let positive = body;
  let modelId: string | undefined;
  if (first && getWorkflow(first)) {
    modelId = first;
    positive = body.slice(first.length).trim();
  }
  const parts = positive.split(/\|\|/).length > 1 ? positive.split(/\|\|/) : positive.split(/\|/);
  positive = (parts[0] || "").trim();
  const negative = parts[1]?.trim() || undefined;
  return { modelId, positive, negative };
}

async function handleCallbackQuery(env: Env, cq: NonNullable<TelegramUpdate["callback_query"]>): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN!;
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const data = cq.data || "";
  if (!chatId || !messageId) return;

  await answerTelegramCallback(token, cq.id);
  const settings = await getSettings(env, chatId);

  switch (true) {
    case data === "panel": {
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        panelText(settings),
        { parseMode: "HTML", replyMarkup: inlineKeyboard(PANEL_ROWS) }
      );
      break;
    }

    case data === "pick:model": {
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        `🎨 <b>Choose a model</b>\n<i>Saved for future generations.</i>`,
        { parseMode: "HTML", replyMarkup: modelPickerMarkup(settings.modelId) }
      );
      break;
    }

    case data.startsWith("pick:model:"): {
      const id = data.slice("pick:model:".length);
      const wf = getWorkflow(id);
      if (!wf) break;
      const persisted = await saveSettings(env, chatId, { modelId: wf.id });
      if (!persisted) await warnNoKV(token, chatId, env);
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        `🎨 <b>Model set to</b> ${escapeHtml(wf.displayName)}${persisted ? "" : "\n⚠️ <i>(not persisted — KV binding missing)</i>"}`,
        { parseMode: "HTML", replyMarkup: inlineKeyboard(HOME_ROWS) }
      );
      break;
    }

    case data === "pick:ratio": {
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        `📐 <b>Choose an aspect ratio</b>\n<i>Saved for future generations. ~1 megapixel base.</i>`,
        { parseMode: "HTML", replyMarkup: ratioPickerMarkup(settings.ratio) }
      );
      break;
    }

    case data.startsWith("pick:ratio:"): {
      const id = data.slice("pick:ratio:".length);
      const ratio = resolveRatio(id);
      if (!ratio) break;
      const persisted = await saveSettings(env, chatId, { ratio: ratio.id });
      if (!persisted) await warnNoKV(token, chatId, env);
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        `📐 <b>Ratio set to</b> ${escapeHtml(ratio.id)} <i>(${ratio.width}×${ratio.height})</i>${persisted ? "" : "\n⚠️ <i>(not persisted — KV binding missing)</i>"}`,
        { parseMode: "HTML", replyMarkup: inlineKeyboard(HOME_ROWS) }
      );
      break;
    }

    case data === "edit:prefill":
    case data === "edit:negative": {
      await beginFieldEdit(env, chatId, token, data === "edit:prefill" ? "prefill" : "negative");
      break;
    }

    case data === "reset": {
      const persisted = await resetSettings(env, chatId);
      if (!persisted) await warnNoKV(token, chatId, env);
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        `♻️ <b>Settings reset to defaults</b>${persisted ? "" : "\n⚠️ <i>(not persisted — KV binding missing)</i>"}`,
        { parseMode: "HTML", replyMarkup: inlineKeyboard(HOME_ROWS) }
      );
      break;
    }

    case data === "ask:prompt": {
      await sendTelegramMessage(
        token,
        chatId,
        `✍️ <b>What should I draw?</b>\nSend your description as a reply. Negative prompt (anima): append <code>| negative text</code>.`,
        {
          parseMode: "HTML",
          replyMarkup: forceReplyMarkup("Describe your image…"),
        }
      );
      await setAwaiting(env, chatId, "prompt");
      break;
    }

    case data === "run:last": {
      const last = await getLastRun(env, chatId);
      if (!last) {
        await sendTelegramMessage(
          token,
          chatId,
          "🤷 <b>Nothing to regenerate yet.</b> Generate an image first!",
          { parseMode: "HTML" }
        );
        break;
      }
      await runGeneration(env, chatId, token, {
        positive: last.positive,
        negativeOverride: last.negative,
        modelId: last.workflowId,
        stored: { ...settings, ratio: last.ratio },
        seed: last.seed,
      });
      break;
    }
  }
}

async function handleMessage(
  env: Env,
  chatId: number,
  text: string,
  isReplyToBot: boolean
): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN!;
  const lower = text.toLowerCase();

  // /start, /help
  if (lower === "/start" || lower.startsWith("/start ") || lower.startsWith("/start@") || lower.startsWith("/help")) {
    await sendTelegramMessage(
      token,
      chatId,
      [
        `🖼 <b>ComfyUI Generator Bot</b>`,
        ``,
        `Describe an image and get it rendered on the GPU pipeline.`,
        ``,
        `🎛 <b>/settings</b> — pick model, ratio, prompts`,
        `✍️ <b>Plain text</b> — generate instantly with saved settings`,
        `🅿️ <b>/gen</b> <code>[model] &lt;prompt&gt; [| negative]</code> — one-shot overrides`,
        `♻️ <b>Regenerate</b> button under every result`,
        `🎨 <b>/models</b> · 📐 <b>/ratio</b> · ✨ <b>/prefill</b> · 🚫 <b>/negative</b>`,
      ].join("\n"),
      { parseMode: "HTML", replyMarkup: inlineKeyboard([OPEN_SETTINGS_ROW]) }
    );
    await warnNoKV(token, chatId, env);
    return;
  }

  // /settings
  if (lower.startsWith("/settings") || lower.startsWith("/config")) {
    await sendPanel(env, chatId, token);
    return;
  }

  // /models — picker; /model [id] — quick set
  if (lower.startsWith("/models")) {
    await sendModelPicker(env, chatId, token);
    return;
  }
  if (lower.startsWith("/model")) {
    const arg = text.slice("/model".length).trim().toLowerCase();
    if (arg) {
      const wf = getWorkflow(arg);
      if (!wf) {
        await sendTelegramMessage(
          token,
          chatId,
          `❌ Unknown model <code>${escapeHtml(arg)}</code>. Options: ${listWorkflows().map((m) => m.id).join(", ")}.`,
          { parseMode: "HTML" }
        );
        return;
      }
      const persisted = await saveSettings(env, chatId, { modelId: wf.id });
      if (!persisted) await warnNoKV(token, chatId, env);
      await sendTelegramMessage(
        token,
        chatId,
        `🎨 <b>Model set to</b> ${escapeHtml(wf.displayName)}${persisted ? "" : "\n⚠️ <i>(not persisted)</i>"}`,
        { parseMode: "HTML" }
      );
      return;
    }
    await sendModelPicker(env, chatId, token);
    return;
  }

  // /ratio [16:9]
  if (lower.startsWith("/ratio")) {
    const arg = text.slice("/ratio".length).trim();
    if (arg) {
      const ratio = resolveRatio(arg);
      if (!ratio) {
        await sendTelegramMessage(
          token,
          chatId,
          `❌ Unknown ratio <code>${escapeHtml(arg)}</code>. Use <code>/ratio</code> for the list.`,
          { parseMode: "HTML" }
        );
        return;
      }
      const persisted = await saveSettings(env, chatId, { ratio: ratio.id });
      if (!persisted) await warnNoKV(token, chatId, env);
      await sendTelegramMessage(
        token,
        chatId,
        `📐 <b>Ratio set to</b> ${escapeHtml(ratio.id)} <i>(${ratio.width}×${ratio.height})</i>${persisted ? "" : "\n⚠️ <i>(not persisted)</i>"}`,
        { parseMode: "HTML" }
      );
      return;
    }
    await sendRatioPicker(env, chatId, token);
    return;
  }

  // /prefill, /negative — ForceReply edit
  if (lower.startsWith("/prefill")) {
    await beginFieldEdit(env, chatId, token, "prefill");
    return;
  }
  if (lower.startsWith("/negative")) {
    await beginFieldEdit(env, chatId, token, "negative");
    return;
  }

  // /gen [model] <positive> [| negative]
  if (lower.startsWith("/gen")) {
    const { modelId, positive, negative } = parseGenerationCommand(text);
    if (!positive) {
      await sendTelegramMessage(
        token,
        chatId,
        `❌ <b>Prompt is empty</b>\nUsage: <code>/gen [model] &lt;positive&gt; [| negative]</code>`,
        { parseMode: "HTML" }
      );
      return;
    }
    await generateFromText(env, chatId, token, positive, { modelId, negativeOverride: negative });
    return;
  }

  // Unknown /command → hint
  if (text.startsWith("/")) {
    await sendTelegramMessage(
      token,
      chatId,
      `🤔 <b>Unknown command.</b>\nSend any text to generate, or use 🎛 settings below.`,
      { parseMode: "HTML", replyMarkup: inlineKeyboard([OPEN_SETTINGS_ROW]) }
    );
    return;
  }

  // Pending ForceReply-style input?
  const awaiting = await getAwaiting(env, chatId);
  if (awaiting && (isReplyToBot || awaiting === "prompt")) {
    await setAwaiting(env, chatId, null);
    if (awaiting === "prompt") {
      await generateFromText(env, chatId, token, text.trim());
    } else {
      await applyFieldInput(env, chatId, token, awaiting as "prefill" | "negative", text.trim());
    }
    return;
  }

  // Plain text = instant generation with saved settings
  await generateFromText(env, chatId, token, text.trim());
}

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;

  if (env.TELEGRAM_WEBHOOK_SECRET?.trim()) {
    const provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (provided !== env.TELEGRAM_WEBHOOK_SECRET.trim()) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (!env.TELEGRAM_BOT_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "TELEGRAM_BOT_TOKEN missing" }), {
      status: 200,
    });
  }

  try {
    if (update.callback_query) {
      await handleCallbackQuery(env, update.callback_query);
    } else if (update.message?.chat?.id && update.message.text) {
      const msg = update.message;
      await handleMessage(
        env,
        msg.chat!.id!,
        msg.text!,
        msg.reply_to_message?.from?.is_bot === true
      );
    }
  } catch (err: any) {
    const chatId = update.callback_query?.message?.chat?.id ?? update.message?.chat?.id;
    if (chatId && env.TELEGRAM_BOT_TOKEN) {
      await sendTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        `❌ <b>Unexpected error</b>\n<code>${escapeHtml(clamp(err?.message || "Unknown error", 300))}</code>`,
        { parseMode: "HTML" }
      ).catch(() => {});
    }
  }

  // Always 200 so Telegram doesn't retry forever
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
