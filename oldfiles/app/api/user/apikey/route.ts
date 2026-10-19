import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured, supabasePatch, supabaseSelect } from "@/lib/supabase";

export const runtime = "nodejs";

function generateSecureKey(): string {
  return "sk-live-" + randomBytes(16).toString("hex");
}

type UserKeyRow = {
  id: string;
  api_key: string | null;
};

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // If studio owner
  if (user.is_owner) {
    return NextResponse.json({
      ok: true,
      apiKey: process.env.OWNER_API_KEY || user.id,
      isOwner: true,
    });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const rows = await supabaseSelect<UserKeyRow[]>(
      `aieditor_users?select=id,api_key&id=eq.${encodeURIComponent(user.id)}&limit=1`,
    );
    const row = rows?.[0];

    let currentKey = row?.api_key;
    if (!currentKey) {
      // Lazy generation on first view
      currentKey = generateSecureKey();
      await supabasePatch(
        `aieditor_users?id=eq.${encodeURIComponent(user.id)}`,
        { api_key: currentKey },
      );
    }

    return NextResponse.json({
      ok: true,
      apiKey: currentKey,
      isOwner: false,
    });
  } catch (err: any) {
    console.error("[user/apikey] GET error:", err);
    return NextResponse.json({ error: "Failed to retrieve API key." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (user.is_owner) {
    return NextResponse.json(
      { error: "The Owner master key is managed via environment variables and cannot be rotated in the studio." },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const newKey = generateSecureKey();
    await supabasePatch(
      `aieditor_users?id=eq.${encodeURIComponent(user.id)}`,
      { api_key: newKey },
    );

    return NextResponse.json({
      ok: true,
      apiKey: newKey,
      isOwner: false,
    });
  } catch (err: any) {
    console.error("[user/apikey] POST (rotate) error:", err);
    return NextResponse.json({ error: "Failed to rotate API key." }, { status: 500 });
  }
}
