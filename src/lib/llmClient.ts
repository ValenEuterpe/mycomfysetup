import { LlmConfig, VNCharacter, VNScene } from "../types/visualNovel";

const STORAGE_KEYS = {
  LLM_BASE_URL: "comfy_studio_llm_base_url",
  LLM_API_KEY: "comfy_studio_llm_api_key",
  LLM_SELECTED_MODEL: "comfy_studio_llm_selected_model",
  LLM_MODELS_CACHE: "comfy_studio_llm_models_cache",
};

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  selectedModel: "gpt-4o-mini",
  availableModels: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
};

export function loadLlmConfig(): LlmConfig {
  try {
    const baseUrl = localStorage.getItem(STORAGE_KEYS.LLM_BASE_URL) || DEFAULT_LLM_CONFIG.baseUrl;
    const apiKey = localStorage.getItem(STORAGE_KEYS.LLM_API_KEY) || DEFAULT_LLM_CONFIG.apiKey;
    const selectedModel =
      localStorage.getItem(STORAGE_KEYS.LLM_SELECTED_MODEL) || DEFAULT_LLM_CONFIG.selectedModel;
    const modelsRaw = localStorage.getItem(STORAGE_KEYS.LLM_MODELS_CACHE);
    const availableModels = modelsRaw ? JSON.parse(modelsRaw) : DEFAULT_LLM_CONFIG.availableModels;

    return {
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      selectedModel: selectedModel.trim(),
      availableModels: Array.isArray(availableModels) && availableModels.length > 0 ? availableModels : DEFAULT_LLM_CONFIG.availableModels,
    };
  } catch {
    return DEFAULT_LLM_CONFIG;
  }
}

export function saveLlmConfig(config: Partial<LlmConfig>): LlmConfig {
  try {
    const current = loadLlmConfig();
    const updated: LlmConfig = {
      ...current,
      ...config,
    };

    if (config.baseUrl !== undefined) localStorage.setItem(STORAGE_KEYS.LLM_BASE_URL, config.baseUrl.trim());
    if (config.apiKey !== undefined) localStorage.setItem(STORAGE_KEYS.LLM_API_KEY, config.apiKey.trim());
    if (config.selectedModel !== undefined) localStorage.setItem(STORAGE_KEYS.LLM_SELECTED_MODEL, config.selectedModel.trim());
    if (config.availableModels !== undefined) {
      localStorage.setItem(STORAGE_KEYS.LLM_MODELS_CACHE, JSON.stringify(config.availableModels));
    }

    return updated;
  } catch {
    return DEFAULT_LLM_CONFIG;
  }
}

/**
 * Normalizes baseUrl to avoid trailing slashes or duplicate /v1
 */
function normalizeBaseUrl(url: string): string {
  let trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    trimmed = `https://${trimmed}`;
  }
  return trimmed;
}

/**
 * Fetch wrapper that tries direct fetch first, and if blocked (CORS / network),
 * falls back to our serverless /api/proxy endpoint.
 */
async function fetchWithProxyFallback(
  targetUrl: string,
  init: RequestInit
): Promise<Response> {
  try {
    const directRes = await fetch(targetUrl, init);
    // If OK or valid HTTP response, return directly
    return directRes;
  } catch (directErr) {
    // Attempt through CORS proxy
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
    const proxyRes = await fetch(proxyUrl, init);
    return proxyRes;
  }
}

/**
 * Fetch available models from an OpenAI-compatible /models endpoint.
 */
export async function fetchAvailableModels(
  baseUrlInput?: string,
  apiKeyInput?: string
): Promise<string[]> {
  const config = loadLlmConfig();
  const baseUrl = normalizeBaseUrl(baseUrlInput || config.baseUrl);
  const apiKey = (apiKeyInput !== undefined ? apiKeyInput : config.apiKey).trim();

  const endpoint = `${baseUrl}/models`;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetchWithProxyFallback(endpoint, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Failed to load models (${res.status}): ${errText || res.statusText}`);
  }

  const json = await res.json();
  const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  const modelIds: string[] = list
    .map((m: any) => (typeof m === "string" ? m : m?.id))
    .filter(Boolean)
    .sort();

  if (modelIds.length > 0) {
    saveLlmConfig({ availableModels: modelIds });
  }

  return modelIds;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Execute a chat completion with the configured OpenAI-compatible LLM.
 */
export async function callLlmChat(
  messages: ChatMessage[],
  options?: {
    model?: string;
    temperature?: number;
    jsonMode?: boolean;
    maxTokens?: number;
  }
): Promise<string> {
  const config = loadLlmConfig();
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const apiKey = config.apiKey.trim();
  const model = options?.model || config.selectedModel || "gpt-4o-mini";

  const endpoint = `${baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const body: any = {
    model,
    messages,
    temperature: options?.temperature ?? 0.7,
  };

  if (options?.jsonMode) {
    body.response_format = { type: "json_object" };
  }
  if (options?.maxTokens) {
    body.max_tokens = options.maxTokens;
  }

  const res = await fetchWithProxyFallback(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`LLM request failed (${res.status}): ${errText || res.statusText}`);
  }

  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("No text content returned from LLM completion.");
  }

  return text.trim();
}

export interface EnhancePromptOptions {
  figureStyle?: string;
  faceShape?: string;
}

/**
 * Sanitizes generated character prompt by removing unwanted meta, quality, style,
 * and static expression tags so the prompt remains strictly anatomical.
 */
export function sanitizeCharacterPrompt(raw: string): string {
  const bannedPhrases = [
    /\b(realistic\s+)?anime\s+style\b/gi,
    /\bhigh\s+quality\b/gi,
    /\bbest\s+quality\b/gi,
    /\bmasterpiece\b/gi,
    /\bdetailed\s+character\s+design\b/gi,
    /\b(simple|neutral|blank)\s+expression\b/gi,
    /\bconcept\s+art\b/gi,
    /\billustration\b/gi,
    /\bdigital\s+art\b/gi,
    /\bphotorealistic\b/gi,
    /\b8k\b/gi,
    /\btrending\s+on\s+artstation\b/gi,
    /\bhyperdetailed\b/gi,
  ];

  let cleaned = raw;
  for (const pattern of bannedPhrases) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Split into tags, trim, deduplicate, and remove job words if standing alone
  const tags = cleaned
    .split(",")
    .map((t) => t.trim())
    .filter(
      (t) =>
        t.length > 0 &&
        !/^(teacher|student|nurse|office worker|doctor|pilot|engineer)$/i.test(t)
    );

  // Deduplicate while preserving order
  const uniqueTags: string[] = [];
  for (const tag of tags) {
    if (!uniqueTags.some((u) => u.toLowerCase() === tag.toLowerCase())) {
      uniqueTags.push(tag);
    }
  }

  return uniqueTags.join(", ");
}

/**
 * Improves user's character description into an Anima-optimized physical identity prompt.
 * Focuses strictly on bodily proportions, figure silhouette, face shape, eye color, hair,
 * and facial features, while completely excluding style, quality, expression, and clothing tags.
 */
export async function enhanceCharacterPrompt(
  userPrompt: string,
  characterName: string,
  options?: EnhancePromptOptions
): Promise<string> {
  const systemPrompt = `You are an expert anime character designer and prompt engineer for diffusion models (specifically the Anima model).
Your task is to convert the user's character idea into an ultra-detailed, Danbooru/tag-informed character physical identity prompt.

CRITICAL PURPOSE:
The Anima model will use this EXACT verbatim prompt across many different scenes, environments, poses, and outfits.
Therefore, YOU MUST FOCUS EXCLUSIVELY ON PHYSICAL BODY PROPORTIONS, FIGURE SILHOUETTE, FACIAL ANATOMY, AND NATURAL FEATURES.

1. FIGURE SILHOUETTE & BODY PROPORTIONS (BE HIGHLY SPECIFIC):
   - Figure silhouette: choose or match the exact figure type (e.g. "hourglass figure", "curvy figure", "pear-shaped body", "apple-shaped figure", "athletic build", "toned physique", "slender build", "lean frame", "chubby build", "plump body", "heavyset body", "thick build", "stocky build", "petite frame", "tall statuesque build").
   - Torso & waistline: waist-to-hip ratio (e.g. "narrow waist", "defined waistline", "straight waist", "soft natural waist"), hips ("wide hips", "curved hips", "narrow hips"), abdomen ("flat stomach", "soft belly").
   - Chest / Bust / Shoulders: chest proportion (e.g. "medium breasts", "large breasts", "ample bust", "small breasts", "flat chest", "broad chest", "muscular pectorals"), shoulder structure ("broad shoulders", "sloping shoulders", "soft shoulders", "narrow shoulders").
   - Limbs & Stature: leg and arm proportions ("thick thighs", "slender thighs", "soft curved legs", "long legs", "toned arms", "proportional limbs"), height ("tall height", "petite height", "average height").

2. FACIAL PROPORTIONS & BONE STRUCTURE:
   - Cranial & jaw geometry: face shape ("oval face", "round face", "heart-shaped face", "diamond face"), jawline ("sharp angular jawline", "soft rounded jaw", "defined jaw", "chiseled jaw"), chin ("pointed chin", "rounded chin", "cleft chin"), cheekbones ("high cheekbones", "soft cheeks", "prominent cheekbones").
   - Facial feature geometry & spacing: eye placement ("almond-shaped eyes", "wide-set eyes", "deep-set eyes", "large expressive eyes"), nose bridge ("straight nose bridge", "button nose", "aquiline nose", "narrow nose tip"), lips ("full lips", "thin lips", "defined cupid's bow", "wide mouth").
   - Eyes & Eyebrows: exact iris color, pupil style, eyelashes ("long dark eyelashes"), eyebrow shape ("arched eyebrows", "soft straight eyebrows").
   - Hair: exact color, hairstyle, hair length ("waist-length", "shoulder-length", "short cropped"), bangs type, hair texture.
   - Complexion & marks: skin tone ("fair porcelain skin", "warm tan skin", "olive skin"), distinct physical marks ("beauty mark under left eye", "faint freckles across nose bridge", "small scar").

3. STRICT PROHIBITIONS:
   - DO NOT include style or rendering tags (e.g. NO "realistic anime style", NO "high quality", NO "detailed character design", NO "masterpiece", NO "illustration", NO "8k"). Style and quality are handled by the pipeline prefill.
   - DO NOT include emotional or expression tags (e.g. NO "simple expression", NO "neutral expression", NO "smiling", NO "frowning"). Expressions vary per scene in the visual novel!
   - DO NOT include clothes, costumes, or job titles (e.g. NO "teacher", NO "suit", NO "uniform", NO "dress"). Clothes are added in story scenes!

4. FORMAT:
   - Output ONLY the comma-separated descriptive anime tags and phrases.
   - No explanations, no markdown codeblocks, no extra commentary.`;

  let userMsg = `Character Name: ${characterName || "Character"}
User's description: ${userPrompt}`;

  if (options?.figureStyle && options.figureStyle !== "Auto") {
    userMsg += `\nPreferred Figure Silhouette / Body Proportions: ${options.figureStyle}`;
  }
  if (options?.faceShape && options.faceShape !== "Auto") {
    userMsg += `\nPreferred Face Shape / Jawline: ${options.faceShape}`;
  }

  userMsg += `\n\nGenerate the detailed bodily and facial identity prompt:`;

  const enhanced = await callLlmChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMsg },
    ],
    { temperature: 0.6 }
  );

  // Clean markdown quotes if any
  const rawText = enhanced.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();

  // Apply deterministic tag sanitizer
  return sanitizeCharacterPrompt(rawText);
}

/**
 * Breaks down the user's story premise & first scene into sequential visual novel scenes.
 * Ensures up to 3 characters per scene and injects each character's verbatim identity prompt.
 */
export async function planVisualNovelScenes(
  characters: VNCharacter[],
  storyPremise: string,
  firstSceneOutline: string,
  sceneCount: number = 4
): Promise<VNScene[]> {
  const charactersSummary = characters
    .map(
      (c, idx) =>
        `[Character ${idx + 1}]
Name: ${c.name}
Gender: ${c.gender || "unspecified"}
Verbatim Physical Identity: ${c.verbatimIdentityPrompt}`
    )
    .join("\n\n");

  const systemPrompt = `You are a master visual novel director and scenario writer.
You will turn the user's story outline into ${sceneCount} sequential visual novel scenes.

CRITICAL RULES FOR "imagePrompt" (DIFFUSION MODEL PROMPT):
1. Maximum 3 characters per scene (0, 1, 2, or 3).
2. NEVER USE COLLECTIVE CLOTHING PHRASES:
   - FORBIDDEN: "both wearing...", "all wearing...", or identical clothes. Collective clothing causes diffusion models to clone the same character across the scene!
   - MANDATORY: For EVERY character in the scene, write their clothes SEPARATELY WITH HIGH VISUAL CONTRAST in colors, garment types, and style.
     Example:
     - Male character: "wearing a torn white dress shirt unbuttoned at collar, rolled up wet sleeves, ripped dark navy trousers, barefoot"
     - Female character: "wearing a waterlogged emerald green silk blouse, torn knee-length beige skirt, soaked fabric"
3. DISTINCT POSES & POSITIONS:
   - Give each character a distinct non-mirroring pose and placement so they do not duplicate each other.
   - Example: "Character A is lying on his stomach coughing seawater on the sand, while Character B is sitting on her knees looking back at the smoking airplane wreckage."
4. STRUCTURE OF "imagePrompt":
   For every character present, include their gender tag ("1man" or "1woman"), character name, their EXACT verbatim physical identity prompt word-for-word, followed immediately by their specific unique outfit and unique pose:
   "[Character 1 Name]: 1man, <Character 1 verbatim identity>, wearing <outfit 1>, <pose 1>, and [Character 2 Name]: 1woman, <Character 2 verbatim identity>, wearing <outfit 2>, <pose 2>, <scene environment, background wreckage, lighting, camera angle>"
5. DIALOGUE & NARRATION:
   - "title": Short evocative scene title.
   - "charactersPresent": Array of character names present (max 3).
   - "narration": 1-2 sentences of narrator description/setting exposition (optional, empty string if none).
   - "dialogues": Array of { "speaker": string, "text": string, "voiceCue": string } where voiceCue is an expressive acting note (e.g. "shivering in fear", "commanding tone", "soft whisper", "gasping for breath").

Return STRICT JSON with the schema:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "string",
      "charactersPresent": ["CharacterName"],
      "imagePrompt": "string",
      "narration": "string",
      "dialogues": [
        {
          "speaker": "string",
          "text": "string",
          "voiceCue": "string"
        }
      ]
    }
  ]
}`;

  const userMsg = `AVAILABLE CHARACTERS:
${charactersSummary}

STORY PREMISE (Where the story goes):
${storyPremise}

FIRST SCENE OUTLINE (How it begins):
${firstSceneOutline}

Generate ${sceneCount} sequential scenes in valid JSON format.`;

  const responseText = await callLlmChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMsg },
    ],
    { jsonMode: true, temperature: 0.7 }
  );

  let parsed: any;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    // Attempt extract json from markdown
    const match = responseText.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error("Failed to parse JSON response from LLM for story scenes.");
    }
  }

  const rawScenes = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
  if (rawScenes.length === 0) {
    throw new Error("LLM did not return any scenes in the expected format.");
  }

  return rawScenes.map((s: any, idx: number): VNScene => ({
    id: `scene_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
    sceneNumber: s.sceneNumber || idx + 1,
    title: s.title || `Scene ${idx + 1}`,
    charactersPresent: Array.isArray(s.charactersPresent) ? s.charactersPresent.slice(0, 3) : [],
    imagePrompt: s.imagePrompt || "",
    narration: s.narration || undefined,
    dialogues: Array.isArray(s.dialogues)
      ? s.dialogues.map((d: any, dIdx: number) => ({
          id: `dlg_${idx}_${dIdx}`,
          speaker: d.speaker || "Narrator",
          text: d.text || "",
          voiceCue: d.voiceCue || undefined,
        }))
      : [],
  }));
}
