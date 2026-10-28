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
  // Per-bot-user settings storage (model / ratio / prefill / negative)
  TELEGRAM_SETTINGS?: KVNamespace;
  [key: string]: unknown;
}

export interface RelayEndpoint {
  base: string; // scheme + host + base path, no trailing slash
  key?: string; // relay auth key (sent as ?key= and auth headers)
  headers: Record<string, string>;
}

/**
 * Normalizes the relay URL and resolves the auth key from secrets
 * (or from a ?key= baked into the URL value, or a client override).
 */
export function getRelayEndpoint(env: Env, overrideUrl?: string | null): RelayEndpoint | null {
  const raw =
    overrideUrl?.trim() ||
    env.COMFY_RELAY_URL?.trim() ||
    "https://comfy-relay.chaoticmindintheuniverse.workers.dev?key=1357911";
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    // unparseable — fall back to string math with no key resolution
    let key = env.COMFY_RELAY_KEY?.trim();
    if (key === "1234567891011" || (!key && raw.includes("chaoticmindintheuniverse.workers.dev"))) {
      key = "1357911";
    }
    const headers: Record<string, string> = {};
    if (key) {
      headers["Authorization"] = `Bearer ${key}`;
      headers["X-Api-Key"] = key;
    }
    return { base: raw, key, headers };
  }

  // Key can come from the dedicated secret OR from ?key= in the URL itself
  let key = env.COMFY_RELAY_KEY?.trim() || url.searchParams.get("key") || undefined;
  if (key) url.searchParams.delete("key");
  if (key) url.searchParams.delete("token");

  // Automatically migrate legacy / expired relay key (1234567891011 -> 1357911)
  // or default key for the primary chaoticmindintheuniverse relay
  if (key === "1234567891011" || (!key && url.host.includes("chaoticmindintheuniverse.workers.dev"))) {
    key = "1357911";
  }

  const base = `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;

  const headers: Record<string, string> = {};
  if (key) {
    headers["Authorization"] = `Bearer ${key}`;
    headers["X-Api-Key"] = key;
  }
  return { base, key, headers };
}

/**
 * Builds a full relay URL: base path + route + auth key as ?key= query param
 * (this is how ComfyUI relays authenticate, matching the studio's browser flow).
 */
export function relayUrl(
  endpoint: RelayEndpoint,
  path: string,
  extraParams?: Record<string, string>
): string {
  const url = new URL(endpoint.base);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  for (const [k, v] of Object.entries(extraParams || {})) {
    url.searchParams.set(k, v);
  }
  if (endpoint.key) url.searchParams.set("key", endpoint.key);
  return url.toString();
}

/**
 * Submits an injected workflow graph to the ComfyUI relay /prompt endpoint.
 */
export async function queuePrompt(
  endpoint: RelayEndpoint,
  workflow: Record<string, any>,
  clientId: string
): Promise<string> {
  const res = await fetch(relayUrl(endpoint, "/prompt"), {
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
  endpoint: RelayEndpoint,
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
      const res = await fetch(relayUrl(endpoint, `/history/${promptId}`), {
        method: "GET",
        headers: endpoint.headers,
        cf: { cacheTtl: 0 },
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
  endpoint: RelayEndpoint,
  media: { filename: string; subfolder: string; type: string }
): Promise<Blob> {
  const params: Record<string, string> = {
    filename: media.filename,
    subfolder: media.subfolder,
    type: media.type,
  };
  const res = await fetch(relayUrl(endpoint, "/view", params), {
    method: "GET",
    headers: endpoint.headers,
    cf: { cacheTtl: 0 },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch media from /view (${res.status})`);
  }
  return res.blob();
}
