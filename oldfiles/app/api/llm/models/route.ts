import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getUserLlmConfig, listEndpointModels } from "@/lib/llm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  let baseUrl = typeof body?.baseUrl === "string" ? body.baseUrl.trim() : "";
  let apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";

  // If no URL supplied, check user's saved config
  if (!baseUrl) {
    const saved = await getUserLlmConfig(user.id);
    baseUrl = saved.baseUrl;
    if (!apiKey) apiKey = saved.apiKey;
  }

  if (!baseUrl) {
    return NextResponse.json({ error: "Endpoint URL is required to list models." }, { status: 400 });
  }

  const result = await listEndpointModels(baseUrl, apiKey);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error || "Failed to reach endpoint." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    models: result.models,
    count: result.models.length,
  });
}
