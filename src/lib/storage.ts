import { GenerationHistoryItem } from "../types/workflow";
import { VNCharacter, VNStory, VNAttire, VNWorld, VNSpriteVariant } from "../types/visualNovel";

const STORAGE_KEYS = {
  ENDPOINT: "comfy_studio_endpoint",
  ENDPOINT_HISTORY: "comfy_studio_endpoint_history",
  ACTIVE_PRESET: "comfy_studio_active_preset",
  CUSTOM_PRESETS: "comfy_studio_custom_presets",
  HISTORY: "comfy_studio_history",
  DELIVERY_PREFS: "comfy_studio_delivery_prefs",
  VN_CHARACTERS: "comfy_studio_vn_characters",
  VN_STORIES: "comfy_studio_vn_stories",
  VN_ATTIRES: "comfy_studio_vn_attires",
  VN_WORLDS: "comfy_studio_vn_worlds",
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

export const DEFAULT_BASELINE_ATTIRES: VNAttire[] = [
  {
    id: "preset_casual_male",
    name: "Civilian Flight Casual (Male)",
    gender: "male",
    category: "travel",
    verbatimPrompt: "crisp grey crewneck t-shirt, dark indigo denim jeans, white canvas sneakers, brown leather watch",
    userDescription: "Standard comfortable traveler clothing for men",
    isPreset: true,
    createdAt: 1700000000000,
  },
  {
    id: "preset_casual_female",
    name: "Civilian Flight Casual (Female)",
    gender: "female",
    category: "travel",
    verbatimPrompt: "light blue linen button-up blouse, dark navy tailored trousers, comfortable white slip-on sneakers",
    userDescription: "Smart casual traveler attire for women",
    isPreset: true,
    createdAt: 1700000000001,
  },
  {
    id: "preset_summer_male",
    name: "Summer Vacationer (Male)",
    gender: "male",
    category: "casual",
    verbatimPrompt: "short-sleeve tropical floral shirt, khaki chino shorts, brown leather boat shoes, woven wristband",
    userDescription: "Relaxed tropical vacation outfit",
    isPreset: true,
    createdAt: 1700000000002,
  },
  {
    id: "preset_summer_female",
    name: "Summer Vacationer (Female)",
    gender: "female",
    category: "casual",
    verbatimPrompt: "lightweight yellow floral sundress with thin straps, straw sunhat, tan leather sandals",
    userDescription: "Breezy sunny day sundress",
    isPreset: true,
    createdAt: 1700000000003,
  },
  {
    id: "preset_office_male",
    name: "Office Executive (Male)",
    gender: "male",
    category: "formal",
    verbatimPrompt: "crisp light blue dress shirt, dark charcoal wool slacks, black leather dress belt, polished oxford shoes",
    userDescription: "Professional business wear for men",
    isPreset: true,
    createdAt: 1700000000004,
  },
  {
    id: "preset_office_female",
    name: "Office Professional (Female)",
    gender: "female",
    category: "formal",
    verbatimPrompt: "silk emerald green button-up blouse, high-waisted beige pencil skirt, black low-heel pumps",
    userDescription: "Tailored professional attire for women",
    isPreset: true,
    createdAt: 1700000000005,
  },
  {
    id: "preset_explorer_unisex",
    name: "Island Explorer (Unisex)",
    gender: "unisex",
    category: "adventure",
    verbatimPrompt: "olive green zippered utility windbreaker, rugged dark cargo pants with pockets, durable waterproof hiking boots",
    userDescription: "Durable survival and outdoor exploration gear",
    isPreset: true,
    createdAt: 1700000000006,
  },
  {
    id: "preset_pilot_male",
    name: "Airline Captain Uniform (Male)",
    gender: "male",
    category: "uniform",
    verbatimPrompt: "crisp white short-sleeve pilot shirt with gold four-stripe epaulets, dark navy formal flight trousers, black leather dress shoes",
    userDescription: "Commercial aviation captain uniform",
    isPreset: true,
    createdAt: 1700000000007,
  },
  {
    id: "preset_attendant_female",
    name: "Flight Attendant Uniform (Female)",
    gender: "female",
    category: "uniform",
    verbatimPrompt: "tailored royal blue flight attendant uniform dress with white lapel collar, red silk neckerchief, black leather pumps",
    userDescription: "Classic commercial airline crew uniform",
    isPreset: true,
    createdAt: 1700000000008,
  },
  {
    id: "preset_athletic_unisex",
    name: "Athletic Sportswear (Unisex)",
    gender: "unisex",
    category: "casual",
    verbatimPrompt: "breathable black dry-fit athletic hoodie, grey tapered sweatpants, modern running sneakers",
    userDescription: "Modern activewear and sportswear",
    isPreset: true,
    createdAt: 1700000000009,
  },
];

export function loadVNAttires(): VNAttire[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VN_ATTIRES);
    const custom: VNAttire[] = raw ? JSON.parse(raw) : [];
    const map = new Map<string, VNAttire>();
    DEFAULT_BASELINE_ATTIRES.forEach((a) => map.set(a.id, a));
    custom.forEach((a) => map.set(a.id, a));
    return Array.from(map.values());
  } catch {
    return DEFAULT_BASELINE_ATTIRES;
  }
}

export async function fetchAttiresFromKV(): Promise<VNAttire[]> {
  try {
    const res = await fetch("/api/attires");
    if (!res.ok) return loadVNAttires();
    const data = await res.json();
    if (Array.isArray(data?.attires) && data.attires.length > 0) {
      const current = loadVNAttires();
      const map = new Map<string, VNAttire>();
      current.forEach((a) => map.set(a.id, a));
      data.attires.forEach((a: VNAttire) => map.set(a.id, a));
      const merged = Array.from(map.values());
      const customOnly = merged.filter((a) => !a.isPreset);
      localStorage.setItem(STORAGE_KEYS.VN_ATTIRES, JSON.stringify(customOnly));
      return merged;
    }
    return loadVNAttires();
  } catch {
    return loadVNAttires();
  }
}

export function saveVNAttire(attire: VNAttire): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VN_ATTIRES);
    const custom: VNAttire[] = raw ? JSON.parse(raw) : [];
    const existingIndex = custom.findIndex((a) => a.id === attire.id);
    let updated: VNAttire[];
    if (existingIndex >= 0) {
      updated = [...custom];
      updated[existingIndex] = attire;
    } else {
      updated = [attire, ...custom];
    }
    localStorage.setItem(STORAGE_KEYS.VN_ATTIRES, JSON.stringify(updated));

    // Background sync to Cloudflare KV
    fetch("/api/attires", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attire }),
    }).catch(() => {});
  } catch {}
}

export function deleteVNAttire(id: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VN_ATTIRES);
    const custom: VNAttire[] = raw ? JSON.parse(raw) : [];
    const updated = custom.filter((a) => a.id !== id);
    localStorage.setItem(STORAGE_KEYS.VN_ATTIRES, JSON.stringify(updated));

    // Background delete from Cloudflare KV
    fetch(`/api/attires?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => {});
  } catch {}
}

export const DEFAULT_WORLDS: VNWorld[] = [
  {
    id: "world_tropical_island",
    title: "Tropical Mystery Island",
    locations: [
      {
        id: "loc_sandy_beach",
        name: "Sandy Coastline",
        description: "White sandy beach with turquoise ocean waves and leaning palm trees",
        prompt: "pristine sandy beach, turquoise tropical ocean waves crashing on shore, leaning palm trees, driftwood on wet sand",
        timeVariants: {},
      },
      {
        id: "loc_jungle_camp",
        name: "Survivor Jungle Camp",
        description: "Rustic makeshift survival shelter surrounded by lush bamboo and tropical vegetation",
        prompt: "rustic makeshift survival campsite, bamboo tent shelter, campfire with stones, surrounded by dense tropical rainforest ferns and palm leaves",
        timeVariants: {},
      },
      {
        id: "loc_cliff_overlook",
        name: "Ocean Cliff Overlook",
        description: "Dramatic rocky cliff looking over the vast open ocean and distant horizon",
        prompt: "high rocky coastal cliff edge overlooking the endless azure sea, ocean horizon, rugged stone plateau",
        timeVariants: {},
      },
    ],
  },
];

export function loadVNWorlds(): VNWorld[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VN_WORLDS);
    if (!raw) return DEFAULT_WORLDS;
    const worlds: VNWorld[] = JSON.parse(raw);
    return worlds.length > 0 ? worlds : DEFAULT_WORLDS;
  } catch {
    return DEFAULT_WORLDS;
  }
}

export function saveVNWorld(world: VNWorld): void {
  try {
    const current = loadVNWorlds();
    const existingIndex = current.findIndex((w) => w.id === world.id);
    let updated: VNWorld[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = world;
    } else {
      updated = [world, ...current];
    }
    localStorage.setItem(STORAGE_KEYS.VN_WORLDS, JSON.stringify(updated));
  } catch {}
}

export function deleteVNWorld(id: string): void {
  try {
    const current = loadVNWorlds();
    const updated = current.filter((w) => w.id !== id);
    localStorage.setItem(STORAGE_KEYS.VN_WORLDS, JSON.stringify(updated));
  } catch {}
}

export function saveVNSpriteVariant(charId: string, sprite: VNSpriteVariant): void {
  try {
    const chars = loadVNCharacters();
    const target = chars.find((c) => c.id === charId);
    if (!target) return;

    const sprites = target.sprites || {};
    const key = `${sprite.outfitId}_${sprite.emotionId}`;
    sprites[key] = sprite;

    const updatedChar: VNCharacter = {
      ...target,
      sprites,
    };
    saveVNCharacter(updatedChar);
  } catch {}
}


