"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/** Where the key lives between visits. */
const STORAGE_KEY = "studio.apiKey";

export type AuthStatus = "checking" | "locked" | "unlocked";

type UnlockResult = { ok: true } | { ok: false; error: string; isInviteCode?: boolean; inviteCode?: string };

export type Capabilities = {
  canDisableFastMode: boolean;
  canAdminister: boolean;
  canAccessFilmmaking: boolean;
  canAccessVideo: boolean;
  canAccessImage: boolean;
  canAccessAdvanced: boolean;
};

const NO_CAPABILITIES: Capabilities = {
  canDisableFastMode: false,
  canAdminister: false,
  canAccessFilmmaking: false,
  canAccessVideo: false,
  canAccessImage: false,
  canAccessAdvanced: false,
};

export type Quota = { used: number; limit: number };

type ApiKeyContextValue = {
  status: AuthStatus;
  username: string | null;
  capabilities: Capabilities;
  quota: Quota | null;
  videoQuota: Quota | null;
  imageQuota: Quota | null;
  generations: number | null;
  syncUsage: (payload: unknown) => void;
  refresh: () => void;
  unlock: (apiKey: string) => Promise<UnlockResult>;
  loginWithPassword: (username: string, password: string) => Promise<UnlockResult>;
  redeemInviteCode: (code: string, username: string) => Promise<UnlockResult>;
  logout: () => void;
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
};

const ApiKeyContext = createContext<ApiKeyContextValue | null>(null);

function readStoredKey(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredKey(apiKey: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, apiKey);
  } catch {
    /* session-only fallback */
  }
}

function clearStoredKey(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

export function parseQuota(value: unknown): Quota | null {
  if (!value || typeof value !== "object") return null;
  const { used, limit } = value as { used?: unknown; limit?: unknown };
  if (typeof used !== "number" || typeof limit !== "number") return null;
  if (!Number.isFinite(used) || !Number.isFinite(limit)) return null;
  return { used, limit };
}

function parseCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function utcDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

function msUntilUtcMidnight(from: Date = new Date()): number {
  const next = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1, 0, 0, 0, 0);
  return next - from.getTime() + 1000;
}

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [username, setUsername] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities>(NO_CAPABILITIES);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [videoQuota, setVideoQuota] = useState<Quota | null>(null);
  const [imageQuota, setImageQuota] = useState<Quota | null>(null);
  const [generations, setGenerations] = useState<number | null>(null);

  const keyRef = useRef("");
  const dayRef = useRef(utcDay());

  const applyLocked = useCallback(() => {
    keyRef.current = "";
    clearStoredKey();
    setUsername(null);
    setCapabilities(NO_CAPABILITIES);
    setQuota(null);
    setVideoQuota(null);
    setImageQuota(null);
    setGenerations(null);
    setStatus("locked");
  }, []);

  const submitSession = useCallback(async (payload: { apiKey?: string; inviteCode?: string; username?: string; loginUsername?: string; password?: string }): Promise<UnlockResult> => {
    let res: Response;
    try {
      res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      return { ok: false, error: "Network error — is the server running?" };
    }

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        ok: false,
        error: data?.error ?? "Sign-in failed.",
        isInviteCode: data?.isInviteCode,
        inviteCode: data?.inviteCode,
      };
    }

    const effectiveKey = data?.apiKey || data?.id || payload.apiKey || "";
    keyRef.current = effectiveKey;
    if (effectiveKey) writeStoredKey(effectiveKey);

    setUsername(data?.username ?? null);
    setCapabilities({
      canDisableFastMode: data?.canDisableFastMode === true,
      canAdminister: data?.canAdminister === true,
      canAccessFilmmaking: data?.canAccessFilmmaking === true,
      canAccessVideo: data?.canAccessVideo !== false,
      canAccessImage: data?.canAccessImage !== false,
      canAccessAdvanced: data?.canAccessAdvanced === true,
    });
    setQuota(parseQuota(data?.quota));
    setVideoQuota(parseQuota(data?.videoQuota));
    setImageQuota(parseQuota(data?.imageQuota));
    setGenerations(parseCount(data?.generations));
    dayRef.current = utcDay();
    setStatus("unlocked");
    return { ok: true };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stored = readStoredKey();

    submitSession(stored ? { apiKey: stored } : {}).then((result) => {
      if (cancelled || result.ok) return;
      keyRef.current = "";
      if (stored) clearStoredKey();
      setStatus("locked");
    });

    return () => {
      cancelled = true;
    };
  }, [submitSession]);

  const unlock = useCallback(
    async (apiKey: string) => {
      const trimmed = apiKey.trim();
      if (!trimmed) return { ok: false as const, error: "Enter your invite code or key to continue." };
      return submitSession({ apiKey: trimmed });
    },
    [submitSession],
  );

  const loginWithPassword = useCallback(
    async (loginUser: string, pass: string) => {
      const trimmedUser = loginUser.trim();
      if (!trimmedUser) return { ok: false as const, error: "Enter your username." };
      if (!pass) return { ok: false as const, error: "Enter your password." };
      return submitSession({ username: trimmedUser, password: pass });
    },
    [submitSession],
  );

  const redeemInviteCode = useCallback(
    async (code: string, rawUsername: string) => {
      const trimmedCode = code.trim().toUpperCase();
      if (!trimmedCode) return { ok: false as const, error: "Enter an invite code." };
      return submitSession({ inviteCode: trimmedCode, username: rawUsername.trim() });
    },
    [submitSession],
  );

  const logout = useCallback(() => {
    applyLocked();
    fetch("/api/session", { method: "DELETE" }).catch(() => {});
  }, [applyLocked]);

  const refresh = useCallback(() => {
    submitSession(keyRef.current ? { apiKey: keyRef.current } : {}).catch(() => {});
  }, [submitSession]);

  const syncUsage = useCallback((payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const body = payload as {
      quota?: unknown;
      videoQuota?: unknown;
      imageQuota?: unknown;
      generations?: unknown;
    };
    if (body.quota !== undefined) setQuota(parseQuota(body.quota));
    if (body.videoQuota !== undefined) setVideoQuota(parseQuota(body.videoQuota));
    if (body.imageQuota !== undefined) setImageQuota(parseQuota(body.imageQuota));
    if (body.generations !== undefined) setGenerations(parseCount(body.generations));
  }, []);

  useEffect(() => {
    if (status !== "unlocked") return;

    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => {
        refresh();
        arm();
      }, msUntilUtcMidnight());
    };
    arm();
    return () => clearTimeout(timer);
  }, [status, refresh]);

  const authFetch = useCallback(
    async (input: string, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      if (keyRef.current && !headers.has("x-api-key")) {
        headers.set("x-api-key", keyRef.current);
      }

      const res = await fetch(input, { ...init, headers });
      if (res.status === 401) {
        applyLocked();
      }
      return res;
    },
    [applyLocked],
  );

  return (
    <ApiKeyContext.Provider
      value={{
        status,
        username,
        capabilities,
        quota,
        videoQuota,
        imageQuota,
        generations,
        syncUsage,
        refresh,
        unlock,
        loginWithPassword,
        redeemInviteCode,
        logout,
        authFetch,
      }}
    >
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey(): ApiKeyContextValue {
  const ctx = useContext(ApiKeyContext);
  if (!ctx) throw new Error("useApiKey must be used within an ApiKeyProvider");
  return ctx;
}
