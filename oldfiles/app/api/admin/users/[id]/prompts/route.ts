import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { listPrompts, prunePrompts } from "@/lib/promptLog";
import { isSupabaseConfigured } from "@/lib/supabase";
import { shouldShowPrompts } from "@/lib/adminConfig";

export const runtime = "nodejs";

const forbidden = () => NextResponse.json({ error: "Owner access required." }, { status: 403 });

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireOwner(req))) return forbidden();
  if (!shouldShowPrompts()) {
    return NextResponse.json(
      { error: "Prompt log viewing is disabled by server configuration.", prompts: [] },
      { status: 403 },
    );
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase isn't configured on the server." }, { status: 500 });
  }

  const userId = params.id.trim();
  if (!userId) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const prompts = await listPrompts(userId);
  if (prompts === null) {
    return NextResponse.json(
      { error: "Couldn't read the prompt log from database." },
      { status: 502 },
    );
  }
  return NextResponse.json({ prompts });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireOwner(req))) return forbidden();
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase isn't configured on the server." }, { status: 500 });
  }

  const userId = params.id.trim();
  if (!userId) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const pruned = await prunePrompts(userId);
  if (pruned === null) {
    return NextResponse.json({ error: "Couldn't prune the prompt log." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, pruned });
}
