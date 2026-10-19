import { isSupabaseConfigured, supabaseDelete, supabaseInsert, supabasePatch, supabaseSelect } from "@/lib/supabase";

export type CharacterWorkflowParams = {
  seed?: number;
  model?: string;
  steps?: number;
  cfg?: number;
  samplerName?: string;
  scheduler?: string;
  denoise?: number;
  aspectRatio?: string;
  width?: number;
  height?: number;
};

export type CharacterRecord = {
  id: string;
  userId: string;
  name: string;
  tag: string;
  description: string;
  prompt: string;
  negativePrompt?: string | null;
  imageUrl?: string | null;
  imageFilename?: string | null;
  workflowParams: CharacterWorkflowParams;
  prefix?: string | null;
  postfix?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveCharacterInput = {
  id?: string;
  name: string;
  tag: string;
  description: string;
  prompt: string;
  negativePrompt?: string | null;
  imageUrl?: string | null;
  imageFilename?: string | null;
  workflowParams?: CharacterWorkflowParams;
  prefix?: string | null;
  postfix?: string | null;
};

type DbCharacterRow = {
  id: string;
  user_id: string;
  name: string;
  tag: string;
  description: string;
  prompt: string;
  negative_prompt?: string | null;
  image_url?: string | null;
  image_filename?: string | null;
  workflow_params?: CharacterWorkflowParams | null;
  prefix?: string | null;
  postfix?: string | null;
  created_at: string;
  updated_at: string;
};

const TABLE = "aieditor_characters";
const SELECT_COLS =
  "id,user_id,name,tag,description,prompt,negative_prompt,image_url,image_filename,workflow_params,prefix,postfix,created_at,updated_at";

// Memory fallback for demo mode / when database table is not migrated yet
const inMemoryCharacters: CharacterRecord[] = [];

export function cleanTag(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/^#+/, "").trim().replace(/[^a-z0-9_-]/g, "_");
  return cleaned || "character";
}

function fromDbRow(row: DbCharacterRow): CharacterRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    tag: row.tag,
    description: row.description,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt ?? null,
    imageUrl: row.image_url ?? null,
    imageFilename: row.image_filename ?? null,
    workflowParams: row.workflow_params ?? {},
    prefix: row.prefix ?? null,
    postfix: row.postfix ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCharacters(userId: string): Promise<CharacterRecord[]> {
  if (!isSupabaseConfigured()) {
    return inMemoryCharacters.filter((c) => c.userId === userId);
  }

  try {
    const rows = await supabaseSelect<DbCharacterRow[]>(
      `${TABLE}?select=${SELECT_COLS}&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
    );
    if (!rows) return inMemoryCharacters.filter((c) => c.userId === userId);
    return rows.map(fromDbRow);
  } catch (err) {
    console.error("[characters] listCharacters error:", err);
    return inMemoryCharacters.filter((c) => c.userId === userId);
  }
}

export async function getCharacter(id: string, userId: string): Promise<CharacterRecord | null> {
  if (!isSupabaseConfigured()) {
    return inMemoryCharacters.find((c) => c.id === id && c.userId === userId) ?? null;
  }

  try {
    const rows = await supabaseSelect<DbCharacterRow[]>(
      `${TABLE}?select=${SELECT_COLS}&id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    );
    const row = rows?.[0];
    return row ? fromDbRow(row) : null;
  } catch (err) {
    console.error("[characters] getCharacter error:", err);
    return inMemoryCharacters.find((c) => c.id === id && c.userId === userId) ?? null;
  }
}

export async function getCharacterByTag(tag: string, userId: string): Promise<CharacterRecord | null> {
  const normTag = cleanTag(tag);
  if (!isSupabaseConfigured()) {
    return inMemoryCharacters.find((c) => cleanTag(c.tag) === normTag && c.userId === userId) ?? null;
  }

  try {
    const rows = await supabaseSelect<DbCharacterRow[]>(
      `${TABLE}?select=${SELECT_COLS}&user_id=eq.${encodeURIComponent(userId)}&tag=ilike.${encodeURIComponent(normTag)}&limit=1`,
    );
    const row = rows?.[0];
    return row ? fromDbRow(row) : null;
  } catch (err) {
    console.error("[characters] getCharacterByTag error:", err);
    return inMemoryCharacters.find((c) => cleanTag(c.tag) === normTag && c.userId === userId) ?? null;
  }
}

export async function saveCharacter(
  userId: string,
  input: SaveCharacterInput,
): Promise<CharacterRecord> {
  const tag = cleanTag(input.tag || input.name);
  const now = new Date().toISOString();

  const payload = {
    user_id: userId,
    name: input.name.trim() || "Untitled Character",
    tag,
    description: input.description.trim(),
    prompt: input.prompt.trim(),
    negative_prompt: input.negativePrompt ? input.negativePrompt.trim() : null,
    image_url: input.imageUrl ? input.imageUrl.trim() : null,
    image_filename: input.imageFilename ?? null,
    workflow_params: input.workflowParams ?? {},
    prefix: input.prefix ? input.prefix.trim() : null,
    postfix: input.postfix ? input.postfix.trim() : null,
  };

  if (!isSupabaseConfigured()) {
    if (input.id) {
      const idx = inMemoryCharacters.findIndex((c) => c.id === input.id && c.userId === userId);
      if (idx >= 0) {
        const updated: CharacterRecord = {
          ...inMemoryCharacters[idx],
          ...input,
          tag,
          workflowParams: input.workflowParams ?? inMemoryCharacters[idx].workflowParams,
          updatedAt: now,
        };
        inMemoryCharacters[idx] = updated;
        return updated;
      }
    }
    const created: CharacterRecord = {
      id: input.id || "char-" + Math.random().toString(36).slice(2, 10),
      userId,
      name: payload.name,
      tag: payload.tag,
      description: payload.description,
      prompt: payload.prompt,
      negativePrompt: payload.negative_prompt,
      imageUrl: payload.image_url,
      imageFilename: payload.image_filename,
      workflowParams: payload.workflow_params,
      prefix: payload.prefix,
      postfix: payload.postfix,
      createdAt: now,
      updatedAt: now,
    };
    inMemoryCharacters.unshift(created);
    return created;
  }

  try {
    if (input.id) {
      const rows = await supabasePatch<DbCharacterRow[]>(
        `${TABLE}?id=eq.${encodeURIComponent(input.id)}&user_id=eq.${encodeURIComponent(userId)}&select=${SELECT_COLS}`,
        payload,
      );
      if (rows && rows[0]) return fromDbRow(rows[0]);
    }

    const inserted = await supabaseInsert<DbCharacterRow[]>(`${TABLE}?select=${SELECT_COLS}`, payload);
    if (!inserted || !inserted[0]) throw new Error("Failed to save character in database.");
    return fromDbRow(inserted[0]);
  } catch (err: any) {
    console.error("[characters] saveCharacter error:", err);
    // Fallback to in-memory if table has not been created yet
    const created: CharacterRecord = {
      id: input.id || "char-" + Math.random().toString(36).slice(2, 10),
      userId,
      name: payload.name,
      tag: payload.tag,
      description: payload.description,
      prompt: payload.prompt,
      negativePrompt: payload.negative_prompt,
      imageUrl: payload.image_url,
      imageFilename: payload.image_filename,
      workflowParams: payload.workflow_params,
      prefix: payload.prefix,
      postfix: payload.postfix,
      createdAt: now,
      updatedAt: now,
    };
    inMemoryCharacters.unshift(created);
    return created;
  }
}

export async function deleteCharacter(id: string, userId: string): Promise<boolean> {
  const memIdx = inMemoryCharacters.findIndex((c) => c.id === id && c.userId === userId);
  if (memIdx >= 0) {
    inMemoryCharacters.splice(memIdx, 1);
  }

  if (!isSupabaseConfigured()) return true;

  try {
    await supabaseDelete(`${TABLE}?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`);
    return true;
  } catch (err) {
    console.error("[characters] deleteCharacter error:", err);
    return false;
  }
}
