import { ComfyWorkflowGraph } from "../types/workflow";
import { RATIO_PRESETS, RatioPreset } from "./ratios";

/**
 * Per-workflow aspect-ratio support, derived from the workflow graph itself:
 *
 * - "free": the graph has a latent/canvas node with literal width+height
 *   inputs (e.g. anima's EmptyLatentImage) → any of the canonical ratios
 *   applies by writing width/height parameter values.
 *
 * - "enum": the graph has a ResolutionSelector node (e.g. kroma) with an
 *   aspect_ratio enum string like "16:9 (Widescreen)" → presets mirror the
 *   node's real dropdown; clicking applies the exact enum string.
 *
 * - "none": no controllable canvas → hide the preset row.
 */

/** Exact enum strings exposed by the ComfyUI ResolutionSelector node. */
const RESOLUTION_SELECTOR_ENUM: { ratio: string; label: string; value: string }[] = [
  { ratio: "1:1", label: "Square", value: "1:1 (Square)" },
  { ratio: "4:3", label: "Standard", value: "4:3 (Standard)" },
  { ratio: "3:2", label: "Photo", value: "3:2 (Photo)" },
  { ratio: "16:9", label: "Widescreen", value: "16:9 (Widescreen)" },
  { ratio: "21:9", label: "Ultrawide", value: "21:9 (Ultrawide)" },
  { ratio: "3:4", label: "Portrait Standard", value: "3:4 (Portrait Standard)" },
  { ratio: "2:3", label: "Portrait Photo", value: "2:3 (Portrait Photo)" },
  { ratio: "9:16", label: "Portrait Widescreen", value: "9:16 (Portrait Widescreen)" },
];

export type RatioSupportMode = "free" | "enum" | "none";

export interface RatioPresetOption extends RatioPreset {
  mode: RatioSupportMode;
  /** For "enum" presets: the exact enum value to write into the node */
  enumValue?: string;
}

export interface RatioSupport {
  mode: RatioSupportMode;
  presets: RatioPresetOption[];
  /** Parameter id of the aspect_ratio input when mode === "enum" */
  aspectRatioParam?: string;
}

/** Literal width+height on any single node unlocks free ratio control. */
function hasLiteralDimensions(graph: ComfyWorkflowGraph): boolean {
  for (const node of Object.values(graph)) {
    if (!node || typeof node !== "object" || !node.inputs) continue;
    const w = node.inputs.width;
    const h = node.inputs.height;
    if (typeof w === "number" && typeof h === "number") return true;
  }
  return false;
}

function enumDims(
  ratioW: number,
  ratioH: number,
  megapixels: number,
  multiple: number
): { width: number; height: number } {
  const area = Math.max(0.1, megapixels) * 1_000_000;
  const m = Math.max(8, multiple || 16);
  const width = Math.round(Math.sqrt(area * (ratioW / ratioH)) / m) * m;
  const height = Math.round(area / width / m) * m;
  return { width: Math.max(m, width), height: Math.max(m, height) };
}

export function getRatioSupportForGraph(
  graph?: ComfyWorkflowGraph | null
): RatioSupport {
  if (!graph) return { mode: "none", presets: [] };

  if (hasLiteralDimensions(graph)) {
    return {
      mode: "free",
      presets: RATIO_PRESETS.map((r) => ({ ...r, mode: "free" as const })),
    };
  }

  if (Object.keys(graph).length === 0) {
    return { mode: "none", presets: [] };
  }

  for (const [nodeId, node] of Object.entries(graph)) {
    if (node?.class_type !== "ResolutionSelector" || !node.inputs) continue;
    const megapixels = typeof node.inputs.megapixels === "number" ? node.inputs.megapixels : 1;
    const multiple = typeof node.inputs.multiple === "number" ? node.inputs.multiple : 16;

    const presets: RatioPresetOption[] = RESOLUTION_SELECTOR_ENUM.map(
      ({ ratio, label, value }) => {
        const [rw, rh] = ratio.split(":").map(Number);
        const { width, height } = enumDims(rw, rh, megapixels, multiple);
        return {
          id: ratio,
          label: `${label} · ${width}×${height}`,
          width,
          height,
          mode: "enum" as const,
          enumValue: value,
        };
      }
    );
    // Preserve the graph's current selection even if not in our table.
    const current = typeof node.inputs.aspect_ratio === "string" ? node.inputs.aspect_ratio : "";
    if (current && !presets.some((p) => p.enumValue === current)) {
      const m = current.match(/^(\d+):(\d+)/);
      if (m) {
        const { width, height } = enumDims(Number(m[1]), Number(m[2]), megapixels, multiple);
        presets.push({
          id: current,
          label: `${current} · ${width}×${height}`,
          width,
          height,
          mode: "enum",
          enumValue: current,
        });
      }
    }

    return {
      mode: "enum",
      presets,
      aspectRatioParam: `${nodeId}.aspect_ratio`,
    };
  }

  return { mode: "none", presets: [] };
}
