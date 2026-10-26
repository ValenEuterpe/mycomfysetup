import {
  ComfyWorkflowGraph,
  ExtractedParameter,
  ParameterCategory,
} from "../types/workflow";

export const COMMON_SAMPLERS = [
  "er_sde",
  "euler",
  "euler_ancestral",
  "heun",
  "dpm_2",
  "dpm_2_ancestral",
  "lms",
  "dpm_fast",
  "dpm_adaptive",
  "dpmpp_2s_ancestral",
  "dpmpp_sde",
  "dpmpp_sde_gpu",
  "dpmpp_2m",
  "dpmpp_2m_sde",
  "dpmpp_2m_sde_gpu",
  "dpmpp_3m_sde",
  "dpmpp_3m_sde_gpu",
  "ddim",
  "uni_pc",
  "uni_pc_bh2",
];

export const COMMON_SCHEDULERS = [
  "simple",
  "normal",
  "karras",
  "exponential",
  "sgm_uniform",
  "kl_optimal",
  "ddim_uniform",
  "beta",
];

export const ASPECT_RATIOS = [
  { label: "1:1 Square", ratio: "1:1", width: 1024, height: 1024 },
  { label: "16:9 Landscape", ratio: "16:9", width: 1344, height: 768 },
  { label: "9:16 Portrait", ratio: "9:16", width: 768, height: 1344 },
  { label: "4:3 Standard", ratio: "4:3", width: 1152, height: 896 },
  { label: "3:4 Standard", ratio: "3:4", width: 896, height: 1152 },
  { label: "21:9 Cinema", ratio: "21:9", width: 1536, height: 640 },
];

/**
 * Checks if a value is a ComfyUI node link connection: [node_id, slot_index]
 */
export function isGraphLink(value: any): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    (typeof value[0] === "string" || typeof value[0] === "number") &&
    typeof value[1] === "number"
  );
}

/**
 * Analyzes a ComfyUI API workflow graph and extracts all configurable parameters.
 */
export function parseWorkflowParameters(graph: ComfyWorkflowGraph): ExtractedParameter[] {
  const parameters: ExtractedParameter[] = [];

  // 1. Identify positive and negative prompt nodes by inspecting KSampler connections
  const negativePromptNodeIds = new Set<string>();
  const positivePromptNodeIds = new Set<string>();

  for (const [, node] of Object.entries(graph)) {
    if (node.inputs) {
      if (isGraphLink(node.inputs.positive)) {
        positivePromptNodeIds.add(String(node.inputs.positive[0]));
      }
      if (isGraphLink(node.inputs.negative)) {
        negativePromptNodeIds.add(String(node.inputs.negative[0]));
      }
    }
  }

  // 2. Traverse all nodes and inspect unlinked inputs
  for (const [nodeId, node] of Object.entries(graph)) {
    if (!node || typeof node !== "object" || !node.inputs) continue;

    const classType = node.class_type || "";
    const nodeTitle = node._meta?.title || classType || `Node ${nodeId}`;

    for (const [inputKey, rawValue] of Object.entries(node.inputs)) {
      // Skip linked inputs
      if (isGraphLink(rawValue)) continue;

      const paramId = `${nodeId}.${inputKey}`;
      let category: ParameterCategory = "generic";
      let type: ExtractedParameter["type"] = "text";
      let label = inputKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      let options: string[] | undefined;
      let min: number | undefined;
      let max: number | undefined;
      let step: number | undefined;
      let isNegative = false;

      // Category detection
      if (
        classType === "CLIPTextEncode" ||
        inputKey === "text" ||
        inputKey === "prompt"
      ) {
        category = "prompt";
        type = "multiline";
        const titleLower = nodeTitle.toLowerCase();
        if (
          negativePromptNodeIds.has(nodeId) ||
          titleLower.includes("neg") ||
          inputKey.toLowerCase().includes("neg")
        ) {
          isNegative = true;
          label = "Negative Prompt";
        } else {
          label = "Positive Prompt";
        }
      } else if (
        classType === "OutlineAlphaSnap" ||
        classType.toLowerCase().includes("outline")
      ) {
        category = "sticker";
        if (inputKey === "width" || inputKey === "thickness") {
          label = "Outline Thickness (px)";
          type = "number";
          min = 0;
          max = 50;
          step = 1;
        } else if (inputKey === "color" || inputKey.includes("color")) {
          label = "Outline Color";
          type = "color";
        } else if (typeof rawValue === "number") {
          type = "number";
        } else {
          type = "text";
        }
      } else if (
        classType === "RMBG" ||
        classType.toLowerCase().includes("rmbg")
      ) {
        category = "sticker";
        if (inputKey === "sensitivity") {
          label = "RMBG Sensitivity";
          type = "number";
          min = 0;
          max = 5;
          step = 0.1;
        } else if (typeof rawValue === "number") {
          type = "number";
        } else {
          type = "text";
        }
      } else if (
        inputKey === "width" ||
        inputKey === "height" ||
        inputKey === "batch_size" ||
        classType.toLowerCase().includes("latent") ||
        classType.toLowerCase().includes("resolution")
      ) {
        category = "dimension";
        // Keep enum-ish strings (e.g. ResolutionSelector aspect_ratio) textual
        type = typeof rawValue === "string" ? "text" : "number";
        if (type === "number") {
          min = inputKey === "batch_size" ? 1 : 64;
          max = inputKey === "batch_size" ? 8 : 4096;
          step = inputKey === "batch_size" ? 1 : 16;
        } else if (inputKey === "aspect_ratio") {
          label = "Aspect Ratio";
        }
      } else if (
        inputKey === "seed" ||
        inputKey === "noise_seed" ||
        inputKey === "steps" ||
        inputKey === "cfg" ||
        inputKey === "denoise" ||
        inputKey === "sampler_name" ||
        inputKey === "scheduler" ||
        classType.toLowerCase().includes("sampler") ||
        classType.toLowerCase().includes("noise")
      ) {
        category = "sampler";
        if (inputKey === "sampler_name") {
          type = "select";
          options = COMMON_SAMPLERS;
        } else if (inputKey === "scheduler") {
          type = "select";
          options = COMMON_SCHEDULERS;
        } else if (typeof rawValue === "number") {
          type = "number";
          if (inputKey.includes("seed")) {
            min = 0;
            max = 999999999999999;
            step = 1;
            label = "Seed";
          } else if (inputKey === "steps") {
            min = 1;
            max = 150;
            step = 1;
            label = "Steps";
          } else if (inputKey === "cfg") {
            min = 0.5;
            max = 30.0;
            step = 0.5;
            label = "CFG Scale";
          } else if (inputKey === "denoise") {
            min = 0.0;
            max = 1.0;
            step = 0.05;
            label = "Denoise";
          }
        }
      } else if (
        classType === "LoadImage" ||
        classType === "LoadImageMask" ||
        classType === "LoadVideo" ||
        (inputKey === "image" && typeof rawValue === "string")
      ) {
        category = "media";
        type = "image";
        label = nodeTitle || "Source Image";
      } else if (
        classType.includes("Loader") ||
        inputKey.includes("unet") ||
        inputKey.includes("ckpt") ||
        inputKey.includes("lora") ||
        inputKey.includes("vae") ||
        inputKey.includes("clip_name")
      ) {
        category = "model";
        if (typeof rawValue === "number") {
          type = "number";
          min = 0;
          max = 2;
          step = 0.05;
        } else {
          type = "text";
        }
      } else if (classType.startsWith("Primitive") || classType.includes("Switch")) {
        category = "primitive";
        if (typeof rawValue === "boolean") {
          type = "boolean";
        } else if (typeof rawValue === "number") {
          type = "number";
        } else {
          type = "text";
        }
      } else {
        // Fallback generic literal
        category = "generic";
        if (typeof rawValue === "boolean") {
          type = "boolean";
        } else if (typeof rawValue === "number") {
          type = "number";
        } else {
          type = typeof rawValue === "string" && rawValue.length > 50 ? "multiline" : "text";
        }
      }

      parameters.push({
        id: paramId,
        nodeId,
        nodeTitle,
        classType,
        inputKey,
        label,
        category,
        type,
        defaultValue: rawValue,
        currentValue: rawValue,
        options,
        min,
        max,
        step,
        isNegative,
      });
    }
  }

  // Sort parameters logically:
  // Prompts (Positive first, Negative second) -> Dimensions -> Sticker -> Media -> Sampler -> Models -> Primitives -> Generic
  const categoryOrder: Record<ParameterCategory, number> = {
    prompt: 1,
    dimension: 2,
    sticker: 3,
    media: 4,
    sampler: 5,
    model: 6,
    primitive: 7,
    generic: 8,
  };

  return parameters.sort((a, b) => {
    const catDiff = categoryOrder[a.category] - categoryOrder[b.category];
    if (catDiff !== 0) return catDiff;
    if (a.category === "prompt") {
      return (a.isNegative ? 1 : 0) - (b.isNegative ? 1 : 0);
    }
    return a.nodeId.localeCompare(b.nodeId, undefined, { numeric: true });
  });
}
