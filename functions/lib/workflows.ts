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

export interface ParameterDef {
  name: string;
  type: "string" | "number" | "integer" | "boolean" | "select";
  default?: any;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  description: string;
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
  /** Nodes receiving sampling steps (e.g. KSampler) */
  stepsNodes?: { node: string; key: string }[];
  /** Nodes receiving CFG scale */
  cfgNodes?: { node: string; key: string }[];
  /** Nodes receiving sampler algorithm name */
  samplerNodes?: { node: string; key: string }[];
  /** Nodes receiving scheduler algorithm name */
  schedulerNodes?: { node: string; key: string }[];
  /** Nodes receiving denoise level */
  denoiseNodes?: { node: string; key: string }[];

  // Sticker-specific injection
  stickerThicknessNode?: { node: string; key: string };
  stickerColorNode?: { node: string; key: string };
  stickerSensitivityNode?: { node: string; key: string };

  // Kroma upscale-specific injection
  upscaleStepsNode?: { node: string; key: string };
  upscaleDenoiseNode?: { node: string; key: string };
  upscaleFactorNode?: { node: string; key: string };
}

export interface BotWorkflow {
  id: string;
  aliases: string[];
  displayName: string;
  description: string;
  graph: ComfyWorkflowGraph;
  supportsNegativePrompt: boolean;
  supportsSize: boolean;
  supportsPrefill: boolean;
  /** Optional quality/character prefix prepended to user prompts via the bot */
  prefillDefault?: string;
  /** Optional negative prompt fallback used when the run supplies none */
  negativeDefault?: string;
  defaultSteps: number;
  defaultCfg: number;
  defaultSampler: string;
  defaultScheduler: string;
  parameters: ParameterDef[];
  inject: WorkflowInjectSpec;
  /** Node ids whose history outputs contain the final media */
  outputNodes: string[];
}

export const ANIMA_PREFILL = "masterpiece, best quality, score_9, score_8, safe, @silvana,";

export const ANIMA_NEGATIVE =
  "worst quality, low quality, score_1, score_2, score_3, too many fingers, deformed hand, too many arms, ugly, uncanny valley";

const SHARED_RATIO_OPTIONS = RATIO_PRESETS.map((r) => r.id);

const COMMON_SAMPLERS = [
  "er_sde",
  "euler",
  "euler_ancestral",
  "heun",
  "dpm_2",
  "dpm_2_ancestral",
  "lms",
  "dpmpp_2s_ancestral",
  "dpmpp_sde",
  "dpmpp_2m",
  "dpmpp_2m_sde",
  "ddim",
  "uni_pc",
];

const COMMON_SCHEDULERS = [
  "simple",
  "normal",
  "karras",
  "exponential",
  "sgm_uniform",
  "ddim_uniform",
  "beta",
];

const WORKFLOWS: BotWorkflow[] = [
  {
    id: "anima",
    aliases: ["anima-base", "animabase"],
    displayName: "Anima Base (T2I)",
    description:
      "High quality anime & stylized image generation with Silvana LoRA. Full positive & negative prompt support, customizable steps, CFG scale, and aspect ratios.",
    graph: animaBaseGraph,
    supportsNegativePrompt: true,
    supportsSize: true,
    supportsPrefill: true,
    prefillDefault: ANIMA_PREFILL,
    negativeDefault: ANIMA_NEGATIVE,
    defaultSteps: 30,
    defaultCfg: 4.0,
    defaultSampler: "er_sde",
    defaultScheduler: "simple",
    parameters: [
      {
        name: "prompt",
        type: "string",
        required: true,
        description: "Primary positive description of the desired image content.",
      },
      {
        name: "negative_prompt",
        type: "string",
        required: false,
        default: ANIMA_NEGATIVE,
        description: "Negative prompt to suppress unwanted artifacts, styles, or anatomical flaws.",
      },
      {
        name: "size",
        type: "string",
        required: false,
        default: "1024x1024",
        options: SHARED_RATIO_OPTIONS,
        description: "Aspect ratio or resolution preset (~1MP). Examples: '1024x1024', '16:9', '9:16', '4:3', '3:4'.",
      },
      {
        name: "steps",
        type: "integer",
        required: false,
        default: 30,
        min: 1,
        max: 150,
        description: "Number of denoising diffusion steps.",
      },
      {
        name: "cfg_scale",
        type: "number",
        required: false,
        default: 4.0,
        min: 0.5,
        max: 30.0,
        description: "Classifier-Free Guidance scale (prompt adherence).",
      },
      {
        name: "sampler_name",
        type: "select",
        required: false,
        default: "er_sde",
        options: COMMON_SAMPLERS,
        description: "KSampler algorithm used for diffusion.",
      },
      {
        name: "scheduler",
        type: "select",
        required: false,
        default: "simple",
        options: COMMON_SCHEDULERS,
        description: "Noise schedule algorithm.",
      },
      {
        name: "seed",
        type: "integer",
        required: false,
        min: 0,
        description: "Deterministic random seed for reproducible generations.",
      },
      {
        name: "prefill",
        type: "boolean",
        required: false,
        default: true,
        description: "Whether to automatically prepend high quality master tags ('masterpiece, best quality, ...'). Set false to disable.",
      },
    ],
    inject: {
      positiveNode: "3",
      positiveKey: "text",
      negativeNode: "4",
      negativeKey: "text",
      seedNodes: [{ node: "8", key: "seed" }],
      latentNode: { node: "6", widthKey: "width", heightKey: "height" },
      stepsNodes: [{ node: "8", key: "steps" }],
      cfgNodes: [{ node: "8", key: "cfg" }],
      samplerNodes: [{ node: "8", key: "sampler_name" }],
      schedulerNodes: [{ node: "8", key: "scheduler" }],
      denoiseNodes: [{ node: "8", key: "denoise" }],
    },
    outputNodes: ["13"],
  },
  {
    id: "kroma",
    aliases: ["krea", "krea2", "krea-kroma", "kroma-upscale"],
    displayName: "Kroma (Krea-2) Upscale",
    description:
      "Photorealistic Krea-2 distilled model with automatic 2x upscale refinement pass. Uses only positive prompts (negative conditioning is zeroed at CFG 1).",
    graph: kromaUpscaleGraph,
    supportsNegativePrompt: false,
    supportsSize: true,
    supportsPrefill: false,
    defaultSteps: 8,
    defaultCfg: 1.0,
    defaultSampler: "euler",
    defaultScheduler: "simple",
    parameters: [
      {
        name: "prompt",
        type: "string",
        required: true,
        description: "Positive prompt description. Negative prompts are not used because Kroma operates at CFG 1 with zeroed negative conditioning.",
      },
      {
        name: "size",
        type: "string",
        required: false,
        default: "1024x1024",
        options: SHARED_RATIO_OPTIONS,
        description: "Aspect ratio preset before 2x upscaling. Examples: '1024x1024', '16:9', '9:16', '4:3', '3:4'.",
      },
      {
        name: "steps",
        type: "integer",
        required: false,
        default: 8,
        min: 1,
        max: 50,
        description: "Base generation steps (fast distilled model).",
      },
      {
        name: "upscale_steps",
        type: "integer",
        required: false,
        default: 4,
        min: 1,
        max: 30,
        description: "Steps executed in the secondary upscale refinement pass.",
      },
      {
        name: "upscale_denoise",
        type: "number",
        required: false,
        default: 0.14,
        min: 0.05,
        max: 0.8,
        description: "Denoising strength applied during the upscale refinement pass.",
      },
      {
        name: "scale_by",
        type: "number",
        required: false,
        default: 2.0,
        min: 1.0,
        max: 4.0,
        description: "Image upscale factor applied before the secondary pass.",
      },
      {
        name: "seed",
        type: "integer",
        required: false,
        min: 0,
        description: "Deterministic random seed for reproducible generations.",
      },
    ],
    inject: {
      positiveNode: "6",
      positiveKey: "text",
      negativeKey: "text",
      seedNodes: [{ node: "30", key: "seed" }],
      latentNode: { node: "23", widthKey: "width", heightKey: "height" },
      stepsNodes: [{ node: "9", key: "steps" }],
      upscaleStepsNode: { node: "26", key: "steps" },
      upscaleDenoiseNode: { node: "26", key: "denoise" },
      upscaleFactorNode: { node: "29", key: "scale_by" },
      samplerNodes: [{ node: "9", key: "sampler_name" }],
      schedulerNodes: [{ node: "9", key: "scheduler" }],
    },
    outputNodes: ["19"],
  },
  {
    id: "anima-sticker",
    aliases: ["sticker", "animasticker", "cutout", "anima-removebg-sticker"],
    displayName: "Anima Sticker (Cutout)",
    description:
      "Anima stylized character generator combined with RMBG-2.0 background removal and customizable sticker outline highlight. Produces transparent PNGs.",
    graph: animaStickerGraph,
    supportsNegativePrompt: true,
    supportsSize: true,
    supportsPrefill: true,
    prefillDefault: ANIMA_PREFILL,
    negativeDefault: ANIMA_NEGATIVE,
    defaultSteps: 30,
    defaultCfg: 4.0,
    defaultSampler: "er_sde",
    defaultScheduler: "simple",
    parameters: [
      {
        name: "prompt",
        type: "string",
        required: true,
        description: "Primary positive description of the subject/sticker.",
      },
      {
        name: "negative_prompt",
        type: "string",
        required: false,
        default: ANIMA_NEGATIVE,
        description: "Negative prompt to suppress unwanted artifacts or background elements.",
      },
      {
        name: "size",
        type: "string",
        required: false,
        default: "1024x1024",
        options: SHARED_RATIO_OPTIONS,
        description: "Aspect ratio or resolution preset. Examples: '1024x1024', '1:1', '3:4'.",
      },
      {
        name: "outline_width",
        type: "integer",
        required: false,
        default: 2,
        min: 0,
        max: 50,
        description: "Width of sticker outline highlight in pixels. Set to 0 for a clean transparent cutout without outline.",
      },
      {
        name: "outline_color",
        type: "string",
        required: false,
        default: "#FFFFFF",
        description: "Hex color code for the sticker outline highlight (e.g. '#FFFFFF', '#EC4899', '#F59E0B').",
      },
      {
        name: "sensitivity",
        type: "number",
        required: false,
        default: 1.0,
        min: 0.1,
        max: 5.0,
        description: "RMBG-2.0 background removal matting sensitivity.",
      },
      {
        name: "steps",
        type: "integer",
        required: false,
        default: 30,
        min: 1,
        max: 150,
        description: "Number of diffusion denoising steps.",
      },
      {
        name: "cfg_scale",
        type: "number",
        required: false,
        default: 4.0,
        min: 0.5,
        max: 30.0,
        description: "Prompt adherence guidance scale.",
      },
      {
        name: "sampler_name",
        type: "select",
        required: false,
        default: "er_sde",
        options: COMMON_SAMPLERS,
        description: "KSampler algorithm used for diffusion.",
      },
      {
        name: "scheduler",
        type: "select",
        required: false,
        default: "simple",
        options: COMMON_SCHEDULERS,
        description: "Noise schedule algorithm.",
      },
      {
        name: "seed",
        type: "integer",
        required: false,
        min: 0,
        description: "Deterministic random seed for reproducible generations.",
      },
      {
        name: "prefill",
        type: "boolean",
        required: false,
        default: true,
        description: "Whether to apply the Anima quality prefill tags automatically.",
      },
    ],
    inject: {
      positiveNode: "2",
      positiveKey: "text",
      negativeNode: "4",
      negativeKey: "text",
      seedNodes: [{ node: "6", key: "seed" }],
      latentNode: { node: "7", widthKey: "width", heightKey: "height" },
      stepsNodes: [{ node: "6", key: "steps" }],
      cfgNodes: [{ node: "6", key: "cfg" }],
      samplerNodes: [{ node: "6", key: "sampler_name" }],
      schedulerNodes: [{ node: "6", key: "scheduler" }],
      denoiseNodes: [{ node: "6", key: "denoise" }],
      stickerThicknessNode: { node: "13", key: "width" },
      stickerColorNode: { node: "13", key: "color" },
      stickerSensitivityNode: { node: "12", key: "sensitivity" },
    },
    outputNodes: ["14"],
  },
];

export const DEFAULT_WORKFLOW_ID = "anima";

export function getWorkflow(id: string): BotWorkflow | undefined {
  const cleanId = (id || "").toLowerCase().trim();
  return WORKFLOWS.find(
    (w) =>
      w.id === cleanId ||
      (Array.isArray(w.aliases) && w.aliases.some((a) => a.toLowerCase() === cleanId))
  );
}

export function isAnimaWorkflow(wf: BotWorkflow | string): boolean {
  const resolved = typeof wf === "string" ? getWorkflow(wf) : wf;
  if (!resolved) return false;
  return resolved.id.startsWith("anima") || resolved.id === "sticker";
}

export function supportsWorkflowPrefill(wf: BotWorkflow | string): boolean {
  const workflow = typeof wf === "string" ? getWorkflow(wf) : wf;
  return Boolean(workflow?.supportsPrefill && workflow?.prefillDefault);
}

export function supportsWorkflowNegative(wf: BotWorkflow | string): boolean {
  const workflow = typeof wf === "string" ? getWorkflow(wf) : wf;
  return Boolean(workflow?.supportsNegativePrompt);
}

export function listWorkflows(): {
  id: string;
  aliases: string[];
  name: string;
  description: string;
  supportsNegativePrompt: boolean;
  supportsPrefill: boolean;
  supportsSize: boolean;
  defaultSteps: number;
  defaultCfg: number;
  defaultSampler: string;
  defaultScheduler: string;
  parameters: ParameterDef[];
}[] {
  return WORKFLOWS.map((w) => ({
    id: w.id,
    aliases: w.aliases || [],
    name: w.displayName,
    description: w.description,
    supportsNegativePrompt: w.supportsNegativePrompt,
    supportsPrefill: w.supportsPrefill,
    supportsSize: w.supportsSize,
    defaultSteps: w.defaultSteps,
    defaultCfg: w.defaultCfg,
    defaultSampler: w.defaultSampler,
    defaultScheduler: w.defaultScheduler,
    parameters: w.parameters,
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

export interface InjectedWorkflowOptions {
  positive: string;
  negative?: string;
  prefill?: string | boolean;
  seed?: string | number;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  sampler_name?: string;
  scheduler?: string;
  denoise?: number;
  // Sticker parameters
  outline_width?: number;
  outline_color?: string;
  sensitivity?: number;
  // Kroma parameters
  upscale_steps?: number;
  upscale_denoise?: number;
  scale_by?: number;
}

/**
 * Builds a fresh, ready-to-queue API graph for a workflow:
 * injects positive prompt (with optional prefill), negative prompt (if
 * supported), seed, aspect ratio, steps, CFG scale, sampler, scheduler,
 * and model-specific parameters like sticker outline or upscale factor.
 */
export function buildInjectedWorkflow(
  wf: BotWorkflow,
  options: InjectedWorkflowOptions
): ComfyWorkflowGraph {
  const graph: ComfyWorkflowGraph = JSON.parse(JSON.stringify(wf.graph));

  // Determine prefill string:
  let resolvedPrefill: string | undefined = undefined;
  if (wf.supportsPrefill && wf.prefillDefault) {
    if (typeof options.prefill === "string") {
      resolvedPrefill = options.prefill;
    } else if (options.prefill === undefined || options.prefill === true) {
      resolvedPrefill = wf.prefillDefault;
    }
  }

  // Positive prompt injection
  graph[wf.inject.positiveNode].inputs[wf.inject.positiveKey] = combinePrefill(
    resolvedPrefill,
    options.positive
  );

  // Negative prompt (only if this workflow supports it)
  const negNode = wf.inject.negativeNode;
  if (negNode && wf.supportsNegativePrompt) {
    const fallback = options.negative ?? wf.negativeDefault ?? "";
    graph[negNode].inputs[wf.inject.negativeKey] = fallback;
  }

  // Seed
  const seed = options.seed !== undefined && String(options.seed).trim() !== ""
    ? String(options.seed)
    : generateRandomSeed();
  for (const s of wf.inject.seedNodes) {
    if (graph[s.node]?.inputs) {
      graph[s.node].inputs[s.key] = seed;
    }
  }

  // Aspect ratio: literal width/height replace any wired input on the latent node
  if (options.width && options.height) {
    const { node, widthKey, heightKey } = wf.inject.latentNode;
    const n = graph[node];
    if (n?.inputs) {
      n.inputs[widthKey] = options.width;
      n.inputs[heightKey] = options.height;
    }
  }

  // Steps
  if (typeof options.steps === "number" && options.steps > 0 && wf.inject.stepsNodes) {
    for (const item of wf.inject.stepsNodes) {
      if (graph[item.node]?.inputs) {
        graph[item.node].inputs[item.key] = options.steps;
      }
    }
  }

  // CFG Scale
  if (typeof options.cfg === "number" && options.cfg > 0 && wf.inject.cfgNodes) {
    for (const item of wf.inject.cfgNodes) {
      if (graph[item.node]?.inputs) {
        graph[item.node].inputs[item.key] = options.cfg;
      }
    }
  }

  // Sampler
  if (options.sampler_name && wf.inject.samplerNodes) {
    for (const item of wf.inject.samplerNodes) {
      if (graph[item.node]?.inputs) {
        graph[item.node].inputs[item.key] = options.sampler_name;
      }
    }
  }

  // Scheduler
  if (options.scheduler && wf.inject.schedulerNodes) {
    for (const item of wf.inject.schedulerNodes) {
      if (graph[item.node]?.inputs) {
        graph[item.node].inputs[item.key] = options.scheduler;
      }
    }
  }

  // Denoise
  if (typeof options.denoise === "number" && wf.inject.denoiseNodes) {
    for (const item of wf.inject.denoiseNodes) {
      if (graph[item.node]?.inputs) {
        graph[item.node].inputs[item.key] = options.denoise;
      }
    }
  }

  // Sticker-specific injection
  if (wf.inject.stickerThicknessNode && typeof options.outline_width === "number") {
    const target = wf.inject.stickerThicknessNode;
    if (graph[target.node]?.inputs) {
      graph[target.node].inputs[target.key] = Math.max(0, options.outline_width);
    }
  }

  if (wf.inject.stickerColorNode && options.outline_color) {
    const target = wf.inject.stickerColorNode;
    if (graph[target.node]?.inputs) {
      graph[target.node].inputs[target.key] = options.outline_color;
    }
  }

  if (wf.inject.stickerSensitivityNode && typeof options.sensitivity === "number") {
    const target = wf.inject.stickerSensitivityNode;
    if (graph[target.node]?.inputs) {
      graph[target.node].inputs[target.key] = Math.max(0, options.sensitivity);
    }
  }

  // Kroma upscale-specific injection
  if (wf.inject.upscaleStepsNode && typeof options.upscale_steps === "number") {
    const target = wf.inject.upscaleStepsNode;
    if (graph[target.node]?.inputs) {
      graph[target.node].inputs[target.key] = Math.max(1, options.upscale_steps);
    }
  }

  if (wf.inject.upscaleDenoiseNode && typeof options.upscale_denoise === "number") {
    const target = wf.inject.upscaleDenoiseNode;
    if (graph[target.node]?.inputs) {
      graph[target.node].inputs[target.key] = options.upscale_denoise;
    }
  }

  if (wf.inject.upscaleFactorNode && typeof options.scale_by === "number") {
    const target = wf.inject.upscaleFactorNode;
    if (graph[target.node]?.inputs) {
      graph[target.node].inputs[target.key] = options.scale_by;
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
