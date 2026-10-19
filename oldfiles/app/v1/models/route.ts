import { NextResponse } from "next/server";

import { CORS_HEADERS, WORKFLOW_MODELS } from "@/lib/openaiModels";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  return NextResponse.json(
    { object: "list", data: WORKFLOW_MODELS },
    { headers: CORS_HEADERS },
  );
}
