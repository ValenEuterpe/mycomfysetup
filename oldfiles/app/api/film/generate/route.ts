import { NextRequest, NextResponse } from "next/server";
import { hasProfile, requireUser } from "@/lib/auth";
import { capabilitiesFor, resolveFastMode } from "@/lib/permissions";
import {
  quotaExceeded,
  videoQuotaExceeded,
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
} from "@/lib/renderQueue";
import {
  MAX_DURATION,
  MIN_DURATION,
  isAspectRatio,
  isValidDuration,
  resolveDimensions,
} from "@/lib/aspect";

export const runtime = "nodejs";

/**
 * Queue a filmmaking shot.
 *
 * Isolated from /api/generate on purpose: that route must stay byte-identical
 * for the existing userbase. This one is the same enqueue + quota + pump, with
 * an extra capability check and no Auto ratio (a sequence locks a preset so
 * first-frame stretch cannot disagree mid-chain).
 *
 * Jobs are stored as `t2v` / `i2v` so history, refunds, and the GPU queue do
 * not need a third type. Shot 1 with no still is t2v; everything else is i2v
 * with the chosen anchor (or opening still) as first_frame.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!capabilitiesFor(user).canAccessFilmmaking) {
    return NextResponse.json({ error: "Filmmaking is not enabled for this account." }, { status: 403 });
  }
  if (!user.can_access_video && !user.is_owner) {
    return NextResponse.json({ error: "Video generation is not enabled for this account." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { prompt, aspectRatio, durationSeconds, imageFilename, fast } = body as {
    prompt: string;
    aspectRatio: unknown;
    durationSeconds: number;
    imageFilename?: string;
    fast?: unknown;
  };

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "Missing prompt." }, { status: 400 });
  }
  if (!isAspectRatio(aspectRatio)) {
    return NextResponse.json({ error: "Invalid aspect ratio." }, { status: 400 });
  }
  const duration = Number(durationSeconds);
  if (!isValidDuration(duration)) {
    return NextResponse.json(
      { error: `Duration must be between ${MIN_DURATION} and ${MAX_DURATION} seconds.` },
      { status: 400 },
    );
  }

  const type: "t2v" | "i2v" = imageFilename ? "i2v" : "t2v";
  if (type === "i2v" && typeof imageFilename !== "string") {
    return NextResponse.json({ error: "Missing imageFilename. Upload the anchor frame first." }, { status: 400 });
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

  const dimensions = resolveDimensions(aspectRatio);
  const useFast = resolveFastMode(user, fast);

  const input = {
    userId: user.id,
    prompt,
    type,
    aspectRatio,
    width: dimensions.width,
    height: dimensions.height,
    durationSeconds: duration,
    fast: useFast,
    imageFilename: type === "i2v" ? imageFilename : undefined,
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
      const profile = await recordGeneration(user.id, "video");
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
