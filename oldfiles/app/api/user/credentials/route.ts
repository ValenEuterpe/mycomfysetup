import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { isSupabaseConfigured, supabasePatch, supabaseSelect } from "@/lib/supabase";

export const runtime = "nodejs";

type UserCredentialRow = {
  id: string;
  username: string | null;
  login_username: string | null;
  password_hash: string | null;
};

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const rows = await supabaseSelect<UserCredentialRow[]>(
      `aieditor_users?select=id,username,login_username,password_hash&id=eq.${encodeURIComponent(user.id)}&limit=1`,
    );
    const row = rows?.[0];

    return NextResponse.json({
      ok: true,
      hasCredentials: Boolean(row?.password_hash),
      loginUsername: row?.login_username ?? null,
      displayName: user.username,
    });
  } catch (err: any) {
    console.error("[user/credentials] GET error:", err);
    return NextResponse.json({ error: "Failed to load credentials status." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const rawLoginUsername = typeof body?.loginUsername === "string" ? body.loginUsername.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!rawLoginUsername || !USERNAME_REGEX.test(rawLoginUsername)) {
    return NextResponse.json(
      { error: "Username must be 3 to 32 characters long and contain only letters, numbers, hyphens, and underscores." },
      { status: 400 },
    );
  }

  if (!password || password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters long." },
      { status: 400 },
    );
  }

  if (password.length > 128) {
    return NextResponse.json(
      { error: "Password is too long (maximum 128 characters)." },
      { status: 400 },
    );
  }

  try {
    // Check if another user already has this login_username
    const existing = await supabaseSelect<UserCredentialRow[]>(
      `aieditor_users?select=id,login_username&login_username=ilike.${encodeURIComponent(rawLoginUsername)}&id=neq.${encodeURIComponent(user.id)}&limit=1`,
    );

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "That username is already taken. Please choose another." },
        { status: 409 },
      );
    }

    const hashedPassword = await hashPassword(password);

    await supabasePatch(
      `aieditor_users?id=eq.${encodeURIComponent(user.id)}`,
      {
        login_username: rawLoginUsername,
        password_hash: hashedPassword,
      },
    );

    return NextResponse.json({
      ok: true,
      message: "Credentials saved successfully.",
      loginUsername: rawLoginUsername,
    });
  } catch (err: any) {
    console.error("[user/credentials] POST error:", err);
    return NextResponse.json({ error: "Failed to save credentials." }, { status: 500 });
  }
}
