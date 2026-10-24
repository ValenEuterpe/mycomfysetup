import { ComfyWorkflowGraph, GeneratedMedia } from "../types/workflow";
import { VNCharacter, VNScene, VNLocation } from "../types/visualNovel";
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
 * Helper to clean and format a sentence segment for Modular Anchor prompts.
 * Strips line breaks and trailing punctuation so segments join into fluent natural prose.
 */
function cleanSentence(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[.,;:\s]+$/, "")
    .trim();
}

/**
 * Single-Character Consistency Blueprint:
 * [Character Anchor] + [Clothing Lock] + [Expression & Pose] + [Setting & Lighting Style]
 *
 * Rules:
 * 1. Flowing Natural Prose: No artificial section labels like "Character Base:" or "Pose & Hands:".
 * 2. Keep [Character Anchor] and [Clothing Lock] 100% identical word-for-word across all prompts.
 * 3. Modify ONLY [Expression & Pose] and [Setting & Lighting].
 * 4. Combine exact anatomical postures, hand mechanics, facial expressions, and camera-directed gazes.
 */
export function buildModularSpritePrompt(
  characterAnchor: string,
  clothingLock: string,
  expressionAndPose: string,
  settingStyle = "Clean plain neutral studio background, soft studio lighting, sharp focus, centered medium full-shot"
): string {
  const anchor = cleanSentence(characterAnchor);

  let clothing = cleanSentence(clothingLock);
  if (!/^wearing\s+/i.test(clothing)) {
    clothing = `Wearing ${clothing.charAt(0).toLowerCase() + clothing.slice(1)}`;
  } else {
    clothing = `Wearing ${clothing.replace(/^wearing\s+/i, "")}`;
  }

  const pose = cleanSentence(expressionAndPose);
  const setting = cleanSentence(settingStyle);

  return `masterpiece, best quality, score_9, score_8, safe, @silvana, ${anchor}. ${clothing}. ${pose}. ${setting}.`;
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
 * Plug-and-play [Expression & Pose] modules containing exact anatomical postures,
 * hand mechanics, facial expressions, and camera-directed gazes.
 */
export const MODULAR_EXPRESSION_LIBRARY: Record<string, ModularExpressionPose> = {
  neutral: {
    id: "neutral",
    name: "Neutral / Attentive",
    category: "neutral",
    prompt:
      "Standing upright with relaxed shoulders, holding a leather-bound notebook against the side with one arm while the other hand rests naturally along the thigh; composed, neutral, attentive facial expression, lips relaxed in a straight line, looking directly forward into the camera at the viewer.",
    handGestures: "holding a notebook against side with one arm, other hand resting along thigh",
    facialCue: "composed neutral attentive expression, lips relaxed in a straight line",
  },
  happy: {
    id: "happy",
    name: "Happy / Welcoming",
    category: "happy",
    prompt:
      "Leaning slightly forward at the waist, one hand gently resting on the hip while the other hand rests open-palmed against the collarbone; warm, cheerful expression with crinkled eye corners, an open genuine smile showing straight teeth, looking directly forward into the camera at the viewer.",
    handGestures: "one hand on hip, other hand open-palmed against collarbone",
    facialCue: "warm cheerful expression, crinkled eye corners, open genuine smile",
  },
  sad: {
    id: "sad",
    name: "Sad / Melancholic",
    category: "dramatic",
    prompt:
      "Standing with slightly slumped shoulders, arms held loosely in front with both hands clasped around the lower abdomen, fingers lightly interlocked; somber downturned mouth, furrowed inner eyebrows, heavy glistening eyelids, looking directly forward into the camera at the viewer with a vulnerable, sorrowful gaze.",
    handGestures: "hands clasped around lower abdomen, fingers lightly interlocked",
    facialCue: "somber downturned mouth, furrowed inner eyebrows, heavy glistening eyelids",
  },
  angry: {
    id: "angry",
    name: "Angry / Stern",
    category: "dramatic",
    prompt:
      "Standing tall with squared shoulders, arms folded firmly across the chest, weight shifted back slightly onto one heel; sharp furrowed brow, narrowed eyelids, tight thin-pressed lips, jaw muscles subtly clenched, staring intently straight into the camera at the viewer with stern, reprimanding authority.",
    handGestures: "arms folded firmly across chest, weight shifted back slightly",
    facialCue: "sharp furrowed brow, narrowed eyelids, tight thin-pressed lips, clenched jaw",
  },
  shy: {
    id: "shy",
    name: "Shy / Timid",
    category: "shy",
    prompt:
      "Standing with shoulders turned slightly inward, one arm crossed over the waist while the other hand gently tucks a strand of hair behind the ear; faint rosy flush across the cheeks and nose bridge, soft hesitant half-smile with closed lips, looking slightly upward directly into the camera at the viewer with a gentle, bashful gaze.",
    handGestures: "one arm crossed over waist, other hand tucking hair behind ear",
    facialCue: "faint rosy flush across cheeks and nose, soft hesitant half-smile, bashful gaze",
  },
  embarrassed: {
    id: "embarrassed",
    name: "Embarrassed / Flustered",
    category: "shy",
    prompt:
      "Standing with a sheepish, hunched posture, one flat palm pressed against the side of a warm flushed cheek while the other hand rubs the back of the neck; pronounced rosy redness across the cheeks and ears, wide sheepish eyes, nervous tight-lipped grimace-smile, gazing directly into the camera at the viewer with an awkward, self-conscious expression.",
    handGestures: "flat palm pressed against flushed cheek, other hand rubbing back of neck",
    facialCue: "pronounced rosy redness on cheeks and ears, wide sheepish eyes, nervous grimace-smile",
  },
  smirk: {
    id: "smirk",
    name: "Smirk / Playful",
    category: "happy",
    prompt:
      "Leaning sideways against the edge of a flat surface or desk, one hand resting on the surface behind and the other hand resting casually on the waist; head tilted slightly to one side, one eyebrow raised subtly, asymmetric wry smirk tugging one corner of the mouth upward, looking directly into the camera at the viewer with an amused, confident challenge.",
    handGestures: "one hand resting on surface behind, other hand casually on waist",
    facialCue: "head tilted, one eyebrow raised subtly, asymmetric wry smirk tugging one corner upward",
  },
  laughing: {
    id: "laughing",
    name: "Laughing / Mirthful",
    category: "happy",
    prompt:
      "Mid-laugh with head tilted slightly back, one hand raised lightly to shield the open mouth while the other hand presses against the stomach; eyes crinkled nearly shut with delight, deep laugh creases, radiant wide open smile showing teeth mid-chuckle, directing a joyful gaze directly forward into the camera at the viewer.",
    handGestures: "one hand raised to shield open mouth, other hand pressing against stomach",
    facialCue: "eyes crinkled nearly shut, deep laugh creases, radiant wide open smile showing teeth",
  },
  thinking: {
    id: "thinking",
    name: "Thinking / Pondering",
    category: "neutral",
    prompt:
      "Standing with arms loosely folded across the chest, one index finger resting lightly along the jawline against the cheek while the thumb supports the chin; head tilted thoughtfully to one side, one eyebrow slightly arched, contemplative focused gaze looking directly forward into the camera at the viewer.",
    handGestures: "arms folded loosely, index finger along jawline, thumb supporting chin",
    facialCue: "head tilted thoughtfully, one eyebrow arched, contemplative focused gaze",
  },
  surprised: {
    id: "surprised",
    name: "Surprised / Startled",
    category: "dramatic",
    prompt:
      "Standing upright with shoulders suddenly drawn back, both hands open-palmed and lifted near the chest with fingers spread slightly apart in involuntary surprise; wide round eyes, eyebrows raised high on the forehead, lips parted in a soft audible gasp, staring directly forward into the camera at the viewer with an astonished expression.",
    handGestures: "both hands open-palmed and lifted near chest with fingers spread slightly",
    facialCue: "wide round eyes, eyebrows raised high, lips parted in a soft audible gasp",
  },
  seductive: {
    id: "seductive",
    name: "Seductive / Alluring",
    category: "action",
    prompt:
      "Standing with weight shifted onto one hip, one hand lightly tracing along the collarbone while the other hand rests loosely along the outer thigh; head tilted slightly downward with a slow upward gaze through eyelashes, subtle bedroom eyes, enigmatic soft parted-lips smirk, looking directly forward into the camera at the viewer with an alluring, confident challenge.",
    handGestures: "one hand lightly tracing collarbone, other hand loosely along outer thigh",
    facialCue: "slow upward gaze through eyelashes, subtle bedroom eyes, soft parted-lips smirk",
  },
  waving: {
    id: "waving",
    name: "Waving / Welcoming",
    category: "happy",
    prompt:
      "Standing upright in a friendly welcoming stance, one hand raised high to shoulder level waving warmly with an open forward-facing palm while the other arm rests easily at the side; bright welcoming smile showing straight upper teeth, energetic sparkling eyes, crinkled cheeks, looking directly forward into the camera at the viewer.",
    handGestures: "one hand raised high to shoulder level waving warmly with open palm",
    facialCue: "bright welcoming smile showing straight upper teeth, energetic sparkling eyes",
  },
  crossed_arms: {
    id: "crossed_arms",
    name: "Crossed Arms / Composed",
    category: "neutral",
    prompt:
      "Standing tall and composed with feet shoulder-width apart, arms folded firmly across the chest with hands tucked neatly under the biceps; calm, steady, self-assured facial expression, lips relaxed in a subtle line, looking directly forward into the camera at the viewer with tranquil confidence.",
    handGestures: "arms folded firmly across chest, hands tucked neatly under biceps",
    facialCue: "calm steady self-assured expression, lips relaxed, tranquil confidence",
  },
  hands_on_hips: {
    id: "hands_on_hips",
    name: "Hands on Hips / Assertive",
    category: "action",
    prompt:
      "Standing with an assertive upright posture, both hands placed firmly on the hips with fingers splayed over the waist and elbows flared outward; determined confident expression, bright focused eyes, chin slightly raised, looking directly forward into the camera at the viewer.",
    handGestures: "both hands placed firmly on hips with fingers splayed, elbows flared outward",
    facialCue: "determined confident expression, bright focused eyes, chin slightly raised",
  },
  relieved: {
    id: "relieved",
    name: "Relieved / Sighing",
    category: "happy",
    prompt:
      "Standing with shoulders visibly dropping in a relaxed exhale, one flat hand placed over the center of the chest while the other arm hangs loosely at the side; soft gentle exhale through parted lips, softened eyelids, subtle warm smile of pure relief, looking directly forward into the camera at the viewer.",
    handGestures: "one flat hand placed over center of chest, other arm hanging loosely",
    facialCue: "soft gentle exhale through parted lips, softened eyelids, subtle warm smile of relief",
  },
  disgusted: {
    id: "disgusted",
    name: "Disgusted / Repulsed",
    category: "dramatic",
    prompt:
      "Leaning the upper torso slightly backward away from the camera, one hand raised halfway in a defensive warding gesture while the other pulls inward toward the ribcage; nose wrinkled sharply, upper lip curled in clear distaste, narrowed skeptical eyes, staring directly forward into the camera at the viewer with unabashed disapproval.",
    handGestures: "one hand raised in defensive warding gesture, other pulled toward ribcage",
    facialCue: "nose wrinkled sharply, upper lip curled in clear distaste, narrowed skeptical eyes",
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
 * 4. Flowing Natural Prose: Seamlessly joined natural sentences.
 */
export function buildMultiCharacterCGPrompt(options: {
  char1: { name: string; anchor: string; clothing: string };
  char2: { name: string; anchor: string; clothing: string };
  interaction: string; // e.g. "engaged in an intense conversation while sitting opposite each other across a cafe table"
  environmentAndLighting?: string;
}): string {
  // Sanitize interaction to strictly eliminate positional left/right labels
  const sanitizedInteraction = options.interaction
    .replace(/\b(on\s+the\s+left(\s+side)?|left\s+side|left-hand\s+side|on\s+the\s+right(\s+side)?|right\s+side|right-hand\s+side)\b/gi, "")
    .replace(/\b(character\s+[12]\s+on\s+the\s+(left|right)|side\s+[ab])\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const c1Anchor = cleanSentence(options.char1.anchor);
  let c1Clothing = cleanSentence(options.char1.clothing);
  if (!/^wearing\s+/i.test(c1Clothing)) {
    c1Clothing = `Wearing ${c1Clothing.charAt(0).toLowerCase() + c1Clothing.slice(1)}`;
  }

  const c2Anchor = cleanSentence(options.char2.anchor);
  let c2Clothing = cleanSentence(options.char2.clothing);
  if (!/^wearing\s+/i.test(c2Clothing)) {
    c2Clothing = `Wearing ${c2Clothing.charAt(0).toLowerCase() + c2Clothing.slice(1)}`;
  }

  const interaction = cleanSentence(sanitizedInteraction);
  const env = cleanSentence(
    options.environmentAndLighting ||
      "Photorealistic two-person cinematic scene, dramatic contrast lighting, detailed atmospheric background with natural depth of field"
  );

  return `masterpiece, best quality, score_9, score_8, safe, @silvana, ${c1Anchor}. ${c1Clothing}. ${c2Anchor}. ${c2Clothing}. ${interaction}. ${env}.`;
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
 * Modular Location Consistency Architecture:
 * [Camera Vantage Point] + [Base Scenery & Terrain] + [Fixed Structural Anchor] + [Fixed Landmark Composition] + [Variable Atmospheric Lighting Layer Only]
 *
 * Rules:
 * 1. Flowing Natural Prose: No artificial section labels.
 * 2. Hyper-Specific Structural Anchor: Explicitly describe any structure (e.g. rustic bamboo shelter with palm-thatch roof)
 *    OR explicitly lock pure wilderness ("completely untouched wild nature with zero buildings, no huts, no houses").
 * 3. Fixed Landmark Anchor: Lock spatial positions of static terrain elements (left volcanic rocks, right leaning palms, foreground driftwood).
 * 4. Atmospheric Lighting Layer Only: The only dynamic element across Day, Evening, and Night.
 * 5. Targeted Negative Prompting: If a rustic hut or wild nature is specified, strictly ban modern houses, luxury villas, glass, resorts, and beach bars.
 */
export function buildModularLocationPrompt(options: {
  locationPrompt: string;
  structuralAnchor?: string;
  landmarkAnchor?: string;
  vantagePoint?: string;
  isInterior?: boolean;
  timeOfDay?: "day" | "evening" | "night";
}): { positivePrompt: string; negativePrompt: string } {
  const timeDesc =
    options.timeOfDay === "evening"
      ? "sunset dusk, golden hour, warm orange and violet horizon glow, long warm cast shadows, glowing twilight sky, evening ambient illumination, golden sun sinking into the ocean horizon"
      : options.timeOfDay === "night"
      ? "deep night, dark indigo starlit sky, glowing full moon casting silver highlights across water and sand, soft atmospheric ambient nighttime glow, serene nocturnal atmosphere"
      : "bright clear daytime, crisp overhead natural sunlight, vibrant azure sky, natural daylight shadows, crystal-clear water reflections, high visibility";

  const segments: string[] = [];

  // 1. Camera Vantage Point
  if (options.vantagePoint?.trim()) {
    segments.push(cleanSentence(options.vantagePoint));
  }

  // 2. Base Scenery / Terrain
  if (options.locationPrompt?.trim()) {
    segments.push(cleanSentence(options.locationPrompt));
  }

  // 3. Structural Anchor (Explicit Presence OR Explicit Absence)
  if (options.structuralAnchor?.trim()) {
    segments.push(cleanSentence(options.structuralAnchor));
  }

  // 4. Fixed Landmark & Spatial Composition
  if (options.landmarkAnchor?.trim()) {
    segments.push(cleanSentence(options.landmarkAnchor));
  }

  // 5. Atmospheric Lighting Layer
  segments.push(cleanSentence(timeDesc));

  // 6. Aesthetic Style (Indoor vs Outdoor)
  if (options.isInterior) {
    segments.push("beautiful detailed interior background, 8k wallpaper, anime background art");
  } else {
    segments.push("beautiful detailed landscape background, 8k wallpaper, anime background art");
  }

  const positivePrompt = `masterpiece, best quality, score_9, score_8, safe, @silvana, scenery, no humans, ${segments.join(". ")}.`;

  // Dynamic Negative Prompt Construction
  let negativePrompt =
    "human, person, girl, boy, character, 1girl, 1boy, crowd, people, low quality, worst quality, text, watermark, signature, blurry, cropped";

  const structLower = (options.structuralAnchor || "").toLowerCase();

  // If untouched nature or zero buildings specified: block all structures
  if (
    structLower.includes("zero building") ||
    structLower.includes("no building") ||
    structLower.includes("no hut") ||
    structLower.includes("no house") ||
    structLower.includes("untouched wild") ||
    structLower.includes("no man-made")
  ) {
    negativePrompt +=
      ", house, building, architecture, hut, cabin, modern house, luxury villa, interior, indoor room, furniture, town, city, hotel, resort, beach bar, pavilion";
  } else if (
    structLower.includes("hut") ||
    structLower.includes("shelter") ||
    structLower.includes("lean-to") ||
    structLower.includes("bamboo") ||
    structLower.includes("rustic") ||
    structLower.includes("cabin")
  ) {
    // If rustic shelter/hut: prevent morphing into modern luxury houses or commercial bars
    negativePrompt +=
      ", modern house, luxury villa, glass windows, modern architecture, brick building, concrete, skyscraper, city, resort, hotel, beach bar, neon signs, commercial building";
  }

  if (options.isInterior) {
    negativePrompt += ", outdoor, sky, mountain, beach, ocean, exterior landscape";
  } else {
    negativePrompt += ", interior, indoor room, living room, bedroom, ceiling";
  }

  return { positivePrompt, negativePrompt };
}

/**
 * Generates an empty location background image using the Modular Location Anchor Method.
 */
export async function executeLocationGeneration(
  endpoint: string,
  options: {
    location?: VNLocation;
    locationPrompt?: string;
    structuralAnchor?: string;
    landmarkAnchor?: string;
    vantagePoint?: string;
    isInterior?: boolean;
    timeOfDay?: "day" | "evening" | "night";
    width?: number;
    height?: number;
    seed?: number;
    onProgress?: (percent: number, statusText: string) => void;
  }
): Promise<GeneratedMedia & { seed: number }> {
  const seed =
    options.seed !== undefined
      ? options.seed
      : options.location?.seed !== undefined
      ? options.location.seed
      : generateRandomSeed();

  const { positivePrompt, negativePrompt } = buildModularLocationPrompt({
    locationPrompt: options.locationPrompt ?? options.location?.prompt ?? "",
    structuralAnchor: options.structuralAnchor ?? options.location?.structuralAnchor,
    landmarkAnchor: options.landmarkAnchor ?? options.location?.landmarkAnchor,
    vantagePoint: options.vantagePoint ?? options.location?.vantagePoint,
    isInterior: options.isInterior ?? options.location?.isInterior,
    timeOfDay: options.timeOfDay,
  });

  const media = await executeAnimaGeneration(endpoint, {
    positivePrompt,
    negativePrompt,
    width: options.width || 1216,
    height: options.height || 832, // 16:9 scenic resolution
    seed,
    onProgress: options.onProgress,
  });

  return {
    ...media,
    seed,
  };
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
