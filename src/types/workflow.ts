export interface ComfyNodeMeta {
  title?: string;
  [key: string]: any;
}

export interface ComfyNode {
  inputs: Record<string, any>;
  class_type: string;
  _meta?: ComfyNodeMeta;
}

export type ComfyWorkflowGraph = Record<string, ComfyNode>;

export type ParameterCategory =
  | "prompt"
  | "dimension"
  | "sampler"
  | "media"
  | "model"
  | "primitive"
  | "generic";

export type ParameterType =
  | "text"
  | "multiline"
  | "number"
  | "boolean"
  | "select"
  | "image";

export interface ExtractedParameter {
  id: string; // e.g., "3.text" or "8.seed"
  nodeId: string;
  nodeTitle: string;
  classType: string;
  inputKey: string;
  label: string;
  category: ParameterCategory;
  type: ParameterType;
  defaultValue: any;
  currentValue: any;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  description?: string;
  isNegative?: boolean;
}

export interface GeneratedMedia {
  id?: string; // Local cache id in IndexedDB
  filename: string;
  subfolder: string;
  type: string;
  url: string;
  mimeType: "image" | "video";
}

export interface GenerationHistoryItem {
  id: string;
  promptId: string;
  timestamp: number;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  currentStep?: string;
  workflowName: string;
  parameters: Record<string, any>;
  outputs: GeneratedMedia[];
  error?: string;
  durationMs?: number;
}
