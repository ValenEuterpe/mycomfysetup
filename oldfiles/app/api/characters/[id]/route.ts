import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteCharacter, getCharacter } from "@/lib/characters";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Character id required." }, { status: 400 });
  }

  const character = await getCharacter(id, user.id);
  if (!character) {
    return NextResponse.json({ error: "Character not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, character });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Character id required." }, { status: 400 });
  }

  const ok = await deleteCharacter(id, user.id);
  if (!ok) {
    return NextResponse.json({ error: "Failed to delete character." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Character deleted." });
}
