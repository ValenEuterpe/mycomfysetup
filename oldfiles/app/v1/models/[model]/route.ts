import { NextRequest, NextResponse } from "next/server";
import { CORS_HEADERS, WORKFLOW_MODELS } from "@/lib/openaiModels";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { model: string } },
) {
  const modelParam = (params.model || "").trim();
  const lower = modelParam.toLowerCase();

  const found = WORKFLOW_MODELS.find(
    (m) =>
      m.id.toLowerCase() === lower ||
      (lower === "anima" && m.id.startsWith("anima")) ||
      (lower === "basb" && m.id.startsWith("BAS")),
  );

  if (!found) {
    return NextResponse.json(
      {
        error: {
          message: `The model '${modelParam}' does not exist. Available models: ${WORKFLOW_MODELS.map((m) => m.id).join(", ")}`,
          type: "invalid_request_error",
          param: "model",
          code: "model_not_found",
        },
      },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(found, { headers: CORS_HEADERS });
}
