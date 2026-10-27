import { animaBaseGraph } from "../workflows/animaBase";
import { kromaUpscaleGraph } from "../workflows/kromaUpscale";
import { animaStickerGraph } from "../workflows/animaSticker";
import { ComfyWorkflowGraph } from "../../src/types/workflow";
import { RATIO_PRESETS, RatioPreset, findRatio } from "../../src/lib/ratios";

// Canonical ratio list is shared with the web studio (src/lib/ratios.ts)
export { RATIO_PRESETS as RATIO_OPTIONS };
export type { RatioPreset as RatioOption };

export function listRatios(): RatioPreset[] {
  return RATIO_PRESETS;
}

export function resolveRatio(id: string): RatioPreset | undefined {
  return findRatio(id);
}

export interface WorkflowInjectSpec {
  /** Node ids receiving the positive prompt text */
  positiveNode: string;
  positiveKey: string;
  /** Fork receiving the negative prompt text (workflow must support it) */
  negativeNode?: string;
  negativeKey: string;
  /** Fork ids to receive the generated seed */
  seedNodes: { node: string; key: string }[];
  /**
   * Latent image node whose width/height inputs can be overridden with
   * literal values for aspect-ratio control. The literal value replaces
   * any wired input (e.g. kroma's ResolutionSelector links).
   */
  latentNode: { node: string; widthKey: string; heightKey: string };
}

export interface BotWorkflow {
  id: string;
  displayName: string;
  description: string;
  graph: ComfyWorkflowGraph;
  supportsNegativePrompt: boolean;
  supportsSize: boolean;
  /** Optional quality/character prefix prepended to user prompts via the bot */
  prefillDefault?: string;
  /** Optional negative prompt fallback used when the run supplies none */
  negativeDefault?: string;
  inject: WorkflowInjectSpec;
  /** Node ids whose history outputs contain the final media */
  outputNodes: string[];
}

export const ANIMA_PREFILL = "masterpiece, best quality, score_9, score_8, safe, @silvana,";

export const ANIMA_NEGATIVE =
  "worst quality, low quality, score_1, score_2, score_3, too many fingers, deformed hand, too many arms, ugly, uncanny valley";

const WORKFLOWS: BotWorkflow[] = [
  {
    id: "anima",
    displayName: "Anima Base (T2I)",
    description:
      "Anima base model, 30 steps, ~1MP. Supports negative prompts and ratio control.",
    graph: animaBaseGraph,
    supportsNegativePrompt: true,
    supportsSize: true,
    prefillDefault: ANIMA_PREFILL,
    negativeDefault: ANIMA_NEGATIVE,
    inject: {
      positiveNode: "3",
      positiveKey: "text",
      negativeNode: "4",
      negativeKey: "text",
      seedNodes: [{ node: "8", key: "seed" }],
      latentNode: { node: "6", widthKey: "width", heightKey: "height" },
    },
    outputNodes: ["13"],
  },
  {
    id: "kroma",
    displayName: "Kroma (Krea-2) Upscale",
    description:
      "Krea-2 generate + upscale pass, 4+8 steps. No negative prompt (distilled, cfg 1). Ratio control supported.",
    graph: kromaUpscaleGraph,
    supportsNegativePrompt: false,
    supportsSize: true,
    inject: {
      positiveNode: "6",
      positiveKey: "text",
      negativeKey: "text",
      seedNodes: [{ node: "30", key: "seed" }],
      latentNode: { node: "23", widthKey: "width", heightKey: "height" },
    },
    outputNodes: ["19"],
  },
  {
    id: "anima-sticker",
    displayName: "Anima Sticker (Cutout)",
    description:
      "Anima with RMBG-2.0 background removal and outline sticker highlight. Transparent PNG output.",
    graph: animaStickerGraph,
    supportsNegativePrompt: true,
    supportsSize: true,
    prefillDefault: ANIMA_PREFILL,
    negativeDefault: ANIMA_NEGATIVE,
    inject: {
      positiveNode: "2",
      positiveKey: "text",
      negativeNode: "4",
      negativeKey: "text",
      seedNodes: [{ node: "6", key: "seed" }],
      latentNode: { node: "7", widthKey: "width", heightKey: "height" },
    },
    outputNodes: ["14"],
  },
];

export const DEFAULT_WORKFLOW_ID = "anima";

export function getWorkflow(id: string): BotWorkflow | undefined {
  return WORKFLOWS.find((w) => w.id === id.toLowerCase().trim());
}

export function isAnimaWorkflow(wf: BotWorkflow | string): boolean {
  const id = typeof wf === "string" ? wf.toLowerCase().trim() : wf.id.toLowerCase().trim();
  return id.startsWith("anima");
}

export function supportsWorkflowPrefill(wf: BotWorkflow | string): boolean {
  const workflow = typeof wf === "string" ? getWorkflow(wf) : wf;
  return Boolean(workflow?.prefillDefault);
}

export function supportsWorkflowNegative(wf: BotWorkflow | string): boolean {
  const workflow = typeof wf === "string" ? getWorkflow(wf) : wf;
  return Boolean(workflow?.supportsNegativePrompt);
}

export function listWorkflows(): {
  id: string;
  name: string;
  description: string;
  supportsNegativePrompt: boolean;
}[] {
  return WORKFLOWS.map((w) => ({
    id: w.id,
    name: w.displayName,
    description: w.description,
    supportsNegativePrompt: w.supportsNegativePrompt,
  }));
}

export function generateRandomSeed(): string {
  return String(Math.floor(Math.random() * 281474976710656));
}

/**
 * Joins an optional prefill with the user's positive prompt, keeping the
 * separator clean whether the prefill ends in a comma or not.
 */
export function combinePrefill(prefill: string | undefined, positive: string): string {
  const p = prefill?.trim();
  if (!p) return positive;
  if (p.endsWith(",")) return `${p} ${positive}`;
  return `${p}, ${positive}`;
}

/**
 * Builds a fresh, ready-to-queue API graph for a workflow:
 * injects positive prompt (with optional prefill), negative prompt (if
 * supported), seed and aspect ratio (literal width/height override).
 */
export function buildInjectedWorkflow(
  wf: BotWorkflow,
  options: {
    positive: string;
    negative?: string;
    prefill?: string;
    seed?: string;
    width?: number;
    height?: number;
  }
): ComfyWorkflowGraph {
  const graph: ComfyWorkflowGraph = JSON.parse(JSON.stringify(wf.graph));

  // Positive prompt (prefill applies to every workflow that declares one,
  // i.e. anima; pass a falsy prefill to opt out).
  graph[wf.inject.positiveNode].inputs[wf.inject.positiveKey] = combinePrefill(
    wf.prefillDefault ? options.prefill : undefined,
    options.positive
  );

  // Negative prompt (only if this workflow supports it)
  const negNode = wf.inject.negativeNode;
  if (negNode && wf.supportsNegativePrompt) {
    const fallback = options.negative ?? wf.negativeDefault ?? "";
    graph[negNode].inputs[wf.inject.negativeKey] = fallback;
  }

  // Seed
  const seed = options.seed || generateRandomSeed();
  for (const s of wf.inject.seedNodes) {
    graph[s.node].inputs[s.key] = seed;
  }

  // Aspect ratio: literal width/height replace any wired input on the latent node
  if (options.width && options.height) {
    const { node, widthKey, heightKey } = wf.inject.latentNode;
    const n = graph[node];
    if (n) {
      n.inputs[widthKey] = options.width;
      n.inputs[heightKey] = options.height;
    }
  }

  return graph;
}

/**
 * Parses a raw prompt string into positive/negative.
 * Negative goes after a "|" or "||" separator.
 */
export function splitPrompt(raw: string): { positive: string; negative?: string } {
  const parts = raw.split(/\|\|/).length > 1 ? raw.split(/\|\|/) : raw.split(/\|/);
  const positive = (parts[0] || "").trim();
  const negative = parts[1]?.trim() || undefined;
  return { positive, negative };
}
