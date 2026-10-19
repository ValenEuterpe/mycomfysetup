import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { characterChatTurn, resolveLlmConfig } from "@/lib/llm";

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

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const currentDescription = typeof body?.currentDescription === "string" ? body.currentDescription.trim() : "";
  const modelOverride = typeof body?.model === "string" ? body.model.trim() : "";

  if (messages.length === 0) {
    return NextResponse.json({ error: "Missing conversation messages." }, { status: 400 });
  }

  try {
    const result = await characterChatTurn({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: modelOverride || config.model,
      messages,
      currentDescription,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err: any) {
    console.error("[api/llm/character-chat] error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate character refinement." }, { status: 500 });
  }
}
