export type UserLlmConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  configured: boolean;
};

export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  if (!url) return "";
  // If user entered e.g. https://api.openai.com without /v1, add /v1
  if (url === "https://api.openai.com") {
    url = "https://api.openai.com/v1";
  }
  return url;
}

export function resolveLlmConfig(clientConfig?: {
  baseUrl?: string | null;
  apiKey?: string | null;
  model?: string | null;
}): UserLlmConfig {
  const envBaseUrl = process.env.OPENAI_BASE_URL || process.env.FILM_ENHANCE_BASE_URL || "";
  const envApiKey = process.env.OPENAI_API_KEY || process.env.FILM_ENHANCE_API_KEY || "";
  const envModel = process.env.OPENAI_MODEL || process.env.FILM_ENHANCE_MODEL || "";

  const rawUrl = clientConfig?.baseUrl || envBaseUrl;
  const baseUrl = normalizeBaseUrl(rawUrl);
  const apiKey = clientConfig?.apiKey?.trim() || envApiKey;
  const model = clientConfig?.model?.trim() || envModel;

  return {
    baseUrl,
    apiKey,
    model,
    configured: Boolean(baseUrl && model),
  };
}

export async function getUserLlmConfig(userId?: string): Promise<UserLlmConfig> {
  return resolveLlmConfig();
}

export async function listEndpointModels(baseUrl: string, apiKey?: string): Promise<{ ok: boolean; models: string[]; error?: string }> {
  const normUrl = normalizeBaseUrl(baseUrl);
  if (!normUrl) return { ok: false, models: [], error: "Missing endpoint URL." };

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (apiKey?.trim()) {
      headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(`${normUrl}/models`, {
      method: "GET",
      headers,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        models: [],
        error: `Provider returned HTTP ${res.status}: ${errText.slice(0, 200) || res.statusText}`,
      };
    }

    const data = await res.json().catch(() => null);
    if (!data) {
      return { ok: false, models: [], error: "Endpoint did not return valid JSON." };
    }

    let modelList: string[] = [];
    if (Array.isArray(data.data)) {
      modelList = data.data.map((m: any) => (typeof m === "string" ? m : m.id)).filter(Boolean);
    } else if (Array.isArray(data.models)) {
      modelList = data.models.map((m: any) => (typeof m === "string" ? m : m.name || m.id)).filter(Boolean);
    } else if (Array.isArray(data)) {
      modelList = data.map((m: any) => (typeof m === "string" ? m : m.id)).filter(Boolean);
    }

    // Sort models cleanly
    modelList = Array.from(new Set(modelList)).sort((a, b) => a.localeCompare(b));

    return {
      ok: true,
      models: modelList,
    };
  } catch (err: any) {
    return {
      ok: false,
      models: [],
      error: err.name === "AbortError" ? "Connection timed out after 12 seconds." : (err.message || "Failed to reach endpoint."),
    };
  }
}

function extractJson(text: string): any {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

export type CharacterChatResult = {
  message: string;
  name: string;
  tag: string;
  coreDescription: string;
  prefix: string;
  postfix: string;
  negativePrompt: string;
  aspectRatio: string;
};

const CHARACTER_MAKER_SYSTEM = `You are an elite Character Concept Designer and Prompt Engineer for high-end AI diffusion models (such as SDXL, Flux, and Anima).

Your goal is to iteratively craft an ultra-detailed, anatomically precise, and visually distinctive character based on the user's natural language feedback.

CRITICAL INSTRUCTIONS:
1. IDENTITY PERSISTENCE:
   - When the user asks for changes (e.g. "change hair to black", "no, put the tattoo on his neck instead", "make her taller"), PRESERVE all other established characteristics (face structure, eyes, skin tone, build, age, vibe) unless specifically asked to change them.
   - Do NOT start over unless the user explicitly commands a brand new character.

2. CORE CHARACTER DESCRIPTION (coreDescription):
   - Must be an ultra-detailed paragraph focusing exclusively on the character's physical appearance and distinctive features:
     * Exact age & ethnicity/phenotype
     * Complexion and skin details (tone, freckles, glow, texture)
     * Hair details (color, length, style, cut, texture, parting)
     * Facial anatomy (eye color, eye shape, eyelashes, brows, nose shape, cheekbones, lips, jawline)
     * Body physique (height, build, muscularity/curves, proportions)
     * Specific markings, tattoos, scars, or accessories (exact placement, motif, colors, outline, details)
   - Do NOT include environment or scene descriptions here; this is purely the character definition.

3. OPTIONAL PREFIX & POSTFIX:
   - Prefix: Default format is "masterpiece, best quality, score_9, score_8, safe, @[tag], "
   - Postfix: Default is "high detail, photorealistic, 8k resolution, cinematic lighting, sharp focus."

4. NEGATIVE PROMPT:
   - Provide a tuned negative prompt preventing anatomical errors, extra limbs, bad hands, low resolution.

5. JSON RESPONSE FORMAT ONLY:
   Output ONLY valid JSON matching this exact structure:
   {
     "message": "A friendly conversational explanation of what you updated or refined in this iteration",
     "name": "Display Name (e.g. Silvana or Marcus)",
     "tag": "sanitized_lowercase_tag (e.g. silvana or marcus)",
     "coreDescription": "The rich detailed character appearance paragraph",
     "prefix": "masterpiece, best quality, score_9, score_8, safe, @name, ",
     "postfix": "high detail, photorealistic, 8k resolution, cinematic lighting, sharp focus.",
     "negativePrompt": "worst quality, low quality, score_1, score_2, score_3, too many fingers, deformed hand, ugly",
     "aspectRatio": "1:1 (Square)" or "9:16 (Portrait)" or "3:4 (Portrait)"
   }`;

export async function characterChatTurn(opts: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  currentDescription?: string;
}): Promise<CharacterChatResult> {
  const normUrl = normalizeBaseUrl(opts.baseUrl);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.apiKey?.trim()) {
    headers["Authorization"] = `Bearer ${opts.apiKey.trim()}`;
  }

  const promptMessages = [
    { role: "system", content: CHARACTER_MAKER_SYSTEM },
    ...(opts.currentDescription
      ? [{ role: "system", content: `CURRENT CHARACTER SPECIFICATION IN MEMORY:\n${opts.currentDescription}` }]
      : []),
    ...opts.messages,
  ];

  async function callCompletion(useJsonFormat: boolean): Promise<Response> {
    return fetch(`${normUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: opts.model,
        temperature: 0.6,
        ...(useJsonFormat ? { response_format: { type: "json_object" } } : {}),
        messages: promptMessages,
      }),
    });
  }

  let res: Response;
  try {
    res = await callCompletion(true);
    if (!res.ok && (res.status === 400 || res.status === 422)) {
      res = await callCompletion(false);
    }
  } catch (err: any) {
    throw new Error(`Failed to contact OpenAI-compatible endpoint: ${err.message}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`AI model returned error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const rawText = data?.choices?.[0]?.message?.content;
  if (!rawText || typeof rawText !== "string") {
    throw new Error("AI model returned an empty response.");
  }

  try {
    const parsed = extractJson(rawText);
    const name = (parsed.name || "Character").trim();
    const tag = (parsed.tag || name.toLowerCase().replace(/[^a-z0-9_]/g, "")).trim();
    return {
      message: parsed.message || "Updated character design.",
      name,
      tag,
      coreDescription: parsed.coreDescription || "",
      prefix: parsed.prefix || `masterpiece, best quality, score_9, score_8, safe, @${tag}, `,
      postfix: parsed.postfix || "high detail, photorealistic, 8k resolution, cinematic lighting, sharp focus.",
      negativePrompt:
        parsed.negativePrompt ||
        "worst quality, low quality, score_1, score_2, score_3, too many fingers, deformed hand, too many arms, ugly",
      aspectRatio: parsed.aspectRatio || "9:16 (Portrait)",
    };
  } catch {
    throw new Error("Failed to parse character model output as structured JSON.");
  }
}

export type SceneExpandResult = {
  composedPrompt: string;
  settingAndPoses: string;
  suggestedPrefix: string;
  suggestedPostfix: string;
};

const SCENE_EXPANDER_SYSTEM = `You are a cinematic director and prompt master for diffusion models.
The user wants to place one or more predefined characters into a scene.
Each character is referenced by a hashtag like #name, and its exact physical appearance is provided.

NON-NEGOTIABLE CORE RULE:
- YOU MUST NEVER ALTER, SIMPLIFY, SHORTEN, OR REPHRASE THE INTRINSIC PHYSICAL APPEARANCE OF THE CHARACTERS (face, eyes, skin tone, hair, physique, tattoos, scars, distinctive markings).
- YOU ONLY EXPAND THE SETTING, BACKGROUND ARCHITECTURE, LIGHTING, MOOD, ATMOSPHERE, AND EACH CHARACTER'S CURRENT POSE, EXPRESSION, ATTIRE/WARDROBE (suited to the scene), AND MUTUAL INTERACTIONS.

MULTI-CHARACTER DELINEATION:
- If multiple characters are in the scene (e.g. #silvana and #marcus), clearly position them (e.g. "on the left..., on the right...") and describe their mutual interactions and sightlines so the diffusion model distinguishes them cleanly without blending.

OUTPUT FORMAT (JSON ONLY):
{
  "composedPrompt": "The full master scene prompt combining the exact character descriptions seamlessly with the rich setting, poses, camera angle, and atmospheric lighting.",
  "settingAndPoses": "Concise summary of what was added for setting, poses, and lighting.",
  "suggestedPrefix": "masterpiece, best quality, score_9, score_8, safe, ",
  "suggestedPostfix": "high detail, photorealistic, 8k resolution, cinematic lighting, sharp focus."
}`;

export async function sceneExpandTurn(opts: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  sceneIntent: string;
  characters: Array<{ tag: string; name: string; description: string }>;
}): Promise<SceneExpandResult> {
  const normUrl = normalizeBaseUrl(opts.baseUrl);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.apiKey?.trim()) {
    headers["Authorization"] = `Bearer ${opts.apiKey.trim()}`;
  }

  const charContext = opts.characters
    .map(
      (c) =>
        `CHARACTER [#${c.tag}] (Name: ${c.name}):\nExact Physical Appearance:\n"${c.description}"\n(REMINDER: Preserve this appearance verbatim in the scene prompt)`,
    )
    .join("\n\n");

  const userMessage = `USER SCENE REQUEST:\n"${opts.sceneIntent}"\n\nCHARACTERS INVOLVED:\n${charContext}\n\nCompose the scene prompt expanding the setting and poses, strictly maintaining each character's appearance.`;

  const messages = [
    { role: "system", content: SCENE_EXPANDER_SYSTEM },
    { role: "user", content: userMessage },
  ];

  async function callCompletion(useJsonFormat: boolean): Promise<Response> {
    return fetch(`${normUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: opts.model,
        temperature: 0.5,
        ...(useJsonFormat ? { response_format: { type: "json_object" } } : {}),
        messages,
      }),
    });
  }

  let res: Response;
  try {
    res = await callCompletion(true);
    if (!res.ok && (res.status === 400 || res.status === 422)) {
      res = await callCompletion(false);
    }
  } catch (err: any) {
    throw new Error(`Failed to contact OpenAI-compatible endpoint: ${err.message}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`AI model returned error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const rawText = data?.choices?.[0]?.message?.content;
  if (!rawText || typeof rawText !== "string") {
    throw new Error("AI model returned an empty response.");
  }

  try {
    const parsed = extractJson(rawText);
    const tagsPrefix = opts.characters.map((c) => `@${c.tag}`).join(", ");
    const defaultPrefix = tagsPrefix
      ? `masterpiece, best quality, score_9, score_8, safe, ${tagsPrefix}, `
      : "masterpiece, best quality, score_9, score_8, safe, ";

    return {
      composedPrompt: parsed.composedPrompt || opts.sceneIntent,
      settingAndPoses: parsed.settingAndPoses || "",
      suggestedPrefix: parsed.suggestedPrefix || defaultPrefix,
      suggestedPostfix: parsed.suggestedPostfix || "high detail, photorealistic, 8k resolution, cinematic lighting, sharp focus.",
    };
  } catch {
    throw new Error("Failed to parse scene model output as structured JSON.");
  }
}
