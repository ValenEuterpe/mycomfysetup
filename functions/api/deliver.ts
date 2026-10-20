import {
  Env,
  getRelayEndpoint,
  fetchMediaBlob,
} from "../lib/comfy";
import { deliverMediaToTelegram } from "../lib/telegram";

interface DeliverRequest {
  target: "telegram";
  media: { filename: string; subfolder?: string; type?: string }[];
  workflowId?: string;
  prompts?: { positive?: string; negative?: string };
  chatId?: string; // optional override; defaults to TELEGRAM_CHAT_ID secret
}

/**
 * Auth-protected. Accepts media references produced by a page-driven
 * generation run and delivers them straight to Telegram without
 * rendering them in the browser.
 */
export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const body: DeliverRequest = await request.json().catch(() => null);
  if (!body || body.target !== "telegram" || !Array.isArray(body.media) || body.media.length === 0) {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
  }

  const chatId = body.chatId?.trim() || env.TELEGRAM_CHAT_ID?.trim();
  if (!chatId) {
    return new Response(
      JSON.stringify({ error: "No chat target: set TELEGRAM_CHAT_ID secret or pass chatId." }),
      { status: 503 }
    );
  }

  const endpoint = getRelayEndpoint(env);
  if (!endpoint) {
    return new Response(JSON.stringify({ error: "COMFY_RELAY_URL is not configured" }), {
      status: 503,
    });
  }

  const captionBase = body.prompts?.positive?.trim()
    ? `${body.prompts.positive.trim().slice(0, 180)}`
    : undefined;

  try {
    await deliverMediaToTelegram(
      env,
      endpoint,
      chatId,
      body.media.map((m) => ({
        filename: m.filename,
        subfolder: m.subfolder || "",
        type: m.type || "output",
      })),
      (media) => fetchMediaBlob(endpoint, media),
      captionBase
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Delivery failed", status: "error" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
  return new Response(JSON.stringify({ ok: true, delivered: body.media.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
