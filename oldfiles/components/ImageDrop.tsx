"use client";

/**
 * Source image input: a drop zone that also accepts a click, plus the state the
 * rest of the form needs from the file.
 *
 * It reports the decoded image upward rather than the raw File, because two
 * things downstream depend on its intrinsic dimensions: the Auto ratio option,
 * which derives the output shape from them, and the crop, which needs the
 * decoded element anyway. Decoding once here avoids doing it again per preview.
 */

import { useCallback, useRef, useState } from "react";
import { LoadedImage, loadImage, rejectionReason } from "@/lib/crop";

type Props = {
  image: LoadedImage | null;
  onImage: (image: LoadedImage | null) => void;
  /** Surfaced through the form's own error box, so there is one place errors appear. */
  onError: (message: string | null) => void;
  disabled?: boolean;
};

export default function ImageDrop({ image, onImage, onError, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;

      const reason = rejectionReason(file);
      if (reason) {
        onError(reason);
        return;
      }

      try {
        const loaded = await loadImage(file);
        onError(null);
        onImage(loaded);
      } catch (err: any) {
        onError(err.message ?? "Could not read that image.");
      }
    },
    [onError, onImage],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    accept(e.dataTransfer.files?.[0]);
  };

  const onDragOver = (e: React.DragEvent) => {
    // Without this the browser navigates to the dropped file.
    e.preventDefault();
    if (!disabled) setDragging(true);
  };

  const clear = () => {
    onImage(null);
    onError(null);
    // Without this, re-picking the same file fires no change event.
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="field">
      <label htmlFor="image">Source image</label>

      <div
        className={`drop-zone${dragging ? " drop-zone-hot" : ""}${image ? " drop-zone-filled" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
      >
        <input
          ref={inputRef}
          id="image"
          type="file"
          accept="image/*"
          className="drop-input"
          onChange={(e) => accept(e.target.files?.[0])}
          disabled={disabled}
        />

        {image ? (
          <div className="drop-filled">
            <span className="drop-filled-dims">
              {image.width} &times; {image.height}
            </span>
            <span className="drop-filled-hint">Drop another image to replace</span>
            <button type="button" className="drop-clear" onClick={clear} disabled={disabled}>
              Remove
            </button>
          </div>
        ) : (
          <div className="drop-idle">
            <span className="drop-idle-main">Drop an image here</span>
            <span className="drop-idle-sub">or click to choose &middot; PNG, JPG, WebP &middot; 15MB max</span>
          </div>
        )}
      </div>

      {/* The crop is silent otherwise, and a user who sees their photo's edges
          missing from the preview deserves to know why. */}
      {image && (
        <p className="field-help">
          Cropped from the centre to fit the selected shape. Pick <strong>Auto</strong> to keep the whole
          frame.
        </p>
      )}
    </div>
  );
}
