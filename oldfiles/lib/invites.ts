import crypto from "crypto";
import {
  isSupabaseConfigured,
  supabaseDelete,
  supabaseInsert,
  supabaseRpc,
  supabaseSelect,
} from "@/lib/supabase";
import type { ProfileRow } from "@/lib/quota";

export type InviteDoc = {
  code: string;
  note: string | null;
  daily_limit: number;
  can_access_advanced: boolean;
  can_access_filmmaking: boolean;
  expires_at: string | null;
  is_used: boolean;
  used_by_user_id: string | null;
  prefix?: string | null;
  used_by_username: string | null;
  used_at: string | null;
  created_at: string;
};

export function generateRandomInviteCode(prefix: string = "KEMO"): string {
  const cleanPrefix = (prefix || "KEMO")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "") || "KEMO";
  const part1 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const part2 = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `${cleanPrefix}-${part1}-${part2}`;
}

export type CreateInvitesBatchParams = {
  prefix: string;
  count?: number;
};

export async function createInvitesBatch(params: CreateInvitesBatchParams): Promise<InviteDoc[]> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  const cleanPrefix = (params.prefix || "KEMO")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");

  if (!cleanPrefix) {
    throw new Error("A valid prefix (alphanumeric, e.g. RUM or VAL) is required.");
  }

  const count = Math.min(100, Math.max(1, Number(params.count) || 1));
  const now = new Date().toISOString();
  const generatedCodes = new Set<string>();
  const rows: Array<Record<string, any>> = [];

  for (let i = 0; i < count; i++) {
    let code = "";
    do {
      code = generateRandomInviteCode(cleanPrefix);
    } while (generatedCodes.has(code));
    generatedCodes.add(code);

    rows.push({
      code,
      prefix: cleanPrefix,
      note: null,
      daily_limit: 10,
      can_access_advanced: false,
      can_access_filmmaking: false,
      expires_at: null,
      is_used: false,
      used_by_user_id: null,
      used_by_username: null,
      used_at: null,
      created_at: now,
    });
  }

  const inserted = await supabaseInsert<InviteDoc[]>("aieditor_invites", rows);
  return inserted ?? (rows as InviteDoc[]);
}

export type CreateInviteParams = {
  prefix?: string;
  customCode?: string;
  note?: string;
  dailyLimit?: number;
  canAccessAdvanced?: boolean;
  canAccessFilmmaking?: boolean;
  expiresInDays?: number | null;
};

export async function createInvite(params: CreateInviteParams = {}): Promise<InviteDoc> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  const cleanPrefix = (params.prefix || "KEMO")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "") || "KEMO";

  const rawCode = params.customCode?.trim() || generateRandomInviteCode(cleanPrefix);
  const code = rawCode.toUpperCase().replace(/\s+/g, "");

  const now = new Date();
  let expiresAt: string | null = null;
  if (params.expiresInDays && params.expiresInDays > 0) {
    const exp = new Date(now.getTime() + params.expiresInDays * 24 * 60 * 60 * 1000);
    expiresAt = exp.toISOString();
  }

  const row = {
    code,
    prefix: cleanPrefix,
    note: params.note?.trim() || null,
    daily_limit: typeof params.dailyLimit === "number" ? Math.max(1, params.dailyLimit) : 10,
    can_access_advanced: Boolean(params.canAccessAdvanced),
    can_access_filmmaking: Boolean(params.canAccessFilmmaking),
    expires_at: expiresAt,
    is_used: false,
    used_by_user_id: null,
    used_by_username: null,
    used_at: null,
    created_at: now.toISOString(),
  };

  const inserted = await supabaseInsert<InviteDoc[]>("aieditor_invites", row);
  return inserted?.[0] ?? (row as InviteDoc);
}

export async function getInvite(code: string): Promise<InviteDoc | null> {
  if (!isSupabaseConfigured()) return null;
  const normalized = code.trim().toUpperCase();

  try {
    const rows = await supabaseSelect<InviteDoc[]>(
      `aieditor_invites?select=*&code=eq.${encodeURIComponent(normalized)}&limit=1`,
    );
    return rows?.[0] ?? null;
  } catch (err) {
    console.error("[invites] getInvite failed:", err);
    return null;
  }
}

export type RedeemResult =
  | { ok: true; user: ProfileRow }
  | { ok: false; error: string; reason?: "invalid" | "used" | "expired" };

export async function redeemInvite(
  code: string,
  rawUsername: string,
  ip: string | null = null,
): Promise<RedeemResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Database not configured." };
  }

  const normalizedCode = code.trim().toUpperCase();
  const username = rawUsername.trim();

  try {
    const rows = await supabaseRpc<ProfileRow[]>("aieditor_redeem_invite", {
      p_code: normalizedCode,
      p_username: username,
      p_ip: ip,
    });

    const user = rows?.[0];
    if (!user) {
      return { ok: false, error: "Failed to redeem invite code." };
    }

    return { ok: true, user };
  } catch (err: any) {
    const message = err?.message || String(err);
    if (message.includes("Invalid invite code")) {
      return { ok: false, error: "Invalid invite code.", reason: "invalid" };
    }
    if (message.includes("already been used")) {
      return { ok: false, error: "This invite code has already been used.", reason: "used" };
    }
    if (message.includes("expired")) {
      return { ok: false, error: "This invite code has expired.", reason: "expired" };
    }
    console.error("[invites] redeemInvite failed:", err);
    return { ok: false, error: message || "Failed to redeem invite code." };
  }
}

export async function listInvites(): Promise<InviteDoc[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const rows = await supabaseSelect<InviteDoc[]>(
      "aieditor_invites?select=*&order=created_at.desc&limit=200",
    );
    return rows ?? [];
  } catch (err) {
    console.error("[invites] listInvites failed:", err);
    return [];
  }
}

export async function revokeInvite(code: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const normalized = code.trim().toUpperCase();
  try {
    await supabaseDelete(`aieditor_invites?code=eq.${encodeURIComponent(normalized)}`);
    return true;
  } catch (err) {
    console.error("[invites] revokeInvite failed:", err);
    return false;
  }
}
