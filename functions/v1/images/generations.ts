import { Env, getRelayEndpoint, relayUrl, queuePrompt, pollForCompletion, fetchMediaBlob } from "../../lib/comfy";
import { getWorkflow, buildInjectedWorkflow, listWorkflows } from "../../lib/workflows";
import { RATIO_PRESETS } from "../../../src/lib/ratios";

/**
 * OpenAI-compatible image generation: POST /v1/images/generations
 *
 * Contract matches the DALL·E / gpt-image style API used by SillyTavern,
 * TavoAI, Cursor, AutoGen, and other OpenAI-SDK clients:
 *   { model, prompt, size, response_format: "url" | "b64_json", n, ... }
 * with model-specific extensions:
 *   - negative_prompt (anima, anima-sticker)
 *   - steps, cfg_scale, sampler_name, scheduler, denoise, seed
 *   - outline_width, outline_color, sensitivity (anima-sticker)
 *   - upscale_steps, upscale_denoise, scale_by (kroma)
 *   - prefill (boolean | string)
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
 * Maps an OpenAI `size` string ("1024x1024", "1792x1024", "16:9", etc.)
 * onto the shared ~1MP ratio presets by aspect ratio.
 */
function resolveSize(size: unknown): { width: number; height: number } | null {
  const DEFAULT = { width: 1024, height: 1024 };
  const s = typeof size === "string" ? size.toLowerCase().trim() : "";
  if (!s) return DEFAULT;

  // Explicit ratio ids ("16:9", "9:16", "1:1", etc.)
  const defaultMatch = s.match(/^(\d{1,2}:\d{1,2})/);
  if (defaultMatch) {
    const preset = RATIO_PRESETS.find((r) => r.id === defaultMatch[1]);
    if (preset) return { width: preset.width, height: preset.height };
  }

  // "WxH" (DALL·E style). Snap to the nearest preset aspect ratio
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

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON in request body.", "bad_json");
  }

  // Support relay endpoint override from request header or body
  const clientRelay =
    request.headers.get("x-relay-url") ||
    request.headers.get("x-comfy-relay") ||
    body?.relay_url ||
    body?.relayUrl;

  const relay = getRelayEndpoint(env, clientRelay);
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
    return apiError(
      400,
      `Invalid value '${body.size}' for parameter size. Expected e.g. "1024x1024", "16:9", "9:16", "4:3", "3:4".`,
      "invalid_value",
      "size"
    );
  }

  const responseFormat = body.response_format === "b64_json" ? "b64_json" : "url";

  // Model selection: supports canonical id and friendly aliases (e.g. 'krea', 'sticker')
  const rawModel = typeof body.model === "string" ? body.model.trim() : "";
  const wf = rawModel ? getWorkflow(rawModel) : getWorkflow("anima");
  if (!wf) {
    const available = listWorkflows()
      .map((w) => `${w.id} (or ${w.aliases.join(", ")})`)
      .join("; ");
    return apiError(
      400,
      `The model '${rawModel}' does not exist. Available models: ${available}`,
      "model_not_found",
      "model"
    );
  }

  // Seed (optional integer >= 0)
  let seed: string | undefined;
  if (body.seed !== undefined && body.seed !== null && body.seed !== "") {
    const parsedSeed = Number(body.seed);
    if (!Number.isFinite(parsedSeed) || parsedSeed < 0) {
      return apiError(400, "Seed must be a non-negative integer.", "invalid_value", "seed");
    }
    seed = String(Math.floor(parsedSeed));
  }

  // Negative prompt resolution:
  // If the model supports negative prompts, allow explicit negative_prompt / negativePrompt
  // or the '|' separator in the prompt string. If the model does not support negative prompts (kroma),
  // we do not fail—we keep the prompt clean and ignore the negative prompt.
  const explicitNegative =
    typeof body.negative_prompt === "string"
      ? body.negative_prompt
      : typeof body.negativePrompt === "string"
      ? body.negativePrompt
      : undefined;

  let positive = prompt;
  let negative = explicitNegative;

  if (wf.supportsNegativePrompt && explicitNegative === undefined) {
    const splitAt = prompt.lastIndexOf("|");
    if (splitAt !== -1) {
      positive = prompt.slice(0, splitAt).trim();
      negative = prompt.slice(splitAt + 1).trim();
    }
  }

  // Prefill control (boolean or custom prefill string)
  let prefill: string | boolean | undefined = undefined;
  if (body.prefill !== undefined) {
    if (typeof body.prefill === "string") {
      prefill = body.prefill;
    } else {
      prefill = Boolean(body.prefill);
    }
  }

  // Steps (optional, integer >= 1)
  let steps: number | undefined;
  const rawSteps = body.steps ?? body.num_inference_steps;
  if (rawSteps !== undefined && rawSteps !== null && rawSteps !== "") {
    const parsedSteps = Number(rawSteps);
    if (!Number.isInteger(parsedSteps) || parsedSteps < 1 || parsedSteps > 150) {
      return apiError(400, "Steps must be an integer between 1 and 150.", "invalid_value", "steps");
    }
    steps = parsedSteps;
  }

  // CFG Scale (optional, number >= 0.5 and <= 30.0)
  let cfg: number | undefined;
  const rawCfg = body.cfg_scale ?? body.cfgScale ?? body.cfg ?? body.guidance_scale;
  if (rawCfg !== undefined && rawCfg !== null && rawCfg !== "") {
    const parsedCfg = Number(rawCfg);
    if (!Number.isFinite(parsedCfg) || parsedCfg < 0.5 || parsedCfg > 30.0) {
      return apiError(400, "CFG scale must be a number between 0.5 and 30.0.", "invalid_value", "cfg_scale");
    }
    cfg = parsedCfg;
  }

  // Sampler & Scheduler
  const samplerName =
    typeof body.sampler_name === "string"
      ? body.sampler_name.trim()
      : typeof body.samplerName === "string"
      ? body.samplerName.trim()
      : typeof body.sampler === "string"
      ? body.sampler.trim()
      : undefined;

  const scheduler =
    typeof body.scheduler === "string" ? body.scheduler.trim() : undefined;

  // Denoise
  let denoise: number | undefined;
  if (body.denoise !== undefined && body.denoise !== null && body.denoise !== "") {
    const parsedDenoise = Number(body.denoise);
    if (!Number.isFinite(parsedDenoise) || parsedDenoise < 0.0 || parsedDenoise > 1.0) {
      return apiError(400, "Denoise must be a number between 0.0 and 1.0.", "invalid_value", "denoise");
    }
    denoise = parsedDenoise;
  }

  // Sticker-specific parameters
  let outlineWidth: number | undefined;
  const rawThickness =
    body.outline_width ?? body.outlineWidth ?? body.sticker_thickness ?? body.thickness;
  if (rawThickness !== undefined && rawThickness !== null && rawThickness !== "") {
    const parsedThickness = Number(rawThickness);
    if (!Number.isFinite(parsedThickness) || parsedThickness < 0 || parsedThickness > 50) {
      return apiError(400, "Outline width must be a number between 0 and 50.", "invalid_value", "outline_width");
    }
    outlineWidth = Math.round(parsedThickness);
  }

  const outlineColor =
    typeof body.outline_color === "string"
      ? body.outline_color.trim()
      : typeof body.outlineColor === "string"
      ? body.outlineColor.trim()
      : typeof body.color === "string"
      ? body.color.trim()
      : undefined;

  let sensitivity: number | undefined;
  const rawSensitivity = body.sensitivity ?? body.rmbg_sensitivity;
  if (rawSensitivity !== undefined && rawSensitivity !== null && rawSensitivity !== "") {
    const parsedSensitivity = Number(rawSensitivity);
    if (!Number.isFinite(parsedSensitivity) || parsedSensitivity < 0.1 || parsedSensitivity > 5.0) {
      return apiError(400, "Sensitivity must be a number between 0.1 and 5.0.", "invalid_value", "sensitivity");
    }
    sensitivity = parsedSensitivity;
  }

  // Kroma upscale-specific parameters
  let upscaleSteps: number | undefined;
  const rawUpscaleSteps = body.upscale_steps ?? body.upscaleSteps;
  if (rawUpscaleSteps !== undefined && rawUpscaleSteps !== null && rawUpscaleSteps !== "") {
    const parsed = Number(rawUpscaleSteps);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
      return apiError(400, "Upscale steps must be an integer between 1 and 50.", "invalid_value", "upscale_steps");
    }
    upscaleSteps = parsed;
  }

  let upscaleDenoise: number | undefined;
  const rawUpscaleDenoise = body.upscale_denoise ?? body.upscaleDenoise;
  if (rawUpscaleDenoise !== undefined && rawUpscaleDenoise !== null && rawUpscaleDenoise !== "") {
    const parsed = Number(rawUpscaleDenoise);
    if (!Number.isFinite(parsed) || parsed < 0.0 || parsed > 1.0) {
      return apiError(400, "Upscale denoise must be between 0.0 and 1.0.", "invalid_value", "upscale_denoise");
    }
    upscaleDenoise = parsed;
  }

  let scaleBy: number | undefined;
  const rawScaleBy = body.scale_by ?? body.scaleBy ?? body.upscale_factor;
  if (rawScaleBy !== undefined && rawScaleBy !== null && rawScaleBy !== "") {
    const parsed = Number(rawScaleBy);
    if (!Number.isFinite(parsed) || parsed < 1.0 || parsed > 4.0) {
      return apiError(400, "Scale factor must be between 1.0 and 4.0.", "invalid_value", "scale_by");
    }
    scaleBy = parsed;
  }

  const graph = buildInjectedWorkflow(wf, {
    positive,
    negative,
    prefill,
    seed,
    width: size.width,
    height: size.height,
    steps,
    cfg,
    sampler_name: samplerName,
    scheduler,
    denoise,
    outline_width: outlineWidth,
    outline_color: outlineColor,
    sensitivity,
    upscale_steps: upscaleSteps,
    upscale_denoise: upscaleDenoise,
    scale_by: scaleBy,
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
      return json({
        created: Math.floor(Date.now() / 1000),
        data: [{ b64_json: b64 }],
      });
    } catch {
      // Fall through to URL format if base64 conversion fails
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
