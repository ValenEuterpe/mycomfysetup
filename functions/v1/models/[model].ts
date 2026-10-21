import { getWorkflow, listWorkflows } from "../../lib/workflows";

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
    const available = listWorkflows().map((w) => w.id).join(", ");
    return new Response(
      JSON.stringify({
        error: {
          message: `The model '${id}' does not exist. Available models: ${available}`,
          type: "invalid_request_error",
          param: null,
          code: "model_not_found",
        },
      }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      id: wf.id,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: "localImageGen",
      display_name: wf.displayName,
      description: wf.description,
      supports_negative_prompt: wf.supportsNegativePrompt,
      supports_size: wf.supportsSize,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    }
  );
};
