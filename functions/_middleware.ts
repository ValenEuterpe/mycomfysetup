import { verifySessionToken, readSessionCookie } from "./lib/auth";
import { Env } from "./lib/comfy";

/**
 * Root middleware:
 * - Root '/' is the public-facing image generation portal (no password required).
 * - '/admin' is the password-protected admin studio.
 * - Public API routes (/api/auth, /api/config, /api/public-settings, /v1, etc.) remain open.
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

  // 1. Password-gated Admin route (/admin and /admin/*)
  const isAdminPath = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
  if (isAdminPath) {
    if (env.SITE_PASSWORD?.trim()) {
      const token = readSessionCookie(request);
      const authed = await verifySessionToken(env, token);
      if (!authed) {
        const loginUrl = new URL("/api/auth", url.origin);
        loginUrl.searchParams.set("next", url.pathname);
        return Response.redirect(loginUrl.toString(), 302);
      }
    }
    // Authenticated admin: serve the SPA index.html while keeping /admin URL in address bar
    const rootUrl = new URL("/", request.url);
    return next(new Request(rootUrl.toString(), request));
  }

  // 2. Public SPA pages: serve root index.html
  if (
    url.pathname === "/" ||
    url.pathname === "/public" ||
    url.pathname === "/novel" ||
    url.pathname === "/vn" ||
    url.pathname === "/docs"
  ) {
    const rootUrl = new URL("/", request.url);
    return next(new Request(rootUrl.toString(), request));
  }

  // 3. Public API endpoints & static assets
  const publicPaths = [
    "/api/auth",
    "/api/config",
    "/api/public-settings",
    "/api/telegram",
    "/api/discord",
    "/api/proxy",
    "/api/characters",
    "/api/attires",
    "/v1",
    "/aspectratio.jpg",
    "/workflows",
    "/assets",
    "/favicon.ico",
  ];
  if (publicPaths.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) {
    return next();
  }

  // 4. Protected API endpoints (require auth session cookie)
  if (env.SITE_PASSWORD?.trim()) {
    const token = readSessionCookie(request);
    const authed = await verifySessionToken(env, token);
    if (!authed) {
      if (url.pathname.startsWith("/api/")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const loginUrl = new URL("/api/auth", url.origin);
      loginUrl.searchParams.set("next", url.pathname);
      return Response.redirect(loginUrl.toString(), 302);
    }
  }

  return next();
};
