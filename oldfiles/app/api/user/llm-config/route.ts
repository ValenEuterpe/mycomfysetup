import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getUserLlmConfig } from "@/lib/llm";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const config = await getUserLlmConfig(user.id);
    return NextResponse.json({
      ok: true,
      baseUrl: config.baseUrl,
      model: config.model,
      hasApiKey: Boolean(config.apiKey),
      isConfigured: config.configured,
    });
  } catch (err: any) {
    console.error("[api/user/llm-config] GET error:", err);
    return NextResponse.json({ error: "Failed to load LLM configuration." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // LLM credentials and endpoint configurations are stored client-side in browser cache (localStorage)
  // to guarantee zero database storage of external AI API keys.
  return NextResponse.json({
    ok: true,
    message: "LLM configuration is stored client-side in browser cache.",
  });
}
