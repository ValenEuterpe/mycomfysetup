"use client";

/**
 * The aspect ratio picker: one tile per option, each drawn at the shape it
 * produces.
 *
 * Replaces a <select> whose options were pure text. The tiles are sized from the
 * same real pixel dimensions as the output frame, so a tile is a scale model of
 * the result rather than an illustration of the nominal ratio.
 *
 * Keyboard behaviour follows the ARIA radio group pattern: one tab stop for the
 * whole group, arrows move between options and select as they go, Home and End
 * jump to the ends.
 */

import { useRef } from "react";
import {
  AUTO_RATIO,
  ASPECT_RATIOS,
  AspectRatio,
  Dimensions,
  RatioChoice,
  ratioLabels,
  resolveDimensions,
} from "@/lib/aspect";

/** Longest edge of a tile's shape, in px. Everything scales inside this. */
const TILE_EDGE = 38;

type Props = {
  value: RatioChoice;
  onChange: (value: RatioChoice) => void;
  disabled?: boolean;
  /**
   * Adds an "Auto" option that takes its shape from the uploaded image, so
   * nothing is cropped. Image-to-video only — with no image there is nothing to
   * measure.
   */
  showAuto?: boolean;
  /** Output shape Auto would produce, once an image has been measured. */
  autoDimensions?: Dimensions | null;
};

/** Scale a shape down so its longest edge is TILE_EDGE. */
function tileSize({ width, height }: Dimensions) {
  const scale = TILE_EDGE / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export default function RatioPicker({
  value,
  onChange,
  disabled = false,
  showAuto = false,
  autoDimensions = null,
}: Props) {
  const groupRef = useRef<HTMLDivElement>(null);

  const options: RatioChoice[] = showAuto ? [AUTO_RATIO, ...ASPECT_RATIOS] : [...ASPECT_RATIOS];

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;

    let next: RatioChoice | null = null;
    if (delta !== 0) {
      const i = options.indexOf(value);
      // Wraps, per the radio group pattern.
      next = options[(i + delta + options.length) % options.length];
    } else if (e.key === "Home") {
      next = options[0];
    } else if (e.key === "End") {
      next = options[options.length - 1];
    }

    if (next === null) return;
    e.preventDefault();
    onChange(next);
    // Selection follows focus here, so move focus to match.
    const idx = options.indexOf(next);
    const tiles = groupRef.current?.querySelectorAll<HTMLButtonElement>("[role='radio']");
    tiles?.[idx]?.focus();
  };

  return (
    <div
      ref={groupRef}
      className="ratio-grid"
      role="radiogroup"
      aria-labelledby="ratio-label"
      onKeyDown={onKeyDown}
    >
      {options.map((option) => {
        const selected = option === value;
        const isAuto = option === AUTO_RATIO;

        // Auto has no fixed shape. Before an image is measured it shows a
        // neutral square; after, the shape that image will produce.
        const dimensions = isAuto
          ? autoDimensions ?? { width: 1, height: 1 }
          : resolveDimensions(option as AspectRatio);
        const shape = tileSize(dimensions);
        const labels = isAuto
          ? { short: "Auto", name: "Match image" }
          : ratioLabels(option as AspectRatio);

        // Auto's real dimensions are unknown until an image lands, so the
        // caption stays honest rather than showing a placeholder size.
        const dimsText = isAuto
          ? autoDimensions
            ? `${autoDimensions.width}\u00d7${autoDimensions.height}`
            : "from image"
          : `${dimensions.width}\u00d7${dimensions.height}`;

        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            // Roving tabindex: only the selected tile is in the tab order.
            tabIndex={selected ? 0 : -1}
            className={selected ? "ratio-tile ratio-tile-on" : "ratio-tile"}
            onClick={() => onChange(option)}
            disabled={disabled}
            title={isAuto ? "Match the uploaded image's shape" : option}
          >
            <span className="ratio-shape-box">
              <span
                className="ratio-shape"
                style={{ width: shape.width, height: shape.height }}
                aria-hidden="true"
              />
            </span>
            <span className="ratio-short">{labels.short}</span>
            <span className="ratio-dims">{dimsText}</span>
            {/* The descriptive name is for screen readers; the tile shows the
                short form to stay legible at six across. */}
            <span className="sr-only">{labels.name}</span>
          </button>
        );
      })}
    </div>
  );
}
