import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { isSupabaseConfigured, supabaseRpc } from "@/lib/supabase";
import { getAdminConfig } from "@/lib/adminConfig";

export const runtime = "nodejs";

type AdminUserRow = {
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
  priority_rank: number | null;
  last_login_at: string | null;
  created_at: string;
};

const forbidden = () => NextResponse.json({ error: "Owner access required." }, { status: 403 });

export async function GET(req: NextRequest) {
  if (!(await requireOwner(req))) return forbidden();
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase isn't configured on the server." }, { status: 500 });
  }

  const config = getAdminConfig();

  try {
    const rawUsers = (await supabaseRpc<AdminUserRow[]>("aieditor_users_with_priority", {})) ?? [];
    const users = config.showIpAddress
      ? rawUsers
      : rawUsers.map((u) => ({ ...u, ip: null }));

    return NextResponse.json({ users, config });
  } catch (err: any) {
    console.error("[admin] list failed:", err);
    return NextResponse.json(
      { error: "Couldn't load users. Has the database schema been executed?" },
      { status: 502 },
    );
  }
}
