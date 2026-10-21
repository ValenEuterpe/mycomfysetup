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
  setTelegramCommands,
} from "../lib/telegram";
import {
  ratioGlyph,
  ratioLabel,
} from "../lib/ratioVisual";
import {
  getEditSession,
  setSceneIndex,
  setEditWaitingPrompt,
  clearEditSession,
  requestEditPrompt,
  editHomeText,
  editHomeMarkup,
  rolePickerText,
  rolePickerMarkup,
  stageTelegramImage,
  startEditSession,
  runEditFlow,
  EDIT_GUIDE_TEXT,
  EDIT_CAP,
  EditStagedImage,
} from "../lib/telegramEdit";

/** Slash-command menu (Telegram "/" dropdown), installed lazily once. */
const BOT_COMMANDS: { command: string; description: string }[] = [
  { command: "start", description: "Start & overview" },
  { command: "settings", description: "Model, ratio & prompt settings" },
  { command: "models", description: "Model picker" },
  { command: "model", description: "Set model directly: /model anima" },
  { command: "ratio", description: "Aspect ratio gallery" },
  { command: "prefill", description: "Edit the anima prefill" },
  { command: "negative", description: "Edit the anima negative prompt" },
  { command: "edit", description: "Edit a photo: /edit starts the guided flow" },
  { command: "gen", description: "One-shot generation: /gen [model] <prompt>" },
  { command: "help", description: "Usage help" },
];

/** Bump to force a re-install of the slash-command menu (e.g. after adding /edit). */
const COMMANDS_VERSION = "2";

async function ensureCommandsInstalled(env: Env, token: string): Promise<void> {
  if (!env.TELEGRAM_SETTINGS) return;
  try {
    const installedVersion = await env.TELEGRAM_SETTINGS.get("global:commands_version");
    if (installedVersion === COMMANDS_VERSION) return;
    const ok = await setTelegramCommands(token, BOT_COMMANDS);
    if (ok) {
      await env.TELEGRAM_SETTINGS.put("global:commands_version", COMMANDS_VERSION);
      // Clean up the pre-versioning flag so future migrations stay tidy.
      await env.TELEGRAM_SETTINGS.delete("global:commands_installed").catch(() => {});
    }
  } catch {
    // non-fatal — the menu is cosmetic
  }
}

interface TelegramUser {
  id?: number;
  is_bot?: boolean;
}

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramMessage {
  chat?: { id?: number };
  message_id?: number;
  text?: string;
  caption?: string;
  from?: TelegramUser;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  media_group_id?: string;
  video?: { file_unique_id?: string };
  animation?: { file_unique_id?: string };
  audio?: { file_unique_id?: string };
  sticker?: { file_unique_id?: string };
  reply_to_message?: { from?: TelegramUser };
}

interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    data?: string;
    from?: TelegramUser;
    message?: {
      chat?: { id?: number };
      message_id?: number;
      text?: string;
      // Legacy field for the callback handlers (photo detection)
      photo?: unknown[];
      document?: unknown;
    };
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
  const ratioLine = ratio
    ? `${ratioGlyph(ratio)} <b>${escapeHtml(s.ratio)}</b> <i>(${ratio.width}×${ratio.height})</i>`
    : escapeHtml(s.ratio);
  return [
    `🎛 <b>Bot Settings</b>`,
    `<i>Your choices apply to every generation until you change them.</i>`,
    ``,
    `🎨 <b>Model</b>: ${escapeHtml(model?.displayName ?? s.modelId)}`,
    `📐 <b>Ratio</b>: ${ratioLine}`,
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
      [ratioLabel(a, a.id === currentId), `pick:ratio:${a.id}`],
    ];
    if (b) {
      row.push([ratioLabel(b, b.id === currentId), `pick:ratio:${b.id}`]);
    }
    rows.push(row);
  }
  rows.push(OPEN_SETTINGS_ROW);
  return inlineKeyboard(rows);
}

function ratioPickerCaption(s: ChatSettings): string {
  const ratio = resolveRatio(s.ratio);
  return [
    `📐 <b>Aspect ratio</b>${ratio ? ` — current: ${ratioLabel(ratio, true)}` : ""}`,
    ``,
    `Pick one below — saved until you change it.`,
  ].join("\n");
}

/**
 * Sends the ratio picker: the visual reference image (public/aspectratio.jpg)
 * with the selection buttons attached. Falls back to a text message if the
 * static asset can't be fetched.
 */
async function sendRatioPicker(
  env: Env,
  chatId: number,
  token: string,
  origin: string
): Promise<void> {
  const s = await getSettings(env, chatId);
  const markup = ratioPickerMarkup(s.ratio);
  const caption = ratioPickerCaption(s);
  try {
    const res = await fetch(`${origin}/aspectratio.jpg`);
    if (!res.ok) throw new Error(`aspectratio.jpg fetch failed (${res.status})`);
    const blob = await res.blob();
    await sendTelegramMedia(token, chatId, blob, "aspectratio.jpg", caption, {
      parseMode: "HTML",
      replyMarkup: markup,
    });
    return;
  } catch {
    await sendTelegramMessage(
      token,
      chatId,
      `${ratioPickerCaption(s)}\n<i>(reference image unavailable)</i>`,
      { parseMode: "HTML", replyMarkup: markup }
    );
  }
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

/* ------------------------------------------------------------------ */
/* Identity Edit flow (/edit)                                          */
/* ------------------------------------------------------------------ */

/** Runs the stage→upload→queue→poll edit chain for a prompt. */
async function runEditFromPrompt(
  env: Env,
  chatId: number,
  token: string,
  prompt: string
): Promise<void> {
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

  const statusId = await sendTelegramMessage(
    token,
    chatId,
    `✂️ <b>Identity edit queued</b> · ${escapeHtml(prompt.slice(0, 80))}`,
    { parseMode: "HTML" }
  ).catch(() => undefined);

  await runEditFlow(env, chatId, {
    endpoint,
    chatId,
    prompt,
    statusMessageId: statusId,
  });
}

/** Photo / photo-document intake while an edit session is active. */
async function handleEditMedia(
  env: Env,
  chatId: number,
  token: string,
  msg: TelegramMessage
): Promise<void> {
  const session = await getEditSession(env, chatId);
  if (!session) {
    // No active edit session: nudge instead of silently ignoring the photo.
    await sendTelegramMessage(
      token,
      chatId,
      `🖼️ Got an image!\nI can <b>edit</b> it or add characters — type <code>/edit</code>, or send any text to generate instead.`,
      { parseMode: "HTML" }
    );
    return;
  }

  let staged: Omit<EditStagedImage, "role">;
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const largest = msg.photo.reduce((a, b) =>
      (b.width || 0) * (b.height || 0) > (a.width || 0) * (a.height || 0) ? b : a
    );
    staged = {
      fileId: largest.file_id,
      fileUniqueId: largest.file_unique_id,
      kind: "photo",
      width: largest.width,
      height: largest.height,
      fileSize: largest.file_size,
      caption: msg.caption,
    };
  } else {
    const doc = msg.document!;
    staged = {
      fileId: doc.file_id,
      fileUniqueId: doc.file_unique_id,
      kind: "document",
      fileSize: doc.file_size,
      caption: msg.caption,
    };
  }

  // Document sanity: only image documents ≤19 MB (bot download cap is 20 MB).
  if (
    staged.kind === "document" &&
    (!staged.fileId ||
      (msg.document!.mime_type && !/^image\/(jpeg|png|webp)$/i.test(msg.document!.mime_type)))
  ) {
    await sendTelegramMessage(
      token,
      chatId,
      "⚠️ Only <b>JPEG / PNG / WebP</b> files work for the edit flow.",
      { parseMode: "HTML" }
    );
    return;
  }
  if (staged.kind === "document" && (staged.fileSize ?? 0) > 19 * 1024 * 1024) {
    await sendTelegramMessage(
      token,
      chatId,
      "⚠️ That file is too big to fetch from Telegram (20 MB cap). Send it as a <b>compressed photo</b> instead.",
      { parseMode: "HTML" }
    );
    return;
  }

  const result = await stageTelegramImage(env, chatId, staged);
  if (!result.persisted) await warnNoKV(token, chatId, env);

  const n = result.session.images.length;
  const index = n - 1;
  if (result.reason === "duplicate") {
    await sendTelegramMessage(
      token,
      chatId,
      `🤷 That photo is already staged (${roleSummaryWord(result.session)}). Send another one or tap ✍️.`,
      { parseMode: "HTML", replyMarkup: editHomeMarkup(result.session.images.length > 0) }
    );
    return;
  }
  if (result.reason === "full" && !result.added) {
    await sendTelegramMessage(
      token,
      chatId,
      `⚠️ Session is full (${n}/${EDIT_CAP}) — use <b>🗑 Clear photos</b> to restart.`,
      { parseMode: "HTML", replyMarkup: editHomeMarkup(true) }
    );
    return;
  }

  const roleAdded = result.session.images[Math.max(0, index)]?.role === "scene" ? "🖼️ Scene" : "🧑 Person";
  const description = staged.kind === "photo" ? "Photo" : "Image document";
  await sendTelegramMessage(
    token,
    chatId,
    `<b>${description} ${index + 1} staged as ${roleAdded}.</b>\n${
      n < EDIT_CAP
        ? "Send another photo, or tap ✍️ to write the prompt."
        : "Session full — tap ✍️ to write the prompt."
    }`,
    { parseMode: "HTML", replyMarkup: editHomeMarkup(result.session.images.length > 0) }
  );

  // Captioned photo → the caption IS the prompt
  // (smooth album+caption UX: photo(s) land, then the caption runs the edit).
  const caption = msg.caption?.trim();
  if (result.added && caption && result.session.images.length >= 1) {
    await runEditFromPrompt(env, chatId, token, caption);
  }
}

/** Re-usable role summary word for confirmations. */
function roleSummaryWord(session: { images: { role: string }[] }): string {
  const scene = session.images.filter((i) => i.role === "scene").length;
  const person = session.images.filter((i) => i.role === "person").length;
  return `${scene} scene · ${person} person${person === 1 ? "" : "s"}`;
}

/** `/edit` command: start, /edit prompt, /edit cancel|off|exit|help. */
async function handleEditCommand(
  env: Env,
  chatId: number,
  token: string,
  text: string
): Promise<void> {
  const arg = text
    .replace(/^\/edit(@\w+)?/i, "")
    .trim()
    .toLowerCase();

  // Leave the edit flow ("off"/"exit"/"cancel"/"stop")
  if (/^(off|exit|cancel|stop)$/.test(arg)) {
    const had = await getEditSession(env, chatId);
    if (had) {
      await clearEditSession(env, chatId);
      await sendTelegramMessage(
        token,
        chatId,
        `✏️ <b>Exited Identity Edit.</b>\nSend any text to generate normally again.`,
        { parseMode: "HTML", replyMarkup: inlineKeyboard(HOME_ROWS) }
      );
      return;
    }
    await sendTelegramMessage(
      token,
      chatId,
      `🤷 No edit session active — send any text to generate.`,
      { parseMode: "HTML" }
    );
    return;
  }

  // Purge any pending Anima ForceReply so routing stays unambiguous
  await setAwaiting(env, chatId, null);

  const existing = await getEditSession(env, chatId);
  if (/^prompt$/.test(arg)) {
    // Starting the flow implicitly when staging a first prompt request
    await requestEditPrompt(env, chatId, existing);
    return;
  }

  // Start / resume the session (persists a fresh one when none exists)
  await startEditSession(env, chatId, existing);
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

async function handleCallbackQuery(
  env: Env,
  cq: NonNullable<TelegramUpdate["callback_query"]>,
  origin: string
): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN!;
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const data = cq.data || "";
  if (!chatId || !messageId) return;

  await answerTelegramCallback(token, cq.id);
  const settings = await getSettings(env, chatId);

  switch (true) {
    case data === "panel": {
      const isMedia =
        Array.isArray(cq.message?.photo) && cq.message!.photo!.length > 0 ||
        !!cq.message?.document;
      if (isMedia) {
        // Image messages can't be edited to text — open the panel fresh
        await sendPanel(env, chatId, token);
      } else {
        await editTelegramMessage(token, chatId, messageId, panelText(settings), {
          parseMode: "HTML",
          replyMarkup: inlineKeyboard(PANEL_ROWS),
        });
      }
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
      // Photo pickers can't be text-edited — send a fresh picker and
      // remove the old one when it was a photo.
      if (Array.isArray(cq.message?.photo) && cq.message!.photo!.length > 0) {
        await deleteTelegramMessage(token, chatId, messageId);
      }
      await sendRatioPicker(env, chatId, token, origin);
      break;
    }

    case data.startsWith("pick:ratio:"): {
      const id = data.slice("pick:ratio:".length);
      const ratio = resolveRatio(id);
      if (!ratio) break;
      const persisted = await saveSettings(env, chatId, { ratio: ratio.id });
      if (!persisted) await warnNoKV(token, chatId, env);
      await deleteTelegramMessage(token, chatId, messageId);
      await sendTelegramMessage(
        token,
        chatId,
        `📐 <b>Ratio set to</b> ${ratioLabel(ratio, true)}${persisted ? "" : "\n⚠️ <i>(not persisted — KV binding missing)</i>"}`,
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

    /* ── Identity Edit flow controls ─────────────────────────────────── */

    case data === "edit:prompt": {
      const session = await getEditSession(env, chatId);
      await requestEditPrompt(env, chatId, session);
      break;
    }

    case data === "edit:clear": {
      const cleared = await clearEditSession(env, chatId);
      if (!cleared) await warnNoKV(token, chatId, env);
      // Fresh (persisted) session with a clean status board
      await startEditSession(env, chatId, null);
      break;
    }

    case data === "edit:roles": {
      const session = await getEditSession(env, chatId);
      if (!session || session.images.length < 2) {
        await answerTelegramCallback(
          token,
          cq.id,
          "Stage at least 2 photos first"
        );
        break;
      }
      await editTelegramMessage(token, chatId, messageId, rolePickerText(session), {
        parseMode: "HTML",
        replyMarkup: rolePickerMarkup(session),
      });
      break;
    }

    case data.startsWith("edit:role:"): {
      const index = parseInt(data.slice("edit:role:".length), 10);
      const session = await setSceneIndex(env, chatId, Number.isFinite(index) ? index : -1);
      if (!session) break;
      await editTelegramMessage(token, chatId, messageId, rolePickerText(session), {
        parseMode: "HTML",
        replyMarkup: rolePickerMarkup(session),
      });
      break;
    }

    case data === "edit:refresh": {
      const session = await getEditSession(env, chatId);
      if (!session) {
        await editTelegramMessage(
          token,
          chatId,
          messageId,
          "⌛ <b>Edit session expired.</b> Type <code>/edit</code> to start again.",
          { parseMode: "HTML" }
        );
        break;
      }
      await editTelegramMessage(token, chatId, messageId, editHomeText(session), {
        parseMode: "HTML",
        replyMarkup: editHomeMarkup(session.images.length > 0),
      });
      break;
    }

    case data === "edit:guide": {
      await editTelegramMessage(token, chatId, messageId, EDIT_GUIDE_TEXT, {
        parseMode: "HTML",
        replyMarkup: inlineKeyboard([[["⬅️ Back", "edit:refresh"]]]),
      });
      break;
    }

    case data === "edit:exit": {
      await clearEditSession(env, chatId);
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        `✏️ <b>Exited Identity Edit.</b>\nSend any text to generate normally again.`,
        { parseMode: "HTML", replyMarkup: inlineKeyboard(HOME_ROWS) }
      );
      break;
    }

    case data === "edit:rerun": {
      const session = await getEditSession(env, chatId);
      if (!session?.lastPrompt) {
        await answerTelegramCallback(token, cq.id, "Nothing to rerun yet");
        break;
      }
      await runEditFromPrompt(env, chatId, token, session.lastPrompt);
      break;
    }
  }
}

async function handleMessage(
  env: Env,
  chatId: number,
  text: string,
  isReplyToBot: boolean,
  origin: string
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
        `✂️ <b>/edit</b> — upload 1–3 photos and edit them (change outfits, expressions, add characters — photo ordering is guided)`,
        `🎛 <b>/settings</b> — pick model, ratio, prompts`,
        `✍️ <b>Plain text</b> — generate instantly with saved settings`,
        `🅿️ <b>/gen</b> <code>[model] &lt;prompt&gt; [| negative]</code> — one-shot overrides`,
        `♻️ <b>Regenerate</b> button under every result`,
        `🎨 <b>/models</b> · 📐 <b>/ratio</b> · ✨ <b>/prefill</b> · 🚫 <b>/negative</b>`,
      ].join("\n"),
      { parseMode: "HTML", replyMarkup: inlineKeyboard(HOME_ROWS) }
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

  // /ratio [16:9] — no arg opens the image picker
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
        `📐 <b>Ratio set to</b> ${ratioLabel(ratio, true)}${persisted ? "" : "\n⚠️ <i>(not persisted)</i>"}`,
        { parseMode: "HTML" }
      );
      return;
    }
    await sendRatioPicker(env, chatId, token, origin);
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

  // /edit — Identity Edit guided flow (also: /edit prompt | /edit off|exit|cancel)
  if (lower === "/edit" || lower.startsWith("/edit ") || lower.startsWith("/edit@")) {
    await handleEditCommand(env, chatId, token, text);
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

  // Reply to a ForceReply field edit beats the edit-session branch
  const awaiting = await getAwaiting(env, chatId);
  if (awaiting && isReplyToBot) {
    await setAwaiting(env, chatId, null);
    if (awaiting === "prompt") {
      await generateFromText(env, chatId, token, text.trim());
    } else {
      await applyFieldInput(env, chatId, token, awaiting as "prefill" | "negative", text.trim());
    }
    return;
  }

  // ── Identity Edit session routing (consumes all non-slash text while active) ──
  const editSession = await getEditSession(env, chatId);
  if (editSession) {
    await setEditWaitingPrompt(env, chatId, false);
    await runEditFromPrompt(env, chatId, token, text.trim());
    return;
  }

  // Prompt requested without an explicit ForceReply context
  if (awaiting === "prompt") {
    await setAwaiting(env, chatId, null);
    await generateFromText(env, chatId, token, text.trim());
    return;
  }

  // Plain text = instant generation with saved settings
  await generateFromText(env, chatId, token, text.trim());
}

export const onRequest = async (context: {
  request: Request;
  env: Env;
  /** Cloudflare Pages Functions context: continue work after responding */
  waitUntil?: (promise: Promise<unknown>) => void;
}): Promise<Response> => {
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

  await ensureCommandsInstalled(env, env.TELEGRAM_BOT_TOKEN);

  const origin = new URL(request.url).origin;

  /**
   * Acknowledge Telegram immediately (200) and keep processing in the
   * background — prevents the webhook retry storm / duplicate queues that
   * long-running generations otherwise cause.
   */
  const dispatch = (async () => {
    try {
      if (update.callback_query) {
        await handleCallbackQuery(env, update.callback_query, origin);
        return;
      }

      const msg = update.message;
      if (!msg?.chat?.id) return;
      const chatId = msg.chat.id;
      const token = env.TELEGRAM_BOT_TOKEN!;

      // Text messages: normal command/flow routing
      if (msg.text) {
        await handleMessage(
          env,
          chatId,
          msg.text,
          msg.reply_to_message?.from?.is_bot === true,
          origin
        );
        return;
      }

      // Photos / image documents: Identity Edit staging (+ caption-as-prompt)
      const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
      const hasImageDoc =
        !!msg.document && (!msg.document.mime_type || /^image\//.test(msg.document.mime_type));
      if (hasPhoto || hasImageDoc) {
        await handleEditMedia(env, chatId, token, msg);
        return;
      }

      // Any non-image media (videos, audio, stickers…) with no text: gentle hint
      if (msg.document || msg.video || msg.animation || msg.audio || msg.sticker) {
        await sendTelegramMessage(
          token,
          chatId,
          `🤔 I can only read text and images. Use ✂️ <code>/edit</code> for photo editing or send text to generate.`,
          { parseMode: "HTML" }
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
  })();

  if (typeof context.waitUntil === "function") {
    context.waitUntil(dispatch);
  } else {
    // Local dev fallback: no waitUntil available — keep the blocking behaviour
    await dispatch;
  }

  // Always 200 so Telegram doesn't retry forever
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
