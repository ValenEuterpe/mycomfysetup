import { verifySessionToken, readSessionCookie } from "./lib/auth";
import { Env } from "./lib/comfy";

/**
 * Root middleware: password-gates the whole site (static pages + API routes),
 * except the auth endpoint itself and the public bot webhook(s).
 */
export const onRequest = async (context: {
  request: Request;
  env: Env;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
}): Promise<Response> => {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Let CORS preflights through untouched
  if (request.method === "OPTIONS") {
    return next();
  }

  // Public routes: login endpoint + bot webhooks
  const publicPaths = ["/api/auth", "/api/telegram", "/api/discord"];
  if (publicPaths.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) {
    return next();
  }

  // If no password is configured, the site stays open (e.g. local dev)
  if (!env.SITE_PASSWORD?.trim()) {
    return next();
  }

  const token = readSessionCookie(request);
  const authed = await verifySessionToken(env, token);

  if (authed) {
    return next();
  }

  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Static page: redirect to the login form
  const loginUrl = new URL("/api/auth", url.origin);
  if (url.pathname !== "/") {
    loginUrl.searchParams.set("next", url.pathname);
  }
  return Response.redirect(loginUrl.toString(), 302);
};
