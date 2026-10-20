import { Env, getRelayEndpoint } from "../lib/comfy";

/**
 * Auth-protected: returns the ComfyUI relay URL/key from secrets,
 * so the browser never needs to store the relay endpoint in localStorage.
 */
export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { env } = context;
  const relay = getRelayEndpoint(env);

  if (!relay) {
    return new Response(JSON.stringify({ configured: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      configured: true,
      endpoint: relay.base,
      key: relay.headers["X-Api-Key"] || null,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    }
  );
};
