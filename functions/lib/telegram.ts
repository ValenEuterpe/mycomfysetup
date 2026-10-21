import { Env, RelayEndpoint } from "./comfy";

const TELEGRAM_API = "https://api.telegram.org";

export interface TelegramMediaRef {
  filename: string;
  subfolder: string;
  type: string;
}

/**
 * Sends a low-level request to the Telegram Bot API.
 */
async function callBotApi(
  token: string,
  method: string,
  body: FormData | string,
  json = false
): Promise<{ ok: boolean; result?: any; description?: string }> {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: json ? { "Content-Type": "application/json" } : undefined,
    body: json ? (body as string) : (body as FormData),
  });
  return res.json();
}

export interface TelegramMessageOptions {
  parseMode?: "HTML";
  replyMarkup?: Record<string, any>;
  /** For editMessageText-style calls */
  messageId?: number;
}

/**
 * Sends a text message. Use parseMode "HTML" for styled output; the caller
 * must escape any user-provided text (see escapeHtml).
 */
export async function sendTelegramMessage(
  token: string,
  chatId: string | number,
  text: string,
  options: TelegramMessageOptions = {}
): Promise<number | undefined> {
  const res = await callBotApi(
    token,
    "sendMessage",
    JSON.stringify({
      chat_id: chatId,
      text,
      ...(options.parseMode ? { parse_mode: options.parseMode } : {}),
      ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
    }),
    true
  );
  return res.result?.message_id;
}

/**
 * Edits an existing bot message's text (and inline keyboard).
 */
export async function editTelegramMessage(
  token: string,
  chatId: string | number,
  messageId: number,
  text: string,
  options: TelegramMessageOptions = {}
): Promise<void> {
  await callBotApi(
    token,
    "editMessageText",
    JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(options.parseMode ? { parse_mode: options.parseMode } : {}),
      ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
    }),
    true
  );
}

/**
 * Acknowledges an inline-button tap. Pass alert "text" for a small popup.
 */
export async function answerTelegramCallback(
  token: string,
  callbackQueryId: string,
  text?: string
): Promise<void> {
  await callBotApi(
    token,
    "answerCallbackQuery",
    JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) }),
    true
  ).catch(() => {});
}

/**
 * Shows a chat status indicator (e.g. "sending photo...").
 */
export async function sendTelegramChatAction(
  token: string,
  chatId: string | number,
  action: "typing" | "upload_photo" = "typing"
): Promise<void> {
  await callBotApi(
    token,
    "sendChatAction",
    JSON.stringify({ chat_id: chatId, action }),
    true
  ).catch(() => {});
}

/**
 * Deletes a previously sent bot message (e.g. a live status indicator).
 */
export async function deleteTelegramMessage(
  token: string,
  chatId: string | number,
  messageId: number
): Promise<void> {
  await callBotApi(
    token,
    "deleteMessage",
    JSON.stringify({ chat_id: chatId, message_id: messageId }),
    true
  ).catch(() => {});
}

/**
 * Escapes user-provided text for Telegram's HTML parse mode.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Builds a ForceReply markup — Telegram's native "input dialog" pattern
 * (pops up an input field attached to a quoted message, like a mini-form).
 */
export function forceReplyMarkup(placeholder: string): Record<string, any> {
  return { force_reply: true, input_field_placeholder: placeholder };
}

/**
 * Builds an inline keyboard from rows of [text, callbackData] pairs.
 */
export function inlineKeyboard(rows: [string, string][][]): Record<string, any> {
  return {
    inline_keyboard: rows.map((row) =>
      row.map(([text, callbackData]) => ({ text, callback_data: callbackData }))
    ),
  };
}

/**
 * Registers the bot's slash-command menu (Telegram's "/" dropdown).
 * Global scope, so it only needs to be set once per bot.
 */
export async function setTelegramCommands(
  token: string,
  commands: { command: string; description: string }[]
): Promise<boolean> {
  const result = await callBotApi(
    token,
    "setMyCommands",
    JSON.stringify({ commands }),
    true
  );
  return Boolean(result.ok);
}

/**
 * Sends a media blob as a photo; falls back to sendDocument if the
 * payload is too large for the photo endpoint (10MB cap).
 */
export async function sendTelegramMedia(
  token: string,
  chatId: string | number,
  blob: Blob,
  filename: string,
  caption?: string,
  options: { parseMode?: "HTML"; replyMarkup?: Record<string, any> } = {}
): Promise<void> {
  const extra = () => {
    if (options.parseMode) form.append("parse_mode", options.parseMode);
    if (options.replyMarkup) form.append("reply_markup", JSON.stringify(options.replyMarkup));
  };

  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);
  extra();

  const isSmallImage = blob.size <= 10 * 1024 * 1024 && !filename.match(/\.(mp4|webm|gif)$/i);
  if (isSmallImage) {
    form.append("photo", blob, filename);
    const result = await callBotApi(token, "sendPhoto", form);
    if (result.ok) return;
  }

  // Fallback: send as document (50MB cap)
  const docForm = new FormData();
  docForm.append("chat_id", String(chatId));
  if (caption) docForm.append("caption", caption);
  extra();
  docForm.append("document", blob, filename);
  const docResult = await callBotApi(token, "sendDocument", docForm);
  if (!docResult.ok) {
    throw new Error(`Telegram sendDocument failed: ${docResult.description || "unknown error"}`);
  }
}

/**
 * Full relay -> Telegram pipeline for one or more media refs.
 */
export async function deliverMediaToTelegram(
  env: Env,
  endpoint: RelayEndpoint,
  chatId: string | number,
  mediaRefs: { filename: string; subfolder: string; type: string }[],
  fetchBlob: (media: { filename: string; subfolder: string; type: string }) => Promise<Blob>,
  caption?: string
): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN secret is not set.");

  for (const ref of mediaRefs) {
    const blob = await fetchBlob(ref);
    await sendTelegramMedia(token, chatId, blob, ref.filename, caption);
  }
}

export function stripEndpointKey(endpointUrl: string): string {
  try {
    const url = new URL(endpointUrl);
    url.searchParams.delete("key");
    url.searchParams.delete("token");
    return url.toString();
  } catch {
    return endpointUrl;
  }
}
