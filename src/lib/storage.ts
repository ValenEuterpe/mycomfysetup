import { GenerationHistoryItem } from "../types/workflow";

const STORAGE_KEYS = {
  ENDPOINT: "comfy_studio_endpoint",
  ENDPOINT_HISTORY: "comfy_studio_endpoint_history",
  ACTIVE_PRESET: "comfy_studio_active_preset",
  CUSTOM_PRESETS: "comfy_studio_custom_presets",
  HISTORY: "comfy_studio_history",
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
