import { RatioPreset } from "../../src/lib/ratios";

/**
 * Visual cues for aspect ratios in Telegram. Real proportional previews are
 * handled by the ratio reference image (public/aspectratio.jpg); buttons and
 * text lines cue orientation with glyphs.
 */

export function ratioGlyph(r: RatioPreset): string {
  if (r.width === r.height) return "⬜";
  if (r.width > r.height) return "▭"; // landscape
  return "▯"; // portrait
}

/** One-line label: "▭ 16:9 · 1368×768" (✅ replaces the glyph when selected) */
export function ratioLabel(r: RatioPreset, selected = false): string {
  const glyph = selected ? "✅" : ratioGlyph(r);
  return `${glyph} ${r.id} · ${r.width}×${r.height}`;
}
