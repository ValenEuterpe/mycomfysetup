import { NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseSelect } from "@/lib/supabase";
import { quotaFor, videoQuotaFor, imageQuotaFor, type Quota, type ProfileRow } from "@/lib/quota";

function cleanKey(val: string | undefined): string {
  if (!val) return "";
  let s = val.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export const OWNER_API_KEY = cleanKey(process.env.OWNER_API_KEY);

/** Header the browser sends the key in. */
export const API_KEY_HEADER = "x-api-key";

/**
 * HttpOnly cookie holding the same key/token. Needed because `<video src="/api/video">`
 * is a plain browser request — it can't carry a custom header.
 */
export const API_KEY_COOKIE = "studio_key";

export const API_KEY_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const OWNER_SENTINEL_ID = "owner";
export const DEMO_SENTINEL_ID = "demo-user";
export const DEFAULT_DAILY_LIMIT = 10;

export type AuthedUser = {
  id: string;
  username: string | null;
  can_access_advanced: boolean;
  can_access_filmmaking: boolean;
  can_access_video: boolean;
  can_access_image: boolean;
  is_owner: boolean;
  quota: Quota | null;
  video_quota?: Quota | null;
  image_quota?: Quota | null;
};

export type AuthFailure =
  | "missing"
  | "invalid"
  | "disabled"
  | "unconfigured"
  | "unavailable";

export type AuthResult = { ok: true; user: AuthedUser } | { ok: false; reason: AuthFailure };

export function isKeyAuthActive(): boolean {
  return isSupabaseConfigured() || Boolean(OWNER_API_KEY);
}

/**
 * Pull the API key / user token off a request:
 * 1. `X-Api-Key` header
 * 2. `Authorization: Bearer <key>`
 * 3. `studio_key` HttpOnly cookie
 */
export function readApiKey(req: NextRequest): string | null {
  const header = req.headers.get(API_KEY_HEADER)?.trim();
  if (header) return header;

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }

  const query = req.nextUrl.searchParams.get("api_key") || req.nextUrl.searchParams.get("key") || req.nextUrl.searchParams.get("token");
  if (query?.trim()) return query.trim();

  return req.cookies.get(API_KEY_COOKIE)?.value?.trim() || null;
}

function looksLikeKey(apiKey: string): boolean {
  return apiKey.length >= 4 && apiKey.length <= 200 && !/[\s\p{Cc}]/u.test(apiKey);
}

function ownerSentinel(): AuthedUser {
  return {
    id: OWNER_SENTINEL_ID,
    username: "Owner",
    can_access_advanced: true,
    can_access_filmmaking: true,
    can_access_video: true,
    can_access_image: true,
    is_owner: true,
    quota: null,
    video_quota: null,
    image_quota: null,
  };
}

export function hasProfile(user: AuthedUser): boolean {
  return isKeyAuthActive() && user.id !== OWNER_SENTINEL_ID && user.id !== DEMO_SENTINEL_ID;
}

type AppUserRow = {
  id: string;
  discord_username: string | null;
  api_key: string;
  is_active: boolean | null;
  admin_disabled: boolean | null;
};

/**
 * Verify a key or session token against Supabase.
 */
export async function verifyApiKey(apiKey: string): Promise<AuthResult> {
  const clean = cleanKey(apiKey);
  if (!clean) return { ok: false, reason: "invalid" };

  const isOwner = Boolean(OWNER_API_KEY) && clean === OWNER_API_KEY;
  if (isOwner) {
    return { ok: true, user: ownerSentinel() };
  }

  if (!looksLikeKey(clean)) return { ok: false, reason: "invalid" };

  if (!isSupabaseConfigured()) {
    return { ok: false, reason: "unconfigured" };
  }

  try {
    // 1. First check if it matches an aieditor_users profile by id (e.g. invite redeemers or direct users)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
    if (isUuid) {
      const userRows = await supabaseSelect<ProfileRow[]>(
        `aieditor_users?select=*&id=eq.${encodeURIComponent(clean)}&limit=1`,
      ).catch(() => null);

      const user = userRows?.[0];
      if (user) {
        if (user.is_active === false || user.admin_disabled === true) {
          return { ok: false, reason: "disabled" };
        }

        return {
          ok: true,
          user: {
            id: user.id,
            username: user.username,
            can_access_advanced: user.can_access_advanced === true,
            can_access_filmmaking: user.can_access_filmmaking === true,
            can_access_video: user.can_access_video !== false,
            can_access_image: user.can_access_image !== false,
            is_owner: false,
            quota: quotaFor(user),
            video_quota: videoQuotaFor(user),
            image_quota: imageQuotaFor(user),
          },
        };
      }
    }

    // 1b. Check if it matches an aieditor_users profile by dedicated api_key
    const keyUserRows = await supabaseSelect<ProfileRow[]>(
      `aieditor_users?select=*&api_key=eq.${encodeURIComponent(clean)}&limit=1`,
    ).catch(() => null);

    const keyUser = keyUserRows?.[0];
    if (keyUser) {
      if (keyUser.is_active === false || keyUser.admin_disabled === true) {
        return { ok: false, reason: "disabled" };
      }

      return {
        ok: true,
        user: {
          id: keyUser.id,
          username: keyUser.username,
          can_access_advanced: keyUser.can_access_advanced === true,
          can_access_filmmaking: keyUser.can_access_filmmaking === true,
          can_access_video: keyUser.can_access_video !== false,
          can_access_image: keyUser.can_access_image !== false,
          is_owner: false,
          quota: quotaFor(keyUser),
          video_quota: videoQuotaFor(keyUser),
          image_quota: imageQuotaFor(keyUser),
        },
      };
    }

    // 2. Check app_users table (if integrating with external Discord bot)
    const appRows = await supabaseSelect<AppUserRow[]>(
      `app_users?select=id,discord_username,api_key,is_active,admin_disabled&api_key=eq.${encodeURIComponent(clean)}&limit=1`,
    ).catch(() => null);

    const account = appRows?.[0];
    if (account) {
      if (account.is_active === false || account.admin_disabled === true) {
        return { ok: false, reason: "disabled" };
      }

      const profileRows = await supabaseSelect<ProfileRow[]>(
        `aieditor_users?select=*&id=eq.${encodeURIComponent(account.id)}&limit=1`,
      ).catch(() => null);

      const profile = profileRows?.[0];
      if (profile) {
        if (profile.is_active === false || profile.admin_disabled === true) {
          return { ok: false, reason: "disabled" };
        }
        return {
          ok: true,
          user: {
            id: account.id,
            username: account.discord_username ?? profile.username,
            can_access_advanced: profile.can_access_advanced === true,
            can_access_filmmaking: profile.can_access_filmmaking === true,
            can_access_video: profile.can_access_video !== false,
            can_access_image: profile.can_access_image !== false,
            is_owner: false,
            quota: quotaFor(profile),
            video_quota: videoQuotaFor(profile),
            image_quota: imageQuotaFor(profile),
          },
        };
      }

      return {
        ok: true,
        user: {
          id: account.id,
          username: account.discord_username,
          can_access_advanced: false,
          can_access_filmmaking: false,
          can_access_video: true,
          can_access_image: true,
          is_owner: false,
          quota: { used: 0, limit: DEFAULT_DAILY_LIMIT },
          video_quota: { used: 0, limit: DEFAULT_DAILY_LIMIT },
          image_quota: { used: 0, limit: 20 },
        },
      };
    }

    return { ok: false, reason: "invalid" };
  } catch (err) {
    console.error("[auth] Supabase user lookup failed:", err);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Authenticate request via key, session cookie, or demo mode.
 */
export async function authenticate(req: NextRequest): Promise<AuthResult> {
  if (isSupabaseConfigured() || Boolean(OWNER_API_KEY)) {
    const apiKey = readApiKey(req);
    if (!apiKey) return { ok: false, reason: "missing" };
    return verifyApiKey(apiKey);
  }

  if (process.env.AUTH_DEMO_MODE === "true") {
    console.warn("⚠️ AUTH_DEMO_MODE=true active. Never use this in production.");
    return {
      ok: true,
      user: {
        id: "demo-user",
        username: "demo",
        can_access_advanced: true,
        can_access_filmmaking: true,
        can_access_video: true,
        can_access_image: true,
        is_owner: false,
        quota: null,
        video_quota: null,
        image_quota: null,
      },
    };
  }

  return { ok: false, reason: "unconfigured" };
}

export async function requireUser(req: NextRequest): Promise<AuthedUser | null> {
  const result = await authenticate(req);
  return result.ok ? result.user : null;
}

export async function requireOwner(req: NextRequest): Promise<AuthedUser | null> {
  const user = await requireUser(req);
  return user?.is_owner ? user : null;
}

export function authFailureMessage(reason: AuthFailure): string {
  switch (reason) {
    case "missing":
      return "Enter your invite code or access key to continue.";
    case "invalid":
      return "That code or key is not recognized. Please check for typos.";
    case "disabled":
      return "This account has been disabled. Contact an administrator.";
    case "unavailable":
      return "Could not reach the database. Please try again in a moment.";
    case "unconfigured":
      return "Authentication is not yet configured on the server.";
  }
}
