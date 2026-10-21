import { GeneratedMedia } from "../types/workflow";
import { saveMediaToLocalCache } from "./mediaCache";

export interface ComfyConnectionTestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
  queueRemaining?: number;
  systemStats?: any;
}

export interface PromptQueueResponse {
  prompt_id: string;
  number?: number;
  node_errors?: Record<string, any>;
}

export interface ComfyHistoryOutput {
  images?: Array<{ filename: string; subfolder: string; type: string }>;
  videos?: Array<{ filename: string; subfolder: string; type: string }>;
  gifs?: Array<{ filename: string; subfolder: string; type: string }>;
  [key: string]: any;
}

export interface ComfyHistoryResult {
  prompt: any;
  outputs: Record<string, ComfyHistoryOutput>;
  status?: {
    status_str: string;
    completed: boolean;
    messages?: any[];
  };
}

/**
 * Extracts any auth token from the endpoint query parameters (like ?key= or ?token=).
 */
export function extractAuthKey(endpoint: string): string | null {
  try {
    const trimmed = endpoint.trim();
    const urlStr = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(urlStr);
    return url.searchParams.get("key") || url.searchParams.get("token") || null;
  } catch {
    return null;
  }
}

/**
 * Returns standard auth headers if a key is present in the endpoint URL.
 */
export function getAuthHeaders(endpoint: string): Record<string, string> {
  const key = extractAuthKey(endpoint);
  if (!key) return {};
  return {
    Authorization: `Bearer ${key}`,
    "X-Api-Key": key,
  };
}

/**
 * Parses and builds URLs for arbitrary ComfyUI endpoints or Cloudflare Worker relays.
 */
export function buildComfyUrl(endpoint: string, path: string, extraParams: Record<string, string> = {}): string {
  try {
    const trimmed = endpoint.trim();
    if (!trimmed) return path;

    // Handle missing protocol
    const urlStr = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

    const url = new URL(urlStr);

    // Normalize base path: strip trailing slashes AND redundant endpoint suffixes (e.g. /prompt, /view)
    let basePath = url.pathname.replace(/\/+$/, "");
    basePath = basePath.replace(/\/(prompt|history|view|upload|queue|system_stats)$/i, "");

    const cleanSubPath = path.startsWith("/") ? path : `/${path}`;
    url.pathname = `${basePath}${cleanSubPath}`;

    // Append extra query params while preserving existing ones (like ?key=...)
    for (const [k, v] of Object.entries(extraParams)) {
      url.searchParams.set(k, v);
    }

    return url.toString();
  } catch (err) {
    return `${endpoint.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  }
}

/**
 * Builds the URL to view an image/video from ComfyUI /view endpoint.
 */
export function buildViewUrl(
  endpoint: string,
  filename: string,
  subfolder: string = "",
  type: string = "output"
): string {
  return buildComfyUrl(endpoint, "/view", {
    filename,
    subfolder,
    type,
  });
}

/**
 * Generates an appropriate WebSocket URL for real-time progress.
 */
export function buildWsUrl(endpoint: string, clientId: string): string {
  try {
    const trimmed = endpoint.trim();
    const urlStr = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

    const url = new URL(urlStr);
    const isSecure = url.protocol === "https:";
    url.protocol = isSecure ? "wss:" : "ws:";

    let basePath = url.pathname.replace(/\/+$/, "");
    basePath = basePath.replace(/\/(prompt|history|view|upload|queue|system_stats)$/i, "");

    url.pathname = `${basePath}/ws`;
    url.searchParams.set("clientId", clientId);
    return url.toString();
  } catch {
    return "";
  }
}

/**
 * Wrapper for fetch with automatic fallback to edge proxy if CORS fails.
 * (Exported so other libs can talk to ComfyUI with the same CORS fallback.)
 */
export async function comfyProxyFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(url, init);
    return res;
  } catch (err: any) {
    // If browser failed with TypeError (likely CORS or network blocked), try local/Cloudflare proxy
    if (err instanceof TypeError && !url.startsWith("/api/proxy")) {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
      return fetch(proxyUrl, init);
    }
    throw err;
  }
}

/**
 * Tests connection to the ComfyUI endpoint.
 */
export async function testComfyConnection(endpoint: string): Promise<ComfyConnectionTestResult> {
  const start = performance.now();
  try {
    const targetUrl = buildComfyUrl(endpoint, "/prompt");
    const headers = { ...getAuthHeaders(endpoint) };
    const res = await comfyProxyFetch(targetUrl, { method: "GET", headers, cache: "no-store" });

    const latencyMs = Math.round(performance.now() - start);

    if (res.status === 403 || res.status === 401) {
      return {
        ok: false,
        message: `Authentication required (${res.status} Forbidden). Check your ?key= parameter.`,
        latencyMs,
      };
    }

    if (!res.ok && res.status !== 405) {
      return {
        ok: false,
        message: `Endpoint responded with status ${res.status} (${res.statusText})`,
        latencyMs,
      };
    }

    const data = await res.json().catch(() => null);
    const queueRemaining = data?.exec_info?.queue_remaining ?? 0;

    return {
      ok: true,
      message: `Connected successfully (${latencyMs}ms)`,
      latencyMs,
      queueRemaining,
      systemStats: data,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      ok: false,
      message: err.message || "Failed to reach endpoint",
      latencyMs,
    };
  }
}

/**
 * Uploads an image to ComfyUI for image-to-image or image-to-video.
 * Accepts a File directly, or a Blob + filename (entities, chained outputs).
 */
export async function uploadImageToComfy(
  endpoint: string,
  image: File | Blob,
  filenameHint?: string
): Promise<{ name: string; subfolder: string; type: string }> {
  const targetUrl = buildComfyUrl(endpoint, "/upload/image");
  const form = new FormData();
  const name =
    (image instanceof File && image.name) ||
    filenameHint ||
    `edit_ref_${Date.now().toString(36)}.png`;
  form.append("image", image, name);
  form.append("overwrite", "true");

  const headers = { ...getAuthHeaders(endpoint) };

  const res = await comfyProxyFetch(targetUrl, {
    method: "POST",
    headers,
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI /upload/image failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Submits a workflow prompt to ComfyUI.
 */
export async function queuePrompt(
  endpoint: string,
  workflow: Record<string, any>,
  clientId: string
): Promise<PromptQueueResponse> {
  const targetUrl = buildComfyUrl(endpoint, "/prompt");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeaders(endpoint),
  };

  const res = await comfyProxyFetch(targetUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });

  if (!res.ok) {
    const text = await res.text();
    let errorMessage = `ComfyUI /prompt failed (${res.status}): ${text || res.statusText}`;
    if (res.status === 403 || res.status === 401) {
      errorMessage = `Authentication failed (${res.status} Forbidden). Please verify your relay '?key=' parameter.`;
    } else if (res.status === 404) {
      errorMessage = `ComfyUI route not found (404) at ${targetUrl}. Please verify your relay URL.`;
    }
    throw new Error(errorMessage);
  }

  return res.json();
}

/**
 * Fetches the execution history for a given promptId.
 */
export async function getHistory(
  endpoint: string,
  promptId: string
): Promise<Record<string, ComfyHistoryResult>> {
  const targetUrl = buildComfyUrl(endpoint, `/history/${promptId}`);
  const headers = { ...getAuthHeaders(endpoint) };

  const res = await comfyProxyFetch(targetUrl, { headers, cache: "no-store" });

  if (!res.ok) {
    throw new Error(`ComfyUI /history failed (${res.status})`);
  }

  return res.json();
}

/**
 * Fetches an output image or video from ComfyUI /view using authenticated fetch
 * and returns a local object URL (blob:...) that renders and downloads cleanly in the browser.
 */
export async function fetchComfyMediaBlob(
  endpoint: string,
  filename: string,
  subfolder: string = "",
  type: string = "output"
): Promise<{ blob: Blob; localUrl: string }> {
  const targetUrl = buildViewUrl(endpoint, filename, subfolder, type);
  const headers = { ...getAuthHeaders(endpoint) };

  const res = await comfyProxyFetch(targetUrl, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch media from ComfyUI /view (${res.status}): ${text || res.statusText}`);
  }

  const blob = await res.blob();
  const localUrl = URL.createObjectURL(blob);
  return { blob, localUrl };
}

/**
 * Polls for completion of a prompt and parses output images/videos.
 */
export async function pollPromptCompletion(
  endpoint: string,
  promptId: string,
  onProgress?: (progress: number, stepText: string) => void,
  maxWaitMs: number = 300_000,
  intervalMs: number = 1200
): Promise<GeneratedMedia[]> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const history = await getHistory(endpoint, promptId);
      const entry = history[promptId];

      if (entry && entry.outputs) {
        const media: GeneratedMedia[] = [];

        for (const [, output] of Object.entries(entry.outputs)) {
          // Images
          if (Array.isArray(output.images)) {
            for (const img of output.images) {
              let displayUrl = buildViewUrl(endpoint, img.filename, img.subfolder, img.type);
              let mediaId: string | undefined;
              try {
                const fetched = await fetchComfyMediaBlob(endpoint, img.filename, img.subfolder, img.type);
                displayUrl = fetched.localUrl;
                mediaId = `media_${Date.now()}_${img.filename.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
                await saveMediaToLocalCache(mediaId, fetched.blob, img.filename, "image");
              } catch (blobErr) {
                console.warn("Could not fetch media blob to local cache:", blobErr);
              }

              media.push({
                id: mediaId,
                filename: img.filename,
                subfolder: img.subfolder || "",
                type: img.type || "output",
                url: displayUrl,
                mimeType: "image",
              });
            }
          }
          // Videos / Gifs
          const videoItems = output.videos || output.gifs;
          if (Array.isArray(videoItems)) {
            for (const vid of videoItems) {
              let displayUrl = buildViewUrl(endpoint, vid.filename, vid.subfolder, vid.type);
              let mediaId: string | undefined;
              try {
                const fetched = await fetchComfyMediaBlob(endpoint, vid.filename, vid.subfolder, vid.type);
                displayUrl = fetched.localUrl;
                mediaId = `media_${Date.now()}_${vid.filename.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
                await saveMediaToLocalCache(mediaId, fetched.blob, vid.filename, "video");
              } catch (blobErr) {
                console.warn("Could not fetch media blob to local cache:", blobErr);
              }

              media.push({
                id: mediaId,
                filename: vid.filename,
                subfolder: vid.subfolder || "",
                type: vid.type || "output",
                url: displayUrl,
                mimeType: "video",
              });
            }
          }
        }

        if (media.length > 0) {
          onProgress?.(100, "Completed");
          return media;
        }

        if (entry.status && entry.status.completed) {
          return media;
        }
      }

      // Check if still queued or running
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      onProgress?.(
        Math.min(95, Math.floor((elapsed / 30) * 100)),
        `Generating... (${elapsed}s)`
      );
    } catch (e) {
      // Continue polling on transient errors
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Generation timed out after ${maxWaitMs / 1000} seconds.`);
}
