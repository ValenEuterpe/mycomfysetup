"use client";

/**
 * History: what you've made, played back from your own device.
 *
 * The split is deliberate. Prompts come from the server, videos from IndexedDB.
 * So "clear media cache" reclaims the disk and leaves every prompt intact and
 * copyable — you lose the clips, not the record of what you asked for. It also
 * means a video that was never cached, or was cached on another device, degrades
 * to a playable-from-server entry rather than an empty page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useApiKey } from "@/components/ApiKeyProvider";
import { clear, formatBytes, get, keys, stats } from "@/lib/mediaCache";

type Entry = {
  id: string;
  status: "queued" | "dispatched" | "done" | "error" | "cancelled";
  prompt: string | null;
  pruned: boolean;
  type: string;
  aspectRatio: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  fast: boolean;
  createdAt: string;
  error: string | null;
  videoUrl: string | null;
};

function formatDateTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

const STATUS_LABEL: Record<Entry["status"], string> = {
  queued: "waiting in queue",
  dispatched: "rendering",
  done: "",
  error: "failed",
  cancelled: "cancelled",
};

export default function History() {
  const { authFetch, status: authStatus } = useApiKey();

  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cached, setCached] = useState<Set<string>>(new Set());
  const [cacheStats, setCacheStats] = useState({ count: 0, bytes: 0 });
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /**
   * Object URLs for the blobs currently on screen, so they can be revoked
   * together. Held in a ref because the cleanup must not re-run every time one
   * more video resolves.
   */
  const urlsRef = useRef<Map<string, string>>(new Map());
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});

  const releaseAll = useCallback(() => {
    for (const url of urlsRef.current.values()) URL.revokeObjectURL(url);
    urlsRef.current.clear();
    setBlobUrls({});
  }, []);

  const refreshCacheState = useCallback(async () => {
    const [ids, size] = await Promise.all([keys(), stats()]);
    setCached(new Set(ids));
    setCacheStats(size);
  }, []);

  // Metadata first: it's small, and it decides what the page looks like. The
  // videos are attached afterwards so a large cache doesn't delay the list.
  useEffect(() => {
    if (authStatus !== "unlocked") return;
    let cancelled = false;

    (async () => {
      try {
        const res = await authFetch("/api/history");
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) throw new Error(data?.error || "Couldn't load your history.");
        setEntries((data.entries ?? []) as Entry[]);
      } catch (err: any) {
        if (!cancelled) setLoadError(err.message);
      }
      if (!cancelled) await refreshCacheState();
    })();

    return () => {
      cancelled = true;
    };
  }, [authStatus, authFetch, refreshCacheState]);

  // Pull each cached blob out and hand it an object URL. Sequential rather than
  // parallel: these are tens of megabytes each, and a burst of simultaneous
  // IndexedDB reads on a phone is how you get a stalled page.
  useEffect(() => {
    if (!entries) return;
    let cancelled = false;

    (async () => {
      for (const entry of entries) {
        if (cancelled) return;
        if (entry.status !== "done" || urlsRef.current.has(entry.id)) continue;

        const blob = await get(entry.id);
        if (cancelled || !blob) continue;

        const url = URL.createObjectURL(blob);
        urlsRef.current.set(entry.id, url);
        setBlobUrls((old) => ({ ...old, [entry.id]: url }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entries]);

  useEffect(() => releaseAll, [releaseAll]);

  const onClearCache = async () => {
    setClearing(true);
    // Released before clearing: a live object URL for a deleted blob would keep
    // the bytes alive and make the freed space a lie.
    releaseAll();
    await clear();
    await refreshCacheState();
    setClearing(false);
    setConfirmClear(false);
  };

  const onCopy = async (entry: Entry) => {
    if (!entry.prompt) return;
    try {
      await navigator.clipboard.writeText(entry.prompt);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId((id) => (id === entry.id ? null : id)), 1500);
    } catch {
      // Clipboard denied (insecure context, or the user said no). The text is
      // selectable on the page, so this is a convenience, not the only route.
    }
  };

  const withPrompt = useMemo(
    () => (entries ?? []).filter((e) => e.prompt && !e.pruned).length,
    [entries],
  );

  return (
    <main className="shell shell-wide">
      <Link href="/" className="brand">
        <span className="dot" />
        STUDIO
      </Link>
      <h1 className="title">History</h1>
      <p className="subtitle">
        Everything you&apos;ve asked for. Renders are cached on this device, so they don&apos;t
        follow you to another browser — the prompts do.
      </p>

      <div className="panel cache-bar">
        <div className="cache-figures">
          <div className="stat">
            <span className="stat-label">Cached items</span>
            <span className="stat-value">{cacheStats.count}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Media cache size</span>
            <span className="stat-value">{formatBytes(cacheStats.bytes)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Prompts kept</span>
            <span className="stat-value">{withPrompt}</span>
          </div>
        </div>

        {confirmClear ? (
          <div className="cache-confirm">
            <p className="cache-confirm-text">
              Delete {cacheStats.count} cached {cacheStats.count === 1 ? "item" : "items"} (
              {formatBytes(cacheStats.bytes)})? Your prompts stay.
            </p>
            <div className="cache-confirm-actions">
              <button type="button" className="modal-danger" onClick={onClearCache} disabled={clearing}>
                {clearing ? "Clearing…" : "Yes, clear media"}
              </button>
              <button
                type="button"
                className="modal-confirm"
                onClick={() => setConfirmClear(false)}
                disabled={clearing}
              >
                Keep them
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="cache-clear"
            onClick={() => setConfirmClear(true)}
            disabled={cacheStats.count === 0}
          >
            Clear media cache
          </button>
        )}
      </div>

      {loadError && <div className="error-box">{loadError}</div>}

      {entries === null && !loadError && <div className="beam" />}

      {entries !== null && entries.length === 0 && (
        <p className="history-empty">
          Nothing yet. <Link href="/text-to-image">Generate an image</Link> or{" "}
          <Link href="/text-to-video">create a video</Link>.
        </p>
      )}

      {entries !== null && entries.length > 0 && (
        <ul className="history-list">
          {entries.map((entry) => {
            const blobUrl = blobUrls[entry.id];
            const isCached = cached.has(entry.id);
            const isImage =
              entry.type === "t2i" ||
              Boolean(entry.videoUrl && /\.(png|jpe?g|webp)($|\?)/i.test(entry.videoUrl));
            // Prefer the local copy; fall back to the server while the file is
            // still on the ComfyUI box. Only when both are gone is the media
            // genuinely unavailable.
            const playable = blobUrl ?? (entry.status === "done" ? entry.videoUrl : null);
            const statusLabel = STATUS_LABEL[entry.status];

            const typeLabel =
              entry.type === "t2i"
                ? "text → image"
                : entry.type === "i2v"
                  ? "image → video"
                  : "text → video";

            return (
              <li key={entry.id} className="history-item panel">
                <div className="history-media">
                  {playable ? (
                    isImage ? (
                      <img
                        className="history-video"
                        src={playable}
                        alt="Generated render"
                        style={
                          entry.width && entry.height
                            ? { aspectRatio: `${entry.width} / ${entry.height}`, objectFit: "cover" }
                            : undefined
                        }
                      />
                    ) : (
                      <video
                        className="history-video"
                        src={playable}
                        controls
                        preload="metadata"
                        playsInline
                        style={
                          entry.width && entry.height
                            ? { aspectRatio: `${entry.width} / ${entry.height}` }
                            : undefined
                        }
                      />
                    )
                  ) : (
                    <div
                      className="history-placeholder"
                      style={
                        entry.width && entry.height
                          ? { aspectRatio: `${entry.width} / ${entry.height}` }
                          : undefined
                      }
                    >
                      {entry.status === "done"
                        ? isImage
                          ? "Image no longer cached"
                          : "Video no longer cached"
                        : statusLabel || (isImage ? "No image" : "No video")}
                    </div>
                  )}
                </div>

                <div className="history-body">
                  <div className="history-meta">
                    <span>{formatDateTime(entry.createdAt)}</span>
                    <span>{typeLabel}</span>
                    {entry.aspectRatio && <span>{entry.aspectRatio}</span>}
                    {entry.width && entry.height && (
                      <span>
                        {entry.width}&times;{entry.height}
                      </span>
                    )}
                    {entry.durationSeconds !== null && <span>{entry.durationSeconds}s</span>}
                    {entry.type !== "t2i" && <span>{entry.fast ? "fast" : "full"}</span>}
                    {statusLabel && <span className="history-status">{statusLabel}</span>}
                    {entry.status === "done" && !isCached && (
                      <span className="history-status">not cached</span>
                    )}
                  </div>

                  {entry.pruned || entry.prompt === null ? (
                    <p className="history-prompt history-prompt-pruned">Prompt cleared by an admin</p>
                  ) : (
                    <p className="history-prompt">{entry.prompt}</p>
                  )}

                  {entry.error && <p className="history-error">{entry.error}</p>}

                  {entry.prompt && !entry.pruned && (
                    <div className="history-actions">
                      <button type="button" className="history-btn" onClick={() => onCopy(entry)}>
                        {copiedId === entry.id ? "Copied" : "Copy prompt"}
                      </button>
                      {/* Carries the prompt in the URL so the studio can prefill
                          it — a retry shouldn't mean retyping. */}
                      <Link
                        className="history-btn"
                        href={
                          entry.type === "t2i"
                            ? `/text-to-image?prompt=${encodeURIComponent(entry.prompt)}`
                            : `/${entry.type === "i2v" ? "image-to-video" : "text-to-video"}?prompt=${encodeURIComponent(entry.prompt)}`
                        }
                      >
                        Reuse
                      </Link>
                      {playable && isImage && (
                        <a
                          href={playable}
                          download={`image-${entry.id}.png`}
                          className="history-btn"
                        >
                          Download
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
