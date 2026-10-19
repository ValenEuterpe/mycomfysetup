import { NextRequest, NextResponse } from "next/server";
import { getInvite, redeemInvite } from "@/lib/invites";
import { clientIp } from "@/lib/quota";
import { API_KEY_COOKIE, API_KEY_COOKIE_MAX_AGE } from "@/lib/auth";

export const runtime = "nodejs";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

/**
 * GET /api/invite?code=KEMO-XXXX-YYYY
 * Check if an invite code is valid and unused.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code")?.trim().toUpperCase();

  if (!code) {
    return NextResponse.json({ error: "Invite code is required." }, { status: 400 });
  }

  const invite = await getInvite(code);
  if (!invite) {
    return NextResponse.json({ valid: false, error: "Invite code not found." }, { status: 404 });
  }

  if (invite.is_used) {
    return NextResponse.json({ valid: false, error: "This invite code has already been used." }, { status: 409 });
  }

  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ valid: false, error: "This invite code has expired." }, { status: 410 });
  }

  return NextResponse.json({
    valid: true,
    code: invite.code,
    prefix: invite.prefix,
    note: invite.note,
    daily_limit: invite.daily_limit,
    can_access_advanced: invite.can_access_advanced,
    can_access_filmmaking: invite.can_access_filmmaking,
  });
}

/**
 * POST /api/invite
 * Redeem an invite code, create the user profile, and issue session cookie.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "";

  if (!code) {
    return NextResponse.json({ error: "Invite code is required." }, { status: 400 });
  }

  const ip = clientIp(req.headers);
  const result = await redeemInvite(code, username, ip);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const user = result.user;
  const res = NextResponse.json({
    ok: true,
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
  });

  // Set the user id as the session cookie so requests are authenticated
  res.cookies.set(API_KEY_COOKIE, user.id, {
    ...cookieOptions(),
    maxAge: API_KEY_COOKIE_MAX_AGE,
  });

  return res;
}
