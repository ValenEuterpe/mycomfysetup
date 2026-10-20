import { Env } from "./comfy";

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

/**
 * Sends a text message. Plain text (no parse mode) to avoid escaping issues.
 */
export async function sendTelegramMessage(
  token: string,
  chatId: string | number,
  text: string
): Promise<void> {
  await callBotApi(token, "sendMessage", JSON.stringify({ chat_id: chatId, text }), true);
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
  caption?: string
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);

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
  endpoint: { base: string; headers: Record<string, string> },
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
