export interface VNCharacter {
  id: string;
  name: string;
  gender?: "male" | "female" | "other";
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
  voiceCue?: string; // e.g. "terrified, shouting", "whispering softly"
}

export interface VNScene {
  id: string;
  sceneNumber: number;
  title: string;
  charactersPresent: string[]; // Character names (max 3)
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

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  selectedModel: string;
  availableModels: string[];
}
