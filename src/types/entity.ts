/**
 * Entity — a saved reference image (person, scene, object, style…).
 * Everything is one unified kind so characters and locations are
 * interchangeable anywhere a reference slot is used.
 */
export interface Entity {
  id: string; // unique entity id, e.g. "ent_<timestamp>_<rand>"
  name: string;
  notes?: string;
  /** id of the image Blob inside the shared IndexedDB media cache (media_blobs store) */
  mediaId: string;
  createdAt: number;
  updatedAt: number;
}
