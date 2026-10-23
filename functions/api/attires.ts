import { Env } from "../lib/comfy";

const KV_ATTIRES_KEY = "vn:attires";

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

  // 1. GET: Retrieve attires from KV
  if (request.method === "GET") {
    if (!kv) {
      return new Response(
        JSON.stringify({ attires: [], cloudAvailable: false }),
        { status: 200, headers: corsHeaders }
      );
    }

    try {
      const raw = await kv.get(KV_ATTIRES_KEY);
      const attires = raw ? JSON.parse(raw) : [];
      return new Response(
        JSON.stringify({ attires, cloudAvailable: true }),
        { status: 200, headers: corsHeaders }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ attires: [], error: err.message, cloudAvailable: true }),
        { status: 200, headers: corsHeaders }
      );
    }
  }

  // 2. POST: Save or update attire(s) in KV
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

      const raw = await kv.get(KV_ATTIRES_KEY);
      let current: any[] = raw ? JSON.parse(raw) : [];

      if (Array.isArray(body.attires)) {
        current = body.attires;
      } else if (body.attire && body.attire.id) {
        const attire = body.attire;
        const existingIdx = current.findIndex((a) => a.id === attire.id);
        if (existingIdx >= 0) {
          current[existingIdx] = attire;
        } else {
          current = [attire, ...current];
        }
      }

      await kv.put(KV_ATTIRES_KEY, JSON.stringify(current));

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

  // 3. DELETE: Remove attire from KV
  if (request.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id || !kv) {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: corsHeaders }
      );
    }

    try {
      const raw = await kv.get(KV_ATTIRES_KEY);
      if (raw) {
        const current: any[] = JSON.parse(raw);
        const filtered = current.filter((a) => a.id !== id);
        await kv.put(KV_ATTIRES_KEY, JSON.stringify(filtered));
      }
      return new Response(
        JSON.stringify({ success: true, deleted: id }),
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
