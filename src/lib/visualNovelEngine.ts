import { ComfyWorkflowGraph, GeneratedMedia } from "../types/workflow";
import { VNCharacter, VNScene } from "../types/visualNovel";
import { queuePrompt, pollPromptCompletion } from "./comfyClient";
import { generateRandomSeed } from "./workflowInjector";

const ANIMA_QUALITY_PREFILL = "masterpiece, best quality, score_9, score_8, safe, @silvana,";
const ANIMA_NEGATIVE_DEFAULT =
  "worst quality, low quality, score_1, score_2, score_3, deformed hand, ugly, uncanny valley, extra limbs, bad anatomy, poorly drawn face, poorly drawn hands, missing fingers, blurry";

/**
 * Base Anima workflow graph template.
 */
export const baseAnimaWorkflow: ComfyWorkflowGraph = {
  "1": {
    inputs: {
      clip_name: "qwen_3_06b_base.safetensors",
      type: "stable_diffusion",
      device: "default",
    },
    class_type: "CLIPLoader",
    _meta: { title: "Load CLIP" },
  },
  "2": {
    inputs: {
      unet_name: "anima.base.safetensors",
      weight_dtype: "default",
    },
    class_type: "UNETLoader",
    _meta: { title: "Load Diffusion Model" },
  },
  "3": {
    inputs: {
      text: "",
      clip: ["1", 0],
    },
    class_type: "CLIPTextEncode",
    _meta: { title: "CLIP Text Encode (Prompt) Pos" },
  },
  "4": {
    inputs: {
      text: ANIMA_NEGATIVE_DEFAULT,
      clip: ["1", 0],
    },
    class_type: "CLIPTextEncode",
    _meta: { title: "CLIP Text Encode (Prompt) Neg" },
  },
  "5": {
    inputs: {
      vae_name: "qwen_image_vae.safetensors",
    },
    class_type: "VAELoader",
    _meta: { title: "Load VAE" },
  },
  "6": {
    inputs: {
      width: 1024,
      height: 1024,
      batch_size: 1,
    },
    class_type: "EmptyLatentImage",
    _meta: { title: "Empty Latent Image" },
  },
  "7": {
    inputs: {
      lora_name: "silvana.safetensors",
      strength_model: 1,
      model: ["2", 0],
    },
    class_type: "LoraLoaderModelOnly",
    _meta: { title: "Load LoRA" },
  },
  "8": {
    inputs: {
      seed: 123456789,
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
    inputs: {
      samples: ["8", 0],
      vae: ["5", 0],
    },
    class_type: "VAEDecode",
    _meta: { title: "VAE Decode" },
  },
  "13": {
    inputs: {
      filename_prefix: "VisualNovel",
      images: ["9", 0],
    },
    class_type: "SaveImage",
    _meta: { title: "Save Image" },
  },
};

/**
 * Executes a single image generation with Anima Base.
 */
export async function executeAnimaGeneration(
  endpoint: string,
  options: {
    positivePrompt: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    seed?: number;
    onProgress?: (percent: number, statusText: string) => void;
  }
): Promise<GeneratedMedia> {
  const graph: ComfyWorkflowGraph = JSON.parse(JSON.stringify(baseAnimaWorkflow));

  // 1. Inject Positive Prompt
  let cleanPrompt = options.positivePrompt.trim();
  if (!cleanPrompt.startsWith("masterpiece")) {
    cleanPrompt = `${ANIMA_QUALITY_PREFILL} ${cleanPrompt}`;
  }
  if (graph["3"]?.inputs) {
    graph["3"].inputs.text = cleanPrompt;
  }

  // 2. Inject Negative Prompt
  if (graph["4"]?.inputs) {
    graph["4"].inputs.text = options.negativePrompt || ANIMA_NEGATIVE_DEFAULT;
  }

  // 3. Inject Dimensions (Default to 1216x832 landscape for scenes, or 832x1216 for portraits)
  const width = options.width || 1216;
  const height = options.height || 832;
  if (graph["6"]?.inputs) {
    graph["6"].inputs.width = width;
    graph["6"].inputs.height = height;
  }

  // 4. Inject Seed
  const seed = options.seed !== undefined ? options.seed : generateRandomSeed();
  if (graph["8"]?.inputs) {
    graph["8"].inputs.seed = seed;
  }

  // 5. Submit to ComfyUI relay
  options.onProgress?.(10, "Submitting to ComfyUI pipeline...");
  const clientId = `vn_${Math.random().toString(36).substring(2, 9)}`;
  const queueRes = await queuePrompt(endpoint, graph, clientId);

  if (!queueRes || !queueRes.prompt_id) {
    throw new Error("No prompt_id returned from ComfyUI /prompt endpoint.");
  }

  options.onProgress?.(25, "Queued in Anima GPU pipeline...");

  // 6. Poll completion
  const mediaOutputs = await pollPromptCompletion(
    endpoint,
    queueRes.prompt_id,
    (pct, text) => {
      options.onProgress?.(Math.max(25, pct), text);
    }
  );

  if (!mediaOutputs || mediaOutputs.length === 0) {
    throw new Error("Generation completed but no output image was found.");
  }

  return mediaOutputs[0];
}

/**
 * Generates an Anima character portrait using their verbatim identity prompt.
 */
export async function generateCharacterPortrait(
  endpoint: string,
  character: { verbatimIdentityPrompt: string; name: string },
  onProgress?: (percent: number, statusText: string) => void
): Promise<GeneratedMedia> {
  const prompt = `${character.verbatimIdentityPrompt}, solo, upper body character portrait, simple clean background, looking at viewer, expressive anime illustration`;
  return executeAnimaGeneration(endpoint, {
    positivePrompt: prompt,
    width: 832,
    height: 1216, // Portrait aspect ratio for character card
    onProgress,
  });
}

/**
 * Builds the composite Anima prompt for a scene, guaranteeing that the verbatim identity
 * prompts of all present characters (up to 3 max) are included.
 */
export function buildScenePrompt(
  scene: VNScene,
  allCharacters: VNCharacter[]
): string {
  // Max 3 characters
  const presentCharNames = (scene.charactersPresent || []).slice(0, 3);
  const presentChars = presentCharNames
    .map((name) => allCharacters.find((c) => c.name.toLowerCase() === name.toLowerCase()))
    .filter((c): c is VNCharacter => !!c);

  const charCountTag =
    presentChars.length === 1
      ? "1person, solo"
      : presentChars.length === 2
      ? "2people, duo"
      : presentChars.length === 3
      ? "3people, trio"
      : "scenery, no humans";

  // Check if scene.imagePrompt already contains verbatim prompts
  let composed = scene.imagePrompt.trim();

  // If the prompt doesn't already reference the characters' verbatim descriptions, append them
  const missingPrompts = presentChars
    .filter((c) => !composed.includes(c.verbatimIdentityPrompt.slice(0, 30)))
    .map((c) => `[Character ${c.name}: ${c.verbatimIdentityPrompt}]`);

  if (missingPrompts.length > 0) {
    composed = `${composed}, ${missingPrompts.join(", ")}`;
  }

  return `${charCountTag}, ${composed}`;
}
