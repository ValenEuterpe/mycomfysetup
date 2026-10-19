/**
 * Local film project. One sequence per browser, no server table in v1.
 *
 * Videos still live in the render queue / media cache; this is only the
 * storyboard the filmmaking studio needs between visits. Blobs and blob: URLs
 * are never stored here — job ids are, and playback is rehydrated from
 * IndexedDB / /api/status on load.
 */

import { ASPECT_RATIOS, type AspectRatio } from "@/lib/aspect";
import { newActionSpan, type ActionSpan, type PromptMode } from "./prompt";

export type ShotStatus = "draft" | "queued" | "rendering" | "done" | "error";

export type OpeningSource = "text" | "image" | "video";

export type Shot = {
  id: string;
  order: number;
  promptMode: PromptMode;
  simplePrompt: string;
  actionSpans: ActionSpan[];
  ambience: string;
  durationSeconds: number;
  jobId: string | null;
  status: ShotStatus;
  error: string | null;
  width: number | null;
  height: number | null;
  /** Seconds cut from the tail for playback. Does not change the source file. */
  trimEndSeconds: number;
  /** Seconds into the untrimmed clip. Null until the user confirms a frame. */
  anchorFrameTime: number | null;
  /** Comfy filename of the first frame this shot was generated from. */
  firstFrameFilename: string | null;
  /** Comfy filename of the frame chosen as the next shot's first frame. */
  anchorFilename: string | null;
};

export type FilmProject = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  styleBible: string;
  lockedContext: string;
  aspectRatio: AspectRatio;
  durationSeconds: number;
  fast: boolean;
  openingSource: OpeningSource;
  selectedShotId: string | null;
  shots: Shot[];
};

const STORAGE_KEY = "studio.film.project";

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `film-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function newShot(
  order: number,
  durationSeconds: number,
  ambience = "",
  promptMode: PromptMode = "beats",
): Shot {
  return {
    id: uid(),
    order,
    promptMode,
    simplePrompt: "",
    actionSpans: [newActionSpan(0, durationSeconds)],
    ambience,
    durationSeconds,
    jobId: null,
    status: "draft",
    error: null,
    width: null,
    height: null,
    trimEndSeconds: 0,
    anchorFrameTime: null,
    firstFrameFilename: null,
    anchorFilename: null,
  };
}

export function newProject(): FilmProject {
  const now = new Date().toISOString();
  const first = newShot(0, 8);
  return {
    id: uid(),
    title: "Untitled sequence",
    createdAt: now,
    updatedAt: now,
    styleBible: "",
    lockedContext: "",
    aspectRatio: "16:9 (Widescreen)",
    durationSeconds: 8,
    fast: true,
    openingSource: "text",
    selectedShotId: first.id,
    shots: [first],
  };
}

function isAspectRatio(value: unknown): value is AspectRatio {
  return typeof value === "string" && (ASPECT_RATIOS as readonly string[]).includes(value);
}

function isPromptMode(value: unknown): value is PromptMode {
  return value === "simple" || value === "beats";
}

function isOpeningSource(value: unknown): value is OpeningSource {
  return value === "text" || value === "image" || value === "video";
}

function parseSpan(raw: unknown): ActionSpan | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<ActionSpan>;
  if (typeof s.from !== "number" || typeof s.to !== "number") return null;
  return {
    id: typeof s.id === "string" ? s.id : uid(),
    from: s.from,
    to: s.to,
    text: typeof s.text === "string" ? s.text : "",
    dialogue: typeof s.dialogue === "string" ? s.dialogue : "",
    foley: typeof s.foley === "string" ? s.foley : "",
  };
}

function parseShot(raw: unknown): Shot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<Shot> & { dialogue?: unknown; foley?: unknown };
  const duration =
    typeof s.durationSeconds === "number" && Number.isFinite(s.durationSeconds) ? s.durationSeconds : 8;
  const spans = Array.isArray(s.actionSpans)
    ? s.actionSpans.map(parseSpan).filter((x): x is ActionSpan => x !== null)
    : [];

  // v1 stored clip-level dialogue/foley. Fold them into the first beat so a
  // refresh after this deploy does not drop spoken lines.
  if (spans[0]) {
    if (!spans[0].dialogue && typeof s.dialogue === "string") spans[0].dialogue = s.dialogue;
    if (!spans[0].foley && typeof s.foley === "string") spans[0].foley = s.foley;
  }

  return {
    id: typeof s.id === "string" ? s.id : uid(),
    order: typeof s.order === "number" ? s.order : 0,
    promptMode: isPromptMode(s.promptMode) ? s.promptMode : "beats",
    simplePrompt: typeof s.simplePrompt === "string" ? s.simplePrompt : "",
    actionSpans: spans.length > 0 ? spans : [newActionSpan(0, duration)],
    ambience: typeof s.ambience === "string" ? s.ambience : "",
    durationSeconds: duration,
    jobId: typeof s.jobId === "string" ? s.jobId : null,
    status:
      s.status === "queued" || s.status === "rendering" || s.status === "done" || s.status === "error"
        ? s.status
        : "draft",
    error: typeof s.error === "string" ? s.error : null,
    width: typeof s.width === "number" ? s.width : null,
    height: typeof s.height === "number" ? s.height : null,
    trimEndSeconds: typeof s.trimEndSeconds === "number" ? s.trimEndSeconds : 0,
    anchorFrameTime: typeof s.anchorFrameTime === "number" ? s.anchorFrameTime : null,
    firstFrameFilename: typeof s.firstFrameFilename === "string" ? s.firstFrameFilename : null,
    anchorFilename: typeof s.anchorFilename === "string" ? s.anchorFilename : null,
  };
}

function persistable(project: FilmProject): FilmProject {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    shots: project.shots.map((shot) => ({ ...shot })),
  };
}

export function loadProject(): FilmProject | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<FilmProject>;
    const shots = Array.isArray(data.shots)
      ? data.shots.map(parseShot).filter((x): x is Shot => x !== null)
      : [];
    if (shots.length === 0) return null;
    const selected =
      typeof data.selectedShotId === "string" && shots.some((s) => s.id === data.selectedShotId)
        ? data.selectedShotId
        : shots[shots.length - 1].id;
    return {
      id: typeof data.id === "string" ? data.id : uid(),
      title: typeof data.title === "string" ? data.title : "Untitled sequence",
      createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
      styleBible: typeof data.styleBible === "string" ? data.styleBible : "",
      lockedContext: typeof data.lockedContext === "string" ? data.lockedContext : "",
      aspectRatio: isAspectRatio(data.aspectRatio) ? data.aspectRatio : "16:9 (Widescreen)",
      durationSeconds:
        typeof data.durationSeconds === "number" && Number.isFinite(data.durationSeconds)
          ? data.durationSeconds
          : 8,
      fast: data.fast !== false,
      openingSource: isOpeningSource(data.openingSource) ? data.openingSource : "text",
      selectedShotId: selected,
      shots,
    };
  } catch {
    return null;
  }
}

export function saveProject(project: FilmProject): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable(project)));
  } catch {
    /* private mode — session-only is fine */
  }
}

export function clearProject(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}
