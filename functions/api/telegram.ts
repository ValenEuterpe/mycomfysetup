import { Env, getRelayEndpoint, queuePrompt, pollForCompletion, fetchMediaBlob } from "../lib/comfy";
import {
  buildInjectedWorkflow,
  getWorkflow,
  DEFAULT_WORKFLOW_ID,
  listWorkflows,
  splitPrompt,
} from "../lib/workflows";
import {
  sendTelegramMessage,
  sendTelegramMedia,
} from "../lib/telegram";

interface TelegramUpdate {
  message?: {
    chat?: { id?: number };
    text?: string;
    from?: { id?: number };
  };
}

const HELP_TEXT = [
  "ComfyUI Generator Bot",
  "",
  "Commands:",
  "/gen [model] <positive prompt> [| negative prompt]",
  "  e.g. /gen anima a dog in the street | blurry, low quality",
  "  e.g. /gen kroma a man in a cabriolet car",
  "",
  "/models - list available workflows",
  "/start - show this help",
  "",
  "Negative prompt only works for models that support it (see /models).",
].join("\n");

function parseCommand(text: string): { modelId?: string; rest: string } {
  const body = text.replace(/^\/gen\b/i, "").trim();
  const tokens = body.split(/\s+/);
  const first = tokens[0]?.toLowerCase();

  if (first && getWorkflow(first)) {
    return { modelId: first, rest: body.slice(first.length).trim() };
  }
  return { modelId: undefined, rest: body };
}

async function handleUpdate(env: Env, update: TelegramUpdate): Promise<void> {
  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();

  if (!chatId || !text) return;

  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN secret is not set.");

  const lower = text.toLowerCase();

  if (lower.startsWith("/start") || lower.startsWith("/help")) {
    await sendTelegramMessage(token, chatId, HELP_TEXT);
    return;
  }

  if (lower.startsWith("/models")) {
    const models = listWorkflows();
    const lines = models.map(
      (m) => `/gen ${m.id} <prompt>` + (m.supportsNegativePrompt ? " [| negative]" : "")
    );
    await sendTelegramMessage(
      token,
      chatId,
      ["Available workflows:", "", ...lines].join("\n")
    );
    return;
  }

  if (!lower.startsWith("/gen")) {
    await sendTelegramMessage(token, chatId, HELP_TEXT);
    return;
  }

  // --- /gen flow ---
  await sendTelegramMessage(token, chatId, "Submitting to GPU pipeline...");

  const { modelId, rest } = parseCommand(text);
  const wf = getWorkflow(modelId || DEFAULT_WORKFLOW_ID);
  if (!wf) {
    await sendTelegramMessage(token, chatId, `Unknown model. Try /models.`);
    return;
  }

  const { positive, negative } = splitPrompt(rest);
  if (!positive) {
    await sendTelegramMessage(token, chatId, "Please provide a prompt. Usage:\n/gen [model] <positive> [| negative]");
    return;
  }

  const endpoint = getRelayEndpoint(env);
  if (!endpoint) {
    await sendTelegramMessage(token, chatId, "Server error: COMFY_RELAY_URL is not configured.");
    return;
  }

  const clientId = `tg_${chatId}_${Date.now()}`;
  const workflow = buildInjectedWorkflow(wf, { positive, negative });
  const promptId = await queuePrompt(endpoint, workflow, clientId);

  const mediaRefs = await pollForCompletion(endpoint, promptId, wf);

  const caption = `${wf.displayName}: ${positive.slice(0, 180)}`;
  let first = true;
  for (const ref of mediaRefs) {
    const blob = await fetchMediaBlob(endpoint, ref);
    await sendTelegramMedia(token, chatId, blob, ref.filename, first ? caption : undefined);
    first = false;
  }
}

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;

  // Optional webhook secret validation
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

  let errorResponse: string | null = null;
  try {
    await handleUpdate(env, update);
  } catch (err: any) {
    errorResponse = err?.message || "Unknown error";
    const chatId = update.message?.chat?.id;
    if (chatId && env.TELEGRAM_BOT_TOKEN) {
      await sendTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        `Generation failed: ${errorResponse}`
      ).catch(() => {});
    }
  }

  // Always 200 so Telegram doesn't retry forever
  return new Response(JSON.stringify({ ok: true, error: errorResponse || undefined }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
