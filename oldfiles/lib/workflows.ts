// These are the two ComfyUI API-format workflows you exported, embedded
// as-is. buildT2VWorkflow / buildI2VWorkflow clone them and inject the
// user's form values into the right node inputs before queuing.
//
// Two nodes the exported graphs used to do arithmetic have been removed and
// replaced with literal values computed in lib/aspect.ts:
//
//   ResolutionSelector    -> width / height, from resolveDimensions()
//   ComfyMathExpression   -> length,         from frameCount()
//
// The reason is that the browser has to show the user the exact output shape
// and duration before they spend a render. Numbers computed inside the graph
// are invisible until it finishes, and a preview that recomputes them
// independently is a second implementation waiting to drift. So the geometry is
// settled once, on our side, and passed in.

import { Dimensions, frameCount } from "./aspect";

// --- Text to video ------------------------------------------------------

const T2V_TEMPLATE = {
  "92": {
    inputs: { filename_prefix: "video/MiniMax_H3", format: "auto", codec: "auto", video: ["140:130", 0] },
    class_type: "SaveVideo",
    _meta: { title: "Save Video" },
  },
  "140:119": { inputs: { vae_name: "minimax_h3_video_vae_fp16.safetensors" }, class_type: "VAELoader", _meta: { title: "Load VAE" } },
  "140:120": { inputs: { vae_name: "minimax_h3_audio_vae_fp32.safetensors" }, class_type: "VAELoader", _meta: { title: "Load VAE" } },
  "140:121": { inputs: { samples: ["140:125", 0], vae: ["140:120", 0] }, class_type: "VAEDecodeAudio", _meta: { title: "VAE Decode Audio" } },
  "140:122": { inputs: { samples: ["140:125", 0], vae: ["140:119", 0] }, class_type: "VAEDecode", _meta: { title: "VAE Decode" } },
  "140:123": { inputs: { sampler_name: "res_multistep" }, class_type: "KSamplerSelect", _meta: { title: "KSamplerSelect" } },
  "140:124": {
    inputs: { scheduler: "simple", steps: ["140:136", 0], denoise: 1, model: ["140:135", 0] },
    class_type: "BasicScheduler",
    _meta: { title: "BasicScheduler" },
  },
  "140:125": {
    inputs: {
      noise: ["140:129", 0],
      guider: ["140:126", 0],
      sampler: ["140:123", 0],
      sigmas: ["140:124", 0],
      latent_image: ["140:131", 1],
    },
    class_type: "SamplerCustomAdvanced",
    _meta: { title: "SamplerCustomAdvanced" },
  },
  "140:126": { inputs: { model: ["140:135", 0], conditioning: ["140:131", 0] }, class_type: "BasicGuider", _meta: { title: "Basic Guider" } },
  "140:127": {
    inputs: { unet_name: "minimax_h3_fl2va_pruned_int8_convrot.safetensors", weight_dtype: "default" },
    class_type: "UNETLoader",
    _meta: { title: "Load Diffusion Model" },
  },
  "140:128": {
    inputs: { clip_name: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", type: "minimax", device: "default" },
    class_type: "CLIPLoader",
    _meta: { title: "Load CLIP" },
  },
  "140:129": { inputs: { noise_seed: 757358688076805 }, class_type: "RandomNoise", _meta: { title: "RandomNoise" } },
  "140:130": {
    inputs: { fps: 24, bit_depth: 8, images: ["140:122", 0], audio: ["140:121", 0] },
    class_type: "CreateVideo",
    _meta: { title: "Create Video" },
  },
  "140:131": {
    inputs: {
      prompt: "",
      // Literals, injected by buildT2VWorkflow. See the note at the top.
      width: 864,
      height: 480,
      length: 124,
      clip: ["140:128", 0],
      vae: ["140:119", 0],
    },
    class_type: "MiniMaxH3ImageToVideo",
    _meta: { title: "MiniMax H3 Image to Video" },
  },
  "140:134": {
    inputs: { lora_name: "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors", strength_model: 1, model: ["140:127", 0] },
    class_type: "LoraLoaderModelOnly",
    _meta: { title: "Load LoRA" },
  },
  "140:135": { inputs: { switch: ["140:139", 0], on_false: ["140:127", 0], on_true: ["140:134", 0] }, class_type: "ComfySwitchNode", _meta: { title: "If/Else Switch (Model)" } },
  "140:136": { inputs: { switch: ["140:139", 0], on_false: ["140:137", 0], on_true: ["140:138", 0] }, class_type: "ComfySwitchNode", _meta: { title: "If/Else Switch (Steps)" } },
  "140:137": { inputs: { value: 20 }, class_type: "PrimitiveInt", _meta: { title: "Int" } },
  "140:138": { inputs: { value: 8 }, class_type: "PrimitiveInt", _meta: { title: "Int" } },
  "140:139": { inputs: { value: false }, class_type: "PrimitiveBoolean", _meta: { title: "Boolean (Enable Lightning LoRA)" } },
} as const;

/**
 * `fast` is required, not optional, on purpose. Fast mode is the default for
 * every user, so a forgotten field must be a compile error rather than a silent
 * fall back to the expensive 20-step path. Resolve it with
 * `resolveFastMode()` from lib/permissions.ts — never straight from the request.
 *
 * `dimensions` is likewise required: it is the same value the browser drew its
 * preview from, so passing it rather than deriving it here is what keeps the
 * two in step.
 */
export function buildT2VWorkflow(opts: {
  prompt: string;
  dimensions: Dimensions;
  durationSeconds: number;
  fast: boolean;
}) {
  const wf = structuredClone(T2V_TEMPLATE) as any;
  wf["140:131"].inputs.prompt = opts.prompt;
  wf["140:131"].inputs.width = opts.dimensions.width;
  wf["140:131"].inputs.height = opts.dimensions.height;
  wf["140:131"].inputs.length = frameCount(opts.durationSeconds);
  // 140:139 drives both switches: the turbo LoRA (140:134) and 8 steps (140:138).
  wf["140:139"].inputs.value = opts.fast;
  wf["140:129"].inputs.noise_seed = randomSeed();
  return wf;
}

// --- Image to video -------------------------------------------------------

const I2V_TEMPLATE = {
  "92": { inputs: { filename_prefix: "video/MiniMax_H3", format: "auto", codec: "auto", video: ["105:91", 0] }, class_type: "SaveVideo", _meta: { title: "Save Video" } },
  "114": { inputs: { image: "" }, class_type: "LoadImage", _meta: { title: "Load Image" } },
  "105:11": { inputs: { vae_name: "minimax_h3_video_vae_fp16.safetensors" }, class_type: "VAELoader", _meta: { title: "Load VAE" } },
  "105:24": { inputs: { vae_name: "minimax_h3_audio_vae_fp32.safetensors" }, class_type: "VAELoader", _meta: { title: "Load VAE" } },
  "105:23": { inputs: { samples: ["105:14", 0], vae: ["105:24", 0] }, class_type: "VAEDecodeAudio", _meta: { title: "VAE Decode Audio" } },
  "105:10": { inputs: { samples: ["105:14", 0], vae: ["105:11", 0] }, class_type: "VAEDecode", _meta: { title: "VAE Decode" } },
  "105:17": { inputs: { sampler_name: "res_multistep" }, class_type: "KSamplerSelect", _meta: { title: "KSamplerSelect" } },
  "105:9": { inputs: { scheduler: "simple", steps: ["105:123", 0], denoise: 1, model: ["105:122", 0] }, class_type: "BasicScheduler", _meta: { title: "BasicScheduler" } },
  "105:14": {
    inputs: { noise: ["105:15", 0], guider: ["105:16", 0], sampler: ["105:17", 0], sigmas: ["105:9", 0], latent_image: ["105:104", 1] },
    class_type: "SamplerCustomAdvanced",
    _meta: { title: "SamplerCustomAdvanced" },
  },
  "105:16": { inputs: { model: ["105:122", 0], conditioning: ["105:104", 0] }, class_type: "BasicGuider", _meta: { title: "Basic Guider" } },
  "105:6": { inputs: { unet_name: "minimax_h3_fl2va_pruned_int8_convrot.safetensors", weight_dtype: "default" }, class_type: "UNETLoader", _meta: { title: "Load Diffusion Model" } },
  "105:13": { inputs: { clip_name: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", type: "minimax", device: "default" }, class_type: "CLIPLoader", _meta: { title: "Load CLIP" } },
  "105:15": { inputs: { noise_seed: 757358688076805 }, class_type: "RandomNoise", _meta: { title: "RandomNoise" } },
  "105:91": { inputs: { fps: 24, bit_depth: 8, images: ["105:10", 0], audio: ["105:23", 0] }, class_type: "CreateVideo", _meta: { title: "Create Video" } },
  "105:104": {
    inputs: {
      prompt: "",
      // Literals, injected by buildI2VWorkflow. See the note at the top.
      width: 640,
      height: 640,
      length: 124,
      clip: ["105:13", 0],
      vae: ["105:11", 0],
      first_frame: ["114", 0],
    },
    class_type: "MiniMaxH3ImageToVideo",
    _meta: { title: "MiniMax H3 Image to Video" },
  },
  "105:121": {
    inputs: { lora_name: "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors", strength_model: 1, model: ["105:6", 0] },
    class_type: "LoraLoaderModelOnly",
    _meta: { title: "Load LoRA" },
  },
  "105:122": { inputs: { switch: ["105:126", 0], on_false: ["105:6", 0], on_true: ["105:121", 0] }, class_type: "ComfySwitchNode", _meta: { title: "If/Else Switch (Model)" } },
  "105:123": { inputs: { switch: ["105:126", 0], on_false: ["105:124", 0], on_true: ["105:125", 0] }, class_type: "ComfySwitchNode", _meta: { title: "If/Else Switch (Steps)" } },
  "105:124": { inputs: { value: 20 }, class_type: "PrimitiveInt", _meta: { title: "Int" } },
  "105:125": { inputs: { value: 8 }, class_type: "PrimitiveInt", _meta: { title: "Int" } },
  "105:126": { inputs: { value: false }, class_type: "PrimitiveBoolean", _meta: { title: "Boolean (Enable Lightning LoRA)" } },
} as const;

/**
 * See buildT2VWorkflow for why `fast` and `dimensions` are required.
 *
 * A note on the image: MiniMaxH3ImageToVideo stretches `first_frame` to the
 * canvas with cropping disabled, so an image whose proportions differ from
 * `dimensions` comes out visibly squashed. The browser therefore crops to
 * `dimensions` before upload, which makes that stretch a no-op. Anything
 * queuing a job by another route needs to crop too, or accept the distortion.
 */
export function buildI2VWorkflow(opts: {
  prompt: string;
  dimensions: Dimensions;
  durationSeconds: number;
  imageFilename: string; // name returned by /upload/image
  fast: boolean;
}) {
  const wf = structuredClone(I2V_TEMPLATE) as any;
  wf["105:104"].inputs.prompt = opts.prompt;
  wf["105:104"].inputs.width = opts.dimensions.width;
  wf["105:104"].inputs.height = opts.dimensions.height;
  wf["105:104"].inputs.length = frameCount(opts.durationSeconds);
  wf["114"].inputs.image = opts.imageFilename;
  // 105:126 drives both switches: the turbo LoRA (105:121) and 8 steps (105:125).
  wf["105:126"].inputs.value = opts.fast;
  wf["105:15"].inputs.noise_seed = randomSeed();
  return wf;
}

// --- Text to image (Anima Base & BAS) --------------------------------------

export const DEFAULT_ANIMA_NEGATIVE_PROMPT =
  "worst quality, low quality, score_1, score_2, score_3, too many fingers, deformed hand, too many arms, ugly, uncanny valley";

export type T2IModelChoice = "anima" | "basb";

export const T2I_MODELS: Record<T2IModelChoice, { name: string; unet: string }> = {
  anima: {
    name: "Anima Base v1.0",
    unet: "anima-base-v1.0.safetensors",
  },
  basb: {
    name: "BAS Better Anime Style",
    unet: "BASBetterAnimeStylePlusAnima_baseV10.safetensors",
  },
};

export const DEFAULT_T2I_SAMPLER = "er_sde";
export const DEFAULT_T2I_SCHEDULER = "simple";
export const DEFAULT_T2I_STEPS = 30;
export const DEFAULT_T2I_CFG = 4;
export const DEFAULT_T2I_DENOISE = 1;

export const SUPPORTED_SAMPLERS = [
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
] as const;

export const SUPPORTED_SCHEDULERS = [
  "simple",
  "normal",
  "karras",
  "exponential",
  "sgm_uniform",
  "kl_optimal",
  "ddim_uniform",
  "beta",
] as const;

const T2I_ANIMA_TEMPLATE = {
  "1": {
    inputs: { clip_name: "qwen_3_06b_base.safetensors", type: "stable_diffusion", device: "default" },
    class_type: "CLIPLoader",
    _meta: { title: "Load CLIP" },
  },
  "2": {
    inputs: { unet_name: "anima-base-v1.0.safetensors", weight_dtype: "default" },
    class_type: "UNETLoader",
    _meta: { title: "Load Diffusion Model" },
  },
  "3": {
    inputs: { text: "", clip: ["1", 0] },
    class_type: "CLIPTextEncode",
    _meta: { title: "CLIP Text Encode (Prompt) Pos" },
  },
  "4": {
    inputs: {
      text: DEFAULT_ANIMA_NEGATIVE_PROMPT,
      clip: ["1", 0],
    },
    class_type: "CLIPTextEncode",
    _meta: { title: "CLIP Text Encode (Prompt) Neg" },
  },
  "5": {
    inputs: { vae_name: "qwen_image_vae.safetensors" },
    class_type: "VAELoader",
    _meta: { title: "Load VAE" },
  },
  "6": {
    inputs: { width: 1024, height: 1024, batch_size: 1 },
    class_type: "EmptyLatentImage",
    _meta: { title: "Empty Latent Image" },
  },
  "7": {
    inputs: { lora_name: "silvana-style-AB10-01.safetensors", strength_model: 1, model: ["2", 0] },
    class_type: "LoraLoaderModelOnly",
    _meta: { title: "Load LoRA" },
  },
  "8": {
    inputs: {
      seed: 908531876921313,
      steps: 30,
      cfg: 4,
      sampler_name: "er_sde",
      scheduler: "simple",
      denoise: 1,
      model: ["7", 0],
      positive: ["3", 0],
      negative: ["4", 0],
      latent_image: ["6", 0],
    },
    class_type: "KSampler",
    _meta: { title: "KSampler" },
  },
  "9": {
    inputs: { samples: ["8", 0], vae: ["5", 0] },
    class_type: "VAEDecode",
    _meta: { title: "VAE Decode" },
  },
  "13": {
    inputs: { filename_prefix: "ComfyUI", images: ["9", 0] },
    class_type: "SaveImage",
    _meta: { title: "Save Image" },
  },
} as const;

export function buildT2IWorkflow(opts: {
  prompt: string;
  negativePrompt?: string;
  dimensions: { width: number; height: number };
  model?: T2IModelChoice | string;
  steps?: number;
  cfg?: number;
  samplerName?: string;
  scheduler?: string;
  denoise?: number;
  loraStrength?: number;
  seed?: number;
}) {
  const wf = structuredClone(T2I_ANIMA_TEMPLATE) as any;
  wf["3"].inputs.text = opts.prompt;
  if (typeof opts.negativePrompt === "string") {
    wf["4"].inputs.text = opts.negativePrompt;
  }
  wf["6"].inputs.width = opts.dimensions.width;
  wf["6"].inputs.height = opts.dimensions.height;

  // Node 2: UNET Loader
  if (opts.model === "basb") {
    wf["2"].inputs.unet_name = T2I_MODELS.basb.unet;
  } else {
    wf["2"].inputs.unet_name = T2I_MODELS.anima.unet;
  }

  if (typeof opts.loraStrength === "number") {
    wf["7"].inputs.strength_model = opts.loraStrength;
  }
  if (typeof opts.steps === "number") {
    wf["8"].inputs.steps = opts.steps;
  }
  if (typeof opts.cfg === "number") {
    wf["8"].inputs.cfg = opts.cfg;
  }
  if (typeof opts.samplerName === "string" && opts.samplerName.trim()) {
    wf["8"].inputs.sampler_name = opts.samplerName.trim();
  }
  if (typeof opts.scheduler === "string" && opts.scheduler.trim()) {
    wf["8"].inputs.scheduler = opts.scheduler.trim();
  }
  if (typeof opts.denoise === "number") {
    wf["8"].inputs.denoise = opts.denoise;
  }
  wf["8"].inputs.seed = typeof opts.seed === "number" && opts.seed >= 0 ? opts.seed : randomSeed();
  return wf;
}

function randomSeed() {
  return Math.floor(Math.random() * 1_000_000_000_000);
}
