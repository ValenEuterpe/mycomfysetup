"use client";

import { useCallback, useRef, useState } from "react";

export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

type Props = {
  hasVideo: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
  onError: (message: string | null) => void;
  disabled?: boolean;
};

export default function VideoDrop({ hasVideo, onFile, onClear, onError, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("video/")) {
        onError("That file isn't a video.");
        return;
      }
      if (file.size > MAX_VIDEO_BYTES) {
        onError("Video is too large (80MB max).");
        return;
      }
      onError(null);
      onFile(file);
    },
    [onError, onFile],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    accept(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="field">
      <label htmlFor="film-source-video">Source video</label>
      <div
        className={`drop-zone${dragging ? " drop-zone-hot" : ""}${hasVideo ? " drop-zone-filled" : ""}`}
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
      >
        <input
          ref={inputRef}
          id="film-source-video"
          type="file"
          accept="video/*"
          className="drop-input"
          onChange={(e) => accept(e.target.files?.[0])}
          disabled={disabled}
        />
        {hasVideo ? (
          <div className="drop-filled">
            <span className="drop-filled-hint">Drop another clip to replace</span>
            <button
              type="button"
              className="drop-clear"
              onClick={() => {
                onClear();
                if (inputRef.current) inputRef.current.value = "";
              }}
              disabled={disabled}
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="drop-idle">
            <span className="drop-idle-main">Drop a video here</span>
            <span className="drop-idle-sub">or click to choose · MP4, WebM, MOV · 80MB max</span>
          </div>
        )}
      </div>
      <p className="field-help">Pick a frame from the clip. That still becomes the first frame of shot 1.</p>
    </div>
  );
}
