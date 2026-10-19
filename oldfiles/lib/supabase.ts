/**
 * Minimal server-side Supabase REST helper.
 *
 * Talks to the PostgREST endpoint with native `fetch`.
 * Zero external client SDK bloat, instant cold starts, and full typing.
 *
 * SUPABASE_SECRET_KEY is the service-role key. It must never reach the browser
 * — only import this module from route handlers / server code.
 */

export type SupabaseConfig = {
  url: string;
  secretKey: string;
};

/** Returns the config, or null when the env vars aren't set. */
export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secretKey) return null;
  return { url, secretKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

/**
 * GET against the PostgREST API with service-role credentials.
 * `path` is everything after `/rest/v1/`, e.g. `aieditor_users?select=*&id=eq.x`.
 */
export async function supabaseSelect<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

/** INSERT one or more rows and return the result. */
export async function supabaseInsert<T>(
  path: string,
  row: Record<string, unknown> | Record<string, unknown>[],
): Promise<T> {
  return request<T>("POST", path, row);
}

/** PATCH rows matching the filter in `path` and return them. */
export async function supabasePatch<T>(path: string, patch: Record<string, unknown>): Promise<T> {
  return request<T>("PATCH", path, patch);
}

/** DELETE rows matching the filter in `path`. */
export async function supabaseDelete<T = void>(path: string): Promise<T> {
  return request<T>("DELETE", path);
}

/**
 * Call a Postgres stored procedure / function.
 * `fn` is the function name; `args` are its named parameters.
 */
export async function supabaseRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  return request<T>("POST", `rpc/${fn}`, args);
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY missing).");
  }

  const res = await fetch(`${config.url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: config.secretKey,
      Authorization: `Bearer ${config.secretKey}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      // Request representation for mutations so PostgREST returns the affected rows
      ...(method === "GET" || method === "DELETE" ? {} : { Prefer: "return=representation" }),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase ${method} failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  // Handle empty bodies (e.g. 204 No Content or void RPCs)
  const text = await res.text();
  if (!text) return null as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Supabase ${method} returned a non-JSON body: ${text.slice(0, 200)}`);
  }
}
