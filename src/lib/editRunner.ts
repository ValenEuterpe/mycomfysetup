import {
  getMediaBlob,
  saveMediaToLocalCache,
} from "./mediaCache";
import {
  uploadImageToComfy,
  queuePrompt,
  pollPromptCompletion,
} from "./comfyClient";
import {
  buildKrea2EditWorkflow,
  Krea2EditBuildOptions,
  PlacementCaps,
} from "./krea2EditWorkflow";
import { GeneratedMedia } from "../types/workflow";
import { SlotSource } from "../components/edit/ImageSlot";

/**
 * Resolves whatever is backing a slot (entity blob, raw file, detached blob,
 * or cached generation output) into an actual image Blob for upload.
 */
export async function slotToBlob(slot: SlotSource): Promise<Blob | null> {
  if (slot.file) return slot.file;
  if (slot.blob) return slot.blob;
  if (slot.mediaId) {
    const cached = await getMediaBlob(slot.mediaId);
    if (cached) return cached;
  }
  try {
    const res = await fetch(slot.previewUrl);
    return await res.blob();
  } catch {
    return null;
  }
}

/**
 * Cache of relay filenames for uploaded inputs, keyed by stable keys
 * (entity media ids / generation media ids) so each image uploads once.
 */
const uploadNameCache = new Map<string, string>();

/**
 * Ensures a LoadImage filename exists on the relay: returns the cached name
 * when known, otherwise uploads the blob once and pins the result.
 */
export async function ensureRelayFilename(
  endpoint: string,
  key: string,
  blob: Blob,
  filenameHint?: string
): Promise<string> {
  const cacheKey = key || `auto_${blob.size}`;
  const cached = uploadNameCache.get(cacheKey);
  if (cached) return cached;

  const res = await uploadImageToComfy(endpoint, blob, filenameHint);
  uploadNameCache.set(cacheKey, res.name);
  return res.name;
}

/** Drops a cached relay filename (call when a queue error suggests a stale file). */
export function invalidateRelayFilename(key: string): void {
  if (key === "auto") {
    for (const k of uploadNameCache.keys()) if (k.startsWith("auto_")) uploadNameCache.delete(k);
  } else {
    uploadNameCache.delete(key);
  }
}

export interface EditPassRunOptions {
  endpoint: string;
  clientId?: string;
  scene: { source: SlotSource; filenameKey?: string };
  reference?: { source: SlotSource; filenameKey?: string };
  buildOpts: Krea2EditBuildOptions;
  onProgress?: (pct: number, text: string) => void;
}

/**
 * Runs a single identity-edit pass: resolves slot blobs, uploads them to the
 * relay once, builds the workflow graph, queues and polls it.
 * Returns the output media (and caches it locally like other generations).
 */
export async function runEditPass(
  opts: EditPassRunOptions
): Promise<{ media: GeneratedMedia[]; sceneFilename: string; refFilename?: string }> {
  const { endpoint, buildOpts } = opts;

  const sceneBlob = await slotToBlob(opts.scene.source);
  if (!sceneBlob) throw new Error("Image 1 (scene) has no valid image data.");

  let refBlob: Blob | null = null;
  if (opts.reference) {
    refBlob = await slotToBlob(opts.reference.source);
    if (!refBlob) throw new Error("Image 2 (reference) has no valid image data.");
  }

  const sceneFilename = await ensureRelayFilename(
    endpoint,
    opts.scene.filenameKey || opts.scene.source.mediaId || "auto",
    sceneBlob,
    opts.scene.source.label
      ? `${opts.scene.source.label.replace(/[^\w.-]+/g, "_").slice(0, 40)}.png`
      : undefined
  );

  let refFilename: string | undefined;
  if (opts.reference && refBlob) {
    refFilename = await ensureRelayFilename(
      endpoint,
      opts.reference.filenameKey || opts.reference.source.mediaId || "auto",
      refBlob,
      opts.reference.source.label
        ? `${opts.reference.source.label.replace(/[^\w.-]+/g, "_").slice(0, 40)}.png`
        : undefined
    );
  }

  const clientId = opts.clientId || `edit_${Math.random().toString(36).slice(2, 9)}`;
  const workflow = buildKrea2EditWorkflow({
    ...buildOpts,
    sceneImage: sceneFilename,
    referenceImage: refFilename,
    placementCaps: buildOpts.placementCaps ?? (null as PlacementCaps | null),
  });

  const queued = await queuePrompt(endpoint, workflow, clientId);
  if (!queued?.prompt_id) throw new Error("No prompt_id returned from ComfyUI /prompt endpoint.");

  const media = await pollPromptCompletion(endpoint, queued.prompt_id, (pct, text) => {
    opts.onProgress?.(pct, text);
  });

  if (!media.length) throw new Error("Generation completed but produced no output.");

  return { media, sceneFilename, refFilename };
}

/** Persists an output under a stable local cache id so passes can chain on it. */
export async function cloneMediaToCache(
  media: GeneratedMedia,
  blob: Blob
): Promise<GeneratedMedia> {
  const id = media.id || `media_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await saveMediaToLocalCache(id, blob, media.filename || "krea2_edit.png", "image");
  return { ...media, id };
}
