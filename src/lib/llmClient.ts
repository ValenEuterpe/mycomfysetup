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
  gender?: "male" | "female" | "other";
  role?: string;
  baselineOutfit?: string;
}

export interface EnhancedCharacterProfile {
  verbatimIdentityPrompt: string;
  baselineOutfit: string;
  role: string;
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
/**
 * Improves user's character description into an Anima-optimized physical identity prompt
 * and establishes a canonical baseline outfit & role.
 *
 * Bodily proportions, figure silhouette, and face shape are kept strictly anatomical,
 * while clothing is isolated into baselineOutfit so it can persist and evolve across scenes.
 */
export async function enhanceCharacterProfile(
  userPrompt: string,
  characterName: string,
  options?: EnhancePromptOptions
): Promise<EnhancedCharacterProfile> {
  const systemPrompt = `You are an expert anime character designer and costume director for diffusion models (specifically the Anima model).
Your task is to take the user's character description and generate three distinct outputs:

1. "verbatimIdentityPrompt":
   An ultra-detailed, Danbooru/tag-informed physical identity prompt focusing EXCLUSIVELY on:
   - Figure silhouette & body proportions (e.g. "hourglass figure", "curvy figure", "pear-shaped body", "athletic build", "slender build", "chubby / plump body", waist-to-hip ratio, bust size, leg shape).
   - Facial bone structure (e.g. "sharp angular jawline", "soft rounded jaw", "high cheekbones", "pointed chin", face shape).
   - Eyes, eyebrows, nose bridge, lips, hair color, hair length, hair style, bangs, complexion.
   - STRICT PROHIBITIONS FOR verbatimIdentityPrompt:
     * NO clothing or costume tags (clothes are isolated in baselineOutfit).
     * NO style or quality tags (e.g. NO "realistic anime style", NO "high quality", NO "detailed character design").
     * NO static emotional expressions (e.g. NO "simple expression", NO "smiling", NO "frowning").

2. "baselineOutfit":
   The canonical starting outfit for this character.
   - If the user explicitly mentions clothing in their description or options (e.g. "wearing green hoodie", "leather jacket", "sundress"), extract and polish that clothing!
   - If the user did NOT mention clothing, create a stylish, believable civilian passenger/traveler outfit (e.g. for male: "casual grey crewneck t-shirt, dark denim jeans, white sneakers"; for female: "light blue linen button-up blouse, dark navy trousers, comfortable sneakers").
   - DO NOT assign unprompted uniforms like pilot or flight attendant unless requested!

3. "role":
   The character's narrative background or profession (e.g. "Civilian Passenger", "High School Teacher", "Software Engineer", or whatever the user described).

Return STRICT JSON:
{
  "verbatimIdentityPrompt": "comma-separated physical anime tags",
  "baselineOutfit": "specific clothing description",
  "role": "character role / background"
}`;

  let userMsg = `Character Name: ${characterName || "Character"}
Gender: ${options?.gender || "unspecified"}
User's description: ${userPrompt}`;

  if (options?.figureStyle && options.figureStyle !== "Auto") {
    userMsg += `\nPreferred Figure Silhouette: ${options.figureStyle}`;
  }
  if (options?.faceShape && options.faceShape !== "Auto") {
    userMsg += `\nPreferred Face Shape / Jawline: ${options.faceShape}`;
  }
  if (options?.role && options.role.trim()) {
    userMsg += `\nPreferred Role: ${options.role.trim()}`;
  }
  if (options?.baselineOutfit && options.baselineOutfit.trim()) {
    userMsg += `\nPreferred Baseline Outfit: ${options.baselineOutfit.trim()}`;
  }

  const responseText = await callLlmChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMsg },
    ],
    { jsonMode: true, temperature: 0.6 }
  );

  let parsed: any;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    const match = responseText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }

  const rawIdentity = parsed?.verbatimIdentityPrompt || responseText;
  const cleanedIdentity = sanitizeCharacterPrompt(
    rawIdentity.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim()
  );

  const fallbackOutfit =
    options?.gender === "male"
      ? "casual grey crewneck t-shirt, dark denim jeans, white sneakers"
      : "casual light blue linen blouse, dark trousers, white sneakers";

  return {
    verbatimIdentityPrompt: cleanedIdentity,
    baselineOutfit: parsed?.baselineOutfit?.trim() || options?.baselineOutfit || fallbackOutfit,
    role: parsed?.role?.trim() || options?.role || "Civilian Passenger",
  };
}

/**
 * Improves user's character description into an Anima-optimized physical identity prompt.
 * Backwards compatible helper that delegates to enhanceCharacterProfile.
 */
export async function enhanceCharacterPrompt(
  userPrompt: string,
  characterName: string,
  options?: EnhancePromptOptions
): Promise<string> {
  const profile = await enhanceCharacterProfile(userPrompt, characterName, options);
  return profile.verbatimIdentityPrompt;
}

/**
 * Improves user's clothing description into a Danbooru-tailored, garment-specific attire prompt.
 * Focuses on garments, cut, fabrics, colors, footwear, and accessories, while strictly excluding human anatomy.
 */
export async function enhanceAttirePrompt(
  userPrompt: string,
  attireName?: string,
  options?: { gender?: "male" | "female" | "unisex"; category?: string }
): Promise<string> {
  const systemPrompt = `You are an expert anime costume designer and prompt engineer for diffusion models (specifically the Anima model).
Your task is to convert the user's clothing/attire idea into a detailed, Danbooru/tag-informed clothing prompt.

CRITICAL PURPOSE:
This prompt will be used:
1. To render the clothing standalone on a white headless mannequin or clothing display stand (no humans).
2. To be injected into visual novel scene prompts when characters wear this outfit.

STRICT RULES:
1. FOCUS EXCLUSIVELY ON CLOTHING, GARMENTS, ACCESSORIES, FOOTWEAR, AND MATERIALS:
   - Upper wear: garment type (e.g. t-shirt, collared dress shirt, hoodie, blouse, coat, jacket), collar style, sleeve length, buttons, patterns.
   - Lower wear: pants, jeans, shorts, skirt, trousers, fit (e.g. slim-fit, cargo, pleated), belt.
   - Footwear: sneakers, boots, sandals, loafers, dress shoes, socks.
   - Colors & fabrics: specific shades (e.g. crimson, navy blue, beige, charcoal, olive green) and textures (e.g. denim, linen, leather, silk, velvet).
   - Accessories: wristwatch, neckerchief, belt, tie, hat (optional).
2. STRICT PROHIBITIONS:
   - DO NOT include human body, anatomy, face, eyes, hair, or skin descriptions (e.g. NO "tall girl", NO "blue eyes", NO "blonde hair", NO "slender body").
   - DO NOT include quality or meta rendering tags (e.g. NO "masterpiece", NO "realistic anime style", NO "high quality").
   - DO NOT include static expressions or character emotions.

FORMAT:
Output ONLY the comma-separated descriptive clothing tags and phrases.
No explanations, no markdown codeblocks, no extra commentary.`;

  let userMsg = `Attire Name: ${attireName || "Custom Attire"}
Category: ${options?.category || "casual"}
Gender: ${options?.gender || "unisex"}
User's clothing description: ${userPrompt}

Generate the detailed clothing prompt:`;

  const responseText = await callLlmChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMsg },
    ],
    { temperature: 0.6 }
  );

  const cleaned = responseText
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .replace(/\b(realistic\s+)?anime\s+style\b/gi, "")
    .replace(/\b(high|best)\s+quality\b/gi, "")
    .replace(/\bmasterpiece\b/gi, "")
    .trim();

  return cleaned;
}

/**
 * Breaks down the user's story premise & first scene into sequential visual novel scenes.
 * Ensures up to 3 characters per scene and injects each character's verbatim identity prompt.
 */
export async function planVisualNovelScenes(
  characters: VNCharacter[],
  storyPremise: string,
  firstSceneOutline: string,
  sceneCount: number = 4,
  previousScenes?: VNScene[]
): Promise<VNScene[]> {
  const charactersSummary = characters
    .map(
      (c, idx) =>
        `[Character ${idx + 1}]
Name: ${c.name}
Gender: ${c.gender || "unspecified"}
Role / Archetype: ${c.role || "Civilian Passenger"}
Baseline Outfit: ${c.baselineOutfit || "casual traveler clothes (t-shirt and denim jeans)"}
Verbatim Physical Identity: ${c.verbatimIdentityPrompt}`
    )
    .join("\n\n");

  let continuityBlock = "";
  if (previousScenes && previousScenes.length > 0) {
    const lastScene = previousScenes[previousScenes.length - 1];
    continuityBlock = `\nPREVIOUS STORY CONTEXT & TIMELINE (CRITICAL FOR CONTINUITY):
- Last Scene (${lastScene.sceneNumber}): "${lastScene.title}"
- Active Setting / Tone: ${lastScene.sceneTone || "survival_dialogue"}
- Current Character Outfits / Conditions:
${
  lastScene.characterStates && lastScene.characterStates.length > 0
    ? lastScene.characterStates.map((cs) => `  * ${cs.name}: ${cs.outfit}`).join("\n")
    : "  * Continuing from previous worn clothes"
}
- Recent Dialogues:
${lastScene.dialogues.map((d) => `  * ${d.speaker}: "${d.text}"`).join("\n")}

CONTINUATION RULES:
1. USER CLOTHING OVERRIDE (HIGHEST PRIORITY): If the new scene prompt states that characters change clothes, find garments, or take something off, UPDATE their outfit to match!
2. OUTFIT CONTINUITY (DEFAULT): If no new clothes are mentioned, KEEP the exact clothes and condition from the previous scene! Do NOT reset to clean clothes or switch outfits.
3. DIALOGUE TONE: Pay close attention to what is being said. If discussing food, survival, or exploring, use normal conversational tags (talking, parted lips, serious expression). NO YELLING.`;
  }

  const systemPrompt = `You are a master visual novel director, scenario writer, and prompt engineer for diffusion models (Anima).
You will turn the user's story outline into ${sceneCount} sequential visual novel scenes.

CRITICAL DIRECTIVES FOR THE NARRATIVE ENGINE:

1. WARDROBE HIERARCHY & CONTINUITY (CRITICAL):
   - USER-SPECIFIED NEW CLOTHES (HIGHEST PRIORITY):
     If the user explicitly writes that a character changes clothes, puts on new garments, or takes something off (e.g. "Mike puts on a flannel shirt", "they find a chest with dry clothes", "Anna wears a sundress"), YOU MUST ADOPT THOSE NEW CLOTHES IMMEDIATELY and track them in subsequent scenes!
   - BASELINE OUTFIT CONTINUITY (DEFAULT):
     If the user does NOT explicitly write new clothes, each character MUST WEAR THEIR ESTABLISHED BASELINE OUTFIT!
     Evolve ONLY the physical condition of that outfit to match the story timeline:
     - Opening scene: intact, normal condition
     - Crash / ocean impact: soaked, waterlogged, clinging to body
     - Beach survival: wet, torn, sand-covered, rolled-up trousers/sleeves, barefoot
     - Later morning: dried, weathered, disheveled
     STRICT PROHIBITION: NEVER hallucinate pilot uniforms, flight attendant costumes, or random unprompted dresses unless the user explicitly requested them!
   - CONTRASTING CLOTHES:
     Never use "both wearing" or identical clothes. Characters must have distinct individual garments and colors.

2. DIALOGUE-DRIVEN EMOTIONAL AWARENESS (NO UNWARRANTED YELLING):
   - Analyze the emotional subtext and intent of the scene:
     - Is it a practical survival discussion? Planning? Intimate conversation? Shock?
   - In diffusion models (Anima/Danbooru), words like "shouting", "screaming", "yelling", "mouth wide open", and "furious" render characters as distorted, aggressive yelling monsters!
   - STRICT PROHIBITION IN DIALOGUE:
     NEVER describe characters as "shouting at", "screaming at", "yelling at", or "mouth open in a silent scream" during ordinary discussions or planning (e.g. when Mike says "We need to find food").
   - MANDATORY ANIME EXPRESSION MAPPING:
     For each character present in the scene, output clean Danbooru expression tags:
     - Speaking character: "talking, parted lips, [emotion] expression, looking at [partner]"
       (e.g. for survival discussion: "talking, parted lips, serious expression, looking at Anna, gesturing while talking")
       (e.g. for gentle comfort: "talking, gentle smile, looking at Anna, soft gaze")
     - Listening character: "listening, closed mouth, [reaction] expression, looking at [speaker]"
       (e.g. for attentive listener: "listening, closed mouth, attentive gaze, slight frown, looking at Mike")
       (e.g. for relieved listener: "listening, closed mouth, soft smile, looking at Mike")
     - Genuine screaming / terror tags (e.g. "wide eyes, terrified expression, open mouth") are ONLY allowed in immediate life-or-death physical disasters (such as the aircraft violently slamming into the sea).

3. SCENE TONE:
   Assign an explicit "sceneTone" for each scene:
   - "crisis" (violent catastrophe, plane crash, immediate disaster)
   - "survival_dialogue" (pragmatic planning, discussing food/shelter/water, exploring)
   - "quiet_moment" (rest, emotional bonding, reflection, sunrise/sunset)
   - "action" (running, building, struggling against elements)
   - "discovery" (finding ruins, wreckage, smoke on the horizon)

4. STRUCTURE OF "imagePrompt":
   For every character present:
   "[Character 1 Name]: 1man, <Character 1 verbatim identity>, wearing <outfit 1>, <Character 1 expression tags>, <Character 1 distinct pose>; and [Character 2 Name]: 1woman, <Character 2 verbatim identity>, wearing <outfit 2>, <Character 2 expression tags>, <Character 2 distinct pose>; <scene environment, background, lighting, camera angle, looking at each other>"

5. RETURN STRICT JSON with the schema:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "string",
      "sceneTone": "crisis | survival_dialogue | quiet_moment | action | discovery",
      "charactersPresent": ["CharacterName"],
      "characterStates": [
        {
          "name": "CharacterName",
          "outfit": "description of active outfit (e.g. torn white t-shirt, wet jeans)",
          "emotion": "serious, pragmatic",
          "expressionTags": "talking, parted lips, serious expression, looking at partner",
          "pose": "sitting on wet sand, gesturing toward island trees"
        }
      ],
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
${continuityBlock}

STORY PREMISE (Where the story goes):
${storyPremise}

SCENE OUTLINE (What happens next):
${firstSceneOutline}

Generate ${sceneCount} sequential scene(s) in valid JSON format following all Narrative Engine directives.`;

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
    sceneTone: s.sceneTone || "survival_dialogue",
    charactersPresent: Array.isArray(s.charactersPresent) ? s.charactersPresent.slice(0, 3) : [],
    characterStates: Array.isArray(s.characterStates)
      ? s.characterStates.map((cs: any) => ({
          name: cs.name || "",
          outfit: cs.outfit || "",
          emotion: cs.emotion || "",
          expressionTags: cs.expressionTags || "",
          pose: cs.pose || "",
        }))
      : undefined,
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
