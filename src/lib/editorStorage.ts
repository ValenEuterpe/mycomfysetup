import { GeneratedMedia } from "./../types/workflow";

/**
 * Editor results persistence — refs only (blobs stay in IndexedDB),
 * survives refreshes so multi-pass outputs remain chainable.
 */
const KEY = "comfy_studio_editor_results";

export interface EditorResultRef {
  media: GeneratedMedia;
  passCount: number;
  label: string;
  timestamp: number;
}

export function loadEditorResults(): EditorResultRef[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as EditorResultRef[]) : [];
  } catch {
    return [];
  }
}

export function saveEditorResults(items: EditorResultRef[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 30)));
  } catch {}
}

export function clearEditorResults(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
