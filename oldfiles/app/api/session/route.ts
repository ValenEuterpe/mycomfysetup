import { NextRequest, NextResponse } from "next/server";
import {
  API_KEY_COOKIE,
  API_KEY_COOKIE_MAX_AGE,
  authFailureMessage,
  authenticate,
  hasProfile,
  isKeyAuthActive,
  verifyApiKey,
  type AuthResult,
} from "@/lib/auth";
import { capabilitiesFor } from "@/lib/permissions";
import { clientIp, quotaFor, videoQuotaFor, imageQuotaFor, touchProfile, type Quota, type ProfileRow } from "@/lib/quota";
import { pumpQueue } from "@/lib/renderQueue";
import { getInvite, redeemInvite } from "@/lib/invites";
import { verifyPassword } from "@/lib/password";
import { isSupabaseConfigured, supabaseSelect } from "@/lib/supabase";

export const runtime = "nodejs";

function statusFor(result: Extract<AuthResult, { ok: false }>): number {
  switch (result.reason) {
    case "disabled":
      return 403;
    case "unavailable":
      return 503;
    case "unconfigured":
      return 500;
    default:
      return 401;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

/**
 * Sign in or validate current session.
 * Supports:
 * 1. Stored session cookie / token
 * 2. API Key or user id
 * 3. Direct invite code redemption (`{ inviteCode, username }`)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const submitted = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    const inviteCode = typeof body?.inviteCode === "string" ? body.inviteCode.trim().toUpperCase() : "";

    const loginUser = typeof body?.loginUsername === "string"
      ? body.loginUsername.trim()
      : typeof body?.username === "string" && !inviteCode
        ? body.username.trim()
        : "";
    const password = typeof body?.password === "string" ? body.password : "";

    // 1. Username & Password sign-in
    if (loginUser && password) {
      if (!isSupabaseConfigured()) {
        return NextResponse.json({ error: "Supabase is not configured on the server." }, { status: 500 });
      }

      const rows = await supabaseSelect<ProfileRow[]>(
        `aieditor_users?select=*&or=(login_username.ilike.${encodeURIComponent(loginUser)},username.ilike.${encodeURIComponent(loginUser)})&limit=1`,
      ).catch(() => null);

      const user = rows?.[0];
      if (!user) {
        return NextResponse.json({ error: "Invalid username or password.", reason: "invalid" }, { status: 401 });
      }

      if (user.is_active === false || user.admin_disabled === true) {
        return NextResponse.json(
          { error: "This account has been disabled. Contact an administrator.", reason: "disabled" },
          { status: 403 },
        );
      }

      if (!user.password_hash) {
        return NextResponse.json(
          {
            error: "No password has been set for this account yet. Please log in from your original browser and set a password in Settings.",
            reason: "invalid",
          },
          { status: 401 },
        );
      }

      const match = await verifyPassword(password, user.password_hash);
      if (!match) {
        return NextResponse.json({ error: "Invalid username or password.", reason: "invalid" }, { status: 401 });
      }

      try {
        await touchProfile(user.id, user.username ?? loginUser, clientIp(req.headers));
      } catch (err) {
        console.error("[session] touch profile failed:", err);
      }

      const res = NextResponse.json({
        id: user.id,
        username: user.username,
        canAccessAdvanced: user.can_access_advanced === true,
        canAccessFilmmaking: user.can_access_filmmaking === true,
        canAccessVideo: user.can_access_video !== false,
        canAccessImage: user.can_access_image !== false,
        canAdminister: false,
        quota: quotaFor(user),
        videoQuota: videoQuotaFor(user),
        imageQuota: imageQuotaFor(user),
        generations: user.generations,
        apiKey: user.id,
      });

      res.cookies.set(API_KEY_COOKIE, user.id, {
        ...cookieOptions(),
        maxAge: API_KEY_COOKIE_MAX_AGE,
      });

      try {
        await pumpQueue();
      } catch (err) {
        console.error("[session] queue pump failed:", err);
      }

      return res;
    }

    // 2. If submitting an invite code to redeem
    if (inviteCode) {
      const rawUsername = typeof body?.username === "string" ? body.username.trim() : "";
      const redeem = await redeemInvite(inviteCode, rawUsername, clientIp(req.headers));
      if (!redeem.ok) {
        return NextResponse.json({ error: redeem.error, reason: "invalid" }, { status: 400 });
      }

      const user = redeem.user;
      const res = NextResponse.json({
        id: user.id,
        username: user.username,
        canAccessAdvanced: user.can_access_advanced,
        canAccessFilmmaking: user.can_access_filmmaking,
        canAccessVideo: user.can_access_video !== false,
        canAccessImage: user.can_access_image !== false,
        canAdminister: false,
        quota: { used: 0, limit: user.daily_generation_limit },
        videoQuota: { used: 0, limit: user.daily_video_limit ?? 10 },
        imageQuota: { used: 0, limit: user.daily_image_limit ?? 20 },
        generations: 0,
        apiKey: user.id,
      });

      res.cookies.set(API_KEY_COOKIE, user.id, {
        ...cookieOptions(),
        maxAge: API_KEY_COOKIE_MAX_AGE,
      });

      try {
        await pumpQueue();
      } catch (err) {
        console.error("[session] queue pump failed:", err);
      }

      return res;
    }

    let result: AuthResult = submitted ? await verifyApiKey(submitted) : await authenticate(req);

    // If apiKey failed verification, check if user actually typed an unused invite code into the key field
    if (!result.ok && submitted.length >= 4) {
      const invite = await getInvite(submitted);
      if (invite && !invite.is_used) {
        return NextResponse.json(
          {
            error: "This is an unredeemed invite code. Please enter your name to activate it.",
            isInviteCode: true,
            inviteCode: invite.code,
          },
          { status: 400 },
        );
      }
    }

    if (!result.ok) {
      const res = NextResponse.json(
        { error: authFailureMessage(result.reason), reason: result.reason },
        { status: statusFor(result) },
      );
      res.cookies.set(API_KEY_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
      return res;
    }

    const capabilities = capabilitiesFor(result.user);

    let quota: Quota | null = result.user.quota;
    let videoQuota: Quota | null = result.user.video_quota ?? null;
    let imageQuota: Quota | null = result.user.image_quota ?? null;
    let generations: number | null = null;
    if (hasProfile(result.user)) {
      const profile = await touchProfile(result.user.id, result.user.username, clientIp(req.headers));
      quota = result.user.is_owner ? null : profile ? quotaFor(profile) : null;
      videoQuota = result.user.is_owner ? null : profile ? videoQuotaFor(profile) : null;
      imageQuota = result.user.is_owner ? null : profile ? imageQuotaFor(profile) : null;
      generations = profile ? profile.generations : null;
    }

    const res = NextResponse.json({
      id: result.user.id,
      username: result.user.username,
      ...capabilities,
      quota,
      videoQuota,
      imageQuota,
      generations,
      apiKey: submitted || undefined,
    });

    if (submitted) {
      res.cookies.set(API_KEY_COOKIE, submitted, { ...cookieOptions(), maxAge: API_KEY_COOKIE_MAX_AGE });
    }

    try {
      await pumpQueue();
    } catch (err) {
      console.error("[session] queue pump failed:", err);
    }

    return res;
  } catch (err: any) {
    console.error("[session] Unhandled error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error occurred", reason: "error" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(API_KEY_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return res;
}
