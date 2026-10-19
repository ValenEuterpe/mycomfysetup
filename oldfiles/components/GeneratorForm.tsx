"use client";

/**
 * The studio: controls on the left, output on the right.
 *
 * The right column is not just a results panel. It holds the aspect frame, which
 * is present from the moment the page loads and always drawn at the exact shape
 * the render will be — empty at first, then the cropped source image, then the
 * finished video. That continuity is the point: the shape you are choosing is on
 * screen while you choose it, and the result arrives in the same box rather than
 * pushing the page around.
 *
 * Geometry is settled here, not in the graph. `dimensions` drives the frame, the
 * crop and the queued workflow from one value, so a preview cannot disagree with
 * a render.
 *
 * A render's identity lives on the server, not in this component. The job id
 * comes back from /api/generate and is re-fetched from /api/jobs on mount, so
 * closing the tab or reloading the page no longer abandons a render that is
 * still going — which it used to, because the id existed only in React state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApiKey } from "./ApiKeyProvider";
import AspectFrame from "./AspectFrame";
import RatioPicker from "./RatioPicker";
import ImageDrop from "./ImageDrop";
import {
  AUTO_RATIO,
  MAX_DURATION,
  MIN_DURATION,
  RatioChoice,
  actualDuration,
  dimensionsForImage,
  resolveDimensions,
} from "@/lib/aspect";
import { LoadedImage, cropToBlob } from "@/lib/crop";
import { fetchAndStore } from "@/lib/mediaCache";

/**
 * `queued` is the new one: accepted by us, not yet sent to the GPU. It is the
 * state that used to be invisible — every job went straight to ComfyUI and
 * everyone behind the first sat on "rendering" with nothing to explain the wait.
 */
type Status = "idle" | "uploading" | "queuing" | "queued" | "rendering" | "done" | "error";

/** The job shape /api/generate, /api/status and /api/jobs all return. */
type Job = {
  id: string;
  status: "queued" | "dispatched" | "done" | "error" | "cancelled";
  videoUrl: string | null;
  error: string | null;
  position?: number;
  queueTotal?: number;
  width: number | null;
  height: number | null;
};

const POLL_INTERVAL_MS = 3000;

export default function GeneratorForm({ mode }: { mode: "t2v" | "i2v" }) {
  const { authFetch, capabilities, quota, videoQuota, refresh, syncUsage } = useApiKey();
  const searchParams = useSearchParams();
  // History's "Reuse" links here with the prompt in the query, so retrying an
  // old render doesn't mean retyping it. Read once as the initial value rather
  // than synced, or editing the box would fight the URL.
  const [prompt, setPrompt] = useState(() => searchParams.get("prompt") ?? "");
  // Image-to-video defaults to Auto, which keeps the uploaded frame whole —
  // the least destructive choice before the user has expressed a preference.
  const [ratio, setRatio] = useState<RatioChoice>(mode === "i2v" ? AUTO_RATIO : "16:9 (Widescreen)");
  const [duration, setDuration] = useState(mode === "i2v" ? 5 : 8);
  // Fast mode is the default for everyone. Only advanced users can turn it off,
  // and the server enforces that regardless of what this value ends up being.
  const [fast, setFast] = useState(true);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [queueAt, setQueueAt] = useState<{ position: number; total: number } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  /** Output shape of a resumed job, which may differ from the current controls. */
  const [resumedDimensions, setResumedDimensions] = useState<{ width: number; height: number } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guards against a poll resolving after the component has gone. */
  const liveRef = useRef(true);

  const busy = status === "uploading" || status === "queuing" || status === "queued" || status === "rendering";

  /**
   * The output shape, and the single source for the frame, the crop and the
   * queued job. Auto falls back to 1:1 until an image has been measured, which
   * is only visible in the moment before the first upload.
   */
  const controlDimensions = useMemo(() => {
    if (ratio === AUTO_RATIO) {
      return image ? dimensionsForImage(image.width, image.height) : resolveDimensions("1:1 (Square)");
    }
    return resolveDimensions(ratio);
  }, [ratio, image]);

  /**
   * A job picked up from a previous session was rendered at its own shape, which
   * the controls know nothing about. Showing it in the frame means a resumed 9:16
   * render doesn't appear in a 16:9 box.
   */
  const dimensions = resumedDimensions ?? controlDimensions;

  /** What Auto would produce, for the picker tile's shape and caption. */
  const autoDimensions = useMemo(
    () => (image ? dimensionsForImage(image.width, image.height) : null),
    [image],
  );

  /**
   * Re-crop whenever the image or the target shape changes, so the frame shows
   * the actual bytes that will be uploaded rather than a CSS approximation of
   * them. The same blob is reused at submit — cropping twice would risk the
   * preview and the upload diverging.
   */
  const croppedBlobRef = useRef<Blob | null>(null);
  // Mirrors croppedUrl so the unmount cleanup can revoke the last one without
  // taking croppedUrl as a dependency and re-running the crop on every swap.
  const croppedUrlRef = useRef<string | null>(null);

  /** Publish a preview URL, releasing the one it replaces. */
  const publishCroppedUrl = useCallback((next: string | null) => {
    setCroppedUrl((old) => {
      if (old && old !== next) URL.revokeObjectURL(old);
      croppedUrlRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (mode !== "i2v" || !image) {
      croppedBlobRef.current = null;
      publishCroppedUrl(null);
      return;
    }

    let cancelled = false;

    cropToBlob(image, controlDimensions)
      .then((blob) => {
        // A slower crop for a superseded shape must not overwrite a newer one.
        // Nothing was published in that case, so there is nothing to revoke.
        if (cancelled) return;
        croppedBlobRef.current = blob;
        publishCroppedUrl(URL.createObjectURL(blob));
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    // Deliberately no revoke here. The URL this run published is still the one
    // on screen, and the next run's crop is async — releasing it now would show
    // a broken image for as long as the new crop takes to encode. publishCropped-
    // Url releases it at the moment its replacement is ready instead.
    return () => {
      cancelled = true;
    };
  }, [mode, image, controlDimensions, publishCroppedUrl]);

  // Stop the poll and release whatever object URLs are still live when the page
  // goes away.
  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
      if (croppedUrlRef.current) URL.revokeObjectURL(croppedUrlRef.current);
    };
  }, []);

  // The source image's own URL is owned by ImageDrop's LoadedImage, so it is
  // released here rather than in the effect above, which never sees it.
  useEffect(() => {
    return () => {
      if (image) URL.revokeObjectURL(image.url);
    };
  }, [image]);

  /**
   * Cache the finished video, then play it from the local blob.
   *
   * Populating the cache here means history fills up as a side effect of
   * generating, with no separate download pass. Best-effort throughout: if the
   * fetch or the store fails, `videoUrl` is left pointing at /api/video and
   * playback is unaffected — only the history entry loses its offline copy.
   */
  const cacheAndShow = useCallback(
    async (id: string, url: string) => {
      setVideoUrl(url);

      const blob = await fetchAndStore(id, url, (target) => authFetch(target));
      if (!blob || !liveRef.current) return;

      const objectUrl = URL.createObjectURL(blob);
      setVideoUrl((old) => {
        if (old && old.startsWith("blob:")) URL.revokeObjectURL(old);
        return objectUrl;
      });
    },
    [authFetch],
  );

  /** Fold a job payload into the UI. Shared by submit, poll and resume. */
  const applyJob = useCallback(
    (job: Job) => {
      setJobId(job.id);

      // A resumed or in-flight job carries the shape it was actually queued at.
      if (job.width && job.height) {
        setResumedDimensions({ width: job.width, height: job.height });
      }

      if (job.status === "done" && job.videoUrl) {
        setQueueAt(null);
        setStatus("done");
        void cacheAndShow(job.id, job.videoUrl);
        return true;
      }

      if (job.status === "error") {
        setQueueAt(null);
        setError(job.error || "Generation failed.");
        setStatus("error");
        return true;
      }

      if (job.status === "cancelled") {
        setQueueAt(null);
        setStatus("idle");
        setJobId(null);
        setResumedDimensions(null);
        return true;
      }

      if (job.status === "queued") {
        setQueueAt({ position: job.position ?? 1, total: job.queueTotal ?? 1 });
        setStatus("queued");
        return false;
      }

      // dispatched
      setQueueAt(null);
      setStatus("rendering");
      return false;
    },
    [cacheAndShow],
  );

  /**
   * Poll one job to completion.
   *
   * The same 3s tick as before, but against our queue row rather than ComfyUI's
   * prompt id — a queued job has no ComfyUI id yet. Each poll also nudges the
   * server's queue along, so waiting is what keeps the line moving.
   */
  const pollJob = useCallback(
    (id: string) => {
      if (pollRef.current) clearTimeout(pollRef.current);

      const tick = async () => {
        if (!liveRef.current) return;
        try {
          const res = await authFetch(`/api/status/${id}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Status check failed.");
          if (!liveRef.current) return;

          const settled = applyJob(data.job as Job);
          if (!settled) pollRef.current = setTimeout(tick, POLL_INTERVAL_MS);
        } catch (err: any) {
          if (!liveRef.current) return;
          setError(err.message);
          setStatus("error");
        }
      };

      tick();
    },
    [authFetch, applyJob],
  );

  /**
   * Pick up an unfinished render on mount.
   *
   * This is what makes a refresh survivable. Only the newest active job is
   * attached to the UI — there is one output frame, and with a concurrency of one
   * a second active job is a rarity — but asking for the list also pumps the
   * queue, so merely opening the studio helps it drain.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await authFetch("/api/jobs");
        if (!res.ok) return;
        const data = await res.json();
        const jobs = (data.jobs ?? []) as Job[];
        if (cancelled || !liveRef.current || jobs.length === 0) return;

        const latest = jobs[jobs.length - 1];
        const settled = applyJob(latest);
        if (!settled) pollJob(latest.id);
      } catch {
        // A failed resume is not worth an error box: the user hasn't asked for
        // anything yet, and the form is perfectly usable without it.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authFetch, applyJob, pollJob]);

  /** Withdraw a job that hasn't reached the GPU. */
  const onCancel = async () => {
    if (!jobId) return;
    setCancelling(true);
    try {
      const res = await authFetch(`/api/jobs?id=${encodeURIComponent(jobId)}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // Almost always a 409: it started rendering between the click and the
        // request. Not an error worth a red box — just let the poll carry on.
        if (res.status !== 409) setError(data?.error || "Couldn't cancel that job.");
        return;
      }
      if (pollRef.current) clearTimeout(pollRef.current);
      setStatus("idle");
      setQueueAt(null);
      setJobId(null);
      setResumedDimensions(null);
      // The cancel refunded the render server-side. Re-read the session so the
      // usage counter reflects it rather than showing a spend that was undone.
      refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pollRef.current) clearTimeout(pollRef.current);
    setError(null);
    setQueueAt(null);
    setJobId(null);
    // A previous run's shape must not outlive it, or the frame would keep showing
    // the old geometry while the new controls say otherwise.
    setResumedDimensions(null);
    setVideoUrl((old) => {
      if (old && old.startsWith("blob:")) URL.revokeObjectURL(old);
      return null;
    });

    if (!prompt.trim()) {
      setError("Write a prompt first.");
      return;
    }
    if (mode === "i2v" && !image) {
      setError("Upload an image first.");
      return;
    }

    try {
      let imageFilename: string | undefined;

      if (mode === "i2v" && image) {
        setStatus("uploading");

        // The crop effect normally has this ready. If a submit lands first,
        // crop now rather than uploading an uncropped file — the model stretches
        // whatever it is given, so an uncropped upload would come out distorted.
        const blob = croppedBlobRef.current ?? (await cropToBlob(image, controlDimensions));

        const form = new FormData();
        form.append("image", new File([blob], "frame.png", { type: "image/png" }));
        const upRes = await authFetch("/api/upload", { method: "POST", body: form });
        const upData = await upRes.json();
        if (!upRes.ok) throw new Error(upData.error || "Upload failed.");
        imageFilename = upData.filename;
      }

      setStatus("queuing");
      const genRes = await authFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: mode,
          prompt,
          aspectRatio: ratio,
          durationSeconds: duration,
          imageFilename,
          // Only meaningful for Auto, where the server recomputes the shape from
          // these rather than trusting a client-supplied width and height.
          imageWidth: image?.width,
          imageHeight: image?.height,
          fast,
        }),
      });
      const genData = await genRes.json();
      // Both the refusal and the success carry the authoritative counts, so the
      // usage figures stay honest even if another tab spent renders. Fields the
      // response doesn't carry (a plain 502 has neither) are left as they were.
      syncUsage(genData);
      if (!genRes.ok) throw new Error(genData.error || "Failed to queue job.");

      const job = genData.job as Job;
      const settled = applyJob(job);
      if (!settled) pollJob(job.id);
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  };

  const effectiveVideoQuota = videoQuota ?? quota;
  const hasVideoAccess = capabilities.canAccessVideo !== false;
  // `effectiveVideoQuota === null` means this account isn't subject to one — owner or demo
  // mode — so the counter and the limit state disappear entirely.
  const atLimit = effectiveVideoQuota !== null && effectiveVideoQuota.used >= effectiveVideoQuota.limit;

  // The model's frame grid is 17k+5, so a request is snapped up to the next
  // valid count. Saying so beats silently returning 5.17s for a 5s request.
  const snapped = actualDuration(duration);
  const durationNote =
    Math.abs(snapped - duration) < 0.05 ? null : `Rounds up to ${snapped.toFixed(2)}s`;

  const buttonLabel =
    !hasVideoAccess
      ? "Video access disabled"
      : status === "queued"
        ? "Waiting in queue…"
        : busy
          ? "Rendering…"
          : atLimit
            ? "Daily video limit reached"
            : "Generate video";

  return (
    <form className="studio" onSubmit={onSubmit}>
      <div className="studio-controls panel">
        {mode === "i2v" && (
          <ImageDrop image={image} onImage={setImage} onError={setError} disabled={busy} />
        )}

        <div className="field">
          <label htmlFor="prompt">Prompt</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === "i2v"
                ? "Describe how the scene should move, light, and cut..."
                : "Describe the shots, camera moves, and audio..."
            }
            disabled={busy}
          />
        </div>

        <div className="field">
          <label id="ratio-label">Aspect ratio</label>
          <RatioPicker
            value={ratio}
            onChange={setRatio}
            disabled={busy}
            showAuto={mode === "i2v"}
            autoDimensions={autoDimensions}
          />
        </div>

        <div className="field">
          <label htmlFor="duration">
            Duration &mdash; {duration}s
          </label>
          <input
            id="duration"
            type="range"
            className="duration-slider"
            min={MIN_DURATION}
            max={MAX_DURATION}
            step={1}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            disabled={busy}
          />
          <div className="duration-scale" aria-hidden="true">
            <span>{MIN_DURATION}s</span>
            <span>{MAX_DURATION}s</span>
          </div>
          {durationNote && <p className="field-help">{durationNote}</p>}
        </div>

        {capabilities.canDisableFastMode ? (
          <details className="advanced">
            <summary>Advanced settings</summary>
            <div className="field advanced-field">
              <label htmlFor="fast" className="checkbox-label">
                <input
                  id="fast"
                  type="checkbox"
                  checked={fast}
                  onChange={(e) => setFast(e.target.checked)}
                  disabled={busy}
                />
                Fast mode
              </label>
              <p className="field-help">
                8-step turbo LoRA — quicker render, softer detail. Uncheck for a full 20-step render.
              </p>
            </div>
          </details>
        ) : null}

        <button className="generate" type="submit" disabled={busy || atLimit || !hasVideoAccess}>
          {buttonLabel}
        </button>

        {!capabilities.canDisableFastMode && (
          <p className="fast-note">
            <span className="fast-note-icon" aria-hidden="true">
              ⚡
            </span>
            Fast mode: on — 8-step turbo render
          </p>
        )}

        {/* The 429 / 403 from /api/generate is the real gate; this is so nobody wastes a click. */}
        {!hasVideoAccess ? (
          <p className="quota-note quota-note-full">
            Video generation is disabled for your account.
          </p>
        ) : effectiveVideoQuota && (
          <p className={atLimit ? "quota-note quota-note-full" : "quota-note"}>
            {atLimit
              ? `Daily limit reached (${effectiveVideoQuota.used} of ${effectiveVideoQuota.limit}) — resets at midnight UTC`
              : `${effectiveVideoQuota.used} of ${effectiveVideoQuota.limit} video renders used today`}
          </p>
        )}

        {status === "error" && error && <div className="error-box">{error}</div>}
      </div>

      <div className="studio-output">
        <div className="studio-output-inner">
          <AspectFrame
            dimensions={dimensions}
            imageUrl={croppedUrl}
            videoUrl={videoUrl}
            rendering={busy}
            caption={`${snapped.toFixed(2)}s · 24 fps`}
          />

          {/* The queue panel. This is the state that had no representation before:
              accepted, but not yet sent anywhere. */}
          {status === "queued" && queueAt && (
            <div className="queue-panel" role="status">
              <p className="queue-position">
                <strong>{queueAt.position}</strong> of {queueAt.total} in the queue
              </p>
              <p className="queue-note">
                Your request hasn&apos;t been sent to the GPU yet. It starts automatically when the
                renders ahead of it finish — you can close this page and come back. The position can
                shift if a higher-priority render is submitted.
              </p>
              <div className="beam" />
              <button type="button" className="queue-cancel" onClick={onCancel} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Cancel this render"}
              </button>
            </div>
          )}

          {busy && status !== "queued" && (
            <div className="status-line" role="status">
              {status === "uploading" && "Uploading image to the render server…"}
              {status === "queuing" && "Adding to the queue…"}
              {status === "rendering" && "Rendering on the GPU — this can take a few minutes…"}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
