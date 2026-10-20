import { animaBaseGraph } from "../workflows/animaBase";
import { kromaUpscaleGraph } from "../workflows/kromaUpscale";
import { ComfyWorkflowGraph } from "../../src/types/workflow";

export interface WorkflowInjectSpec {
  /** Node ids receiving the positive prompt text */
  positiveNode: string;
  positiveKey: string;
  /** Fork receiving the negative prompt text (workflow must support it) */
  negativeNode?: string;
  negativeKey: string;
  /** Fork ids to receive the generated seed */
  seedNodes: { node: string; key: string }[];
  /** Optional width/height injection (node must contain literal width/height inputs) */
  sizeNode?: { node: string; widthKey: string; heightKey: string };
}

export interface BotWorkflow {
  id: string;
  displayName: string;
  description: string;
  graph: ComfyWorkflowGraph;
  supportsNegativePrompt: boolean;
  supportsSize: boolean;
  inject: WorkflowInjectSpec;
  /** Node ids whose history outputs contain the final media */
  outputNodes: string[];
}

const WORKFLOWS: BotWorkflow[] = [
  {
    id: "anima",
    displayName: "Anima Base (T2I)",
    description: "Anima base model, 30 steps, 1024x1024 default. Supports negative prompts.",
    graph: animaBaseGraph,
    supportsNegativePrompt: true,
    supportsSize: true,
    inject: {
      positiveNode: "3",
      positiveKey: "text",
      negativeNode: "4",
      negativeKey: "text",
      seedNodes: [{ node: "8", key: "seed" }],
      sizeNode: { node: "6", widthKey: "width", heightKey: "height" },
    },
    outputNodes: ["13"],
  },
  {
    id: "kroma",
    displayName: "Kroma (Krea-2) Upscale",
    description: "Krea-2 generate + upscale pass, 4+8 steps. No negative prompt (distilled, cfg 1).",
    graph: kromaUpscaleGraph,
    supportsNegativePrompt: false,
    supportsSize: false,
    inject: {
      positiveNode: "6",
      positiveKey: "text",
      negativeKey: "text",
      seedNodes: [{ node: "30", key: "seed" }],
    },
    outputNodes: ["19"],
  },
];

export const DEFAULT_WORKFLOW_ID = "anima";

export function getWorkflow(id: string): BotWorkflow | undefined {
  return WORKFLOWS.find((w) => w.id === id.toLowerCase().trim());
}

export function listWorkflows(): { id: string; name: string; description: string; supportsNegativePrompt: boolean }[] {
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
 * Builds a fresh, ready-to-queue API graph for a workflow:
 * injects positive prompt, negative prompt (if supported), seed and optional size.
 */
export function buildInjectedWorkflow(
  wf: BotWorkflow,
  options: {
    positive: string;
    negative?: string;
    seed?: string;
    width?: number;
    height?: number;
  }
): ComfyWorkflowGraph {
  const graph: ComfyWorkflowGraph = JSON.parse(JSON.stringify(wf.graph));

  // Positive prompt
  graph[wf.inject.positiveNode].inputs[wf.inject.positiveKey] = options.positive;

  // Negative prompt (only if this workflow supports it)
  const negNode = wf.inject.negativeNode;
  if (negNode && wf.supportsNegativePrompt) {
    graph[negNode].inputs[wf.inject.negativeKey] =
      options.negative || graph[negNode].inputs[wf.inject.negativeKey] || "";
  }

  // Seed
  const seed = options.seed || generateRandomSeed();
  for (const s of wf.inject.seedNodes) {
    graph[s.node].inputs[s.key] = seed;
  }

  // Size
  if (options.width && options.height && wf.inject.sizeNode) {
    const { node, widthKey, heightKey } = wf.inject.sizeNode;
    const n = graph[node];
    if (n) {
      n.inputs[widthKey] = Math.round(options.width / 8) * 8;
      n.inputs[heightKey] = Math.round(options.height / 8) * 8;
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
