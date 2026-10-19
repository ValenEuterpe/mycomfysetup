/**
 * Client-side frame extract for the filmmaking anchor picker.
 *
 * Seeks are serialized per video element. Two overlapping currentTime writes
 * drop seeked events, which is what left "Reading frames…" and "Saving frame…"
 * spinning forever.
 */

import { Dimensions, FPS } from "@/lib/aspect";

export const UNSTABLE_TAIL_FRAMES = 8;
export const DEFAULT_LOOKBACK_SECONDS = 0.5;
export const STRIP_SECONDS = 2;
export const MAX_TRIM_SECONDS = 2;

const seekQueues = new WeakMap<HTMLVideoElement, Promise<void>>();

export function totalFrames(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 1;
  return Math.max(1, Math.round(durationSeconds * FPS));
}

export function timeToFrame(time: number, durationSeconds: number): number {
  const max = totalFrames(durationSeconds) - 1;
  return Math.min(max, Math.max(0, Math.round(time * FPS)));
}

export function frameToTime(frame: number): number {
  return frame / FPS;
}

export function snapTime(time: number, durationSeconds: number): number {
  return frameToTime(timeToFrame(time, durationSeconds));
}

export function isUnstableTail(time: number, durationSeconds: number): boolean {
  const frame = timeToFrame(time, durationSeconds);
  const last = totalFrames(durationSeconds) - 1;
  return frame > last - UNSTABLE_TAIL_FRAMES;
}

export function defaultAnchorTime(durationSeconds: number): number {
  const last = totalFrames(durationSeconds) - 1;
  const lastStable = Math.max(0, last - UNSTABLE_TAIL_FRAMES);
  const lookback = Math.round(DEFAULT_LOOKBACK_SECONDS * FPS);
  const preferred = Math.max(0, last - lookback);
  return frameToTime(Math.min(preferred, lastStable));
}

export function stripStartTime(durationSeconds: number, fullClip = false): number {
  if (fullClip) return 0;
  return Math.max(0, durationSeconds - STRIP_SECONDS);
}

function waitForData(video: HTMLVideoElement, timeoutMs = 8000): Promise<void> {
  if (video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Couldn't load the clip for frame picking."));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      if (video.readyState >= 2) resolve();
      else reject(new Error("The video didn't load in time. Try another file."));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", onError);
    video.load();
  });
}

function seekOnce(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = Math.min(Math.max(0, time), Number.isFinite(video.duration) ? video.duration : time);
    if (video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.04) {
      resolve();
      return;
    }

    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Couldn't seek the video."));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      if (Math.abs(video.currentTime - target) < 0.12) resolve();
      else reject(new Error("Seek timed out."));
    }, 2500);

    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    video.currentTime = target;
  });
}

export function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  const previous = seekQueues.get(video) ?? Promise.resolve();
  const next = previous.then(
    () => seekOnce(video, time),
    () => seekOnce(video, time),
  );
  const tracked = next.catch(() => {});
  seekQueues.set(video, tracked);
  return next;
}

function drawFrame(video: HTMLVideoElement, dimensions: Dimensions): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, dimensions.width);
  canvas.height = Math.max(1, dimensions.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read a frame from the video.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the frame."))),
      type,
    );
  });
}

export async function extractFrame(
  video: HTMLVideoElement,
  time: number,
  dimensions: Dimensions,
): Promise<Blob> {
  await waitForData(video);
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : time;
  await seekTo(video, snapTime(time, duration));
  return canvasToBlob(drawFrame(video, dimensions), "image/png");
}

export type StripThumb = {
  time: number;
  frame: number;
  dataUrl: string;
  unstable: boolean;
};

export async function extractFilmstrip(
  video: HTMLVideoElement,
  durationSeconds: number,
  opts?: {
    fullClip?: boolean;
    markUnstable?: boolean;
    signal?: { cancelled: boolean };
    onProgress?: (done: number, total: number) => void;
  },
): Promise<StripThumb[]> {
  await waitForData(video);
  const duration =
    Number.isFinite(video.duration) && video.duration > 0 ? video.duration : durationSeconds;
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const fullClip = opts?.fullClip === true;
  const markUnstable = opts?.markUnstable !== false;
  const start = stripStartTime(duration, fullClip);
  const startFrame = timeToFrame(start, duration);
  const endFrame = totalFrames(duration) - 1;
  const maxThumbs = fullClip ? 24 : 16;
  const step = Math.max(1, Math.ceil((endFrame - startFrame + 1) / maxThumbs));
  const frames: number[] = [];
  for (let f = startFrame; f <= endFrame; f += step) frames.push(f);
  if (frames[frames.length - 1] !== endFrame) frames.push(endFrame);

  const thumbs: StripThumb[] = [];
  const srcH = video.videoHeight || 90;
  const srcW = video.videoWidth || 160;
  const thumbSize = {
    width: 160,
    height: Math.max(1, Math.round(160 * (srcH / Math.max(1, srcW)))),
  };

  for (let i = 0; i < frames.length; i++) {
    if (opts?.signal?.cancelled) break;
    const frame = frames[i];
    const time = frameToTime(frame);
    try {
      await seekTo(video, time);
      if (opts?.signal?.cancelled) break;
      const canvas = drawFrame(video, thumbSize);
      thumbs.push({
        time,
        frame,
        dataUrl: canvas.toDataURL("image/jpeg", 0.7),
        unstable: markUnstable && isUnstableTail(time, duration),
      });
    } catch {
      /* skip a failed seek rather than aborting the strip */
    }
    opts?.onProgress?.(i + 1, frames.length);
  }

  return thumbs;
}
