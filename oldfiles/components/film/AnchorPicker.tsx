"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, FPS, actualDuration } from "@/lib/aspect";
import {
  MAX_TRIM_SECONDS,
  UNSTABLE_TAIL_FRAMES,
  defaultAnchorTime,
  extractFilmstrip,
  extractFrame,
  frameToTime,
  isUnstableTail,
  snapTime,
  stripStartTime,
  timeToFrame,
  totalFrames,
  type StripThumb,
} from "@/lib/film/frames";

type Props = {
  videoUrl: string;
  durationSeconds: number;
  dimensions: Dimensions;
  trimEndSeconds: number;
  onTrim: (seconds: number) => void;
  anchorTime: number | null;
  onAnchorTime: (time: number) => void;
  onConfirm: (blob: Blob, time: number) => Promise<void>;
  confirming: boolean;
  disabled: boolean;
  importMode?: boolean;
  confirmLabel?: string;
};

export default function AnchorPicker({
  videoUrl,
  durationSeconds,
  dimensions,
  trimEndSeconds,
  onTrim,
  anchorTime,
  onAnchorTime,
  onConfirm,
  confirming,
  disabled,
  importMode = false,
  confirmLabel,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [strip, setStrip] = useState<StripThumb[] | null>(null);
  const [stripError, setStripError] = useState<string | null>(null);
  const [loadingStrip, setLoadingStrip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaDuration, setMediaDuration] = useState(durationSeconds);
  const [capturing, setCapturing] = useState(false);
  const stripSignalRef = useRef({ cancelled: false });

  const snappedDuration = importMode
    ? mediaDuration > 0
      ? mediaDuration
      : durationSeconds
    : actualDuration(durationSeconds);
  const lastFrame = totalFrames(snappedDuration) - 1;
  const defaultTime = importMode ? 0 : defaultAnchorTime(snappedDuration);
  const selected = snapTime(anchorTime ?? defaultTime, snappedDuration);
  const selectedFrame = timeToFrame(selected, snappedDuration);
  const unstable = !importMode && isUnstableTail(selected, snappedDuration);
  const stripStart = stripStartTime(snappedDuration, importMode);
  const busy = disabled || confirming || capturing;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onMeta = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) setMediaDuration(video.duration);
    };
    video.addEventListener("loadedmetadata", onMeta);
    if (video.readyState >= 1) onMeta();
    return () => video.removeEventListener("loadedmetadata", onMeta);
  }, [videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const signal = { cancelled: false };
    stripSignalRef.current = signal;
    setStrip(null);
    setStripError(null);
    setLoadingStrip(true);

    const run = async () => {
      try {
        const duration =
          Number.isFinite(video.duration) && video.duration > 0 ? video.duration : snappedDuration;
        const thumbs = await extractFilmstrip(video, duration, {
          fullClip: importMode,
          markUnstable: !importMode,
          signal,
        });
        if (!signal.cancelled) setStrip(thumbs);
      } catch (err: any) {
        if (!signal.cancelled) setStripError(err.message ?? "Couldn't build the filmstrip.");
      } finally {
        if (!signal.cancelled) setLoadingStrip(false);
      }
    };

    run();
    return () => {
      signal.cancelled = true;
    };
  }, [videoUrl, importMode]);

  const pick = useCallback(
    (time: number) => {
      const snapped = snapTime(time, snappedDuration);
      onAnchorTime(snapped);
      const video = videoRef.current;
      if (video) video.currentTime = snapped;
    },
    [onAnchorTime, snappedDuration],
  );

  useEffect(() => {
    if (anchorTime === null) onAnchorTime(defaultTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorTime, defaultTime]);

  const onKey = (e: React.KeyboardEvent) => {
    if (busy) return;
    const step = e.shiftKey ? 6 : 1;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      pick(frameToTime(Math.max(0, selectedFrame - step)));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      pick(frameToTime(Math.min(lastFrame, selectedFrame + step)));
    }
  };

  const confirm = async () => {
    const video = videoRef.current;
    if (!video || capturing || confirming) return;
    setError(null);
    setCapturing(true);
    stripSignalRef.current.cancelled = true;
    setLoadingStrip(false);
    try {
      const blob = await extractFrame(video, selected, dimensions);
      await onConfirm(blob, selected);
    } catch (err: any) {
      setError(err.message ?? "Couldn't capture that frame.");
    } finally {
      setCapturing(false);
    }
  };

  const maxTrim = Math.min(MAX_TRIM_SECONDS, Math.max(0, snappedDuration - 1));
  const trimPct = importMode || snappedDuration <= 0 ? 0 : (trimEndSeconds / snappedDuration) * 100;
  const unstablePct = importMode || lastFrame < 1 ? 0 : (UNSTABLE_TAIL_FRAMES / (lastFrame + 1)) * 100;
  const selectedPct = snappedDuration > 0 ? (selected / snappedDuration) * 100 : 0;
  const defaultPct = snappedDuration > 0 ? (defaultTime / snappedDuration) * 100 : 0;

  const reason = useMemo(() => {
    if (importMode) return "This frame becomes the first frame of the next shot.";
    if (unstable) return "This is in the last 8 frames — often smeared or flickery. Usable, not recommended.";
    if (Math.abs(selected - defaultTime) < 1 / FPS) {
      return "Recommended — ~0.5s before the end, outside the unstable tail.";
    }
    return "Custom pick. The next clip will open on this exact frame.";
  }, [importMode, unstable, selected, defaultTime]);

  const saving = confirming || capturing;

  return (
    <div className="film-anchor" onKeyDown={onKey} tabIndex={0} aria-label="Anchor frame picker">
      <video
        ref={videoRef}
        className="film-anchor-player"
        src={videoUrl}
        controls
        playsInline
        muted={importMode}
        preload="auto"
      />

      <div className="film-anchor-readout">
        <span>
          {selected.toFixed(2)}s · frame {selectedFrame + 1} / {lastFrame + 1}
        </span>
        <span className="film-anchor-hint">← → frame · Shift 0.25s</span>
      </div>

      <div className="film-scrub-wrap">
        <div className="film-scrub-track" aria-hidden="true">
          {unstablePct > 0 && <span className="film-scrub-unstable" style={{ width: `${unstablePct}%` }} />}
          {trimPct > 0 && <span className="film-scrub-trim" style={{ width: `${trimPct}%` }} />}
          <span className="film-scrub-default" style={{ left: `${defaultPct}%` }} title="Recommended" />
          <span className="film-scrub-playhead" style={{ left: `${selectedPct}%` }} />
        </div>
        <input
          type="range"
          className="film-scrub"
          min={0}
          max={Math.max(0, lastFrame)}
          step={1}
          value={selectedFrame}
          onChange={(e) => pick(frameToTime(Number(e.target.value)))}
          disabled={busy}
          aria-label="Anchor frame"
        />
      </div>

      <div className="film-strip" role="listbox" aria-label={importMode ? "Clip frames" : "Tail frames"}>
        {loadingStrip && <p className="field-help">Reading frames… you can still pick and save from the player.</p>}
        {stripError && <p className="field-help">{stripError}</p>}
        {strip &&
          strip.map((thumb) => (
            <button
              key={thumb.frame}
              type="button"
              role="option"
              aria-selected={thumb.frame === selectedFrame}
              className={`film-thumb${thumb.unstable ? " is-unstable" : ""}${
                Math.abs(thumb.time - selected) < 1 / FPS ? " is-selected" : ""
              }${!importMode && Math.abs(thumb.time - defaultTime) < 2 / FPS ? " is-recommended" : ""}`}
              onClick={() => pick(thumb.time)}
              disabled={busy}
              title={`${thumb.time.toFixed(2)}s${thumb.unstable ? " · unstable tail" : ""}`}
            >
              <img src={thumb.dataUrl} alt="" />
            </button>
          ))}
      </div>
      {strip && !importMode && stripStart > 0 && (
        <p className="field-help">Showing the last {Math.min(2, snappedDuration).toFixed(1)}s of the clip.</p>
      )}

      {!importMode && (
        <div className="field">
          <label htmlFor="film-trim">Trim tail — {trimEndSeconds.toFixed(2)}s</label>
          <input
            id="film-trim"
            type="range"
            className="duration-slider"
            min={0}
            max={maxTrim}
            step={1 / FPS}
            value={trimEndSeconds}
            onChange={(e) => onTrim(Number(e.target.value))}
            disabled={busy}
          />
          <p className="field-help">
            Playback only. Does not change the next generation. Default anchor sits just before a trim when you set one.
          </p>
        </div>
      )}

      <p className={`film-anchor-reason${unstable ? " is-warn" : ""}`}>{reason}</p>

      <button type="button" className="film-use-frame" onClick={confirm} disabled={busy}>
        {saving
          ? "Saving frame…"
          : confirmLabel ?? "Use this frame for the next shot"}
      </button>
      {error && <div className="error-box">{error}</div>}
    </div>
  );
}
