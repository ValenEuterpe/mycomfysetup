/**
 * Browser-side video cache, on IndexedDB.
 *
 * Finished renders are kept as Blobs on the user's own device, keyed by queue row
 * id, so history can play them back without the server storing anything extra.
 * The prompts live in Postgres; only the bytes live here. That split is what lets
 * "clear media cache" wipe every video and leave the prompt text intact and
 * copyable.
 *
 * IndexedDB rather than the Cache API because Cache entries are keyed by request
 * and would need /api/video's exact query to look up, while these are keyed by
 * job id — the same id the history metadata arrives under. It also makes the
 * total-size sum a plain iteration rather than a set of refetches.
 *
 * Browser-only. Every function degrades quietly: a private window with IndexedDB
 * blocked, or a quota refusal, must leave history working with uncached videos
 * rather than throwing into the UI.
 */

const DB_NAME = "studio-media";
const DB_VERSION = 1;
const STORE = "videos";

export type CachedVideo = {
  /** Queue row id — the same id the history entry carries. */
  id: string;
  blob: Blob;
  /** Cached at, so an eviction policy has something to sort on if one is added. */
  storedAt: number;
};

/** True when this browser can cache at all. False in some private modes. */
export function isSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Couldn't open the media cache."));
    // Fires when another tab holds an old version open. Rejecting beats hanging.
    req.onblocked = () => reject(new Error("The media cache is busy in another tab."));
  });
}

/** Wrap one transaction, resolving on `complete` rather than on request success. */
async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest | null,
): Promise<T | null> {
  if (!isSupported()) return null;

  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (err) {
    console.warn("[mediaCache] unavailable:", err);
    return null;
  }

  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const req = fn(store);

      let value: T | null = null;
      if (req) {
        req.onsuccess = () => {
          value = req.result as T;
        };
      }

      // Waiting for the transaction, not the request: a write isn't durable until
      // the transaction commits, and on a quota failure it is `tx` that aborts.
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error ?? new Error("Media cache transaction failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Media cache transaction aborted."));
    });
  } catch (err) {
    console.warn("[mediaCache] operation failed:", err);
    return null;
  } finally {
    db.close();
  }
}

/**
 * Store one video. Overwrites any existing entry for the same job.
 *
 * Returns false when it couldn't be stored — most likely a storage quota refusal
 * on a nearly-full disk. Callers should carry on: an uncached video still plays
 * from the server.
 */
export async function put(id: string, blob: Blob): Promise<boolean> {
  const entry: CachedVideo = { id, blob, storedAt: Date.now() };
  const result = await withStore<IDBValidKey>("readwrite", (store) => store.put(entry));
  return result !== null;
}

/** One cached video, or null if it was never stored or has been cleared. */
export async function get(id: string): Promise<Blob | null> {
  const entry = await withStore<CachedVideo | undefined>("readonly", (store) => store.get(id));
  return entry?.blob ?? null;
}

/** Ids currently cached, for marking up a history list in one pass. */
export async function keys(): Promise<string[]> {
  const result = await withStore<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
  return (result ?? []).map(String);
}

export type CacheStats = { count: number; bytes: number };

/**
 * How much room the cache is taking.
 *
 * Sums the blobs rather than asking `navigator.storage.estimate()`, which reports
 * the whole origin — every other cache and database included — and would show a
 * number that "clear media cache" then fails to zero.
 */
export async function stats(): Promise<CacheStats> {
  const all = await withStore<CachedVideo[]>("readonly", (store) => store.getAll());
  if (!all) return { count: 0, bytes: 0 };
  return {
    count: all.length,
    bytes: all.reduce((sum, entry) => sum + (entry.blob?.size ?? 0), 0),
  };
}

/** Drop one video, leaving its prompt untouched on the server. */
export async function remove(id: string): Promise<void> {
  await withStore<undefined>("readwrite", (store) => store.delete(id));
}

/**
 * Empty the cache.
 *
 * Videos only. Prompts are server-side, so they survive this and stay copyable
 * and reusable — which is the point of storing the two separately.
 */
export async function clear(): Promise<boolean> {
  if (!isSupported()) return false;

  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (err) {
    console.warn("[mediaCache] unavailable:", err);
    return false;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
  } catch (err) {
    console.warn("[mediaCache] clear failed:", err);
    return false;
  } finally {
    db.close();
  }
}

/**
 * Fetch a finished video and cache it.
 *
 * Called when a render completes, so history fills up as a side effect of
 * generating rather than needing its own pass later. `fetcher` is the caller's
 * authenticated fetch — /api/video needs the session.
 *
 * Returns the blob on success so the caller can play from it directly, or null if
 * either the fetch or the store failed, in which case the plain URL still works.
 */
export async function fetchAndStore(
  id: string,
  videoUrl: string,
  fetcher: (url: string) => Promise<Response>,
): Promise<Blob | null> {
  try {
    const res = await fetcher(videoUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    // Stored best-effort: a full disk shouldn't stop the video playing now.
    await put(id, blob);
    return blob;
  } catch (err) {
    console.warn("[mediaCache] couldn't cache video:", err);
    return null;
  }
}

/** Human-readable size, for the history page's total. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
