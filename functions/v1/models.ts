import { listWorkflows } from "../lib/workflows";

/**
 * OpenAI-compatible model catalog: GET /v1/models
 * Each workflow registered in functions/lib/workflows.ts is exposed as a
 * selectable "model" for POST /v1/images/generations.
 */
export const onRequestGet = async (): Promise<Response> => {
  const now = Math.floor(Date.now() / 1000);

  const data = listWorkflows().map((w) => ({
    id: w.id,
    object: "model",
    created: now,
    owned_by: "localImageGen",
    display_name: w.name,
    description: w.description,
    supports_negative_prompt: w.supportsNegativePrompt,
  }));

  return new Response(JSON.stringify({ object: "list", data }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};
