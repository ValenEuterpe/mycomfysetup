import { GenerationHistoryItem } from "../types/workflow";
import { VNCharacter, VNStory } from "../types/visualNovel";

const STORAGE_KEYS = {
  ENDPOINT: "comfy_studio_endpoint",
  ENDPOINT_HISTORY: "comfy_studio_endpoint_history",
  ACTIVE_PRESET: "comfy_studio_active_preset",
  CUSTOM_PRESETS: "comfy_studio_custom_presets",
  HISTORY: "comfy_studio_history",
  DELIVERY_PREFS: "comfy_studio_delivery_prefs",
  VN_CHARACTERS: "comfy_studio_vn_characters",
  VN_STORIES: "comfy_studio_vn_stories",
};

export const DEFAULT_ENDPOINT =
  "https://comfy-relay.chaoticmindintheuniverse.workers.dev/?key=somepersonalkeymaybeher";

export interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  workflowJson: string; // serialized ComfyWorkflowGraph
  isCustom?: boolean;
}

export function loadSavedEndpoint(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.ENDPOINT);
    return saved ? saved.trim() : DEFAULT_ENDPOINT;
  } catch {
    return DEFAULT_ENDPOINT;
  }
}

export function saveEndpoint(endpoint: string): void {
  try {
    const trimmed = endpoint.trim();
    localStorage.setItem(STORAGE_KEYS.ENDPOINT, trimmed);

    // Also track in history
    const history = loadEndpointHistory();
    if (!history.includes(trimmed)) {
      const updated = [trimmed, ...history.filter((e) => e !== trimmed)].slice(0, 5);
      localStorage.setItem(STORAGE_KEYS.ENDPOINT_HISTORY, JSON.stringify(updated));
    }
  } catch {}
}

export function loadEndpointHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ENDPOINT_HISTORY);
    return raw ? JSON.parse(raw) : [DEFAULT_ENDPOINT];
  } catch {
    return [DEFAULT_ENDPOINT];
  }
}

export function loadGenerationHistory(): GenerationHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveGenerationItem(item: GenerationHistoryItem): void {
  try {
    const current = loadGenerationHistory();
    const existingIndex = current.findIndex((i) => i.id === item.id);
    let updated: GenerationHistoryItem[];

    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = item;
    } else {
      updated = [item, ...current].slice(0, 50); // Keep last 50 generations
    }

    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(updated));
  } catch {}
}

export function clearGenerationHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
  } catch {}
}

export function loadCustomPresets(): WorkflowPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_PRESETS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomPreset(preset: WorkflowPreset): void {
  try {
    const existing = loadCustomPresets();
    const updated = [
      preset,
      ...existing.filter((p) => p.id !== preset.id),
    ];
    localStorage.setItem(STORAGE_KEYS.CUSTOM_PRESETS, JSON.stringify(updated));
  } catch {}
}

export function deleteCustomPreset(id: string): void {
  try {
    const existing = loadCustomPresets();
    const updated = existing.filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_PRESETS, JSON.stringify(updated));
  } catch {}
}

export interface DeliveryPrefs {
  loadInBrowser: boolean;
  sendToTelegram: boolean;
}

export function loadDeliveryPrefs(): DeliveryPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELIVERY_PREFS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        loadInBrowser: parsed.loadInBrowser !== false,
        sendToTelegram: parsed.sendToTelegram === true,
      };
    }
  } catch {}
  return { loadInBrowser: true, sendToTelegram: false };
}

export function saveDeliveryPrefs(prefs: DeliveryPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DELIVERY_PREFS, JSON.stringify(prefs));
  } catch {}
}

export function loadVNCharacters(): VNCharacter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VN_CHARACTERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Fetches characters saved in Cloudflare KV memory and merges with local storage.
 */
export async function fetchCharactersFromKV(): Promise<VNCharacter[]> {
  try {
    const res = await fetch("/api/characters");
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data?.characters) && data.characters.length > 0) {
      const local = loadVNCharacters();
      const mergedMap = new Map<string, VNCharacter>();
      data.characters.forEach((c: VNCharacter) => mergedMap.set(c.id, c));
      local.forEach((c: VNCharacter) => mergedMap.set(c.id, c));
      const merged = Array.from(mergedMap.values());
      localStorage.setItem(STORAGE_KEYS.VN_CHARACTERS, JSON.stringify(merged));
      return merged;
    }
    return [];
  } catch {
    return [];
  }
}

export function saveVNCharacter(char: VNCharacter): void {
  try {
    const current = loadVNCharacters();
    const existingIndex = current.findIndex((c) => c.id === char.id);
    let updated: VNCharacter[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = char;
    } else {
      updated = [char, ...current];
    }
    localStorage.setItem(STORAGE_KEYS.VN_CHARACTERS, JSON.stringify(updated));

    // Background sync to Cloudflare KV memory (stores text prompt & identity)
    fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character: char }),
    }).catch(() => {});
  } catch {}
}

export function deleteVNCharacter(id: string): void {
  try {
    const current = loadVNCharacters();
    const updated = current.filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.VN_CHARACTERS, JSON.stringify(updated));

    // Background delete from Cloudflare KV memory
    fetch(`/api/characters?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => {});
  } catch {}
}

export function loadVNStories(): VNStory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VN_STORIES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveVNStory(story: VNStory): void {
  try {
    const current = loadVNStories();
    const existingIndex = current.findIndex((s) => s.id === story.id);
    let updated: VNStory[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = story;
    } else {
      updated = [story, ...current];
    }
    localStorage.setItem(STORAGE_KEYS.VN_STORIES, JSON.stringify(updated));
  } catch {}
}

export function deleteVNStory(id: string): void {
  try {
    const current = loadVNStories();
    const updated = current.filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.VN_STORIES, JSON.stringify(updated));
  } catch {}
}

