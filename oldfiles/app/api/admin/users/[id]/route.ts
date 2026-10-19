import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { utcDay } from "@/lib/quota";
import { isSupabaseConfigured, supabasePatch } from "@/lib/supabase";

export const runtime = "nodejs";

/** Editable booleans. Anything else in the body is ignored. */
const EDITABLE_FLAGS = [
  "can_access_advanced",
  "can_access_filmmaking",
  "can_access_video",
  "can_access_image",
  "is_active",
  "admin_disabled",
] as const;

const EDITABLE_COUNTS = {
  daily_generation_limit: { min: 0, max: 1000 },
  generations_today: { min: 0, max: 1000 },
  daily_video_limit: { min: 0, max: 1000 },
  daily_image_limit: { min: 0, max: 1000 },
  video_generations_today: { min: 0, max: 1000 },
  image_generations_today: { min: 0, max: 1000 },
} as const;

const ALL_FIELDS = [...EDITABLE_FLAGS, ...Object.keys(EDITABLE_COUNTS)];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireOwner(req))) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase isn't configured on the server." }, { status: 500 });
  }

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const patch: Record<string, boolean | number | string> = {};

  for (const field of EDITABLE_FLAGS) {
    if (typeof body?.[field] === "boolean") patch[field] = body[field];
  }

  for (const [field, range] of Object.entries(EDITABLE_COUNTS)) {
    const value = body?.[field];
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < range.min || value > range.max) {
      return NextResponse.json(
        { error: `${field} must be an integer between ${range.min} and ${range.max}.` },
        { status: 400 },
      );
    }
    patch[field] = value;
  }

  if ("generations_today" in patch || "video_generations_today" in patch || "image_generations_today" in patch) {
    patch.quota_date = utcDay();
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: `Nothing to update. Send one or more of: ${ALL_FIELDS.join(", ")}.` },
      { status: 400 },
    );
  }

  try {
    const rows = await supabasePatch<unknown[]>(
      `aieditor_users?id=eq.${encodeURIComponent(params.id)}&select=id`,
      patch,
    );
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "No such user." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, updated: patch });
  } catch (err: any) {
    console.error("[admin] update failed:", err);
    return NextResponse.json({ error: "Couldn't update the user." }, { status: 502 });
  }
}
