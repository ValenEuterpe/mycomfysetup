import { Env } from "../lib/comfy";

const KV_CHARACTERS_KEY = "vn:characters";

export interface EventContext<Env = unknown, P extends string = string, Data = unknown> {
  request: Request;
  functionPath: string;
  waitUntil: (promise: Promise<unknown>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  env: Env;
  params: Record<P, string | string[]>;
  data: Data;
}

export const onRequest = async (context: EventContext<Env>): Promise<Response> => {
  const { request, env } = context;
  const url = new URL(request.url);

  // Handle CORS Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  const kv = env.TELEGRAM_SETTINGS;

  // 1. GET: Retrieve characters from KV
  if (request.method === "GET") {
    if (!kv) {
      return new Response(
        JSON.stringify({ characters: [], cloudAvailable: false }),
        { status: 200, headers: corsHeaders }
      );
    }

    try {
      const raw = await kv.get(KV_CHARACTERS_KEY);
      const characters = raw ? JSON.parse(raw) : [];
      return new Response(
        JSON.stringify({ characters, cloudAvailable: true }),
        { status: 200, headers: corsHeaders }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ characters: [], error: err.message, cloudAvailable: true }),
        { status: 200, headers: corsHeaders }
      );
    }
  }

  // 2. POST: Save or update character(s) in KV
  if (request.method === "POST") {
    if (!kv) {
      return new Response(
        JSON.stringify({ success: false, message: "Cloud KV not configured" }),
        { status: 200, headers: corsHeaders }
      );
    }

    try {
      const body = await request.json().catch(() => null);
      if (!body) {
        return new Response(
          JSON.stringify({ error: "Missing JSON body" }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Existing list
      const raw = await kv.get(KV_CHARACTERS_KEY);
      let current: any[] = raw ? JSON.parse(raw) : [];

      if (Array.isArray(body.characters)) {
        // Bulk replace or merge
        current = body.characters;
      } else if (body.character && body.character.id) {
        // Single upsert
        const char = body.character;
        const existingIdx = current.findIndex((c) => c.id === char.id);
        if (existingIdx >= 0) {
          current[existingIdx] = char;
        } else {
          current = [char, ...current];
        }
      }

      // Save text representations to KV
      await kv.put(KV_CHARACTERS_KEY, JSON.stringify(current));

      return new Response(
        JSON.stringify({ success: true, count: current.length }),
        { status: 200, headers: corsHeaders }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  // 3. DELETE: Remove character from KV
  if (request.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id || !kv) {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: corsHeaders }
      );
    }

    try {
      const raw = await kv.get(KV_CHARACTERS_KEY);
      if (raw) {
        const current: any[] = JSON.parse(raw);
        const filtered = current.filter((c) => c.id !== id);
        await kv.put(KV_CHARACTERS_KEY, JSON.stringify(filtered));
      }
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: corsHeaders }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  return new Response("Method not allowed", { status: 405 });
};
