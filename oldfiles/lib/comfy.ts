// Server-side only. Never import this from a client component —
// it reads COMFY_URL, which should never reach the browser.

const COMFY_URL = process.env.COMFY_URL;

function baseUrl() {
  if (!COMFY_URL) {
    throw new Error("COMFY_URL is not set. Add it to your Vercel project's environment variables.");
  }
  return COMFY_URL.replace(/\/$/, "");
}

function authHeaders(): Record<string, string> {
  const key = process.env.COMFY_API_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

export async function queuePrompt(workflow: Record<string, any>) {
  const res = await fetch(`${baseUrl()}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ prompt: workflow, client_id: crypto.randomUUID() }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI /prompt failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<{ prompt_id: string; number: number; node_errors: Record<string, any> }>;
}

export async function getHistory(promptId: string) {
  const res = await fetch(`${baseUrl()}/history/${promptId}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`ComfyUI /history failed (${res.status})`);
  }
  return res.json();
}

/**
 * What ComfyUI currently has: prompt ids running, and prompt ids pending.
 *
 * This exists to answer a question our own table cannot: is a row we believe is
 * `dispatched` actually known to the GPU? A row can be marked in-flight and be
 * completely absent from ComfyUI — the function died before recording the id, or
 * ComfyUI restarted and lost its in-memory queue — and with a concurrency of one
 * that single phantom row blocks every subsequent dispatch.
 *
 * /queue returns entries as arrays whose second element is the prompt id
 * ([number, prompt_id, prompt, extra_data, outputs]). Read defensively: this is
 * a positional shape from another project, not an API contract.
 */
export async function getComfyQueue(): Promise<{ running: string[]; pending: string[] }> {
  const res = await fetch(`${baseUrl()}/queue`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`ComfyUI /queue failed (${res.status})`);
  }

  const data = await res.json();
  const ids = (entries: unknown): string[] =>
    Array.isArray(entries)
      ? entries
          .map((entry) => (Array.isArray(entry) ? entry[1] : null))
          .filter((id): id is string => typeof id === "string")
      : [];

  return {
    running: ids(data?.queue_running),
    pending: ids(data?.queue_pending),
  };
}

/** How many jobs ComfyUI still has to do, from /prompt's exec_info. */
export async function getComfyQueueDepth(): Promise<number | null> {
  const res = await fetch(`${baseUrl()}/prompt`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const remaining = data?.exec_info?.queue_remaining;
  return typeof remaining === "number" ? remaining : null;
}

export async function uploadImageToComfy(file: File) {
  const form = new FormData();
  form.append("image", file);
  form.append("overwrite", "true");
  const res = await fetch(`${baseUrl()}/upload/image`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI /upload/image failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<{ name: string; subfolder: string; type: string }>;
}

export async function fetchComfyFile(filename: string, subfolder = "", type = "output") {
  const params = new URLSearchParams({ filename, subfolder, type });
  const res = await fetch(`${baseUrl()}/view?${params.toString()}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`ComfyUI /view failed (${res.status})`);
  }
  return res;
}

/**
 * Walks a /history/{id} response and finds the video file the SaveVideo
 * node (id "92" in both workflows) wrote out.
 *
 * ComfyUI's core SaveVideo node reports its output under an "images" or
 * "gifs"/"video" key depending on version — this checks the common shapes
 * so you don't have to guess. If your ComfyUI build uses a different key,
 * add it to CANDIDATE_KEYS below (open /history/<id> in a browser once
 * after a real run to confirm the exact shape on your server).
 */
const CANDIDATE_KEYS = ["images", "gifs", "video", "videos"];

export function extractVideoFile(historyEntry: any): { filename: string; subfolder: string; type: string } | null {
  const outputs = historyEntry?.outputs;
  if (!outputs || typeof outputs !== "object") return null;

  // Check designated output nodes first: 92 (SaveVideo) or 13 (SaveImage in Anima)
  const prioritizedNodeIds = ["92", "13", ...Object.keys(outputs).filter((k) => k !== "92" && k !== "13")];

  for (const nodeId of prioritizedNodeIds) {
    const nodeOutput = outputs[nodeId];
    if (!nodeOutput) continue;

    for (const key of CANDIDATE_KEYS) {
      const arr = nodeOutput[key];
      if (Array.isArray(arr) && arr.length > 0) {
        const item = arr[0];
        if (item?.filename) {
          return { filename: item.filename, subfolder: item.subfolder ?? "", type: item.type ?? "output" };
        }
      }
    }
  }

  return null;
}
