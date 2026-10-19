import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { resolveLlmConfig, sceneExpandTurn } from "@/lib/llm";
import { cleanTag, getCharacterByTag, listCharacters } from "@/lib/characters";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const clientLlm = body?.llmConfig || {
    baseUrl: body?.baseUrl,
    apiKey: body?.apiKey,
    model: body?.model,
  };

  const config = resolveLlmConfig(clientLlm);
  if (!config.configured) {
    return NextResponse.json(
      {
        error: "OpenAI-compatible endpoint is not configured. Please open Settings to set your URL and pick a model.",
        unconfigured: true,
      },
      { status: 400 },
    );
  }

  const sceneIntent = typeof body?.sceneIntent === "string" ? body.sceneIntent.trim() : "";
  if (!sceneIntent) {
    return NextResponse.json({ error: "Scene intent description is required." }, { status: 400 });
  }

  // Detect #hashtags in the scene intent
  const tagMatches = Array.from(sceneIntent.matchAll(/#([a-zA-Z0-9_-]+)/g)).map((m: any) => m[1] as string);
  const explicitTags: string[] = Array.isArray(body?.characterTags) ? body.characterTags : [];
  const uniqueTags = Array.from(new Set([...tagMatches, ...explicitTags])).map(cleanTag);

  // Look up characters from the database/storage
  const matchedCharacters: Array<{ tag: string; name: string; description: string }> = [];
  const allUserCharacters = await listCharacters(user.id);

  for (const tag of uniqueTags) {
    const found =
      allUserCharacters.find((c) => cleanTag(c.tag) === tag) ||
      (await getCharacterByTag(tag, user.id));

    if (found) {
      matchedCharacters.push({
        tag: found.tag,
        name: found.name,
        description: found.description,
      });
    }
  }

  try {
    const result = await sceneExpandTurn({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      sceneIntent,
      characters: matchedCharacters,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      charactersFound: matchedCharacters.map((c) => c.tag),
    });
  } catch (err: any) {
    console.error("[api/llm/scene-expand] error:", err);
    return NextResponse.json({ error: err.message || "Failed to expand scene prompt." }, { status: 500 });
  }
}
