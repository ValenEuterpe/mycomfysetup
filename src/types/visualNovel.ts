export interface VNCharacter {
  id: string;
  name: string;
  gender?: "male" | "female" | "other";
  role?: string; // e.g. "Civilian Passenger", "Teacher", "Doctor", "Pilot"
  baselineOutfit?: string; // e.g. "casual grey t-shirt, dark denim jeans, white sneakers"
  userPrompt: string;
  figureStyle?: string;
  faceShape?: string;
  /** Exact verbatim prompt describing bodily and facial proportions, hair, eyes, etc. */
  verbatimIdentityPrompt: string;
  avatarUrl?: string;
  mediaId?: string;
  createdAt: number;
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

export interface VNScene {
  id: string;
  sceneNumber: number;
  title: string;
  sceneTone?: string; // e.g. "crisis", "survival_dialogue", "quiet_moment", "discovery"
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

export type VNTab = "characters" | "story" | "reader" | "ledger";

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  selectedModel: string;
  availableModels: string[];
}
