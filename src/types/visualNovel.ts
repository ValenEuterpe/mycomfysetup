export interface VNAttire {
  id: string;
  name: string;
  gender: "female" | "male" | "unisex";
  category: "casual" | "formal" | "travel" | "swimwear" | "uniform" | "adventure" | "other";
  /** Exact verbatim prompt describing garments, materials, colors, and footwear */
  verbatimPrompt: string;
  userDescription?: string;
  previewImageUrl?: string;
  mediaId?: string;
  isPreset?: boolean;
  createdAt: number;
}

export interface VNSpriteVariant {
  id: string;
  characterId: string;
  outfitId: string;
  poseId: string;
  emotionId: string;
  imageUrl: string;
  mediaId?: string;
  outlineWidth: number; // 0 for clean alpha cutout, 2 for sticker white border
  seed?: number;
  createdAt: number;
}

export interface VNCharacter {
  id: string;
  name: string;
  gender?: "male" | "female" | "other";
  role?: string; // e.g. "Civilian Passenger", "Teacher", "Doctor", "Pilot"
  baselineOutfit?: string; // e.g. "casual grey t-shirt, dark denim jeans, white sneakers"
  baselineAttireId?: string; // Link to canonical VNAttire
  userPrompt: string;
  figureStyle?: string;
  faceShape?: string;
  /** Exact verbatim prompt describing bodily and facial proportions, hair, eyes, etc. */
  verbatimIdentityPrompt: string;
  /** Immutable anatomical anchor (measurable traits: jawline, cheekbones, eyes, exact hair, height/build) */
  characterAnchor?: string;
  /** Clothing locks keyed by outfit name/id */
  clothingLocks?: Record<string, string>;
  /** Height in centimeters for proportional stage scaling (e.g. 165) */
  cm?: number;
  /** Generated transparent sprite cutouts keyed by `${outfitId}_${emotionId}` */
  sprites?: Record<string, VNSpriteVariant>;
  avatarUrl?: string;
  mediaId?: string;
  createdAt: number;
}

export interface VNLocation {
  id: string;
  name: string;
  description: string;
  prompt: string;
  /** Explicit structural anchor (e.g. exact type of hut/building or 'zero buildings') */
  structuralAnchor?: string;
  /** Fixed landmarks & spatial composition (e.g. left rocks, right trees, foreground driftwood) */
  landmarkAnchor?: string;
  /** Camera vantage point (e.g. fixed wide-angle shot from the shore) */
  vantagePoint?: string;
  /** Whether the location is an interior room */
  isInterior?: boolean;
  /** Base seed to lock procedural terrain geometry across times of day */
  seed?: number;
  timeVariants: {
    day?: string;
    evening?: string;
    night?: string;
  };
}

export interface VNWorld {
  id: string;
  title: string;
  locations: VNLocation[];
}

export interface VNDialogueLine {
  id: string;
  speaker: string; // Character name or "Narrator"
  text: string;
  voiceCue?: string; // e.g. "terrified, shouting", "whispering softly", "calm, serious"
}

export interface VNCharacterSceneState {
  name: string;
  outfit: string; // Active outfit in this scene (evolved wear or newly user-specified)
  emotion: string; // e.g. "serious, focused", "gentle, relieved", "worried, attentive"
  expressionTags: string; // Danbooru anime expression tags (e.g. "talking, parted lips, serious expression, looking at another")
  pose: string; // e.g. "sitting on wet sand, gesturing with hand"
}

export interface VNActiveSpriteOnStage {
  characterId: string;
  outfitId?: string;
  poseId?: string;
  emotionId?: string;
  spriteUrl?: string;
  position?: number; // Normalized x-position on stage: 0.2 (left), 0.5 (center), 0.8 (right)
  isSpeaking?: boolean;
}

export interface VNScene {
  id: string;
  sceneNumber: number;
  title: string;
  sceneTone?: string; // e.g. "crisis", "survival_dialogue", "quiet_moment", "discovery"
  sceneType?: "layered" | "cg"; // "layered" (background + cutouts) or "cg" (full event illustration)
  backgroundUrl?: string;
  worldId?: string;
  locationId?: string;
  timeOfDay?: "day" | "evening" | "night";
  activeSprites?: VNActiveSpriteOnStage[];
  cgUrl?: string;
  charactersPresent: string[]; // Character names (max 3)
  characterStates?: VNCharacterSceneState[];
  /** Composed Anima prompt including verbatim character identities + environment + action */
  imagePrompt: string;
  narration?: string;
  dialogues: VNDialogueLine[];
  imageUrl?: string;
  mediaId?: string;
  isGenerating?: boolean;
  statusText?: string;
  progressPercent?: number;
  error?: string;
}

export interface VNStory {
  id: string;
  title: string;
  premise: string;
  firstScene: string;
  characterIds: string[];
  scenes: VNScene[];
  createdAt: number;
  updatedAt: number;
}

export type VNTab = "characters" | "wardrobe" | "sprites" | "locations" | "story" | "reader" | "ledger";

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  selectedModel: string;
  availableModels: string[];
}
