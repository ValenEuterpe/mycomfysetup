import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listCharacters, saveCharacter, type SaveCharacterInput } from "@/lib/characters";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const characters = await listCharacters(user.id);
    return NextResponse.json({
      ok: true,
      characters,
      count: characters.length,
    });
  } catch (err: any) {
    console.error("[api/characters] GET error:", err);
    return NextResponse.json({ error: "Failed to load characters." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const tag = typeof body.tag === "string" ? body.tag.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Character name is required." }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: "Character description is required." }, { status: 400 });
  }

  const input: SaveCharacterInput = {
    id: typeof body.id === "string" ? body.id : undefined,
    name,
    tag: tag || name,
    description,
    prompt: prompt || description,
    negativePrompt: typeof body.negativePrompt === "string" ? body.negativePrompt : undefined,
    imageUrl: imageUrl || null,
    imageFilename: typeof body.imageFilename === "string" ? body.imageFilename : undefined,
    workflowParams: typeof body.workflowParams === "object" && body.workflowParams !== null ? body.workflowParams : {},
    prefix: typeof body.prefix === "string" ? body.prefix : undefined,
    postfix: typeof body.postfix === "string" ? body.postfix : undefined,
  };

  try {
    const saved = await saveCharacter(user.id, input);
    return NextResponse.json({
      ok: true,
      character: saved,
      message: `Character '${saved.name}' saved successfully.`,
    });
  } catch (err: any) {
    console.error("[api/characters] POST error:", err);
    return NextResponse.json({ error: err.message || "Failed to save character." }, { status: 500 });
  }
}
