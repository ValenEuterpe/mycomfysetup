import { ComfyWorkflowGraph, GeneratedMedia } from "../types/workflow";
import { VNCharacter, VNScene } from "../types/visualNovel";
import { queuePrompt, pollPromptCompletion } from "./comfyClient";
import { generateRandomSeed } from "./workflowInjector";

const ANIMA_QUALITY_PREFILL = "masterpiece, best quality, score_9, score_8, safe, @silvana,";
const ANIMA_NEGATIVE_DEFAULT =
  "worst quality, low quality, score_1, score_2, score_3, deformed hand, ugly, uncanny valley, extra limbs, bad anatomy, poorly drawn face, poorly drawn hands, missing fingers, blurry";

/**
 * Base Anima workflow graph template for scene illustrations.
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
 * Anima + RMBG-2.0 + OutlineAlphaSnap workflow graph template for character sprites.
 * Matches workflow/anima-removebg-sticker.json exactly.
 */
export const animaRemoveBgStickerWorkflow: ComfyWorkflowGraph = {
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
      text: "",
      clip: ["1", 0],
    },
    class_type: "CLIPTextEncode",
    _meta: { title: "CLIP Text Encode (Prompt) Pos" },
  },
  "3": {
    inputs: {
      unet_name: "anima.base.safetensors",
      weight_dtype: "default",
    },
    class_type: "UNETLoader",
    _meta: { title: "Load Diffusion Model" },
  },
  "4": {
    inputs: {
      text: "worst quality, low quality, score_1, score_2, score_3, too many fingers, deformed hand, too many arms, ugly, uncanny valley",
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
      seed: 707943841279101,
      steps: 30,
      cfg: 4,
      sampler_name: "er_sde",
      scheduler: "simple",
      denoise: 1,
      model: ["8", 0],
      positive: ["2", 0],
      negative: ["4", 0],
      latent_image: ["7", 0],
    },
    class_type: "KSampler",
    _meta: { title: "KSampler" },
  },
  "7": {
    inputs: {
      width: 1024,
      height: 1024,
      batch_size: 1,
    },
    class_type: "EmptyLatentImage",
    _meta: { title: "Empty Latent Image" },
  },
  "8": {
    inputs: {
      lora_name: "silvana.safetensors",
      strength_model: 1,
      model: ["3", 0],
    },
    class_type: "LoraLoaderModelOnly",
    _meta: { title: "Load LoRA" },
  },
  "9": {
    inputs: {
      samples: ["6", 0],
      vae: ["5", 0],
    },
    class_type: "VAEDecode",
    _meta: { title: "VAE Decode" },
  },
  "12": {
    inputs: {
      model: "RMBG-2.0",
      sensitivity: 1,
      process_res: 1024,
      mask_blur: 0,
      mask_offset: 0,
      invert_output: false,
      refine_foreground: false,
      unload_model: false,
      background: "Alpha",
      background_color: "#222222",
      image: ["9", 0],
    },
    class_type: "RMBG",
    _meta: { title: "Remove Background (RMBG)" },
  },
  "13": {
    inputs: {
      width: 2,
      color: "#FFFFFF",
      image: ["12", 0],
    },
    class_type: "OutlineAlphaSnap",
    _meta: { title: "Outline Alpha Snap" },
  },
  "14": {
    inputs: {
      filename_prefix: "Sprites",
      images: ["13", 0],
    },
    class_type: "SaveImage",
    _meta: { title: "Save Image" },
  },
};

/**
 * Single-Character Consistency Blueprint:
 * [Character Anchor] + [Clothing Lock] + [Expression & Pose] + [Setting & Lighting Style]
 *
 * Rules:
 * 1. Keep [Character Anchor] and [Clothing Lock] 100% identical word-for-word across all prompts.
 * 2. Modify ONLY [Expression & Pose] and [Setting & Lighting].
 * 3. Combine pose, hand gestures, and emotion explicitly, always facing the player/viewer.
 */
export function buildModularSpritePrompt(
  characterAnchor: string,
  clothingLock: string,
  expressionAndPose: string,
  settingStyle = "clean plain neutral studio background, soft studio lighting, sharp focus, centered full body display"
): string {
  return `masterpiece, best quality, score_9, score_8, safe, @silvana, Character Base: ${characterAnchor.trim()}\nClothing: ${clothingLock.trim()}\nPose & Hands: ${expressionAndPose.trim()}\nSetting & Style: ${settingStyle.trim()}`;
}

export interface ModularExpressionPose {
  id: string;
  name: string;
  category: "neutral" | "happy" | "shy" | "dramatic" | "action";
  prompt: string;
  handGestures: string;
  facialCue: string;
}

/**
 * Master Expression & Pose Library for single-character sprites.
 * Each entry strictly combines measurable hand positions, posture, facial cues,
 * and always includes "looking at viewer".
 */
export const MODULAR_EXPRESSION_LIBRARY: Record<string, ModularExpressionPose> = {
  neutral: {
    id: "neutral",
    name: "Neutral / Calm",
    category: "neutral",
    prompt:
      "Standing upright with relaxed shoulders, arms resting naturally at sides with relaxed hands; calm composed expression, gentle relaxed lips, clear direct eyes, looking at viewer",
    handGestures: "arms resting naturally at sides, open relaxed fingers",
    facialCue: "calm composed expression, gentle relaxed lips",
  },
  shy: {
    id: "shy",
    name: "Shy / Bashful",
    category: "shy",
    prompt:
      "Standing timidly with shoulders turned slightly inward, both hands held in front at chest level with her two index fingers touching tip-to-tip in a hesitant, shy gesture; shy bashful expression with a subtle rosy blush and modest upward gaze, looking at viewer",
    handGestures: "both hands held at chest level with two index fingers touching tip-to-tip",
    facialCue: "shy bashful expression, rosy blushing cheeks, modest upward gaze",
  },
  happy: {
    id: "happy",
    name: "Happy / Cheerful",
    category: "happy",
    prompt:
      "Standing cheerfully with relaxed shoulders, one hand raised near collarbone with fingers curled gently in a warm gesture; radiant warm smile, sparkling happy eyes, soft blush, looking at viewer",
    handGestures: "one hand raised near collarbone, gentle curled fingers",
    facialCue: "radiant warm smile, sparkling happy eyes, soft blush",
  },
  laughing: {
    id: "laughing",
    name: "Laughing / Joyful",
    category: "happy",
    prompt:
      "Standing joyfully tilted slightly back, one hand covering mouth in delightful amusement; cheerful open laughing expression, crinkling joyful eyes, looking at viewer",
    handGestures: "one hand covering mouth in amusement",
    facialCue: "cheerful open laughing expression, joyful crinkling eyes",
  },
  angry: {
    id: "angry",
    name: "Angry / Aggressive",
    category: "dramatic",
    prompt:
      "Standing aggressively with shoulders squared forward, both hands clenched into tight fists at sides; furious stern glare, furrowed eyebrows, clenched jaw, intense focused eyes, looking at viewer",
    handGestures: "both hands clenched into tight fists at sides",
    facialCue: "furious stern glare, furrowed eyebrows, clenched jaw",
  },
  smug: {
    id: "smug",
    name: "Smug / Confident",
    category: "happy",
    prompt:
      "Standing with confident posture, one hand placed firmly on hip with elbow flared out, other hand relaxed; playful smug smirk, half-lidded eyes, one eyebrow slightly raised, looking at viewer",
    handGestures: "one hand placed firmly on hip, elbow flared out",
    facialCue: "playful smug smirk, half-lidded eyes, one raised eyebrow",
  },
  sad: {
    id: "sad",
    name: "Sad / Melancholic",
    category: "dramatic",
    prompt:
      "Standing with slumped shoulders, hands loosely clasping wrists in front; sad melancholic frown, teary glistening eyes, looking slightly downward before meeting viewer's gaze, looking at viewer",
    handGestures: "hands loosely clasping wrists in front of waist",
    facialCue: "sad melancholic frown, teary glistening eyes",
  },
  surprised: {
    id: "surprised",
    name: "Surprised / Gasp",
    category: "dramatic",
    prompt:
      "Standing upright with shoulders back, both hands open and raised near chest in sudden surprise; wide round eyes, small parted lips in a gasp, raised eyebrows, looking at viewer",
    handGestures: "both hands open with palms raised near chest",
    facialCue: "wide round eyes, parted lips in a gasp, raised eyebrows",
  },
  thinking: {
    id: "thinking",
    name: "Thinking / Pondering",
    category: "neutral",
    prompt:
      "Standing with arms loosely folded across chest, one index finger resting lightly against chin; thoughtful curious expression, focused contemplative eyes, head tilted slightly, looking at viewer",
    handGestures: "arms folded across chest, index finger on chin",
    facialCue: "thoughtful curious expression, contemplative eyes",
  },
  flirty: {
    id: "flirty",
    name: "Flirty / Seductive",
    category: "action",
    prompt:
      "Standing with weight shifted onto one hip, one hand gently twirling a strand of hair; seductive alluring gaze, half-lidded bedroom eyes, subtle teasing smirk, looking at viewer",
    handGestures: "one hand gently twirling a strand of hair",
    facialCue: "seductive alluring gaze, half-lidded bedroom eyes, teasing smirk",
  },
  waving: {
    id: "waving",
    name: "Waving / Friendly",
    category: "happy",
    prompt:
      "Standing upright in a friendly stance, one hand raised high waving warmly with open palm facing forward; welcoming cheerful smile, bright friendly eyes, looking at viewer",
    handGestures: "one hand raised high waving warmly with open palm",
    facialCue: "welcoming cheerful smile, bright friendly eyes",
  },
  crossed_arms: {
    id: "crossed_arms",
    name: "Crossed Arms / Composed",
    category: "neutral",
    prompt:
      "Standing tall and composed, arms folded firmly across chest; calm composed expression, direct steady eye contact, looking at viewer",
    handGestures: "arms folded firmly across chest",
    facialCue: "calm composed expression, direct steady eye contact",
  },
  hands_on_hips: {
    id: "hands_on_hips",
    name: "Hands on Hips / Assertive",
    category: "action",
    prompt:
      "Standing with an assertive posture, both hands placed firmly on hips, elbows flared outward; determined confident expression, bright focused eyes, looking at viewer",
    handGestures: "both hands placed firmly on hips, elbows flared outward",
    facialCue: "determined confident expression, bright focused eyes",
  },
};

/**
 * Multi-Character Integration & Separation Blueprint:
 * [Character 1 Anchor & Clothing Lock]
 * + [Character 2 Anchor & Clothing Lock]
 * + [Unified Interaction & Spatial Relationship]
 * + [Environment, Lighting, & Style]
 *
 * Rules:
 * 1. Strict Token Order: Always list Character 1 first and Character 2 second in every prompt.
 * 2. Eliminate Positional Labels: Strictly avoid "left/right", "side A/side B" to prevent canvas splitting.
 * 3. Use Collaborative Verbs: Anchor characters together using spatial interaction.
 */
export function buildMultiCharacterCGPrompt(options: {
  char1: { name: string; anchor: string; clothing: string };
  char2: { name: string; anchor: string; clothing: string };
  interaction: string; // e.g. "sitting opposite across a table", "leaning head on shoulder", "embracing intimately"
  environmentAndLighting?: string;
}): string {
  // Sanitize interaction to strictly eliminate positional left/right labels
  const sanitizedInteraction = options.interaction
    .replace(/\b(on\s+the\s+left(\s+side)?|left\s+side|left-hand\s+side|on\s+the\s+right(\s+side)?|right\s+side|right-hand\s+side)\b/gi, "")
    .replace(/\b(character\s+[12]\s+on\s+the\s+(left|right)|side\s+[ab])\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const env =
    options.environmentAndLighting?.trim() ||
    "warm cinematic lighting, natural depth of field, detailed atmospheric environment";

  return `masterpiece, best quality, score_9, score_8, safe, @silvana, Character 1: ${options.char1.name}, ${options.char1.anchor.trim()}, wearing ${options.char1.clothing.trim()}.\nCharacter 2: ${options.char2.name}, ${options.char2.anchor.trim()}, wearing ${options.char2.clothing.trim()}.\nScene & Interaction: ${sanitizedInteraction}.\nSetting & Style: ${env}.`;
}

/**
 * Executes a sprite generation with Anima + RMBG-2.0 + OutlineAlphaSnap.
 * If outlineWidth is 0, connects SaveImage directly to RMBG-2.0 for pure alpha cutout.
 * If outlineWidth > 0, applies the outline snap pass with specified border width.
 */
export async function executeAnimaSpriteGeneration(
  endpoint: string,
  options: {
    positivePrompt: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    outlineWidth?: number; // 0 for clean alpha cutout, 2 for sticker border
    seed?: number;
    onProgress?: (percent: number, statusText: string) => void;
  }
): Promise<GeneratedMedia> {
  const graph: ComfyWorkflowGraph = JSON.parse(JSON.stringify(animaRemoveBgStickerWorkflow));

  // 1. Positive Prompt (Modular Anchor)
  if (graph["2"]?.inputs) {
    graph["2"].inputs.text = options.positivePrompt.trim();
  }

  // 2. Negative Prompt
  if (graph["4"]?.inputs && options.negativePrompt) {
    graph["4"].inputs.text = options.negativePrompt;
  }

  // 3. Dimensions (Default 1024x1024 or 1024x1536 full-body)
  if (graph["7"]?.inputs) {
    graph["7"].inputs.width = options.width || 1024;
    graph["7"].inputs.height = options.height || 1024;
  }

  // 4. Seed
  const seed = options.seed !== undefined ? options.seed : generateRandomSeed();
  if (graph["6"]?.inputs) {
    graph["6"].inputs.seed = seed;
  }

  // 5. Outline / Cutout Mode
  const outlineWidth = options.outlineWidth !== undefined ? options.outlineWidth : 0;
  if (outlineWidth === 0) {
    // Pure clean transparent alpha cutout directly from RMBG-2.0
    if (graph["14"]?.inputs) {
      graph["14"].inputs.images = ["12", 0];
    }
  } else {
    // Apply sticker outline with specified width
    if (graph["13"]?.inputs) {
      graph["13"].inputs.width = outlineWidth;
      graph["13"].inputs.color = "#FFFFFF";
    }
    if (graph["14"]?.inputs) {
      graph["14"].inputs.images = ["13", 0];
    }
  }

  options.onProgress?.(10, "Submitting to ComfyUI sprite pipeline...");
  const clientId = `sprite_${Math.random().toString(36).substring(2, 9)}`;
  const queueRes = await queuePrompt(endpoint, graph, clientId);

  if (!queueRes || !queueRes.prompt_id) {
    throw new Error("No prompt_id returned from ComfyUI /prompt endpoint.");
  }

  options.onProgress?.(25, "Queued in Anima + RMBG GPU pipeline...");

  const mediaOutputs = await pollPromptCompletion(
    endpoint,
    queueRes.prompt_id,
    (pct, text) => {
      options.onProgress?.(Math.max(25, pct), text);
    }
  );

  if (!mediaOutputs || mediaOutputs.length === 0) {
    throw new Error("Sprite generation completed but no output image was found.");
  }

  return mediaOutputs[0];
}

/**
 * Generates an empty location background image with Anima scenery tags.
 */
export async function executeLocationGeneration(
  endpoint: string,
  options: {
    locationPrompt: string;
    timeOfDay?: "day" | "evening" | "night";
    width?: number;
    height?: number;
    seed?: number;
    onProgress?: (percent: number, statusText: string) => void;
  }
): Promise<GeneratedMedia> {
  const timeDesc =
    options.timeOfDay === "evening"
      ? "sunset, golden hour warm lighting, dusk sky"
      : options.timeOfDay === "night"
      ? "night, starry dark sky, glowing moonlight, ambient night illumination"
      : "daytime, bright clear natural daylight, vibrant atmosphere";

  const positivePrompt = `masterpiece, best quality, score_9, score_8, safe, @silvana, scenery, no humans, ${options.locationPrompt.trim()}, ${timeDesc}, beautiful detailed background, 8k wallpaper, anime style, highly detailed interior and architecture`;
  const negativePrompt =
    "human, person, girl, boy, character, 1girl, 1boy, crowd, people, low quality, worst quality, text, watermark, signature";

  return executeAnimaGeneration(endpoint, {
    positivePrompt,
    negativePrompt,
    width: options.width || 1216,
    height: options.height || 832, // 16:9 scenic resolution
    seed: options.seed,
    onProgress: options.onProgress,
  });
}

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
 * Generates an Anima lookbook reference photo of an outfit on a white headless mannequin or clothing display stand (no humans).
 */
export async function generateAttirePreview(
  endpoint: string,
  attire: { verbatimPrompt: string; name?: string },
  onProgress?: (percent: number, statusText: string) => void
): Promise<GeneratedMedia> {
  const positivePrompt = `no humans, clothes on display, white mannequin, headless mannequin, ghost mannequin, clothes on hanger, clothing display, ${attire.verbatimPrompt}, simple clean neutral background, studio product shot, full outfit display, high detail, sharp focus`;
  const negativePrompt = `human, face, head, woman, man, girl, boy, eyes, skin, hair, realistic person, lowres, blurry, distorted, anime girl, anime boy`;

  return executeAnimaGeneration(endpoint, {
    positivePrompt,
    negativePrompt,
    width: 832,
    height: 1216, // Portrait format for full outfit display
    onProgress,
  });
}

/**
 * Detects whether a character is male or female based on explicit gender tag or prompt keywords.
 */
export function detectCharacterGender(c: VNCharacter): "male" | "female" {
  if (c.gender === "male") return "male";
  if (c.gender === "female") return "female";
  const text = `${c.verbatimIdentityPrompt} ${c.userPrompt}`.toLowerCase();
  if (/\b(1man|1boy|male|man|boy|guy|husband|father|gentleman|brother|he|his)\b/.test(text)) {
    return "male";
  }
  return "female";
}

/**
 * Returns exact Danbooru multi-subject composition tags to prevent gender and identity bleeding.
 */
export function getDanbooruGenderCountTag(characters: VNCharacter[]): string {
  if (characters.length === 0) return "scenery, no humans";
  const genders = characters.map(detectCharacterGender);
  const males = genders.filter((g) => g === "male").length;
  const females = genders.filter((g) => g === "female").length;

  if (characters.length === 1) {
    return males === 1 ? "1boy, solo" : "1girl, solo";
  }
  if (characters.length === 2) {
    if (males === 1 && females === 1) return "1boy and 1girl, 1boy, 1girl";
    if (females === 2) return "2girls";
    return "2boys";
  }
  if (characters.length === 3) {
    if (males === 1 && females === 2) return "1boy and 2girls, 1boy, 2girls";
    if (males === 2 && females === 1) return "2boys and 1girl, 2boys, 1girl";
    if (females === 3) return "3girls";
    return "3boys";
  }
  return "multiple people";
}

/**
 * Sanitizes aggressive literary hyperbole (e.g. shouting, screaming, yelling) in conversational scenes
 * so that Danbooru anime diffusion models do not render violent, distorted screaming faces during dialogue.
 */
export function sanitizeSceneExpressions(prompt: string, tone?: string): string {
  // If scene is explicitly marked as a crisis (e.g. violent plane crash), allow terrified disaster reactions
  if (tone === "crisis") {
    return prompt;
  }

  return prompt
    .replace(/\b(shouting|screaming|yelling)\s+(at|towards)\b/gi, "talking to, looking at")
    .replace(/\bmouth\s+open\s+in\s+a\s+(silent\s+)?(scream|shout|gasp)\b/gi, "parted lips, serious expression")
    .replace(/\b(shouting|screaming|yelling|screaming\s+furiously)\b/gi, "talking, parted lips")
    .replace(/\beyes\s+wide\s+with\s+terror\b/gi, "serious focused expression")
    .replace(/\b(sobbing\s+hysterically|hysterical\s+crying)\b/gi, "worried expression, looking down");
}

/**
 * Builds the composite Anima prompt for a scene, guaranteeing that the verbatim identity
 * prompts of all present characters (up to 3 max) are included and segmented with exact gender tags.
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

  const charCountTag = getDanbooruGenderCountTag(presentChars);

  let composed = scene.imagePrompt.trim();

  // Strip generic count tags if LLM placed them at the start
  composed = composed
    .replace(/^(2people,\s*duo|3people,\s*trio|1person,\s*solo),\s*/i, "")
    .replace(/\bboth\s+wearing\b/gi, "individually wearing");

  // Apply expression sanitizer to prevent unwarranted yelling during discussions
  composed = sanitizeSceneExpressions(composed, scene.sceneTone);

  // If the prompt doesn't already reference the characters' verbatim descriptions, append them
  const missingPrompts = presentChars
    .filter((c) => !composed.includes(c.verbatimIdentityPrompt.slice(0, 25)))
    .map((c) => {
      const gTag = detectCharacterGender(c) === "male" ? "1man" : "1woman";
      return `[Character ${c.name}: ${gTag}, ${c.verbatimIdentityPrompt}]`;
    });

  if (missingPrompts.length > 0) {
    composed = `${composed}, ${missingPrompts.join(", ")}`;
  }

  // If 2 or more characters are present and no gaze direction is specified, add mutual gaze
  if (presentChars.length >= 2 && !/\b(looking at each other|facing each other|eye contact)\b/i.test(composed)) {
    composed = `${composed}, looking at each other`;
  }

  return `${charCountTag}, ${composed}`;
}
