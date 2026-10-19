export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
};

export interface OpenAIModelItem {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  root: string;
  parent: null;
  permission: [];
  description: string;
}

export const WORKFLOW_MODELS: OpenAIModelItem[] = [
  {
    id: "anima-base-v1.0",
    object: "model",
    created: 1726570000,
    owned_by: "studio",
    root: "anima-base-v1.0.safetensors",
    parent: null,
    permission: [],
    description: "Anima Base v1.0 foundation anime diffusion model (anima-base-v1.0.safetensors)",
  },
  {
    id: "BASBetterAnimeStylePlusAnima_baseV10",
    object: "model",
    created: 1726570000,
    owned_by: "studio",
    root: "BASBetterAnimeStylePlusAnima_baseV10.safetensors",
    parent: null,
    permission: [],
    description: "BAS Better Anime Style Plus diffusion model (BASBetterAnimeStylePlusAnima_baseV10.safetensors)",
  },
];
