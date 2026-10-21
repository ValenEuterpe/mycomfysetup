import { RatioOption } from "./workflows";

/**
 * Visual helpers for aspect ratios: Telegram buttons can't draw real
 * proportional shapes, so we cue orientation with glyphs and render true
 * proportion diagrams in monospace (<code>) message blocks.
 */

export function ratioGlyph(r: RatioOption): string {
  if (r.width === r.height) return "⬜";
  if (r.width > r.height) return "▭"; // landscape
  return "▯"; // portrait
}

/**
 * Builds a monospace block diagram that visually reflects the ratio's
 * proportions. Corrected for the ~1:2 width:height aspect of terminal
 * characters: visual ratio = cols : (rows * 2). A tiny search derives the
 * best (cols, rows) pair so the drawn box matches width:height closely.
 */
export function ratioDiagram(r: RatioOption): string {
  const target = r.width / r.height;
  if (Math.abs(target - 1) < 0.05) {
    return ["█".repeat(8), "█".repeat(8), "█".repeat(8), "█".repeat(8)].join("\n");
  }

  const landscape = target > 1;
  const baseRows = landscape ? Math.max(2, Math.round(8 / target)) : 7;
  let best = { cols: 1, rows: 1, err: Number.POSITIVE_INFINITY };

  for (const rowsDelta of [-1, 0, 1]) {
    const rows = baseRows + rowsDelta;
    if (rows < 1 || rows > 8) continue;
    if (landscape && rows * 2 > 12) continue; // keep landscape boxes low
    const cols = Math.round(rows * 2 * target);
    if (cols < 3 || cols > 18) continue;
    const err = Math.abs(cols / (rows * 2) - target);
    if (err < best.err) best = { cols, rows, err };
  }

  const line = "█".repeat(best.cols);
  return Array.from({ length: best.rows }, () => line).join("\n");
}

/** One-line label: "▭ 16:9 · 1368×768" (✅ replaces the glyph when selected) */
export function ratioLabel(r: RatioOption, selected = false): string {
  const glyph = selected ? "✅" : ratioGlyph(r);
  return `${glyph} ${r.id} · ${r.width}×${r.height}`;
}

/** Full cheat-sheet block: every ratio as label + proportional diagram. */
export function ratioGallery(ratios: RatioOption[]): string {
  return ratios
    .map((r) => `${ratioLabel(r)}\n${ratioDiagram(r)}`)
    .join("\n\n");
}
