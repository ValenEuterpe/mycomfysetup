import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { createInvite, createInvitesBatch, listInvites, revokeInvite } from "@/lib/invites";

export const runtime = "nodejs";

const forbidden = () => NextResponse.json({ error: "Owner access required." }, { status: 403 });

export async function GET(req: NextRequest) {
  if (!(await requireOwner(req))) return forbidden();

  try {
    const invites = await listInvites();
    return NextResponse.json({ invites });
  } catch (err: any) {
    console.error("[admin/invites] list failed:", err);
    return NextResponse.json({ error: "Failed to list invites." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireOwner(req))) return forbidden();

  try {
    const body = await req.json().catch(() => ({}));
    const rawPrefix = typeof body?.prefix === "string" ? body.prefix.trim() : "";
    const prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, "");

    if (!prefix) {
      return NextResponse.json({ error: "A valid prefix (e.g. 'rum' or 'val') is required." }, { status: 400 });
    }

    const count = Math.min(100, Math.max(1, Number(body?.count) || 1));
    const invites = await createInvitesBatch({
      prefix,
      count,
    });

    return NextResponse.json({ ok: true, count: invites.length, invites });
  } catch (err: any) {
    console.error("[admin/invites] create failed:", err);
    return NextResponse.json({ error: err?.message || "Failed to create invites." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await requireOwner(req))) return forbidden();

  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    if (!code) {
      return NextResponse.json({ error: "Code parameter is required." }, { status: 400 });
    }

    const ok = await revokeInvite(code);
    return NextResponse.json({ ok });
  } catch (err: any) {
    console.error("[admin/invites] delete failed:", err);
    return NextResponse.json({ error: "Failed to delete invite." }, { status: 500 });
  }
}
