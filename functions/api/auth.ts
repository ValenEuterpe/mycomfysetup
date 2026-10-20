import { Env } from "../lib/comfy";
import {
  createSessionToken,
  buildSessionCookie,
  safePasswordMatch,
  verifySessionToken,
  readSessionCookie,
} from "../lib/auth";

const LOGIN_PAGE_HTML = (error?: boolean, nextPath?: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in — ComfyUI Universal Studio</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: #09090b; color: #fafafa; font-family: ui-sans-serif, system-ui, sans-serif;
    }
    .card {
      width: 100%; max-width: 380px; margin: 20px; padding: 36px 32px;
      background: #111113; border: 1px solid #27272a; border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,.5);
    }
    h1 { font-size: 18px; font-weight: 700; margin-bottom: 6px; }
    p.sub { font-size: 13px; color: #a1a1aa; margin-bottom: 24px; }
    form { display: flex; flex-direction: column; gap: 12px; }
    input {
      padding: 12px 14px; border-radius: 12px; border: 1px solid #3f3f46;
      background: #18181b; color: #fafafa; font-size: 14px; outline: none;
    }
    input:focus { border-color: #6366f1; }
    button {
      padding: 12px 14px; border: none; border-radius: 12px; cursor: pointer;
      background: linear-gradient(90deg,#4f46e5,#9333ea); color: white;
      font-weight: 700; font-size: 14px; transition: opacity .15s;
    }
    button:hover { opacity: .9; }
    .error { padding: 10px 12px; border-radius: 10px; background: #450a0a; color: #fecaca; font-size: 13px; }
    .hint { margin-top: 20px; font-size: 11px; color: #52525b; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <h1>ComfyUI Universal Studio</h1>
    <p class="sub">Enter the access password to continue.</p>
    ${error ? '<div class="error">Incorrect password. Please try again.</div>' : ""}
    <form method="POST" action="/api/auth${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}">
      <input type="password" name="password" placeholder="Password" autocomplete="current-password" required autofocus />
      <button type="submit">Sign in</button>
    </form>
    <div class="hint">Password is set via the SITE_PASSWORD secret.</div>
  </div>
</body>
</html>`;

export const onRequest = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === "GET") {
    const nextPath = url.searchParams.get("next") || "";

    // Already signed in? bounce to the target page.
    const authed = await verifySessionToken(env, readSessionCookie(request));
    if (authed) {
      return Response.redirect(url.origin + (nextPath.startsWith("/") ? nextPath : "/"), 302);
    }

    return new Response(
      LOGIN_PAGE_HTML(Boolean(url.searchParams.get("error")), nextPath || undefined),
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }

  if (request.method === "POST") {
    const contentType = request.headers.get("Content-Type") || "";
    let password = "";
    let nextPath = url.searchParams.get("next") || "";

    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      password = String(body?.password || "");
      if (!nextPath) nextPath = String(body?.next || "");
    } else {
      const form = await request.formData();
      password = String(form.get("password") || "");
      if (!nextPath) nextPath = String(form.get("next") || "");
    }

    const expected = env.SITE_PASSWORD?.trim() || "";
    if (!expected) {
      return new Response(JSON.stringify({ error: "SITE_PASSWORD not configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (await safePasswordMatch(password, expected)) {
      const token = await createSessionToken(env);
      return new Response(null, {
        status: 302,
        headers: {
          "Set-Cookie": buildSessionCookie(token),
          Location: nextPath.startsWith("/") ? nextPath : "/",
        },
      });
    }

    return Response.redirect(`${url.origin}/api/auth?error=1`, 302);
  }

  return new Response("Method not allowed", { status: 405 });
};
