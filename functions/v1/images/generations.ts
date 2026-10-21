import { Env, getRelayEndpoint, relayUrl, queuePrompt, pollForCompletion, fetchMediaBlob } from "../../lib/comfy";
import { getWorkflow, buildInjectedWorkflow, listWorkflows } from "../../lib/workflows";
import { RATIO_PRESETS } from "../../../src/lib/ratios";

/**
 * OpenAI-compatible image generation: POST /v1/images/generations
 *
 * Contract matches the DALL·E / gpt-image style API used by SillyTavern,
 * TavoAI and other OpenAI-SDK clients:
 *   { model, prompt, size, response_format: "url" | "b64_json", n, ... }
 * with local extensions: negative_prompt, seed, prefill.
 *
 * Internally it selects a workflow from the registry (the "model"),
 * injects prompt/seed/ratio via buildInjectedWorkflow, queues it on the
 * ComfyUI relay and polls /history until outputs are ready.
 */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
  "Access-Control-Max-Age": "86400",
};

export const onRequestOptions = async (): Promise<Response> =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

function apiError(
  status: number,
  message: string,
  code: string,
  param: string | null = null,
  type = "invalid_request_error"
): Response {
  return new Response(
    JSON.stringify({ error: { message, type, param, code } }),
    { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
  );
}

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

/**
 * Maps an OpenAI `size` string ("1024x1024", "1792x1024", "9:16-crop")
 * onto the shared ~1MP ratio presets by aspect ratio.
 */
function resolveSize(size: unknown): { width: number; height: number } | null {
  const DEFAULT = { width: 1024, height: 1024 };
  const s = typeof size === "string" ? size.toLowerCase().trim() : "";
  if (!s) return DEFAULT;

  // Explicit ratio ids ("16:9"), optionally with presets suffix
  const defaultMatch = s.match(/^(\d{1,2}:\d{1,2})/);
  if (defaultMatch) {
    const preset = RATIO_PRESETS.find((r) => r.id === defaultMatch[1]);
    if (preset) return { width: preset.width, height: preset.height };
  }

  // "WxH" (DALL·E style). Snap to the nearest preset aspect ratio so the
  // relayed model always renders within its comfortable ~1MP envelope.
  const dims = s.match(/^(\d{2,5})x(\d{2,5})$/);
  if (dims) {
    const w = Number(dims[1]);
    const h = Number(dims[2]);
    if (w > 0 && h > 0) {
      const target = w / h;
      let best = RATIO_PRESETS[0];
      let bestDiff = Infinity;
      for (const r of RATIO_PRESETS) {
        const diff = Math.abs(r.width / r.height - target);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = r;
        }
      }
      return { width: best.width, height: best.height };
    }
  }

  return null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  });
}

export const onRequestPost = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const { env, request } = context;

  const relay = getRelayEndpoint(env);
  if (!relay) {
    return json(
      {
        error: {
          message: "Image generation is not configured on this deployment (missing COMFY_RELAY_URL).",
          type: "server_error",
          param: null,
          code: "not_configured",
        },
      },
      503
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON in request body.", "bad_json");
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return apiError(400, "Missing required parameter: prompt.", "missing_required_parameter", "prompt");
  }

  const n = body.n === undefined ? 1 : Number(body.n);
  if (Number.isInteger(n) && n > 1) {
    return apiError(400, "This deployment generates one image per request (n must be 1).", "unsupported_n", "n");
  }

  const size = resolveSize(body.size);
  if (!size) {
    return apiError(400, `Invalid value '${body.size}' for parameter size. Expected e.g. "1024x1024", "1792x1024" or a ratio like "16:9".`, "invalid_value", "size");
  }

  const responseFormat = body.response_format === "b64_json" ? "b64_json" : "url";

  // Model selection: registry workflow id, defaulting to the first workflow.
  const rawModel = typeof body.model === "string" ? body.model.trim() : "";
  const wf = rawModel ? getWorkflow(rawModel) : getWorkflow("anima");
  if (!wf) {
    const available = listWorkflows().map((w) => w.id).join(", ");
    return apiError(400, `The model '${rawModel}' does not exist. Available models: ${available}`, "model_not_found", "model");
  }

  // Seed (optional, integer >= 0)
  let seed: string | undefined;
  const parsedSeed = Number(body.seed);
  if (Number.isInteger(parsedSeed) && parsedSeed >= 0) {
    seed = String(parsedSeed);
  }

  // Negative prompt: explicit parameter wins, else the "|" convention
  // shared with the bot lets callers embed negatives in the prompt string.
  const explicitNegative =
    typeof body.negative_prompt === "string"
      ? body.negative_prompt
      : typeof body.negativePrompt === "string"
        ? body.negativePrompt
        : undefined;

  let positive = prompt;
  let negative = explicitNegative;
  if (explicitNegative === undefined) {
    const splitAt = prompt.lastIndexOf("|");
    if (splitAt !== -1) {
      positive = prompt.slice(0, splitAt).trim();
      negative = prompt.slice(splitAt + 1).trim();
    }
  }

  const prefill = body.prefill === undefined ? true : Boolean(body.prefill);

  const graph = buildInjectedWorkflow(wf, {
    positive,
    negative,
    // Apply the workflow's quality prefill (anima) unless the caller opts out
    prefill: prefill ? wf.prefillDefault : undefined,
    seed,
    width: size.width,
    height: size.height,
  });

  let media: { filename: string; subfolder: string; type: string };
  try {
    const promptId = await queuePrompt(relay, graph as Record<string, any>, crypto.randomUUID());
    media = (await pollForCompletion(relay, promptId, wf))[0];
  } catch (err: any) {
    const message = String(err?.message || "Image generation failed.");

    if (message.includes("timed out")) {
      return json(
        {
          error: {
            message,
            type: "server_error",
            param: null,
            code: "timeout",
          },
        },
        504
      );
    }

    return json(
      {
        error: {
          message,
          type: "server_error",
          param: null,
          code: "generation_failed",
        },
      },
      500
    );
  }

  if (responseFormat === "b64_json") {
    try {
      const blob = await fetchMediaBlob(relay, media);
      const b64 = await blobToBase64(blob);
      return json({ created: Math.floor(Date.now() / 1000), data: [{ b64_json: b64 }] });
    } catch {
      // Fall through to the URL format if encoding fails
    }
  }

  return json({
    created: Math.floor(Date.now() / 1000),
    data: [
      {
        url: relayUrl(relay, "/view", {
          filename: media.filename,
          subfolder: media.subfolder,
          type: media.type,
        }),
      },
    ],
  });
};
