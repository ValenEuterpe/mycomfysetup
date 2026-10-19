import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { isSupabaseConfigured, supabaseRpc } from "@/lib/supabase";

export const runtime = "nodejs";

const forbidden = () => NextResponse.json({ error: "Owner access required." }, { status: 403 });

type MemberRow = {
  user_id: string;
  username: string | null;
  rank: number;
  note: string | null;
  added_at: string;
};

export async function GET(req: NextRequest) {
  if (!(await requireOwner(req))) return forbidden();
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase isn't configured on the server." }, { status: 500 });
  }

  try {
    const members = await supabaseRpc<MemberRow[]>("aieditor_priority_members", {});
    return NextResponse.json({ members: members ?? [] });
  } catch (err: any) {
    console.error("[admin] priority list failed:", err);
    return NextResponse.json(
      { error: "Couldn't load the priority list." },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireOwner(req))) return forbidden();
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase isn't configured on the server." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";
  const id = typeof body?.id === "string" ? body.id : "";
  const note = typeof body?.note === "string" ? body.note.slice(0, 200) : null;

  if (action === "normalize") {
    try {
      await supabaseRpc("aieditor_normalize_priority_ranks", {});
      return NextResponse.json({ ok: true });
    } catch (err: any) {
      console.error("[admin] rank normalise failed:", err);
      return NextResponse.json({ error: "Couldn't renumber the list." }, { status: 502 });
    }
  }

  if (!id) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  try {
    switch (action) {
      case "add":
        await supabaseRpc("aieditor_add_priority_member", { p_user_id: id, p_note: note });
        return NextResponse.json({ ok: true });

      case "remove":
        await supabaseRpc("aieditor_remove_priority_member", { p_user_id: id });
        return NextResponse.json({ ok: true });

      case "move": {
        if (body?.direction !== "up" && body?.direction !== "down") {
          return NextResponse.json({ error: "direction must be 'up' or 'down'." }, { status: 400 });
        }
        await supabaseRpc("aieditor_move_priority_member", {
          p_user_id: id,
          p_direction: body.direction,
        });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json(
          { error: "action must be one of: add, remove, move, normalize." },
          { status: 400 },
        );
    }
  } catch (err: any) {
    console.error(`[admin] priority ${action} failed:`, err);
    return NextResponse.json(
      { error: `Couldn't ${action} user priority.` },
      { status: 502 },
    );
  }
}
