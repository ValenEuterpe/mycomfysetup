import {
  ENTITY_STORE_NAME,
  EntityMetaEntry,
  deleteEntityMeta,
  getMediaBlob,
  loadAllEntityMeta,
  saveEntityMeta,
  saveMediaToLocalCache,
} from "./mediaCache";
import { Entity } from "../types/entity";

function newEntityId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `ent_${Date.now().toString(36)}_${rand}`;
}

function metaToEntity(e: EntityMetaEntry): Entity {
  return {
    id: e.id,
    name: e.name,
    notes: e.notes,
    mediaId: e.mediaId,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

/**
 * Load the full entity library, most recent first.
 */
export async function listEntities(): Promise<Entity[]> {
  const metas = await loadAllEntityMeta();
  return metas
    .map(metaToEntity)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Create an entity from an image Blob (upload or generated output clone).
 * The blob is stored once in the shared media cache under a dedicated id.
 */
export async function createEntity(
  blob: Blob,
  name: string,
  notes?: string,
  filenameHint?: string
): Promise<Entity> {
  const id = newEntityId();
  const mediaId = `${id}_img`;
  await saveMediaToLocalCache(mediaId, blob, filenameHint || `${id}.png`, "image");

  const now = Date.now();
  const meta: EntityMetaEntry = {
    id,
    name: name.trim() || `Entity ${now}`,
    notes: notes?.trim() || undefined,
    mediaId,
    createdAt: now,
    updatedAt: now,
  };
  const ok = await saveEntityMeta(meta);
  if (!ok) throw new Error("Failed to save entity metadata (database unavailable).");
  return metaToEntity(meta);
}

/**
 * Create an entity directly from an already-cached media id
 * (e.g. a generated image that lives in IndexedDB) — no re-fetch needed.
 */
export async function createEntityFromMediaId(
  mediaId: string,
  name: string,
  notes?: string
): Promise<Entity> {
  const blob = await getMediaBlob(mediaId);
  if (!blob) throw new Error("Source image not found in local cache (was it cleared?).");
  return createEntity(blob, name, notes);
}

export async function updateEntity(
  id: string,
  changes: Partial<Pick<Entity, "name" | "notes">>
): Promise<void> {
  const metas = await loadAllEntityMeta();
  const found = metas.find((m) => m.id === id);
  if (!found) throw new Error("Entity not found.");
  const updated: EntityMetaEntry = {
    ...found,
    name: (changes.name?.trim() || found.name),
    notes: changes.notes !== undefined ? changes.notes.trim() || undefined : found.notes,
    updatedAt: Date.now(),
  };
  await saveEntityMeta(updated);
}

export async function deleteEntity(id: string): Promise<void> {
  await deleteEntityMeta(id);
}

/**
 * Resolve the object URL for an entity's image blob (for thumbnails/slots).
 */
export async function getEntityImageUrl(mediaId: string): Promise<string | null> {
  const blob = await getMediaBlob(mediaId);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export function entityStoreName(): string {
  return ENTITY_STORE_NAME;
}
