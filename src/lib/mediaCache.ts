/**
 * Local Browser Media Cache using IndexedDB.
 *
 * All generated images and videos are saved ONLY on the user's local device
 * in the browser's IndexedDB. No external servers, no cloud links, no cloudflare storage.
 *
 * When "Clear" is clicked, all media blobs are wiped completely from the device.
 */

const DB_NAME = "comfy_universal_media_vault";
const DB_VERSION = 1;
const STORE_NAME = "media_blobs";

export interface CachedMediaEntry {
  id: string; // Unique generation id or filename
  blob: Blob;
  mimeType: "image" | "video";
  filename: string;
  timestamp: number;
  size: number;
}

/** Check if IndexedDB is available */
export function isIndexedDBSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

/** Open or create the local IndexedDB database */
function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBSupported()) {
      return reject(new Error("IndexedDB is not supported in this browser"));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open local media database"));
    request.onblocked = () => reject(new Error("Local media database is open in another tab"));
  });
}

/** Helper to run a transaction with store */
async function withMediaStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest | null
): Promise<T | null> {
  if (!isIndexedDBSupported()) return null;

  let db: IDBDatabase;
  try {
    db = await openMediaDb();
  } catch (err) {
    console.warn("[MediaCache] Database unavailable:", err);
    return null;
  }

  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = action(store);

      let resultValue: T | null = null;
      if (request) {
        request.onsuccess = () => {
          resultValue = request.result as T;
        };
      }

      tx.oncomplete = () => resolve(resultValue);
      tx.onerror = () => reject(tx.error || new Error("MediaCache transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("MediaCache transaction aborted"));
    });
  } catch (err) {
    console.warn("[MediaCache] Operation failed:", err);
    return null;
  } finally {
    db.close();
  }
}

/**
 * Save an image/video Blob locally in the browser's IndexedDB.
 */
export async function saveMediaToLocalCache(
  id: string,
  blob: Blob,
  filename: string,
  mimeType: "image" | "video" = "image"
): Promise<boolean> {
  const entry: CachedMediaEntry = {
    id,
    blob,
    filename,
    mimeType,
    timestamp: Date.now(),
    size: blob.size,
  };

  const res = await withMediaStore<IDBValidKey>("readwrite", (store) => store.put(entry));
  return res !== null;
}

/**
 * Retrieve a locally cached media Blob by ID.
 */
export async function getMediaFromLocalCache(id: string): Promise<Blob | null> {
  const entry = await withMediaStore<CachedMediaEntry | undefined>("readonly", (store) =>
    store.get(id)
  );
  return entry?.blob || null;
}

/**
 * Retrieve a local object URL (blob:...) for a cached media ID.
 */
export async function getLocalMediaUrl(id: string): Promise<string | null> {
  const blob = await getMediaFromLocalCache(id);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

/**
 * Delete a single media item from the local cache.
 */
export async function deleteMediaFromLocalCache(id: string): Promise<void> {
  await withMediaStore<undefined>("readwrite", (store) => store.delete(id));
}

/**
 * Completely wipe the entire local media cache.
 * Removes every saved image/video from the browser storage.
 */
export async function clearAllLocalMedia(): Promise<boolean> {
  if (!isIndexedDBSupported()) return false;

  let db: IDBDatabase;
  try {
    db = await openMediaDb();
  } catch (err) {
    console.warn("[MediaCache] Database unavailable for clearing:", err);
    return false;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    console.log("[MediaCache] All local cached images/videos wiped completely.");
    return true;
  } catch (err) {
    console.warn("[MediaCache] Clear failed:", err);
    return false;
  } finally {
    db.close();
  }
}

/**
 * Get statistics about local cache usage (file count and total size in MB).
 */
export async function getLocalCacheStats(): Promise<{ count: number; bytes: number; formattedSize: string }> {
  const all = await withMediaStore<CachedMediaEntry[]>("readonly", (store) => store.getAll());
  if (!all) return { count: 0, bytes: 0, formattedSize: "0 MB" };

  const totalBytes = all.reduce((sum, item) => sum + (item.size || 0), 0);
  const mb = totalBytes / (1024 * 1024);

  let formatted = "0 MB";
  if (mb < 0.1 && totalBytes > 0) {
    formatted = `${Math.round(totalBytes / 1024)} KB`;
  } else if (mb < 1000) {
    formatted = `${mb.toFixed(1)} MB`;
  } else {
    formatted = `${(mb / 1024).toFixed(2)} GB`;
  }

  return {
    count: all.length,
    bytes: totalBytes,
    formattedSize: formatted,
  };
}
