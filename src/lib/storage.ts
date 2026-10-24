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
    id: "preset_silk_blouse_trousers",
    name: "Silk Blouse & Pleated Wool Trousers (Female)",
    gender: "female",
    category: "formal",
    verbatimPrompt:
      "a tucked-in, long-sleeved silk button-up ivory blouse with mother-of-pearl buttons, paired with tailored high-waisted pleated beige wool trousers cinched with a slim brown leather belt",
    userDescription: "Master-consistency tailored ivory silk blouse and pleated wool trousers",
    isPreset: true,
    createdAt: 1700000000000,
  },
  {
    id: "preset_knit_denim_female",
    name: "Oversized Cable Knit & High-Waist Denim (Female)",
    gender: "female",
    category: "casual",
    verbatimPrompt:
      "an over-sized beige chunky-knit sweater with ribbed cuffs and hem, paired with dark blue high-waisted denim jeans with copper rivets, cinched with a tan leather belt, finished with brown ankle boots",
    userDescription: "Cozy oversized knit sweater with dark denim jeans",
    isPreset: true,
    createdAt: 1700000000001,
  },
  {
    id: "preset_casual_female",
    name: "Linen Blouse & Tailored Chino Trousers (Female)",
    gender: "female",
    category: "travel",
    verbatimPrompt:
      "a tucked-in, relaxed-fit light blue linen button-up blouse with white resin buttons and rolled sleeves, paired with dark navy tailored high-waisted cotton-twill ankle trousers cinched with a braided tan leather belt, finished with low-profile white canvas slip-on sneakers",
    userDescription: "Smart casual traveler attire with linen texture and tailored fit",
    isPreset: true,
    createdAt: 1700000000002,
  },
  {
    id: "preset_casual_male",
    name: "Combed-Cotton Crewneck & Raw Denim (Male)",
    gender: "male",
    category: "travel",
    verbatimPrompt:
      "a fitted heather-grey combed-cotton crewneck t-shirt with ribbed collar, paired with dark indigo raw-denim straight-leg jeans with bronze rivets, cinched with a distressed brown leather belt with brass buckle, finished with minimalist white leather sneakers",
    userDescription: "High-detail casual wardrobe with denim rivets and leather belt",
    isPreset: true,
    createdAt: 1700000000003,
  },
  {
    id: "preset_summer_female",
    name: "Floral Linen Sundress & Woven Sunhat (Female)",
    gender: "female",
    category: "casual",
    verbatimPrompt:
      "a fitted pastel-yellow floral-print linen A-line sundress with delicate thin shoulder straps and a sweetheart neckline, cinched at the natural waist with a matching fabric sash, accessorized with a wide-brim woven straw sunhat and tan leather strap sandals",
    userDescription: "Summer sundress with specific linen weave, sash tie, and sandals",
    isPreset: true,
    createdAt: 1700000000004,
  },
  {
    id: "preset_summer_male",
    name: "Resort Camp-Collar Shirt & Chino Shorts (Male)",
    gender: "male",
    category: "casual",
    verbatimPrompt:
      "a short-sleeved botanical-print rayon camp-collar resort shirt with coconut shell buttons, paired with tailored khaki cotton-twill chino shorts with slanted side pockets, cinched with a braided dark brown leather belt, finished with tan suede boat shoes",
    userDescription: "Tropical vacation resort shirt with coconut buttons and chino shorts",
    isPreset: true,
    createdAt: 1700000000005,
  },
  {
    id: "preset_office_female",
    name: "Silk Crepe Blouse & Houndstooth Skirt (Female)",
    gender: "female",
    category: "formal",
    verbatimPrompt:
      "a tailored emerald-green silk crepe button-up blouse with a covered hidden placket and French cuffs, tucked into a high-waisted charcoal-grey wool houndstooth pencil skirt with back vent, cinched with a narrow black patent-leather belt with gold buckle, finished with pointed-toe black leather low-heel pumps",
    userDescription: "Executive professional attire with french cuffs and houndstooth weave",
    isPreset: true,
    createdAt: 1700000000006,
  },
  {
    id: "preset_office_male",
    name: "Egyptian Cotton Dress Shirt & Wool Slacks (Male)",
    gender: "male",
    category: "formal",
    verbatimPrompt:
      "a crisp tailored sky-blue Egyptian cotton dress shirt with spread collar and mother-of-pearl buttons, tucked into tailored charcoal-grey wool-flannel dress trousers with sharp front creases, cinched with a polished black leather dress belt with silver buckle, finished with dark brown leather cap-toe oxford shoes",
    userDescription: "Bespoke executive business wear with sharp creases and oxford shoes",
    isPreset: true,
    createdAt: 1700000000007,
  },
  {
    id: "preset_explorer_unisex",
    name: "Ripstop Utility Windbreaker & Cargo Pants (Unisex)",
    gender: "unisex",
    category: "adventure",
    verbatimPrompt:
      "a weather-resistant olive-green ripstop utility windbreaker with brass zippers and cargo chest pockets, worn over a charcoal dry-fit undershirt, paired with rugged dark khaki cargo pants with reinforced knee seams and zippered pockets, cinched with a heavy-duty nylon webbing utility belt, finished with durable waterproof leather hiking boots with Vibram lug soles",
    userDescription: "Durable tactical survival and outdoor expedition gear",
    isPreset: true,
    createdAt: 1700000000008,
  },
  {
    id: "preset_pilot_male",
    name: "Aviation Captain Uniform (Male)",
    gender: "male",
    category: "uniform",
    verbatimPrompt:
      "a crisp white short-sleeved aviation pilot shirt with dual pleated chest pockets and gold four-stripe shoulder epaulets, tucked into tailored dark navy gabardine wool flight trousers with a sharp crease, cinched with a formal black leather belt with gold buckle, finished with polished high-shine black leather dress shoes",
    userDescription: "Commercial aviation captain uniform with gold epaulets and gabardine wool",
    isPreset: true,
    createdAt: 1700000000009,
  },
  {
    id: "preset_attendant_female",
    name: "Flight Attendant Wool Uniform Dress (Female)",
    gender: "female",
    category: "uniform",
    verbatimPrompt:
      "a tailored royal-blue wool-crepe uniform dress with asymmetrical white lapels and gold-trimmed cuff buttons, accented with a vibrant red silk neckerchief tied neatly in a side knot, cinched at the natural waist with a matching blue fabric belt, paired with black leather court pumps",
    userDescription: "Classic commercial airline crew uniform with silk neckerchief",
    isPreset: true,
    createdAt: 1700000000010,
  },
  {
    id: "preset_athletic_unisex",
    name: "Technical Dry-Fit Hoodie & Fleece Joggers (Unisex)",
    gender: "unisex",
    category: "casual",
    verbatimPrompt:
      "a fitted matte-black technical dry-fit athletic zip hoodie with raglan sleeves and thumbholes, paired with charcoal tapered fleece jogger sweatpants with zippered hip pockets and an elastic drawstring waist, finished with modern breathable mesh running sneakers with white soles",
    userDescription: "Modern activewear with technical fabric textures and raglan seams",
    isPreset: true,
    createdAt: 1700000000011,
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
        description: "White sandy shore with a small bamboo shelter, leaning palm trees, and coastal rocks",
        prompt: "pristine sandy beach shoreline meeting rolling turquoise ocean surf waves",
        structuralAnchor:
          "a single small weathered open-air bamboo shelter with rough wooden stilt posts and a shaggy dried palm-thatch roof situated on the far right sand dunes",
        landmarkAnchor:
          "three tall leaning coconut palm trees clustered on the far right sand dunes behind the shelter, dark jagged volcanic rocks jutting into the surf on the left coastline, weathered gray driftwood logs and smooth sea pebbles resting on the damp packed sand in the immediate foreground",
        vantagePoint:
          "fixed wide-angle eye-level landscape shot from the dry sandy shoreline looking across the beach toward the turquoise ocean waves",
        isInterior: false,
        seed: 482910481,
        timeVariants: {},
      },
      {
        id: "loc_jungle_camp",
        name: "Survivor Jungle Camp",
        description: "Makeshift survival shelter with a stone campfire ring in a lush rainforest clearing",
        prompt: "dense tropical jungle clearing surrounded by ancient mossy banyan trees and giant broadleaf ferns",
        structuralAnchor:
          "a single small A-frame survival lean-to shelter made of tied bamboo poles and woven green palm fronds on the left side of the clearing",
        landmarkAnchor:
          "a circular stone-lined campfire pit with weathered gray river stones and smoldering blackened charcoal in the center foreground, tall bamboo thickets framing the background, hanging jungle vines draping down from canopy trees",
        vantagePoint:
          "fixed medium-wide eye-level perspective centered on the jungle clearing and campfire",
        isInterior: false,
        seed: 719302845,
        timeVariants: {},
      },
      {
        id: "loc_cliff_overlook",
        name: "Ocean Cliff Overlook",
        description: "Untouched rocky coastal cliff overlooking the vast open ocean horizon",
        prompt: "dramatic high coastal cliff plateau overlooking the endless deep azure sea",
        structuralAnchor:
          "completely untouched wild nature with zero buildings, no huts, no houses, no man-made structures",
        landmarkAnchor:
          "craggy dark basalt rock ledge extending toward the edge on the right, wild coastal grass and hardy blooming purple sea lavender clinging to rock crevices, distant ocean horizon meeting the sky",
        vantagePoint:
          "fixed wide-angle landscape vista shot standing on the rocky plateau looking out toward the ocean horizon",
        isInterior: false,
        seed: 938102476,
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
    if (!Array.isArray(worlds) || worlds.length === 0) return DEFAULT_WORLDS;

    // Backfill defaults if user has older stored default locations missing structural anchors
    return worlds.map((w) => {
      const defaultW = DEFAULT_WORLDS.find((dw) => dw.id === w.id);
      if (!defaultW) return w;
      return {
        ...w,
        locations: w.locations.map((loc) => {
          const defaultLoc = defaultW.locations.find((dl) => dl.id === loc.id);
          if (!defaultLoc) return loc;
          return {
            ...defaultLoc,
            ...loc,
            structuralAnchor: loc.structuralAnchor || defaultLoc.structuralAnchor,
            landmarkAnchor: loc.landmarkAnchor || defaultLoc.landmarkAnchor,
            vantagePoint: loc.vantagePoint || defaultLoc.vantagePoint,
            isInterior: loc.isInterior !== undefined ? loc.isInterior : defaultLoc.isInterior,
            seed: loc.seed !== undefined ? loc.seed : defaultLoc.seed,
          };
        }),
      };
    });
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


