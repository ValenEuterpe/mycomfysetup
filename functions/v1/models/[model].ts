import { getWorkflow, listWorkflows, RATIO_OPTIONS } from "../../lib/workflows";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
  "Access-Control-Max-Age": "86400",
};

export const onRequestOptions = async (): Promise<Response> =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

/**
 * OpenAI-compatible model detail: GET /v1/models/{id}
 */
export const onRequestGet = async (context: {
  params: Record<string, string | string[] | undefined>;
}): Promise<Response> => {
  const raw = context.params.model;
  const id = (Array.isArray(raw) ? raw[0] : raw) || "";

  const wf = getWorkflow(id);
  if (!wf) {
    const available = listWorkflows()
      .map((w) => `${w.id} (or ${w.aliases.join(", ")})`)
      .join("; ");
    return new Response(
      JSON.stringify({
        error: {
          message: `The model '${id}' does not exist. Available models: ${available}`,
          type: "invalid_request_error",
          param: "model",
          code: "model_not_found",
        },
      }),
      { status: 404, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  return new Response(
    JSON.stringify(
      {
        id: wf.id,
        aliases: wf.aliases,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "localImageGen",
        display_name: wf.displayName,
        description: wf.description,
        supports_negative_prompt: wf.supportsNegativePrompt,
        supports_prefill: wf.supportsPrefill,
        supports_size: wf.supportsSize,
        defaults: {
          steps: wf.defaultSteps,
          cfg_scale: wf.defaultCfg,
          sampler: wf.defaultSampler,
          scheduler: wf.defaultScheduler,
          negative_prompt: wf.negativeDefault,
          prefill: wf.prefillDefault,
        },
        supported_aspect_ratios: RATIO_OPTIONS.map((r) => ({
          ratio: r.id,
          label: r.label,
          width: r.width,
          height: r.height,
        })),
        parameters: wf.parameters,
      },
      null,
      2
    ),
    {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS_HEADERS },
    }
  );
};
