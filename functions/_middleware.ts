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

  // Public routes: login endpoint + bot webhooks + public OpenAI-compatible /v1 API
  // + ratio cheat-sheet asset + public Visual Novel page & public Image Gen page & proxy
  const publicPaths = [
    "/api/auth",
    "/api/config",
    "/api/telegram",
    "/api/discord",
    "/api/proxy",
    "/api/characters",
    "/api/attires",
    "/v1",
    "/aspectratio.jpg",
    "/public",
    "/novel",
    "/vn",
    "/workflows",
    "/assets",
    "/favicon.ico",
  ];
  if (publicPaths.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) {
    // If accessing a public SPA route directly, serve root index.html
    if (url.pathname === "/novel" || url.pathname === "/vn" || url.pathname === "/public") {
      const rootUrl = new URL("/", request.url);
      return next(new Request(rootUrl.toString(), request));
    }
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
