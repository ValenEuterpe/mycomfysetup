/**
 * Helper utilities for parsing batch JSON prompts and resolving
 * character and location templates using word-boundary replacements.
 */

export interface PromptBatchPayload {
  characters?: Record<string, string>;
  locations?: Record<string, string>;
  /** Singular aliases for flexibility */
  character?: Record<string, string>;
  location?: Record<string, string> | string;
  prompts: (string | { prompt: string })[];
  /** Optional suffix appended to all prompts (e.g. "35mm film, photorealistic realism") */
  suffix?: string;
  /** Optional prefix prepended to all prompts */
  prefix?: string;
  /** Optional model/ratio override if specified directly in JSON */
  model?: string;
  ratio?: string;
  negative?: string;
  negative_prompt?: string;
}

export interface ParsedBatchResult {
  payload: PromptBatchPayload | null;
  /** True if text looks like JSON (starts with { and has prompt keys) but failed JSON.parse (e.g. truncated) */
  isTruncatedOrMalformed?: boolean;
  error?: string;
}

export interface ResolvedBatch {
  resolvedPrompts: string[];
  total: number;
  suffix?: string;
  prefix?: string;
  modelOverride?: string;
  ratioOverride?: string;
  negativeOverride?: string;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalizes and extracts character/location mappings into a consolidated
 * key-value map for template substitutions.
 */
function buildReplacementMap(payload: PromptBatchPayload): Record<string, string> {
  const map: Record<string, string> = {};

  // Characters
  const charBlock = payload.characters || payload.character;
  if (charBlock && typeof charBlock === "object") {
    for (const [name, desc] of Object.entries(charBlock)) {
      if (typeof desc === "string" && name.trim()) {
        map[name.trim()] = desc.trim();
      }
    }
  }

  // Locations
  const locBlock = payload.locations || payload.location;
  if (locBlock) {
    if (typeof locBlock === "string" && locBlock.trim()) {
      map["location"] = locBlock.trim();
    } else if (typeof locBlock === "object") {
      for (const [locName, desc] of Object.entries(locBlock)) {
        if (typeof desc === "string" && locName.trim()) {
          map[locName.trim()] = desc.trim();
        }
      }
    }
  }

  return map;
}

/**
 * Resolves a prompt string by substituting all character and location keys
 * with their full descriptions in a single pass. Names are completely removed.
 * Single-pass replacement prevents cascading replacements if a replacement text
 * happens to contain another character's name.
 */
export function resolvePromptTemplate(
  prompt: string,
  replacements: Record<string, string>
): string {
  const keys = Object.keys(replacements).filter((k) => k.trim().length > 0);
  if (keys.length === 0) {
    return prompt.replace(/\s+/g, " ").trim();
  }

  // Sort keys by descending length so "Lisa Marie" is matched before "Lisa"
  keys.sort((a, b) => b.length - a.length);

  // Build unified single-pass regex patterns
  const patterns: string[] = [];
  for (const key of keys) {
    const val = replacements[key];
    const valStartsWithArticle = /^(?:a|an)\s+/i.test(val);
    if (valStartsWithArticle) {
      patterns.push(`\\b(?:the|a|an)\\s+${escapeRegExp(key)}\\b`);
    }
    patterns.push(`\\b${escapeRegExp(key)}\\b`);
  }

  const combinedRegex = new RegExp(patterns.join("|"), "gi");

  const result = prompt.replace(combinedRegex, (match) => {
    const lowerMatch = match.toLowerCase();
    for (const key of keys) {
      const lowerKey = key.toLowerCase();
      if (
        lowerMatch === lowerKey ||
        lowerMatch === `the ${lowerKey}` ||
        lowerMatch === `a ${lowerKey}` ||
        lowerMatch === `an ${lowerKey}`
      ) {
        return replacements[key];
      }
    }
    return match;
  });

  // Clean up any accidental article collisions like "the a" -> "a", collapse multiple spaces, and trim
  return result
    .replace(/\bthe\s+a\b/gi, "a")
    .replace(/\bthe\s+an\b/gi, "an")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts and parses a JSON batch payload from a raw string or markdown-fenced block.
 */
export function extractBatchPayload(rawText: string): ParsedBatchResult {
  if (!rawText || typeof rawText !== "string") {
    return { payload: null };
  }

  let text = rawText.trim();

  // Strip markdown code fences if wrapped in ```json ... ``` or ``` ... ```
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  // If it doesn't start with { or [, it's not a JSON block
  if (!text.startsWith("{")) {
    return { payload: null };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (err: any) {
    // Check if it appears to be a truncated JSON payload
    const lower = text.toLowerCase();
    const hasBatchClues =
      lower.includes('"prompts"') ||
      lower.includes('"characters"') ||
      lower.includes('"character"') ||
      lower.includes('"locations"');

    if (hasBatchClues) {
      return {
        payload: null,
        isTruncatedOrMalformed: true,
        error: err?.message || "Invalid JSON syntax",
      };
    }
    return { payload: null };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { payload: null };
  }

  // Check for the prompts block (required)
  const rawPrompts = parsed.prompts || parsed.scenes || parsed.queue;
  if (!Array.isArray(rawPrompts) || rawPrompts.length === 0) {
    return { payload: null };
  }

  // Validate that items in prompts are either strings or objects with a prompt property
  const validPrompts = rawPrompts.filter(
    (item: any) =>
      typeof item === "string" ||
      (typeof item === "object" && item !== null && typeof item.prompt === "string")
  );

  if (validPrompts.length === 0) {
    return { payload: null };
  }

  return {
    payload: {
      characters: parsed.characters,
      character: parsed.character,
      locations: parsed.locations,
      location: parsed.location,
      prompts: validPrompts,
      suffix:
        typeof parsed.suffix === "string"
          ? parsed.suffix
          : typeof parsed.style === "string"
          ? parsed.style
          : typeof parsed.prompt_suffix === "string"
          ? parsed.prompt_suffix
          : undefined,
      prefix:
        typeof parsed.prefix === "string"
          ? parsed.prefix
          : typeof parsed.prompt_prefix === "string"
          ? parsed.prompt_prefix
          : undefined,
      model: typeof parsed.model === "string" ? parsed.model : undefined,
      ratio: typeof parsed.ratio === "string" ? parsed.ratio : undefined,
      negative:
        typeof parsed.negative === "string"
          ? parsed.negative
          : typeof parsed.negative_prompt === "string"
          ? parsed.negative_prompt
          : undefined,
    },
  };
}

/**
 * Resolves all prompts in the payload, replacing character & location tags,
 * and applying optional prefix and suffix to each prompt.
 */
export function resolveBatch(payload: PromptBatchPayload): ResolvedBatch {
  const replacements = buildReplacementMap(payload);
  const resolvedPrompts: string[] = [];

  for (const item of payload.prompts) {
    const rawPrompt = typeof item === "string" ? item : item.prompt;
    if (!rawPrompt || !rawPrompt.trim()) continue;

    let resolved = resolvePromptTemplate(rawPrompt.trim(), replacements);
    if (resolved) {
      if (payload.prefix?.trim()) {
        const cleanPrefix = payload.prefix.trim().replace(/,\s*$/, "");
        resolved = `${cleanPrefix}, ${resolved}`;
      }
      if (payload.suffix?.trim()) {
        const cleanSuffix = payload.suffix.trim().replace(/^,\s*/, "");
        resolved = /[,;.!?]$/.test(resolved)
          ? `${resolved} ${cleanSuffix}`
          : `${resolved}, ${cleanSuffix}`;
      }
      resolvedPrompts.push(resolved.replace(/\s+/g, " ").trim());
    }
  }

  return {
    resolvedPrompts,
    total: resolvedPrompts.length,
    suffix: payload.suffix,
    prefix: payload.prefix,
    modelOverride: payload.model,
    ratioOverride: payload.ratio,
    negativeOverride: payload.negative,
  };
}
