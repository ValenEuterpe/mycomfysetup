"use client";

/**
 * The output frame: one box, always at the exact shape the render will be, whose
 * contents change with the job's state.
 *
 * It exists because a dropdown reading "9:16 (Portrait Widescreen)" tells you
 * nothing about what you are about to spend a render on. The frame is drawn from
 * the real pixel dimensions rather than the nominal ratio — 4:3 at 0.4 MP is
 * 736x576, which is 1.278:1, not 1.333:1 — so what is on screen is what comes
 * back.
 *
 * The same element persists across idle, rendering and done. Only its contents
 * swap, so the page never jumps at the moment a result arrives.
 */

import { Dimensions } from "@/lib/aspect";

export type FrameState = "empty" | "image" | "rendering" | "done";

type Props = {
  dimensions: Dimensions;
  /** Cropped source preview, for image-to-video. */
  imageUrl?: string | null;
  /** Finished render url (video or image). Takes precedence over imageUrl once present. */
  videoUrl?: string | null;
  rendering?: boolean;
  /** Shown in the empty state, e.g. "Your video will appear here". */
  placeholder?: string;
  /** Duration caption under the frame, already rounded for display. */
  caption?: string;
  /** Force output media type: "video" or "image". If omitted, checks file extension or defaults to video. */
  mediaType?: "video" | "image";
};

export default function AspectFrame({
  dimensions,
  imageUrl,
  videoUrl,
  rendering = false,
  placeholder = "Your video will appear here",
  caption,
  mediaType,
}: Props) {
  const { width, height } = dimensions;
  const state: FrameState = videoUrl ? "done" : rendering ? "rendering" : imageUrl ? "image" : "empty";
  const isImageResult =
    mediaType === "image" ||
    (typeof videoUrl === "string" && /\.(png|jpe?g|webp|gif)($|\?)/i.test(videoUrl));

  return (
    // The width cap lives on the wrapper rather than the frame so the dimension
    // caption below lines up with the frame's edges instead of the column's.
    //
    // It caps width, not height: with `aspect-ratio` set, a max-height would
    // squash the box out of shape while width stayed at 100%. Capping width at
    // the height limit times the ratio bounds the height instead and keeps the
    // proportions exact, which is what stops a 9:16 frame running off the bottom
    // of the screen.
    <div className="aspect-output" style={{ maxWidth: `calc(70vh * ${width} / ${height})` }}>
      <div
        className={`aspect-frame aspect-frame-${state}`}
        // The frame's shape comes from the numbers themselves, so it cannot
        // disagree with the label beneath it.
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {state === "done" && videoUrl && (
          isImageResult ? (
            <img className="aspect-media" src={videoUrl} alt="Generated output" />
          ) : (
            <video className="aspect-media" src={videoUrl} controls autoPlay loop playsInline />
          )
        )}

        {/* The source image stays mounted while rendering, dimmed, so there is
            something to look at during the wait instead of an empty box. */}
        {state !== "done" && imageUrl && (
          <img className="aspect-media" src={imageUrl} alt="Source frame preview" />
        )}

        {state === "rendering" && (
          <div className="aspect-overlay">
            <div className="beam" style={{ maxWidth: 160 }} />
          </div>
        )}

        {state === "empty" && (
          <div className="aspect-empty">
            <span className="aspect-empty-dims">
              {width} &times; {height}
            </span>
            <span className="aspect-empty-hint">{placeholder}</span>
          </div>
        )}
      </div>

      <div className="aspect-meta">
        <span className="aspect-meta-dims">
          {width} &times; {height}
        </span>
        {caption && <span className="aspect-meta-caption">{caption}</span>}
      </div>
    </div>
  );
}
