import { NextRequest, NextResponse } from "next/server";
import { hasProfile, requireUser } from "@/lib/auth";
import { resolveFastMode } from "@/lib/permissions";
import {
  quotaExceeded,
  videoQuotaExceeded,
  imageQuotaExceeded,
  quotaFor,
  videoQuotaFor,
  imageQuotaFor,
  recordGeneration,
} from "@/lib/quota";
import {
  directView,
  dispatchDirect,
  enqueueRender,
  getRenderForUser,
  pumpQueue,
  queueEnabled,
  toView,
  type WorkflowParams,
} from "@/lib/renderQueue";
import {
  SUPPORTED_SAMPLERS,
  SUPPORTED_SCHEDULERS,
} from "@/lib/workflows";
import {
  AUTO_RATIO,
  IMAGE_RATIOS,
  MAX_DURATION,
  MIN_DURATION,
  RatioChoice,
  dimensionsForImage,
  isRatioChoice,
  isValidDuration,
  isValidImageEdge,
  resolveDimensions,
} from "@/lib/aspect";

export const runtime = "nodejs";

/**
 * Accept a render into the queue (Text->Video, Image->Video, or Text->Image).
 */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    type,
    prompt,
    negativePrompt,
    aspectRatio,
    durationSeconds,
    imageFilename,
    imageWidth,
    imageHeight,
    fast,
    model,
    seed,
    steps,
    cfg,
    samplerName,
    scheduler,
    denoise,
  } = body as {
    type: "t2v" | "i2v" | "t2i";
    prompt: string;
    negativePrompt?: string;
    aspectRatio: RatioChoice;
    durationSeconds?: number;
    imageFilename?: string;
    imageWidth?: number;
    imageHeight?: number;
    fast?: unknown;
    model?: string;
    seed?: unknown;
    steps?: unknown;
    cfg?: unknown;
    samplerName?: unknown;
    scheduler?: unknown;
    denoise?: unknown;
  };

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "Missing prompt." }, { status: 400 });
  }
  if (type !== "t2v" && type !== "i2v" && type !== "t2i") {
    return NextResponse.json({ error: "type must be 't2v', 'i2v', or 't2i'." }, { status: 400 });
  }
  if (!isRatioChoice(aspectRatio) && !IMAGE_RATIOS[aspectRatio]) {
    return NextResponse.json({ error: "Invalid aspect ratio." }, { status: 400 });
  }

  // "auto" means "take the shape from the uploaded image", which needs a source image
  if (aspectRatio === AUTO_RATIO && type !== "i2v") {
    return NextResponse.json({ error: "Auto aspect ratio needs a source image." }, { status: 400 });
  }

  const duration = Number(durationSeconds);
  if (type !== "t2i" && !isValidDuration(duration)) {
    return NextResponse.json(
      { error: `Duration must be between ${MIN_DURATION} and ${MAX_DURATION} seconds.` },
      { status: 400 },
    );
  }
  if (type === "i2v" && !imageFilename) {
    return NextResponse.json(
      { error: "Missing imageFilename. Upload the image first via /api/upload." },
      { status: 400 },
    );
  }

  if (type === "t2i") {
    if (!user.can_access_image && !user.is_owner) {
      return NextResponse.json({ error: "Image generation is not enabled for this account." }, { status: 403 });
    }
    if (imageQuotaExceeded(user)) {
      const q = user.image_quota || user.quota || { used: 0, limit: 20 };
      return NextResponse.json(
        {
          error: `Daily image limit reached (${q.used}/${q.limit}). Resets at midnight UTC.`,
          reason: "quota",
          quota: user.quota,
          imageQuota: user.image_quota,
        },
        { status: 429 },
      );
    }
  } else {
    if (!user.can_access_video && !user.is_owner) {
      return NextResponse.json({ error: "Video generation is not enabled for this account." }, { status: 403 });
    }
    if (videoQuotaExceeded(user)) {
      const q = user.video_quota || user.quota || { used: 0, limit: 10 };
      return NextResponse.json(
        {
          error: `Daily video limit reached (${q.used}/${q.limit}). Resets at midnight UTC.`,
          reason: "quota",
          quota: user.quota,
          videoQuota: user.video_quota,
        },
        { status: 429 },
      );
    }
  }

  let dimensions: { width: number; height: number };
  if (type === "t2i") {
    dimensions = IMAGE_RATIOS[aspectRatio] || { width: 1024, height: 1024 };
  } else if (aspectRatio === AUTO_RATIO) {
    if (!isValidImageEdge(imageWidth) || !isValidImageEdge(imageHeight)) {
      return NextResponse.json({ error: "Auto aspect ratio needs the source image dimensions." }, { status: 400 });
    }
    dimensions = dimensionsForImage(imageWidth, imageHeight);
  } else {
    dimensions = resolveDimensions(aspectRatio);
  }

  const ratioLabel =
    aspectRatio === AUTO_RATIO ? `auto (${dimensions.width}x${dimensions.height})` : aspectRatio;

  const useFast = resolveFastMode(user, fast);

  let workflowParams: WorkflowParams | undefined = undefined;
  if (type === "t2i") {
    const canAdvanced = user.can_access_advanced || user.is_owner;
    const p: WorkflowParams = {};

    if (model === "basb" || model === "anima") {
      p.model = model;
    } else {
      p.model = "anima";
    }

    const parsedSeed = Number(seed);
    if (Number.isInteger(parsedSeed) && parsedSeed >= 0) {
      p.seed = parsedSeed;
    } else {
      p.seed = Math.floor(Math.random() * 1_000_000_000_000);
    }

    if (canAdvanced) {
      const parsedSteps = Number(steps);
      if (Number.isInteger(parsedSteps)) {
        p.steps = Math.max(10, Math.min(60, parsedSteps));
      }
      const parsedCfg = Number(cfg);
      if (Number.isFinite(parsedCfg)) {
        p.cfg = Math.max(1, Math.min(20, parsedCfg));
      }
      if (typeof samplerName === "string" && (SUPPORTED_SAMPLERS as readonly string[]).includes(samplerName)) {
        p.samplerName = samplerName;
      }
      if (typeof scheduler === "string" && (SUPPORTED_SCHEDULERS as readonly string[]).includes(scheduler)) {
        p.scheduler = scheduler;
      }
      const parsedDenoise = Number(denoise);
      if (Number.isFinite(parsedDenoise)) {
        p.denoise = Math.max(0.1, Math.min(1.0, parsedDenoise));
      }
    }

    workflowParams = p;
  }

  const input = {
    userId: user.id,
    prompt,
    negativePrompt: typeof negativePrompt === "string" ? negativePrompt : undefined,
    type,
    aspectRatio: ratioLabel,
    width: dimensions.width,
    height: dimensions.height,
    durationSeconds: type === "t2i" ? null : duration,
    fast: useFast,
    imageFilename: type === "i2v" ? imageFilename : undefined,
    workflowParams,
  };

  if (!queueEnabled()) {
    try {
      const promptId = await dispatchDirect(input);
      return NextResponse.json({ job: directView(promptId, input), quota: user.quota, generations: null });
    } catch (err: any) {
      console.error(err);
      return NextResponse.json({ error: err.message ?? "Failed to queue job." }, { status: 502 });
    }
  }

  try {
    const row = await enqueueRender(input);

    let quota = user.quota;
    let videoQuota = user.video_quota;
    let imageQuota = user.image_quota;
    let generations: number | null = null;
    if (hasProfile(user)) {
      const profile = await recordGeneration(user.id, type);
      generations = profile ? profile.generations : null;
      if (user.quota !== null) {
        quota = profile ? quotaFor(profile) : { ...user.quota, used: user.quota.used + 1 };
      }
      if (user.video_quota !== null && user.video_quota !== undefined) {
        videoQuota = profile ? videoQuotaFor(profile) : user.video_quota;
      }
      if (user.image_quota !== null && user.image_quota !== undefined) {
        imageQuota = profile ? imageQuotaFor(profile) : user.image_quota;
      }
    }

    await pumpQueue();

    const fresh = (await getRenderForUser(row.id, user.id)) ?? row;
    return NextResponse.json({ job: await toView(fresh), quota, videoQuota, imageQuota, generations });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message ?? "Failed to queue your render." }, { status: 502 });
  }
}
