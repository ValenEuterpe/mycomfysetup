import { Env } from "../lib/comfy";
import { verifySessionToken, readSessionCookie } from "../lib/auth";

export interface PublicSiteSettings {
  enabledModels: Record<string, boolean>; // e.g. { "anima-base": true, "kroma": true, "anima-sticker": true }
  defaultModelId: string;
  updatedAt?: number;
}

export const DEFAULT_PUBLIC_SETTINGS: PublicSiteSettings = {
  enabledModels: {
    "anima-base": true,
    "kroma": true,
    "anima-sticker": true,
  },
  defaultModelId: "anima-base",
};

const KV_KEY = "site:public_settings";

export const onRequestGet = async (context: { env: Env }): Promise<Response> => {
  const { env } = context;
  try {
    if (env.TELEGRAM_SETTINGS) {
      const raw = await env.TELEGRAM_SETTINGS.get(KV_KEY);
      if (raw) {
        return new Response(raw, {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      }
    }
  } catch (err) {
    console.error("Failed to read public settings from KV:", err);
  }

  return new Response(JSON.stringify(DEFAULT_PUBLIC_SETTINGS), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};

export const onRequestPost = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const { request, env } = context;

  // Check admin session cookie if site password is set
  if (env.SITE_PASSWORD?.trim()) {
    const token = readSessionCookie(request);
    const authed = await verifySessionToken(env, token);
    if (!authed) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  try {
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const updated: PublicSiteSettings = {
      enabledModels: {
        ...DEFAULT_PUBLIC_SETTINGS.enabledModels,
        ...(payload.enabledModels || {}),
      },
      defaultModelId: payload.defaultModelId || DEFAULT_PUBLIC_SETTINGS.defaultModelId,
      updatedAt: Date.now(),
    };

    if (env.TELEGRAM_SETTINGS) {
      await env.TELEGRAM_SETTINGS.put(KV_KEY, JSON.stringify(updated));
    }

    return new Response(JSON.stringify({ ok: true, settings: updated }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Failed to update settings" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
