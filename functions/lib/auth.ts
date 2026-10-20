export const AUTH_COOKIE = "studio_auth";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function getAuthSecret(env: { SITE_PASSWORD?: string; AUTH_SECRET?: string }): Promise<string> {
  return env.AUTH_SECRET?.trim() || env.SITE_PASSWORD?.trim() || "";
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Creates a signed session token: "<expiryMs>.<hmac>"
 */
export async function createSessionToken(env: { SITE_PASSWORD?: string; AUTH_SECRET?: string }): Promise<string> {
  const secret = await getAuthSecret(env);
  const expiry = Date.now() + SESSION_TTL_MS;
  const sig = await hmacSign(secret, `auth:${expiry}`);
  return `${expiry}.${sig}`;
}

/**
 * Verifies a session token against the configured secret.
 */
export async function verifySessionToken(
  env: { SITE_PASSWORD?: string; AUTH_SECRET?: string },
  token: string | undefined
): Promise<boolean> {
  if (!token || !token.includes(".")) return false;
  const secret = await getAuthSecret(env);
  if (!secret) return false;

  const [expiryStr, sig] = token.split(".");
  const expiry = parseInt(expiryStr, 10);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;

  const expected = await hmacSign(secret, `auth:${expiry}`);
  // Constant-ish time comparison
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Extracts the session token from a request's Cookie header.
 */
export function readSessionCookie(request: Request): string | undefined {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return undefined;
  const cookies = cookieHeader.split(/;\s*/);
  for (const c of cookies) {
    const eq = c.indexOf("=");
    if (eq === -1) continue;
    if (c.slice(0, eq).trim() === AUTH_COOKIE) {
      return decodeURIComponent(c.slice(eq + 1).trim());
    }
  }
  return undefined;
}

export function buildSessionCookie(token: string): string {
  return `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

/**
 * Constant-time string comparison for password checking.
 */
export async function safePasswordMatch(supplied: string, expected: string): Promise<boolean> {
  const a = await hmacSign("cmp", supplied);
  const b = await hmacSign("cmp", expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
