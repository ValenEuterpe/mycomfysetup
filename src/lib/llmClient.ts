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

/**
 * Improves user's character description into an Anima-optimized physical identity prompt.
 * Focuses on bodily proportions, face shape, eye color, hair, facial features, minimizing clothes.
 */
export async function enhanceCharacterPrompt(
  userPrompt: string,
  characterName: string
): Promise<string> {
  const systemPrompt = `You are an expert anime character designer and prompt engineer for diffusion models (specifically the Anima model).
Your task is to convert the user's character idea into an ultra-detailed, Danbooru/tag-informed character identity prompt.

CRITICAL REQUIREMENTS:
1. The Anima model will use this EXACT verbatim prompt across many different scenes, environments, and situations.
2. Therefore, YOU MUST FOCUS STRONGLY ON BODILY PROPORTIONS, FACIAL FEATURES, AND NATURAL TRAITS, AND MINIMIZE/AVOID SPECIFIC CLOTHING.
   - Bodily proportions: gender tag (e.g. 1girl / 1boy / 1man / 1woman), apparent age, body frame, height, shoulder width, waistline, limb build, posture.
   - Hair: exact color, hairstyle, hair length (e.g. waist-length, shoulder-length), bangs type, hair texture, distinct strands/locks.
   - Eyes: exact eye color, iris detail, eye shape, eyelashes, eyebrows.
   - Facial features: skin tone, jaw/chin shape, nose type, cheeks, distinct facial marks (e.g. beauty mark, small mole under left eye, faint scar, freckles).
   - Clothing: DO NOT describe elaborate clothes or specific uniforms (clothes will be added in scene-specific story prompts). At most specify "simple generic neutral clothes" or leave clothing unspecified.
3. Use comma-separated descriptive anime tags and phrases that diffusion models understand best.
4. Output ONLY the resulting prompt tags, nothing else (no conversational filler, no markdown codeblocks).`;

  const userMsg = `Character Name: ${characterName || "Character"}
User's description: ${userPrompt}

Generate the detailed bodily and facial identity prompt:`;

  const enhanced = await callLlmChat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userMsg },
  ], { temperature: 0.6 });

  // Clean any quotes or stray markdown formatting
  return enhanced.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
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
Verbatim Identity Prompt: ${c.verbatimIdentityPrompt}`
    )
    .join("\n\n");

  const systemPrompt = `You are a visual novel director and scenario writer.
You will turn the user's story outline into ${sceneCount} sequential visual novel scenes.

RULES:
1. Maximum 3 characters per scene (can be 0, 1, 2, or 3).
2. For each scene, you MUST generate:
   - "title": A short evocative scene title.
   - "charactersPresent": Array of character names present in the scene (max 3, must match character names).
   - "imagePrompt": A diffusion prompt for the Anima anime model.
     CRITICAL: For every character present in this scene, YOU MUST INCLUDE THEIR EXACT VERBATIM IDENTITY PROMPT word-for-word, followed by their scene-specific clothing, dynamic pose, facial expression, and the scene environment/action/lighting/camera angle!
   - "narration": 1-2 sentences of narrator description/setting exposition (optional; leave empty string if not needed).
   - "dialogues": Array of dialogue items: { "speaker": string, "text": string, "voiceCue": string }
     - "speaker": Character name or "Narrator"
     - "text": The spoken line
     - "voiceCue": Short performance / tone / emotional cue (e.g. "shivering in fear", "commanding tone", "soft whisper", "gasping for breath").
3. Return STRICT JSON with the schema:
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
