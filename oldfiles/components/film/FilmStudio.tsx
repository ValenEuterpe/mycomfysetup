"use client";

/**
 * Filmmaking studio: sequence of chained MiniMax H3 clips.
 *
 * Isolated from GeneratorForm on purpose. Existing T2V/I2V users never load
 * this module. Jobs still enqueue as t2v/i2v through /api/film/generate, so
 * the GPU queue, quota, and history stay the same.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useApiKey } from "@/components/ApiKeyProvider";
import AspectFrame from "@/components/AspectFrame";
import ImageDrop from "@/components/ImageDrop";
import PromptDesk from "./PromptDesk";
import ShotList from "./ShotList";
import SequencePlayer from "./SequencePlayer";
import AnchorPicker from "./AnchorPicker";
import VideoDrop from "./VideoDrop";
import { actualDuration, resolveDimensions, type AspectRatio } from "@/lib/aspect";
import { cropToBlob, type LoadedImage } from "@/lib/crop";
import { fetchAndStore, get as getCached, put as putCached } from "@/lib/mediaCache";
import { assembleFilmPrompt, newActionSpan, promptIsEmpty } from "@/lib/film/prompt";
import { defaultAnchorTime, snapTime } from "@/lib/film/frames";
import {
  clearProject,
  loadProject,
  newProject,
  newShot,
  saveProject,
  type FilmProject,
  type OpeningSource,
  type Shot,
} from "@/lib/film/project";

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

type Status = "idle" | "uploading" | "queuing" | "queued" | "rendering" | "done" | "error";

const POLL_INTERVAL_MS = 3000;

function jobStatusToShot(status: Job["status"]): Shot["status"] {
  if (status === "queued") return "queued";
  if (status === "dispatched") return "rendering";
  if (status === "done") return "done";
  if (status === "error") return "error";
  return "draft";
}

export default function FilmStudio() {
  const { authFetch, capabilities, quota, videoQuota, refresh, syncUsage } = useApiKey();

  const [project, setProject] = useState<FilmProject>(() => newProject());
  const [hydrated, setHydrated] = useState(false);
  const [playbackUrls, setPlaybackUrls] = useState<Record<string, string>>({});
  const [firstFramePreviews, setFirstFramePreviews] = useState<Record<string, string>>({});
  const firstFramePreviewsRef = useRef<Record<string, string>>({});
  const [openingImage, setOpeningImage] = useState<LoadedImage | null>(null);
  const [openingPreview, setOpeningPreview] = useState<string | null>(null);
  const [importVideoUrl, setImportVideoUrl] = useState<string | null>(null);
  const importVideoUrlRef = useRef<string | null>(null);
  const [importPickTime, setImportPickTime] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [queueAt, setQueueAt] = useState<{ position: number; total: number } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [anchorReady, setAnchorReady] = useState(false);
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [intent, setIntent] = useState("");
  const [enhancing, setEnhancing] = useState(false);
  const [enhancerReady, setEnhancerReady] = useState(false);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRef = useRef(true);
  const croppedBlobRef = useRef<Blob | null>(null);
  const playbackUrlsRef = useRef<Record<string, string>>({});

  const selectedId = project.selectedShotId ?? project.shots[0]?.id;
  const selected = project.shots.find((s) => s.id === selectedId) ?? project.shots[0];
  const selectedIndex = project.shots.findIndex((s) => s.id === selected.id);
  const isFirst = selectedIndex === 0;
  const dimensions = resolveDimensions(project.aspectRatio);
  const pipelineBusy =
    status === "uploading" || status === "queuing" || status === "queued" || status === "rendering";
  const busy = pipelineBusy && activeShotId === selected.id;
  const effectiveVideoQuota = videoQuota ?? quota;
  const hasVideoAccess = capabilities.canAccessVideo !== false;
  const atLimit = effectiveVideoQuota !== null && effectiveVideoQuota.used >= effectiveVideoQuota.limit;
  const ratioLocked = project.shots.some(
    (s) => s.status === "done" || s.status === "queued" || s.status === "rendering",
  );
  const playbackUrl = playbackUrls[selected.id] ?? null;

  const firstFrameCacheId = (shotId: string) => `film-first-${shotId}`;

  const setFirstFramePreview = useCallback((shotId: string, url: string | null) => {
    setFirstFramePreviews((old) => {
      const prev = old[shotId];
      if (prev && prev.startsWith("blob:") && prev !== url) URL.revokeObjectURL(prev);
      const next = { ...old };
      if (url) next[shotId] = url;
      else delete next[shotId];
      firstFramePreviewsRef.current = next;
      return next;
    });
  }, []);

  const rememberFirstFrame = useCallback(
    async (shotId: string, blob: Blob) => {
      const url = URL.createObjectURL(blob);
      setFirstFramePreview(shotId, url);
      await putCached(firstFrameCacheId(shotId), blob);
    },
    [setFirstFramePreview],
  );

  const setPlayback = useCallback((shotId: string, url: string | null) => {
    setPlaybackUrls((old) => {
      const prev = old[shotId];
      if (prev && prev.startsWith("blob:") && prev !== url) URL.revokeObjectURL(prev);
      const next = { ...old };
      if (url) next[shotId] = url;
      else delete next[shotId];
      playbackUrlsRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    liveRef.current = true;
    const stored = loadProject();
    if (stored) setProject(stored);
    else setProject((p) => ({ ...p, selectedShotId: p.shots[0].id }));
    setHydrated(true);
    return () => {
      liveRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
      for (const url of Object.values(playbackUrlsRef.current)) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
      for (const url of Object.values(firstFramePreviewsRef.current)) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
      if (importVideoUrlRef.current) URL.revokeObjectURL(importVideoUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hydrated) saveProject(project);
  }, [project, hydrated]);

  useEffect(() => {
    if (!openingImage) {
      croppedBlobRef.current = null;
      return;
    }
    let cancelled = false;
    cropToBlob(openingImage, dimensions).then((blob) => {
      if (cancelled) return;
      croppedBlobRef.current = blob;
      setOpeningPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [openingImage, dimensions]);

  useEffect(() => {
    return () => {
      if (openingImage) URL.revokeObjectURL(openingImage.url);
    };
  }, [openingImage]);

  useEffect(() => {
    return () => {
      if (openingPreview) URL.revokeObjectURL(openingPreview);
    };
  }, [openingPreview]);

  const patchProject = useCallback((patch: Partial<FilmProject>) => {
    setProject((prev) => ({ ...prev, ...patch }));
  }, []);

  const patchShot = useCallback((id: string, patch: Partial<Shot>) => {
    setProject((prev) => ({
      ...prev,
      shots: prev.shots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }, []);

  const cacheAndShow = useCallback(
    async (shotId: string, jobId: string, url: string) => {
      setPlayback(shotId, url);
      const blob = await fetchAndStore(jobId, url, (target) => authFetch(target));
      if (!blob || !liveRef.current) return;
      setPlayback(shotId, URL.createObjectURL(blob));
    },
    [authFetch, setPlayback],
  );

  const applyJob = useCallback(
    (shotId: string, job: Job) => {
      patchShot(shotId, {
        jobId: job.id,
        status: jobStatusToShot(job.status),
        error: job.error,
        width: job.width,
        height: job.height,
      });

      if (job.status === "done" && job.videoUrl) {
        setQueueAt(null);
        setStatus("done");
        setActiveShotId(null);
        void cacheAndShow(shotId, job.id, job.videoUrl);
        return true;
      }
      if (job.status === "error") {
        setQueueAt(null);
        setError(job.error || "Generation failed.");
        setStatus("error");
        setActiveShotId(null);
        return true;
      }
      if (job.status === "cancelled") {
        setQueueAt(null);
        setStatus("idle");
        setActiveShotId(null);
        patchShot(shotId, { jobId: null, status: "draft" });
        return true;
      }
      if (job.status === "queued") {
        setQueueAt({ position: job.position ?? 1, total: job.queueTotal ?? 1 });
        setStatus("queued");
        return false;
      }
      setQueueAt(null);
      setStatus("rendering");
      return false;
    },
    [cacheAndShow, patchShot],
  );

  const pollJob = useCallback(
    (shotId: string, id: string) => {
      if (pollRef.current) clearTimeout(pollRef.current);
      const tick = async () => {
        if (!liveRef.current) return;
        try {
          const res = await authFetch(`/api/status/${id}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Status check failed.");
          if (!liveRef.current) return;
          const settled = applyJob(shotId, data.job as Job);
          if (!settled) pollRef.current = setTimeout(tick, POLL_INTERVAL_MS);
        } catch (err: any) {
          if (!liveRef.current) return;
          setError(err.message);
          setStatus("error");
          setActiveShotId(null);
          patchShot(shotId, { status: "error", error: err.message });
        }
      };
      tick();
    },
    [authFetch, applyJob, patchShot],
  );

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    (async () => {
      for (const shot of project.shots) {
        if (cancelled || !shot.jobId || shot.status !== "done") continue;
        const cached = await getCached(shot.jobId);
        if (cancelled) return;
        if (cached) {
          setPlayback(shot.id, URL.createObjectURL(cached));
          continue;
        }
        try {
          const res = await authFetch(`/api/status/${shot.jobId}`);
          const data = await res.json().catch(() => null);
          const url = data?.job?.videoUrl as string | undefined;
          if (url) await cacheAndShow(shot.id, shot.jobId, url);
        } catch {
          /* clip stays empty until they regenerate or history still has it */
        }
      }

      for (const shot of project.shots) {
        if (cancelled || !shot.firstFrameFilename) continue;
        const cached = await getCached(firstFrameCacheId(shot.id));
        if (cancelled) return;
        if (cached) setFirstFramePreview(shot.id, URL.createObjectURL(cached));
      }
    })();

    const inflight = project.shots.find(
      (s) => s.jobId && (s.status === "queued" || s.status === "rendering"),
    );
    if (inflight?.jobId) {
      setActiveShotId(inflight.id);
      setProject((prev) => ({ ...prev, selectedShotId: inflight.id }));
      pollJob(inflight.id, inflight.jobId);
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/film/enhance")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setEnhancerReady(data?.configured === true);
      })
      .catch(() => {
        if (!cancelled) setEnhancerReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  const onCancel = async () => {
    if (!selected.jobId) return;
    setCancelling(true);
    try {
      const res = await authFetch(`/api/jobs?id=${encodeURIComponent(selected.jobId)}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status !== 409) setError(data?.error || "Couldn't cancel that job.");
        return;
      }
      if (pollRef.current) clearTimeout(pollRef.current);
      setStatus("idle");
      setQueueAt(null);
      setActiveShotId(null);
      patchShot(selected.id, { jobId: null, status: "draft" });
      refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  const uploadBlob = async (blob: Blob, name: string) => {
    const form = new FormData();
    form.append("image", new File([blob], name, { type: "image/png" }));
    const upRes = await authFetch("/api/upload", { method: "POST", body: form });
    const upData = await upRes.json();
    if (!upRes.ok) throw new Error(upData.error || "Upload failed.");
    return upData.filename as string;
  };

  const promptInput = () => ({
    style: project.styleBible,
    context: project.lockedContext,
    mode: selected.promptMode,
    simplePrompt: selected.simplePrompt,
    spans: selected.actionSpans,
    ambience: selected.ambience,
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pollRef.current) clearTimeout(pollRef.current);
    setError(null);
    setQueueAt(null);
    setAnchorReady(false);

    const input = promptInput();
    if (promptIsEmpty(input)) {
      setError(selected.promptMode === "simple" ? "Write a prompt first." : "Write at least one beat first.");
      return;
    }
    if (!isFirst && !selected.firstFrameFilename) {
      setError("This shot has no opening frame. Continue from the previous shot first.");
      return;
    }
    if (isFirst && project.openingSource === "image" && !openingImage && !selected.firstFrameFilename) {
      setError("Drop an image, or switch to Text.");
      return;
    }
    if (isFirst && project.openingSource === "video" && !selected.firstFrameFilename) {
      setError("Pick a frame from the imported video first.");
      return;
    }

    setActiveShotId(selected.id);
    setPlayback(selected.id, null);

    try {
      let imageFilename = selected.firstFrameFilename ?? undefined;
      if (isFirst && project.openingSource === "image" && openingImage) {
        setStatus("uploading");
        const blob = croppedBlobRef.current ?? (await cropToBlob(openingImage, dimensions));
        imageFilename = await uploadBlob(blob, "opening.png");
        patchShot(selected.id, { firstFrameFilename: imageFilename });
      }

      setStatus("queuing");
      const genRes = await authFetch("/api/film/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: assembleFilmPrompt(input),
          aspectRatio: project.aspectRatio,
          durationSeconds: selected.durationSeconds,
          imageFilename,
          fast: project.fast,
        }),
      });
      const genData = await genRes.json();
      syncUsage(genData);
      if (!genRes.ok) throw new Error(genData.error || "Failed to queue job.");

      const job = genData.job as Job;
      const settled = applyJob(selected.id, job);
      if (!settled) pollJob(selected.id, job.id);
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
      setActiveShotId(null);
      patchShot(selected.id, { status: "error", error: err.message });
    }
  };

  const advanceWithFrame = async (blob: Blob, time: number) => {
    setConfirming(true);
    setError(null);
    try {
      const filename = await uploadBlob(blob, "anchor.png");
      const sourceId = selected.id;
      const nextDraft = project.shots.find(
        (s, i) => i === selectedIndex + 1 && s.status === "draft" && !s.jobId,
      );
      const next =
        nextDraft ??
        newShot(project.shots.length, project.durationSeconds, selected.ambience, selected.promptMode);
      next.firstFrameFilename = filename;

      setProject((prev) => {
        const shots = prev.shots.map((s) =>
          s.id === sourceId ? { ...s, anchorFrameTime: time, anchorFilename: filename } : s,
        );
        const already = shots.some((s) => s.id === next.id);
        return {
          ...prev,
          shots: already
            ? shots.map((s) => (s.id === next.id ? { ...s, firstFrameFilename: filename } : s))
            : [...shots, next],
          selectedShotId: next.id,
        };
      });

      await rememberFirstFrame(next.id, blob);
      if (importVideoUrlRef.current) URL.revokeObjectURL(importVideoUrlRef.current);
      importVideoUrlRef.current = null;
      setImportVideoUrl(null);
      setImportPickTime(null);
      setStatus("idle");
      setQueueAt(null);
      setAnchorReady(false);
    } catch (err: any) {
      setError(err.message ?? "Couldn't save that frame.");
      throw err;
    } finally {
      setConfirming(false);
    }
  };

  const resetCanvas = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    clearProject();
    const fresh = newProject();
    setProject(fresh);
    setStatus("idle");
    setError(null);
    setQueueAt(null);
    setAnchorReady(false);
    setOpeningImage(null);
    setOpeningPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setActiveShotId(null);
    setIntent("");
    for (const url of Object.values(firstFramePreviewsRef.current)) {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    }
    setFirstFramePreviews({});
    firstFramePreviewsRef.current = {};
    if (importVideoUrlRef.current) URL.revokeObjectURL(importVideoUrlRef.current);
    importVideoUrlRef.current = null;
    setImportVideoUrl(null);
    setImportPickTime(null);
    for (const url of Object.values(playbackUrlsRef.current)) {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    }
    setPlaybackUrls({});
    playbackUrlsRef.current = {};
  }, []);

  const onRemoveShot = (id: string) => {
    const target = project.shots.find((s) => s.id === id);
    if (!target) return;
    if (target.id === activeShotId && (target.status === "queued" || target.status === "rendering")) return;

    if (project.shots.length <= 1) {
      resetCanvas();
      return;
    }

    const index = project.shots.findIndex((s) => s.id === id);
    const remaining = project.shots.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i }));
    const nextSelected =
      selectedId === id
        ? remaining[Math.max(0, index - 1)]?.id ?? remaining[0].id
        : selectedId;

    setPlayback(id, null);
    setFirstFramePreview(id, null);
    setProject((prev) => ({
      ...prev,
      shots: remaining,
      selectedShotId: remaining.some((s) => s.id === nextSelected) ? nextSelected : remaining[0].id,
    }));
    if (selectedId === id) {
      setStatus("idle");
      setError(null);
      setQueueAt(null);
      setAnchorReady(false);
    }
  };

  const onContinue = () => {
    if (selected.status !== "done" || !selected.anchorFilename) return;
    const existing = project.shots.find(
      (s, i) => i === selectedIndex + 1 && s.status === "draft" && !s.jobId,
    );
    if (existing) {
      patchShot(existing.id, { firstFrameFilename: selected.anchorFilename });
      patchProject({ selectedShotId: existing.id });
    } else {
      const next = newShot(project.shots.length, project.durationSeconds, selected.ambience, selected.promptMode);
      next.firstFrameFilename = selected.anchorFilename;
      setProject((prev) => ({
        ...prev,
        shots: [...prev.shots, next],
        selectedShotId: next.id,
      }));
    }
    setStatus("idle");
    setError(null);
    setQueueAt(null);
    setAnchorReady(false);
  };

  const onEnhance = async () => {
    if (!intent.trim()) return;
    setEnhancing(true);
    setError(null);
    try {
      const previous = project.shots
        .filter((s) => s.order < selected.order)
        .map((s) =>
          assembleFilmPrompt({
            style: project.styleBible,
            context: project.lockedContext,
            mode: s.promptMode,
            simplePrompt: s.simplePrompt,
            spans: s.actionSpans,
            ambience: s.ambience,
          }),
        )
        .filter(Boolean)
        .slice(-1)[0];

      const res = await authFetch("/api/film/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent,
          mode: selected.promptMode,
          durationSeconds: selected.durationSeconds,
          hasFirstFrame: Boolean(selected.firstFrameFilename) || Boolean(openingImage),
          style: project.styleBible,
          scene: project.lockedContext,
          previousAssembled: previous || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't enhance that prompt.");

      if (typeof data.style === "string") patchProject({ styleBible: data.style });
      if (typeof data.scene === "string") patchProject({ lockedContext: data.scene });
      if (typeof data.ambience === "string") patchShot(selected.id, { ambience: data.ambience });

      if (selected.promptMode === "simple" && typeof data.simplePrompt === "string") {
        patchShot(selected.id, { simplePrompt: data.simplePrompt });
      }
      if (selected.promptMode === "beats" && Array.isArray(data.beats)) {
        const spans = data.beats.map((beat: { from?: number; to?: number; action?: string; dialogue?: string; foley?: string }) =>
          newActionSpan(
            typeof beat.from === "number" ? beat.from : 0,
            typeof beat.to === "number" ? beat.to : selected.durationSeconds,
            typeof beat.action === "string" ? beat.action : "",
            typeof beat.dialogue === "string" ? beat.dialogue : "",
            typeof beat.foley === "string" ? beat.foley : "",
          ),
        );
        if (spans.length > 0) patchShot(selected.id, { actionSpans: spans });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEnhancing(false);
    }
  };

  const setOpeningSource = (source: OpeningSource) => {
    if (source === project.openingSource) return;
    patchProject({ openingSource: source });
    patchShot(selected.id, { firstFrameFilename: null });
    setOpeningPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    if (source !== "image") setOpeningImage(null);
    if (source !== "video") {
      if (importVideoUrlRef.current) URL.revokeObjectURL(importVideoUrlRef.current);
      importVideoUrlRef.current = null;
      setImportVideoUrl(null);
      setImportPickTime(null);
    }
  };

  const lastDone = [...project.shots].reverse().find((s) => s.status === "done");
  const canContinue = selected.status === "done" && Boolean(selected.anchorFilename);
  const continueReason = !lastDone
    ? "Generate a shot, then pick a frame for the next one."
    : selected.status !== "done"
      ? "Finish this shot first."
      : !selected.anchorFilename
        ? "Use this frame for the next shot — that creates shot 2 with the still loaded."
        : "Opens the next shot with this frame as the first image.";

  const snapped = actualDuration(selected.durationSeconds);
  const submitLabel =
    !hasVideoAccess
      ? "Video access disabled"
      : status === "queued"
        ? "Waiting in queue…"
        : busy
          ? "Rendering…"
          : atLimit
            ? "Daily video limit reached"
            : isFirst
              ? "Generate first shot"
              : "Generate this shot";

  const quotaNote = !hasVideoAccess
    ? "Video generation is disabled for your account."
    : effectiveVideoQuota
      ? atLimit
        ? `Daily limit reached (${effectiveVideoQuota.used} of ${effectiveVideoQuota.limit}) — resets at midnight UTC`
        : `${effectiveVideoQuota.used} of ${effectiveVideoQuota.limit} video renders used today`
      : null;

  const showGeneratedPicker = Boolean(playbackUrl) && !busy;
  const showOpeningPicker =
    isFirst &&
    !showGeneratedPicker &&
    !playbackUrl &&
    (selected.status === "draft" || selected.status === "error");

  if (!hydrated) {
    return <div className="beam" />;
  }

  return (
    <form className="film-studio" onSubmit={onSubmit}>
      <ShotList
        shots={project.shots}
        selectedId={selected.id}
        onSelect={(id) => {
          patchProject({ selectedShotId: id });
          setError(null);
        }}
        onRemove={onRemoveShot}
        onContinue={onContinue}
        canContinue={canContinue}
        continueDisabledReason={continueReason}
        busy={pipelineBusy}
        busyShotId={activeShotId}
      />

      <div className="film-stage">
        {showOpeningPicker && (
          <>
            <div className="film-mode-toggle" role="tablist" aria-label="Opening source">
              <button
                type="button"
                role="tab"
                aria-selected={project.openingSource === "text"}
                className={project.openingSource === "text" ? "is-active" : ""}
                onClick={() => setOpeningSource("text")}
                disabled={busy}
              >
                Text
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={project.openingSource === "image"}
                className={project.openingSource === "image" ? "is-active" : ""}
                onClick={() => setOpeningSource("image")}
                disabled={busy}
              >
                Image
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={project.openingSource === "video"}
                className={project.openingSource === "video" ? "is-active" : ""}
                onClick={() => setOpeningSource("video")}
                disabled={busy}
              >
                Video
              </button>
            </div>

            {project.openingSource === "image" && (
              <ImageDrop image={openingImage} onImage={setOpeningImage} onError={setError} disabled={busy} />
            )}
            {project.openingSource === "video" && (
              <VideoDrop
                hasVideo={Boolean(importVideoUrl)}
                onFile={(file) => {
                  if (importVideoUrlRef.current) URL.revokeObjectURL(importVideoUrlRef.current);
                  const url = URL.createObjectURL(file);
                  importVideoUrlRef.current = url;
                  setImportVideoUrl(url);
                  setImportPickTime(null);
                  patchShot(selected.id, { firstFrameFilename: null });
                }}
                onClear={() => {
                  if (importVideoUrlRef.current) URL.revokeObjectURL(importVideoUrlRef.current);
                  importVideoUrlRef.current = null;
                  setImportVideoUrl(null);
                  setImportPickTime(null);
                  patchShot(selected.id, { firstFrameFilename: null });
                }}
                onError={setError}
                disabled={busy}
              />
            )}
          </>
        )}

        {showGeneratedPicker && playbackUrl ? (
          <AnchorPicker
            videoUrl={playbackUrl}
            durationSeconds={selected.durationSeconds}
            dimensions={
              selected.width && selected.height
                ? { width: selected.width, height: selected.height }
                : dimensions
            }
            trimEndSeconds={selected.trimEndSeconds}
            onTrim={(seconds) => {
              const duration = actualDuration(selected.durationSeconds);
              const next = snapTime(seconds, duration);
              const suggested = Math.min(
                defaultAnchorTime(duration),
                Math.max(0, duration - next - 8 / 24),
              );
              const shouldMove =
                selected.anchorFrameTime === null || selected.anchorFrameTime > duration - next;
              patchShot(selected.id, {
                trimEndSeconds: next,
                ...(shouldMove ? { anchorFrameTime: suggested } : {}),
              });
            }}
            anchorTime={selected.anchorFrameTime}
            onAnchorTime={(time) => {
              const stale = selected.anchorFilename && selected.anchorFrameTime !== time;
              patchShot(selected.id, {
                anchorFrameTime: time,
                ...(stale ? { anchorFilename: null } : {}),
              });
              if (stale) setAnchorReady(false);
            }}
            onConfirm={advanceWithFrame}
            confirming={confirming}
            disabled={busy}
          />
        ) : showOpeningPicker && project.openingSource === "video" && importVideoUrl ? (
          <AnchorPicker
            videoUrl={importVideoUrl}
            durationSeconds={selected.durationSeconds}
            dimensions={dimensions}
            trimEndSeconds={0}
            onTrim={() => {}}
            anchorTime={importPickTime}
            onAnchorTime={setImportPickTime}
            onConfirm={advanceWithFrame}
            confirming={confirming}
            disabled={busy}
            importMode
          />
        ) : (
          <AspectFrame
            dimensions={
              selected.width && selected.height
                ? { width: selected.width, height: selected.height }
                : dimensions
            }
            imageUrl={
              firstFramePreviews[selected.id] ?? openingPreview ?? openingImage?.url
            }
            videoUrl={playbackUrl}
            rendering={busy}
            caption={`${snapped.toFixed(2)}s · 24 fps`}
            placeholder={
              selected.firstFrameFilename
                ? "Image to video — this still is the first frame"
                : isFirst
                  ? "First shot will appear here"
                  : "This shot will appear here"
            }
          />
        )}

        {status === "queued" && queueAt && activeShotId === selected.id && (
          <div className="queue-panel" role="status">
            <p className="queue-position">
              <strong>{queueAt.position}</strong> of {queueAt.total} in the queue
            </p>
            <p className="queue-note">Same GPU queue as the rest of the studio. This shot costs 1 render.</p>
            <div className="beam" />
            <button type="button" className="queue-cancel" onClick={onCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel this render"}
            </button>
          </div>
        )}

        {busy && status !== "queued" && (
          <div className="status-line" role="status">
            {status === "uploading" && "Uploading frame to the render server…"}
            {status === "queuing" && "Adding to the queue…"}
            {status === "rendering" && "Rendering on the GPU — this can take a few minutes…"}
          </div>
        )}

        {selected.status === "draft" && selected.firstFrameFilename && !playbackUrl && (
          <p className="film-anchor-saved">Opening frame loaded. Write the action, then generate.</p>
        )}

        {status === "error" && error && <div className="error-box">{error}</div>}
      </div>

      <div className="film-desk-col panel">
        <h2 className="film-col-title">Shot {selectedIndex + 1}</h2>
        <PromptDesk
          styleBible={project.styleBible}
          onStyleBible={(value) => patchProject({ styleBible: value })}
          context={project.lockedContext}
          onContext={(value) => patchProject({ lockedContext: value })}
          promptMode={selected.promptMode}
          onPromptMode={(mode) => patchShot(selected.id, { promptMode: mode })}
          simplePrompt={selected.simplePrompt}
          onSimplePrompt={(value) => patchShot(selected.id, { simplePrompt: value })}
          spans={selected.actionSpans}
          onSpans={(spans) => patchShot(selected.id, { actionSpans: spans })}
          ambience={selected.ambience}
          onAmbience={(value) => patchShot(selected.id, { ambience: value })}
          duration={selected.durationSeconds}
          onDuration={(value) => {
            patchShot(selected.id, { durationSeconds: value });
            if (isFirst && selected.status === "draft") patchProject({ durationSeconds: value });
          }}
          ratio={project.aspectRatio}
          onRatio={(value: AspectRatio) => patchProject({ aspectRatio: value })}
          ratioLocked={ratioLocked}
          fast={project.fast}
          onFast={(value) => patchProject({ fast: value })}
          canDisableFastMode={capabilities.canDisableFastMode}
          busy={busy}
          atLimit={atLimit || !hasVideoAccess}
          quotaNote={quotaNote}
          atLimitNote={atLimit || !hasVideoAccess}
          submitLabel={submitLabel}
          costNote="Each shot costs 1 render from today's allowance."
          intent={intent}
          onIntent={setIntent}
          onEnhance={onEnhance}
          enhancing={enhancing}
          enhancerReady={enhancerReady}
        />
        <button
          type="button"
          className="film-reset"
          onClick={resetCanvas}
          disabled={pipelineBusy}
        >
          New sequence
        </button>
      </div>

      <SequencePlayer
        clips={project.shots
          .filter((s) => s.status === "done" && playbackUrls[s.id])
          .map((s) => ({ shot: s, url: playbackUrls[s.id] }))}
      />
    </form>
  );
}
