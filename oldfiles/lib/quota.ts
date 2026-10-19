/**
 * Daily render quota backed by Supabase PostgreSQL.
 *
 * The limit lives on `aieditor_users.daily_generation_limit`, usage in
 * `generations_today` + `quota_date`. Both counters are only ever moved by the
 * `aieditor_record_generation` Postgres function, preventing read-modify-write races.
 *
 * Server-side only — this module connects to Supabase with the service-role key.
 */

import type { AuthedUser } from "@/lib/auth";
import { isSupabaseConfigured, supabaseRpc } from "@/lib/supabase";

export type ProfileRow = {
  id: string;
  username: string | null;
  ip: string | null;
  generations: number;
  generations_today: number;
  quota_date: string;
  daily_generation_limit: number;
  is_active: boolean;
  admin_disabled: boolean;
  can_access_advanced: boolean;
  can_access_filmmaking: boolean;
  can_access_video?: boolean;
  can_access_image?: boolean;
  daily_video_limit?: number;
  daily_image_limit?: number;
  video_generations_today?: number;
  image_generations_today?: number;
  login_username?: string | null;
  password_hash?: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Quota = { used: number; limit: number };

/** Today as `YYYY-MM-DD` in UTC, matching SQL functions' reset boundary. */
export function utcDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Usage so far today.
 */
export function usedToday(row: Pick<ProfileRow, "generations_today" | "quota_date">): number {
  return row.quota_date === utcDay() ? row.generations_today : 0;
}

export function usedVideoToday(row: Pick<ProfileRow, "video_generations_today" | "quota_date">): number {
  return row.quota_date === utcDay() ? (row.video_generations_today ?? 0) : 0;
}

export function usedImageToday(row: Pick<ProfileRow, "image_generations_today" | "quota_date">): number {
  return row.quota_date === utcDay() ? (row.image_generations_today ?? 0) : 0;
}

export type QuotaColumns = Pick<
  ProfileRow,
  "generations_today" | "quota_date" | "daily_generation_limit"
>;

export function quotaFor(row: QuotaColumns): Quota {
  return { used: usedToday(row), limit: row.daily_generation_limit };
}

export function videoQuotaFor(
  row: Pick<ProfileRow, "video_generations_today" | "quota_date" | "daily_video_limit">,
): Quota {
  return { used: usedVideoToday(row), limit: row.daily_video_limit ?? 10 };
}

export function imageQuotaFor(
  row: Pick<ProfileRow, "image_generations_today" | "quota_date" | "daily_image_limit">,
): Quota {
  return { used: usedImageToday(row), limit: row.daily_image_limit ?? 20 };
}

/** `quota === null` means unlimited / exempt (owner or demo mode). */
export function quotaExceeded(user: AuthedUser): boolean {
  return user.quota !== null && user.quota.used >= user.quota.limit;
}

export function videoQuotaExceeded(user: AuthedUser): boolean {
  if (user.is_owner) return false;
  if (user.can_access_video === false) return true;
  if (!user.video_quota) return quotaExceeded(user);
  return user.video_quota.used >= user.video_quota.limit;
}

export function imageQuotaExceeded(user: AuthedUser): boolean {
  if (user.is_owner) return false;
  if (user.can_access_image === false) return true;
  if (!user.image_quota) return quotaExceeded(user);
  return user.image_quota.used >= user.image_quota.limit;
}

/**
 * Create or refresh user profile.
 */
export async function touchProfile(
  id: string,
  username: string | null,
  ip: string | null,
): Promise<ProfileRow | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const rows = await supabaseRpc<ProfileRow[]>("aieditor_touch_profile", {
      p_id: id,
      p_username: username,
      p_ip: ip,
    });
    return rows?.[0] ?? null;
  } catch (err) {
    console.error("[quota] aieditor_touch_profile failed (has 002 been run?):", err);
    return null;
  }
}

/**
 * Atomic charge of 1 generation at enqueue, with optional media type tracking.
 */
export async function recordGeneration(id: string, type: string = "video"): Promise<ProfileRow | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const rows = await supabaseRpc<ProfileRow[]>("aieditor_record_media_generation", {
      p_id: id,
      p_type: type,
    }).catch(async () => {
      return await supabaseRpc<ProfileRow[]>("aieditor_record_generation", { p_id: id });
    });
    return rows?.[0] ?? null;
  } catch (err) {
    console.error("[quota] aieditor_record_generation failed:", err);
    return null;
  }
}

/**
 * Refund a generation on failure, with optional media type tracking.
 */
export async function refundGeneration(id: string, type: string = "video"): Promise<ProfileRow | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const rows = await supabaseRpc<ProfileRow[]>("aieditor_refund_media_generation", {
      p_id: id,
      p_type: type,
    }).catch(async () => {
      return await supabaseRpc<ProfileRow[]>("aieditor_refund_generation", { p_id: id });
    });
    return rows?.[0] ?? null;
  } catch (err) {
    console.error("[quota] aieditor_refund_generation failed:", err);
    return null;
  }
}

/** Real client IP from proxy headers (Vercel, Cloudflare, standard reverse proxy). */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || null;
}
