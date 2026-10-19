// Client-side cover-crop, run before upload.
//
// Why crop here rather than let the render do it: MiniMaxH3ImageToVideo resizes
// its first_frame with cropping disabled — a plain stretch to the canvas — so an
// image whose proportions differ from the chosen output shape arrives visibly
// squashed. Cropping to the exact output dimensions first makes that stretch a
// no-op, and means the preview in the frame is the frame the model receives.
//
// Browser-only: needs Image, canvas and URL.createObjectURL.

import { Dimensions, MAX_IMAGE_EDGE } from "./aspect";

export type LoadedImage = {
  element: HTMLImageElement;
  /** Intrinsic pixel size, which is what the output shape is derived from. */
  width: number;
  height: number;
  /** Object URL backing `element`. Caller owns it — revoke when finished. */
  url: string;
};

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Decode a file far enough to read its intrinsic dimensions. */
export function loadImage(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = new Image();

    element.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = element;
      if (!width || !height) {
        URL.revokeObjectURL(url);
        reject(new Error("That image has no readable dimensions."));
        return;
      }
      if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) {
        URL.revokeObjectURL(url);
        reject(new Error(`Image is too large (max ${MAX_IMAGE_EDGE}px per side).`));
        return;
      }
      resolve({ element, width, height, url });
    };

    element.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };

    element.src = url;
  });
}

/**
 * The source rectangle a centred cover-crop takes: scale to fill the target,
 * then trim the overflowing axis equally from both sides.
 *
 * Exported because the preview and the upload have to agree on it exactly — the
 * whole point of cropping client-side is that the two are the same operation.
 *
 * Note that "same shape" means the target's real dimensions, not its nominal
 * ratio, so a 1920x1080 photo into 864x480 does lose 13 rows: 864/480 is 1.800
 * after the 32-rounding, while 1920x1080 is 1.7778. Small, but it is a crop, and
 * the preview shows it.
 */
export function coverCropRect(source: Dimensions, target: Dimensions) {
  const sourceAspect = source.width / source.height;
  const targetAspect = target.width / target.height;

  // Each axis is clamped to at least 1 and to the source's extent. Rounding on a
  // very small or very lopsided source can otherwise produce a zero-sized or
  // out-of-bounds rectangle, which makes drawImage throw.
  if (sourceAspect > targetAspect) {
    // Source is wider: full height, trim left and right.
    const width = Math.min(source.width, Math.max(1, Math.round(source.height * targetAspect)));
    return { x: Math.round((source.width - width) / 2), y: 0, width, height: source.height };
  }
  // Source is taller (or equal): full width, trim top and bottom.
  const height = Math.min(source.height, Math.max(1, Math.round(source.width / targetAspect)));
  return { x: 0, y: Math.round((source.height - height) / 2), width: source.width, height };
}

/**
 * Draw the cover-crop at exactly the output dimensions.
 *
 * PNG, not JPEG: at 0.4 MP the file is small either way, and the first frame
 * anchors the whole clip's geometry, so it is not worth feeding the model
 * compression artefacts to save a few hundred kilobytes.
 *
 * A source smaller than the target is upscaled. That is not a loss of fidelity
 * introduced here — the render would have upscaled it regardless.
 */
export async function cropToBlob(image: LoadedImage, target: Dimensions): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the image for upload.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Transparency would otherwise composite as black; the model drops the alpha
  // channel anyway, so flatten onto white deliberately rather than by accident.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, target.width, target.height);

  const rect = coverCropRect({ width: image.width, height: image.height }, target);
  ctx.drawImage(
    image.element,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    target.width,
    target.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the cropped image."))),
      "image/png",
    );
  });
}

/** Validate before decoding, so an obviously wrong file fails fast. */
export function rejectionReason(file: File): string | null {
  if (!file.type.startsWith("image/")) return "That file isn't an image.";
  if (file.size > MAX_UPLOAD_BYTES) return "Image is too large (15MB max).";
  return null;
}
