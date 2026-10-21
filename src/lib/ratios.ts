/**
 * Canonical aspect-ratio list shared by the web studio AND the Telegram bot
 * (~1MP base, multiples of 8). Dimensions match public/aspectratio.jpg.
 */
export interface RatioPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const RATIO_PRESETS: RatioPreset[] = [
  { id: "1:1", label: "Square / Social", width: 1024, height: 1024 },
  { id: "4:3", label: "Standard", width: 1184, height: 888 },
  { id: "3:2", label: "Photo", width: 1256, height: 832 },
  { id: "16:9", label: "Widescreen", width: 1368, height: 768 },
  { id: "21:9", label: "Ultrawide", width: 1568, height: 672 },
  { id: "3:4", label: "Portrait Standard", width: 888, height: 1184 },
  { id: "2:3", label: "Portrait Photo", width: 840, height: 1248 },
  { id: "9:16", label: "Portrait Widescreen", width: 768, height: 1368 },
  { id: "16:10", label: "Landscape Extended", width: 1296, height: 808 },
  { id: "10:16", label: "Portrait Extended", width: 808, height: 1296 },
  { id: "9:21", label: "Ultra-tall", width: 672, height: 1560 },
];

export function findRatio(id: string): RatioPreset | undefined {
  return RATIO_PRESETS.find((r) => r.id === id.toLowerCase().trim());
}
