// Output geometry and timing, in one place, shared by the browser and the API.
//
// Every number the UI shows a user has to be the number ComfyUI will actually
// produce, otherwise the aspect-ratio preview is decoration. So the two bits of
// arithmetic that decide the output shape are ported here from the nodes that
// own them upstream, and both the client preview and the queued workflow read
// from this module:
//
//   resolveDimensions()  <- comfy_extras/nodes_resolution.py, ResolutionSelector
//   frameCount()         <- comfy_extras/nodes_minimax_h3.py, align_frame_count
//
// If you change MEGAPIXELS or MULTIPLE here, the preview and the render move
// together. Nothing else needs touching.

/**
 * Target output area. 0.4 MP is what the exported workflow was tuned for —
 * 864x480 at 16:9. Raising it raises render time roughly in proportion, which
 * is why it is a constant rather than a user-facing control.
 */
export const MEGAPIXELS = 0.4;

/** Both output axes are rounded to a multiple of this. The model needs 32. */
export const MULTIPLE = 32;

export const FPS = 24;

/**
 * The model's trained duration range. MiniMax H3's frame grid is 17k+5 frames,
 * so a request is snapped up to the next valid count — see frameCount(). 5s
 * becomes 124 frames (5.17s) and 15s becomes 362 frames (15.08s), which is the
 * upstream "trained range is ~124-362" bracket.
 */
export const MIN_DURATION = 5;
export const MAX_DURATION = 15;

// --- Aspect ratios --------------------------------------------------------

/**
 * The strings here are matched exactly against ComfyUI's AspectRatio enum in
 * comfy_extras/nodes_resolution.py. Do not tidy up the wording: an unrecognised
 * value is rejected by the node, not coerced.
 *
 * Ordered widest to tallest so the picker reads as a spectrum.
 */
export const ASPECT_RATIOS = [
  "21:9 (Ultrawide)",
  "16:9 (Widescreen)",
  "4:3 (Standard)",
  "1:1 (Square)",
  "3:4 (Portrait Standard)",
  "9:16 (Portrait Widescreen)",
] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const IMAGE_ASPECT_RATIOS = [
  "1:1 (Square)",
  "9:16 (Portrait)",
  "16:9 (Landscape)",
  "3:4 (Portrait)",
  "4:3 (Landscape)",
] as const;

export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

export const IMAGE_RATIOS: Record<string, Dimensions> = {
  "1:1 (Square)": { width: 1024, height: 1024 },
  "9:16 (Portrait)": { width: 768, height: 1344 },
  "9:16 (Portrait Widescreen)": { width: 768, height: 1344 },
  "16:9 (Landscape)": { width: 1344, height: 768 },
  "16:9 (Widescreen)": { width: 1344, height: 768 },
  "3:4 (Portrait Standard)": { width: 896, height: 1152 },
  "3:4 (Portrait)": { width: 896, height: 1152 },
  "4:3 (Standard)": { width: 1152, height: 896 },
  "4:3 (Landscape)": { width: 1152, height: 896 },
  "2:3 (Portrait Photo)": { width: 832, height: 1216 },
  "3:2 (Photo)": { width: 1216, height: 832 },
  "21:9 (Ultrawide)": { width: 1536, height: 640 },
};

/**
 * Image-to-video only: derive the output shape from the uploaded image's own
 * proportions instead of a preset, so nothing is cropped away. There is no
 * equivalent for text-to-video — with no image there is nothing to measure.
 */
export const AUTO_RATIO = "auto";

export type RatioChoice = AspectRatio | typeof AUTO_RATIO;

export function isAspectRatio(value: unknown): value is AspectRatio {
  return typeof value === "string" && (ASPECT_RATIOS as readonly string[]).includes(value);
}

export function isRatioChoice(value: unknown): value is RatioChoice {
  return value === AUTO_RATIO || isAspectRatio(value);
}

/** The w:h pair behind each label, and a short form for the picker tiles. */
const RATIO_TABLE: Record<AspectRatio, { w: number; h: number; short: string; name: string }> = {
  "21:9 (Ultrawide)": { w: 21, h: 9, short: "21:9", name: "Ultrawide" },
  "16:9 (Widescreen)": { w: 16, h: 9, short: "16:9", name: "Widescreen" },
  "4:3 (Standard)": { w: 4, h: 3, short: "4:3", name: "Standard" },
  "1:1 (Square)": { w: 1, h: 1, short: "1:1", name: "Square" },
  "3:4 (Portrait Standard)": { w: 3, h: 4, short: "3:4", name: "Portrait" },
  "9:16 (Portrait Widescreen)": { w: 9, h: 16, short: "9:16", name: "Tall" },
};

export function ratioLabels(ratio: AspectRatio) {
  return { short: RATIO_TABLE[ratio].short, name: RATIO_TABLE[ratio].name };
}

// --- Resolution -----------------------------------------------------------

export type Dimensions = { width: number; height: number };

/**
 * Python's round(): halfway cases go to the even neighbour, not always up.
 * JavaScript's Math.round() sends 0.5 up, so 2.5 would part company with
 * ComfyUI's 2. It only bites on exact halves, but an exact half is precisely
 * what a clean aspect ratio at a round megapixel target tends to produce.
 */
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * ResolutionSelector.execute(), verbatim. Given a w:h pair and a target area,
 * scale to that area then round each axis to MULTIPLE independently.
 *
 * That independent rounding is why the result is not exactly the ratio you
 * asked for: 4:3 at 0.4 MP lands on 736x576, which is 1.278:1, not 1.333:1.
 * Callers should show and crop to the returned numbers rather than the nominal
 * ratio, or the preview will drift from the render.
 */
function dimensionsFor(w: number, h: number): Dimensions {
  const totalPixels = MEGAPIXELS * 1024 * 1024;
  const scale = Math.sqrt(totalPixels / (w * h));
  return {
    width: Math.max(MULTIPLE, roundHalfEven((w * scale) / MULTIPLE) * MULTIPLE),
    height: Math.max(MULTIPLE, roundHalfEven((h * scale) / MULTIPLE) * MULTIPLE),
  };
}

/** The real pixel size a preset produces. */
export function resolveDimensions(ratio: AspectRatio): Dimensions {
  const { w, h } = RATIO_TABLE[ratio];
  return dimensionsFor(w, h);
}

/**
 * The real pixel size for AUTO_RATIO: the source image's own proportions,
 * rescaled to the standard output area. Feeding pixel counts in as the ratio
 * pair works because dimensionsFor only cares about w/h.
 */
export function dimensionsForImage(imageWidth: number, imageHeight: number): Dimensions {
  return dimensionsFor(imageWidth, imageHeight);
}

/** Largest source dimension we will measure, as a sanity bound on client input. */
export const MAX_IMAGE_EDGE = 16384;

export function isValidImageEdge(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_IMAGE_EDGE;
}

export function aspectOf({ width, height }: Dimensions): number {
  return width / height;
}

// --- Duration -------------------------------------------------------------

/**
 * align_frame_count(): the model only accepts frame counts congruent to 5
 * mod 17, so a request is snapped up to the next one. This replaces the
 * ComfyMathExpression node the exported workflow used to do the same sum, so
 * the queued length is decided here and the UI can state the true duration.
 */
export function frameCount(seconds: number): number {
  let n = Math.max(5, roundHalfEven(seconds * FPS));
  while (n % 17 !== 5) n += 1;
  return n;
}

/** What the requested duration actually becomes, after snapping. Seconds. */
export function actualDuration(seconds: number): number {
  return frameCount(seconds) / FPS;
}

export function isValidDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_DURATION &&
    value <= MAX_DURATION
  );
}
