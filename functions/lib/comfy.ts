import { GeneratedMedia } from "../../src/types/workflow";
import { BotWorkflow } from "./workflows";

export interface Env {
  // Auth
  SITE_PASSWORD?: string; // master password for the web page
  AUTH_SECRET?: string; // cookie signing secret (falls back to SITE_PASSWORD)
  // ComfyUI relay
  COMFY_RELAY_URL?: string;
  COMFY_RELAY_KEY?: string;
  // Telegram bot
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string; // optional webhook secret token header
  TELEGRAM_CHAT_ID?: string; // default chat for page-driven delivery
  [key: string]: unknown;
}

export interface RelayFetchInit extends RequestInit {}

/**
 * Normalizes the relay URL and builds auth headers from secrets.
 */
export function getRelayEndpoint(env: Env): { base: string; headers: Record<string, string> } | null {
  const raw = env.COMFY_RELAY_URL?.trim();
  if (!raw) return null;

  let base = raw;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    base = `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    // keep raw
  }

  const key = env.COMFY_RELAY_KEY?.trim();
  const headers: Record<string, string> = {};
  if (key) {
    headers["Authorization"] = `Bearer ${key}`;
    headers["X-Api-Key"] = key;
  }
  return { base, headers };
}

export function buildRelayUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/**
 * Submits an injected workflow graph to the ComfyUI relay /prompt endpoint.
 */
export async function queuePrompt(
  endpoint: { base: string; headers: Record<string, string> },
  workflow: Record<string, any>,
  clientId: string
): Promise<string> {
  const res = await fetch(buildRelayUrl(endpoint.base, "/prompt"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...endpoint.headers },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI /prompt failed (${res.status}): ${text || res.statusText}`);
  }

  const data = await res.json();
  if (!data?.prompt_id) {
    throw new Error("ComfyUI /prompt returned no prompt_id.");
  }
  return data.prompt_id as string;
}

export interface ComfyOutputEntry {
  outputs?: Record<string, {
    images?: Array<{ filename: string; subfolder?: string; type?: string }>;
    [key: string]: any;
  }>;
  status?: { status_str?: string; completed?: boolean };
  [key: string]: any;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Polls /history/{promptId} until the workflow reports outputs, then
 * returns media references. Wall-clock waiting is fine in a Worker
 * (waiting on a promise doesn't consume CPU time).
 */
export async function pollForCompletion(
  endpoint: { base: string; headers: Record<string, string> },
  promptId: string,
  wf: BotWorkflow,
  options: { maxWaitMs?: number; intervalMs?: number } = {}
): Promise<{ filename: string; subfolder: string; type: string }[]> {
  const maxWaitMs = options.maxWaitMs ?? 240_000;
  const intervalMs = options.intervalMs ?? 1_500;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    await sleep(intervalMs);
    try {
      const res = await fetch(buildRelayUrl(endpoint.base, `/history/${promptId}`), {
        method: "GET",
        headers: endpoint.headers,
        cache: "no-store",
      });
      if (!res.ok) continue;

      const history = await res.json();
      const entry = history?.[promptId];
      if (!entry) continue;

      const found: { filename: string; subfolder: string; type: string }[] = [];

      // Prefer the registry-declared output nodes, fall back to any node with images.
      const nodeIds = wf.outputNodes.filter((id) => entry.outputs?.[id]);
      const ids = nodeIds.length > 0 ? nodeIds : Object.keys(entry.outputs || {});
      for (const nodeId of ids) {
        const out = entry.outputs?.[nodeId];
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
      // transient error, keep polling
    }
  }

  throw new Error(`Generation timed out after ${Math.round(maxWaitMs / 1000)}s.`);
}

/**
 * Downloads generated media from the relay /view endpoint.
 */
export async function fetchMediaBlob(
  endpoint: { base: string; headers: Record<string, string> },
  media: { filename: string; subfolder: string; type: string }
): Promise<Blob> {
  const params = new URLSearchParams({
    filename: media.filename,
    subfolder: media.subfolder,
    type: media.type,
  });
  const res = await fetch(buildRelayUrl(endpoint.base, `/view?${params.toString()}`), {
    method: "GET",
    headers: endpoint.headers,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch media from /view (${res.status})`);
  }
  return res.blob();
}
