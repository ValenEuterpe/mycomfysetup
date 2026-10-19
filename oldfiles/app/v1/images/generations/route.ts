import { NextRequest, NextResponse } from "next/server";
import { hasProfile, requireUser } from "@/lib/auth";
import { imageQuotaExceeded, recordGeneration } from "@/lib/quota";
import {
  directPromptId,
  dispatchDirect,
  enqueueRender,
  getRenderForUser,
  isDirectId,
  pumpQueue,
  queueEnabled,
  resolveDirect,
  resolveRender,
  videoUrlFor,
  type EnqueueInput,
  type WorkflowParams,
} from "@/lib/renderQueue";
import {
  SUPPORTED_SAMPLERS,
  SUPPORTED_SCHEDULERS,
} from "@/lib/workflows";
import { fetchComfyFile } from "@/lib/comfy";
import { ImageAspectRatio, IMAGE_RATIOS } from "@/lib/aspect";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 60 seconds on Vercel for GPU generation

// OpenAI client calls wait synchronously for image generation completion
const POLL_INTERVAL_MS = 1500;
const MAX_WAIT_TIMEOUT_MS = 120_000; // 2 minutes

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function resolveSizeAndRatio(sizeInput?: unknown): {
  ratio: ImageAspectRatio;
  width: number;
  height: number;
} {
  const sizeStr = typeof sizeInput === "string" ? sizeInput.toLowerCase().trim() : "";

  if (sizeStr === "896x1152" || sizeStr === "3:4" || sizeStr === "portrait_standard") {
    return { ratio: "3:4 (Portrait)", ...IMAGE_RATIOS["3:4 (Portrait)"] };
  }
  if (sizeStr === "1152x896" || sizeStr === "4:3" || sizeStr === "landscape_standard") {
    return { ratio: "4:3 (Landscape)", ...IMAGE_RATIOS["4:3 (Landscape)"] };
  }
  if (sizeStr === "768x1344" || sizeStr === "1024x1792" || sizeStr === "9:16" || sizeStr === "portrait") {
    return { ratio: "9:16 (Portrait)", ...IMAGE_RATIOS["9:16 (Portrait)"] };
  }
  if (sizeStr === "1344x768" || sizeStr === "1792x1024" || sizeStr === "16:9" || sizeStr === "landscape") {
    return { ratio: "16:9 (Landscape)", ...IMAGE_RATIOS["16:9 (Landscape)"] };
  }

  // Default: 1:1 Square (1024x1024)
  return { ratio: "1:1 (Square)", ...IMAGE_RATIOS["1:1 (Square)"] };
}

export async function POST(req: NextRequest) {
  // 1. Authenticate user via Authorization: Bearer <key>, X-Api-Key, or cookie
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json(
      {
        error: {
          message: "Incorrect API key provided or missing authorization header.",
          type: "invalid_request_error",
          param: null,
          code: "invalid_api_key",
        },
      },
      { status: 401, headers: CORS_HEADERS },
    );
  }



  // 3. Verify image generation permissions
  if (!user.can_access_image && !user.is_owner) {
    return NextResponse.json(
      {
        error: {
          message: "Image generation is not enabled for this account.",
          type: "permission_denied",
          param: null,
          code: "image_access_disabled",
        },
      },
      { status: 403, headers: CORS_HEADERS },
    );
  }

  // 4. Check daily image generation quota
  if (imageQuotaExceeded(user)) {
    const q = user.image_quota || user.quota || { used: 0, limit: 20 };
    return NextResponse.json(
      {
        error: {
          message: `Daily image generation quota exceeded (${q.used}/${q.limit}). Quota resets at midnight UTC.`,
          type: "insufficient_quota",
          param: null,
          code: "daily_quota_exceeded",
        },
      },
      { status: 429, headers: CORS_HEADERS },
    );
  }

  // 5. Parse request body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: "Invalid JSON in request body.",
          type: "invalid_request_error",
          param: null,
          code: "bad_json",
        },
      },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json(
      {
        error: {
          message: "Missing required parameter: prompt.",
          type: "invalid_request_error",
          param: "prompt",
          code: "missing_required_parameter",
        },
      },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { ratio, width, height } = resolveSizeAndRatio(body.size);
  const responseFormat = body.response_format === "b64_json" ? "b64_json" : "url";

  // Model selection (default: "anima-base-v1.0", supports full name and shorthand aliases)
  const rawModel = typeof body.model === "string" ? body.model.trim() : "";
  let modelChoice: "anima" | "basb" = "anima";

  if (rawModel) {
    const lower = rawModel.toLowerCase();
    if (
      lower === "anima-base-v1.0" ||
      lower === "anima" ||
      lower === "anima-base" ||
      lower === "anima-base-v1.0.safetensors"
    ) {
      modelChoice = "anima";
    } else if (
      lower === "basbetteranimestyleplusanima_basev10" ||
      lower === "basb" ||
      lower === "betteranime" ||
      lower.includes("basbetteranime") ||
      lower === "basbetteranimestyleplusanima_basev10.safetensors"
    ) {
      modelChoice = "basb";
    } else {
      return NextResponse.json(
        {
          error: {
            message: `The model '${rawModel}' does not exist. Available models: anima-base-v1.0, BASBetterAnimeStylePlusAnima_baseV10`,
            type: "invalid_request_error",
            param: "model",
            code: "model_not_found",
          },
        },
        { status: 400, headers: CORS_HEADERS },
      );
    }
  }

  // Advanced sampling options (gated behind can_access_advanced)
  const canAdvanced = user.can_access_advanced || user.is_owner;
  let workflowParams: WorkflowParams | undefined = undefined;

  if (canAdvanced) {
    const p: WorkflowParams = { model: modelChoice };

    const parsedSeed = Number(body.seed);
    if (Number.isInteger(parsedSeed) && parsedSeed >= 0) {
      p.seed = parsedSeed;
    }
    const parsedSteps = Number(body.steps);
    if (Number.isInteger(parsedSteps)) {
      p.steps = Math.max(10, Math.min(60, parsedSteps));
    }
    const parsedCfg = Number(body.cfg);
    if (Number.isFinite(parsedCfg)) {
      p.cfg = Math.max(1, Math.min(20, parsedCfg));
    }
    const samplerCandidate = body.sampler_name || body.samplerName;
    if (typeof samplerCandidate === "string" && (SUPPORTED_SAMPLERS as readonly string[]).includes(samplerCandidate)) {
      p.samplerName = samplerCandidate;
    }
    if (typeof body.scheduler === "string" && (SUPPORTED_SCHEDULERS as readonly string[]).includes(body.scheduler)) {
      p.scheduler = body.scheduler;
    }
    const parsedDenoise = Number(body.denoise);
    if (Number.isFinite(parsedDenoise)) {
      p.denoise = Math.max(0.1, Math.min(1.0, parsedDenoise));
    }

    workflowParams = p;
  }

  const negativePrompt =
    typeof body.negative_prompt === "string"
      ? body.negative_prompt
      : typeof body.negativePrompt === "string"
        ? body.negativePrompt
        : undefined;

  const input: EnqueueInput = {
    userId: user.id,
    prompt,
    negativePrompt,
    type: "t2i",
    aspectRatio: ratio,
    width,
    height,
    durationSeconds: null,
    fast: true,
    workflowParams,
  };

  // Record quota deduction
  if (hasProfile(user)) {
    await recordGeneration(user.id, "t2i");
  }

  // 6. Dispatch and synchronous polling until done
  const startTime = Date.now();
  let relativeUrl: string | null = null;
  let outputFilename: string | null = null;
  let outputSubfolder = "";
  let outputType = "output";

  try {
    if (!queueEnabled()) {
      // Direct dispatch (no database)
      const promptId = await dispatchDirect(input);

      while (Date.now() - startTime < MAX_WAIT_TIMEOUT_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const resolved = await resolveDirect(promptId);

        if (resolved.status === "done" && resolved.videoUrl) {
          relativeUrl = resolved.videoUrl;
          break;
        }
        if (resolved.status === "error") {
          throw new Error(resolved.error || "Generation failed on ComfyUI server.");
        }
      }
    } else {
      // Enqueue in database render queue
      const row = await enqueueRender(input);
      await pumpQueue();

      while (Date.now() - startTime < MAX_WAIT_TIMEOUT_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

        const freshRow = await getRenderForUser(row.id, user.id);
        if (!freshRow) {
          throw new Error("Job unexpectedly disappeared from queue.");
        }

        const resolved = await resolveRender(freshRow);
        await pumpQueue();

        if (resolved.status === "done" && (resolved.video_filename || videoUrlFor(resolved))) {
          relativeUrl = videoUrlFor(resolved);
          outputFilename = resolved.video_filename;
          outputSubfolder = resolved.video_subfolder ?? "";
          outputType = resolved.video_type ?? "output";
          break;
        }
        if (resolved.status === "error" || resolved.status === "cancelled") {
          throw new Error(resolved.error || "Generation failed or was cancelled.");
        }
      }
    }
  } catch (err: any) {
    console.error("[/v1/images/generations] error:", err);
    return NextResponse.json(
      {
        error: {
          message: err.message || "Image generation failed.",
          type: "server_error",
          param: null,
          code: "generation_failed",
        },
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  if (!relativeUrl) {
    return NextResponse.json(
      {
        error: {
          message: "Image generation timed out waiting for GPU completion.",
          type: "server_error",
          param: null,
          code: "timeout",
        },
      },
      { status: 504, headers: CORS_HEADERS },
    );
  }

  // 7. Format OpenAI-compatible response
  const origin = req.nextUrl.origin;
  const absoluteUrl = `${origin}${relativeUrl}`;

  if (responseFormat === "b64_json") {
    try {
      // If we don't have filename directly, parse it from relativeUrl query params
      const parsedUrl = new URL(relativeUrl, origin);
      const fn = outputFilename || parsedUrl.searchParams.get("filename") || "";
      const sub = outputSubfolder || parsedUrl.searchParams.get("subfolder") || "";
      const ty = outputType || parsedUrl.searchParams.get("type") || "output";

      const comfyRes = await fetchComfyFile(fn, sub, ty);
      const arrayBuffer = await comfyRes.arrayBuffer();
      const b64 = Buffer.from(arrayBuffer).toString("base64");

      return NextResponse.json(
        {
          created: Math.floor(Date.now() / 1000),
          data: [{ b64_json: b64 }],
        },
        { headers: CORS_HEADERS },
      );
    } catch (err: any) {
      console.error("[/v1/images/generations] failed to encode base64:", err);
      // Fallback to URL if base64 conversion fails
    }
  }

  return NextResponse.json(
    {
      created: Math.floor(Date.now() / 1000),
      data: [{ url: absoluteUrl }],
    },
    { headers: CORS_HEADERS },
  );
}
