export interface PublicSiteSettings {
  enabledModels: Record<string, boolean>; // e.g. { "anima-base": true, "kroma": true, "anima-sticker": true }
  defaultModelId: string;
  updatedAt?: number;
}

export const DEFAULT_PUBLIC_SETTINGS: PublicSiteSettings = {
  enabledModels: {
    "anima-base": true,
    "kroma": true,
    "anima-sticker": true,
  },
  defaultModelId: "anima-base",
};

const STORAGE_KEY = "comfy_studio_public_settings";

export function loadCachedPublicSettings(): PublicSiteSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabledModels: {
          ...DEFAULT_PUBLIC_SETTINGS.enabledModels,
          ...(parsed.enabledModels || {}),
        },
        defaultModelId: parsed.defaultModelId || DEFAULT_PUBLIC_SETTINGS.defaultModelId,
        updatedAt: parsed.updatedAt,
      };
    }
  } catch (e) {
    console.warn("Failed to load cached public settings:", e);
  }
  return DEFAULT_PUBLIC_SETTINGS;
}

export function cachePublicSettings(settings: PublicSiteSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("Failed to cache public settings:", e);
  }
}

export async function fetchPublicSettings(): Promise<PublicSiteSettings> {
  try {
    const res = await fetch("/api/public-settings", { cache: "no-store" });
    if (res.ok) {
      const data: PublicSiteSettings = await res.json();
      const resolved: PublicSiteSettings = {
        enabledModels: {
          ...DEFAULT_PUBLIC_SETTINGS.enabledModels,
          ...(data.enabledModels || {}),
        },
        defaultModelId: data.defaultModelId || DEFAULT_PUBLIC_SETTINGS.defaultModelId,
        updatedAt: data.updatedAt,
      };
      cachePublicSettings(resolved);
      return resolved;
    }
  } catch (err) {
    console.warn("Could not fetch /api/public-settings:", err);
  }
  return loadCachedPublicSettings();
}

export async function savePublicSettingsOnServer(
  settings: PublicSiteSettings
): Promise<{ ok: boolean; message?: string }> {
  cachePublicSettings(settings);
  try {
    const res = await fetch("/api/public-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, message: err?.error || `Server responded with ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, message: err.message || "Network error" };
  }
}
