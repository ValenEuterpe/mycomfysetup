import { ComfyWorkflowGraph, ComfyNode } from "../types/workflow";
import { buildComfyUrl, comfyProxyFetch, getAuthHeaders } from "./comfyClient";

/* ------------------------------------------------------------------ */
/* Embedded template: Krea-2 Identity/Edit single-image API workflow   */
/* (derived from the official krea2_identity_edit export)              */
/*                                                                     */
/* Node map:                                                           */
/*   29 SaveImage | 53 KSampler | 54 VAEDecode                         */
/*   55 UNETLoader | 56 CLIPLoader | 57 VAELoader | 71 LoraLoader      */
/*   72 LoadImage (scene) | 73 VAEEncode                               */
/*   79 Krea2EditModelPatch | 82 EmptySD3LatentImage                   */
/*   84/85 Krea2EditGroundedEncode (positive / empty negative)          */
/*                                                                     */
/* The builder appends nodes 90 (LoadImage) + 92 (VAEEncode) and wires  */
/* image_b / source_latent_b / source_image_b when a second reference  */
/* (person/entity) is used — i.e. the "greyed out" group, un-greyed.    */
/* ResolutionSelector (83) is replaced by explicit width/height so the */
/* UI side controls sizing exactly (snapped to multiples of 8).        */
/* ------------------------------------------------------------------ */

const TEMPLATE: ComfyWorkflowGraph = {
  "29": {
    inputs: { filename_prefix: "krea2_identity_edit", images: ["54", 0] },
    class_type: "SaveImage",
    _meta: { title: "Save Image", cnr_id: "comfy-core" },
  },
  "53": {
    inputs: {
      seed: 423516491587350,
      steps: 8,
      cfg: 1,
      sampler_name: "euler",
      scheduler: "simple",
      denoise: 1,
      model: ["79", 0],
      positive: ["84", 0],
      negative: ["85", 0],
      latent_image: ["82", 0],
    },
    class_type: "KSampler",
    _meta: { title: "KSampler", cnr_id: "comfy-core" },
  },
  "54": {
    inputs: { samples: ["53", 0], vae: ["57", 0] },
    class_type: "VAEDecode",
    _meta: { title: "VAE Decode", cnr_id: "comfy-core" },
  },
  "55": {
    inputs: { unet_name: "Kroma (Krea-2).safetensors", weight_dtype: "default" },
    class_type: "UNETLoader",
    _meta: { title: "Load Diffusion Model", cnr_id: "comfy-core" },
  },
  "56": {
    inputs: { clip_name: "qwen3vl_4b_bf16.safetensors", type: "krea2", device: "default" },
    class_type: "CLIPLoader",
    _meta: { title: "Load CLIP", cnr_id: "comfy-core" },
  },
  "57": {
    inputs: { vae_name: "qwen_image_vae.safetensors" },
    class_type: "VAELoader",
    _meta: { title: "Load VAE", cnr_id: "comfy-core" },
  },
  "71": {
    inputs: {
      lora_name: "conradlocke.krea2-identity-edit.safetensors",
      strength_model: 1,
      model: ["55", 0],
    },
    class_type: "LoraLoaderModelOnly",
    _meta: { title: "Load LoRA", cnr_id: "comfy-core" },
  },
  "72": {
    inputs: { image: "" },
    class_type: "LoadImage",
    _meta: { title: "Image 1 (scene)", cnr_id: "comfy-core" },
  },
  "73": {
    inputs: { pixels: ["72", 0], vae: ["57", 0] },
    class_type: "VAEEncode",
    _meta: { title: "VAE Encode", cnr_id: "comfy-core" },
  },
  "79": {
    inputs: {
      ref_boost: 2,
      ref_boost_a: 1,
      fit_mode: "fit",
      model: ["71", 0],
      source_latent: ["73", 0],
      source_image: ["72", 0],
      vae: ["57", 0],
      target_latent: ["82", 0],
    },
    class_type: "Krea2EditModelPatch",
    _meta: { title: "Krea2 Edit (source patch)", cnr_id: "comfyui-krea2edit" },
  },
  "82": {
    inputs: { width: 1024, height: 1024, batch_size: 1 },
    class_type: "EmptySD3LatentImage",
    _meta: { title: "EmptySD3LatentImage", cnr_id: "comfy-core" },
  },
  "84": {
    inputs: {
      prompt: "",
      grounding_px: 768,
      system_prompt: "",
      clip: ["56", 0],
      image: ["72", 0],
    },
    class_type: "Krea2EditGroundedEncode",
    _meta: { title: "Krea2 Edit (grounded encode)", cnr_id: "comfyui-krea2edit" },
  },
  "85": {
    inputs: {
      prompt: "",
      grounding_px: 768,
      system_prompt: "",
      clip: ["56", 0],
      image: ["72", 0],
    },
    class_type: "Krea2EditGroundedEncode",
    _meta: { title: "negative (leave empty)", cnr_id: "comfyui-krea2edit" },
  },
};

/* The two-image (second reference) nodes added on demand */
const TWO_IMAGE_NODES: Record<string, ComfyNode> = {
  "90": {
    inputs: { image: "" },
    class_type: "LoadImage",
    _meta: { title: "Image 2 (reference)", cnr_id: "comfy-core" },
  },
  "92": {
    inputs: { pixels: ["90", 0], vae: ["57", 0] },
    class_type: "VAEEncode",
    _meta: { title: "VAE Encode (ref)", cnr_id: "comfy-core" },
  },
};

/** Placeholder swapped in negative grounding encode so refs stay consistently grounded */
const NEG_IMAGE_B = { image_b: ["90", 0] };

/* ------------------------------------------------------------------ */
/* Placement (reference position) support detection                    */
/* ------------------------------------------------------------------ */

export interface PlacementCaps {
  /** node pack exposes ref_position / ref_position_a (V2 >= 2.0.0) */
  supportsPlacement: boolean;
  placementOptions: string[];
  /** class_type that carries ref_position (defaults to the model patch node) */
  placementNodeClass: "Krea2EditModelPatch" | "Krea2EditGroundedEncode";
}

export type RefPlacement = "aligned" | "beside";

export const DEFAULT_PLACEMENT_OPTIONS: string[] = ["aligned", "beside"];

/**
 * Detects the installed comfyui-krea2edit node capabilities via /object_info.
 * Returns null when the probe cannot be completed (endpoint offline etc.).
 */
export async function detectEditNodeCaps(endpoint: string): Promise<PlacementCaps | null> {
  try {
    const url = buildComfyUrl(endpoint, "/object_info/Krea2EditModelPatch");
    const res = await comfyProxyFetch(url, { headers: { ...getAuthHeaders(endpoint) }, cache: "no-store" });
    if (!res.ok) return null;
    const info = await res.json();
    const nodeDef = info?.Krea2EditModelPatch;
    if (!nodeDef) {
      return {
        supportsPlacement: false,
        placementOptions: DEFAULT_PLACEMENT_OPTIONS,
        placementNodeClass: "Krea2EditModelPatch",
      };
    }
    const inputs = { ...(nodeDef.input?.required || {}), ...(nodeDef.input?.optional || {}) };
    // ref_position may live on this node or on the grounded encode node of a newer pack
    let supportsPlacement = false;
    let options = DEFAULT_PLACEMENT_OPTIONS;
    let placementNodeClass: PlacementCaps["placementNodeClass"] = "Krea2EditModelPatch";

    const readOptions = (spec: any): string[] => {
      const first = Array.isArray(spec) ? spec[0] : null;
      return Array.isArray(first) && first.every((v: unknown) => typeof v === "string")
        ? (first as string[])
        : DEFAULT_PLACEMENT_OPTIONS;
    };

    for (const key of Object.keys(inputs)) {
      if (/^ref_position_a?$/i.test(key)) {
        supportsPlacement = true;
        options = readOptions(inputs[key]);
        break;
      }
    }
    return { supportsPlacement, placementOptions: options, placementNodeClass };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

export interface Krea2EditBuildOptions {
  /** filename of image 1 (scene / subject) as known to the relay (set by the runner) */
  sceneImage?: string;
  /** filename of image 2 (person / entity reference); omit = single-image mode */
  referenceImage?: string;
  prompt: string;
  systemPrompt?: string;
  groundingPx?: number; // 384–768 trained range
  refBoost?: number; // person/image-2 dial (or the only image in single mode)
  refBoostScene?: number; // ref_boost_a — scene/image-1 dial
  placementRef?: string; // ref_position (person / only reference)
  placementScene?: string; // ref_position_a (scene)
  fitMode?: RepFitMode;
  steps?: number;
  cfg?: number;
  seed?: number;
  loraStrength?: number;
  outWidth: number; // pre-snapped
  outHeight: number;
  batch?: number;
  placementCaps?: PlacementCaps | null;
}

export type RepFitMode = "fit" | "crop";

/**
 * Builds a ready-to-queue ComfyUI API workflow for the Krea2 edit flow.
 * Always uses two-image wiring when `referenceImage` is provided.
 */
export function buildKrea2EditWorkflow(opts: Krea2EditBuildOptions): ComfyWorkflowGraph {
  const graph: ComfyWorkflowGraph = JSON.parse(JSON.stringify(TEMPLATE));

  const steps = clampInt(opts.steps ?? 8, 1, 64);
  const cfg = Number.isFinite(opts.cfg) ? Number(opts.cfg) : 1;
  const seed = Number.isFinite(opts.seed!) ? Math.abs(Math.floor(opts.seed!)) : 0;
  const batch = clampInt(opts.batch ?? 1, 1, 4);
  const grounding = clampInt(opts.groundingPx ?? 768, 256, 1024);
  const refBoost = clampNum(opts.refBoost ?? 2, 0, 12);
  const refBoostScene = clampNum(opts.refBoostScene ?? 1, 0, 12);
  const fitMode: RepFitMode = opts.fitMode === "crop" ? "crop" : "fit";

  // 1. Image-1 (scene) input
  graph["72"].inputs.image = opts.sceneImage ?? "";

  // 2. Prompt + grounding on positive / empty negative
  graph["84"].inputs.prompt = opts.prompt ?? "";
  graph["84"].inputs.grounding_px = grounding;
  graph["84"].inputs.system_prompt = opts.systemPrompt ?? "";
  graph["85"].inputs.grounding_px = grounding;

  // 3. Model patch dials
  graph["79"].inputs.ref_boost = refBoost;
  graph["79"].inputs.ref_boost_a = refBoostScene;
  graph["79"].inputs.fit_mode = fitMode;
  graph["71"].inputs.strength_model = clampNum(opts.loraStrength ?? 1, 0, 2);

  // 4. Sampling
  graph["53"].inputs.steps = steps;
  graph["53"].inputs.cfg = cfg;
  graph["53"].inputs.seed = seed;

  // 5. Output size
  graph["82"].inputs.width = clampInt(opts.outWidth, 256, 4096);
  graph["82"].inputs.height = clampInt(opts.outHeight, 256, 4096);
  graph["82"].inputs.batch_size = batch;
  if (graph["73"].inputs.vae === undefined) graph["73"].inputs.vae = ["57", 0];

  // 6. Two-image wiring (the previously bypassed group)
  if (opts.referenceImage) {
    Object.assign(graph, JSON.parse(JSON.stringify(TWO_IMAGE_NODES)));
    graph["90"].inputs.image = opts.referenceImage;
    graph["79"].inputs.source_latent_b = ["92", 0];
    graph["79"].inputs.source_image_b = ["90", 0];
    graph["84"].inputs.image_b = ["90", 0];
    graph["85"].inputs.image_b = [...NEG_IMAGE_B.image_b];

    // V2 placement: scene = first reference, person = last reference
    if (opts.placementCaps?.supportsPlacement) {
      const cls = opts.placementCaps.placementNodeClass;
      const placement = (key: string, value?: string) => {
        if (!value) return;
        for (const id of Object.keys(graph)) {
          if (graph[id].class_type === cls) {
            (graph[id].inputs as Record<string, unknown>)[key] = value;
          }
        }
      };
      placement("ref_position", opts.placementRef || "beside");
      placement("ref_position_a", opts.placementScene || "aligned");
    }
  }

  return graph;
}

/**
 * Computes width/height for an aspect ratio at a given megapixel target,
 * snapped down to a multiple of `multiple` (8 keeps the VAE happy).
 */
export function computeResolution(
  ratio: string, // "16:9"
  megapixels: number,
  multiple = 8
): { width: number; height: number } {
  const [rw, rh] = ratio.split(":").map((n) => parseFloat(n));
  const valid = rw > 0 && rh > 0 && Number.isFinite(rw) && Number.isFinite(rh);
  const targetPx = Math.max(0.25, Math.min(2, megapixels || 1)) * 1_000_000;
  let w = Math.sqrt(targetPx * (valid ? rw / rh : 1));
  let h = Math.sqrt(targetPx * (valid ? rh / rw : 1));
  const snap = (v: number) => Math.max(multiple, Math.round(v / multiple) * multiple);
  return { width: snap(w), height: snap(h) };
}

/* ------------------------------------------------------------------ */
/* Multi-pass prompt helpers                                           */
/* ------------------------------------------------------------------ */

/**
 * Substitutes [NAME]-style placeholders with the entity name.
 */
export function fillPromptTemplate(template: string, entityName?: string): string {
  if (!entityName) {
    return template.replace(/\[NAME\]/gi, "").replace(/\s{2,}/g, " ").trim();
  }
  return template.replace(/\[NAME\]/gi, entityName);
}

function clampInt(v: number, min: number, max: number): number {
  const n = Math.round(Number(v) || 0);
  return Math.max(min, Math.min(max, n));
}

function clampNum(v: number, min: number, max: number): number {
  const n = Number(v) || 0;
  return Math.max(min, Math.min(max, n));
}
