import { listWorkflows, RATIO_OPTIONS } from "../lib/workflows";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
  "Access-Control-Max-Age": "86400",
};

export const onRequestOptions = async (): Promise<Response> =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

/**
 * OpenAI-compatible model catalog: GET /v1/models
 * Returns all available image generation models with their specific parameter schemas.
 */
export const onRequestGet = async (): Promise<Response> => {
  const now = Math.floor(Date.now() / 1000);

  const data = listWorkflows().map((w) => ({
    id: w.id,
    aliases: w.aliases,
    object: "model",
    created: now,
    owned_by: "localImageGen",
    display_name: w.name,
    description: w.description,
    supports_negative_prompt: w.supportsNegativePrompt,
    supports_prefill: w.supportsPrefill,
    supports_size: w.supportsSize,
    defaults: {
      steps: w.defaultSteps,
      cfg_scale: w.defaultCfg,
      sampler: w.defaultSampler,
      scheduler: w.defaultScheduler,
    },
    supported_aspect_ratios: RATIO_OPTIONS.map((r) => ({
      ratio: r.id,
      label: r.label,
      width: r.width,
      height: r.height,
    })),
    parameters: w.parameters,
  }));

  return new Response(JSON.stringify({ object: "list", data }, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
    },
  });
};
