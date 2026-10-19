/**
 * The prompt log, as /admin sees it, backed by Supabase PostgreSQL.
 */

import { RenderRow, listRenders, pruneUserPrompts } from "@/lib/renderQueue";

export type PromptLogRow = {
  id: string;
  user_id: string;
  prompt: string | null;
  pruned: boolean;
  type: string;
  aspect_ratio: string | null;
  duration_seconds: number | null;
  fast: boolean;
  comfy_prompt_id: string | null;
  created_at: string;
  status: string;
};

export const PROMPT_LOG_LIMIT = 30;

function toLogRow(row: RenderRow): PromptLogRow {
  return {
    id: row.id,
    user_id: row.user_id,
    prompt: row.prompt,
    pruned: row.pruned,
    type: row.type,
    aspect_ratio: row.aspect_ratio,
    duration_seconds: row.duration_seconds,
    fast: row.fast,
    comfy_prompt_id: row.comfy_prompt_id,
    created_at: row.created_at,
    status: row.status,
  };
}

export async function listPrompts(
  userId: string,
  limit: number = PROMPT_LOG_LIMIT,
): Promise<PromptLogRow[] | null> {
  const rows = await listRenders(userId, limit);
  return rows === null ? null : rows.map(toLogRow);
}

export async function prunePrompts(userId: string): Promise<number | null> {
  try {
    return await pruneUserPrompts(userId);
  } catch (err) {
    console.error("[promptLog] prune failed:", err);
    return null;
  }
}
