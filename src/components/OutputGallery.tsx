import React, { useState, useEffect } from "react";
import {
  Download,
  Copy,
  Check,
  Maximize2,
  Sparkles,
  AlertCircle,
  Film,
  Image as ImageIcon,
  History,
  Trash2,
  RefreshCw,
  HardDrive,
  LayoutTemplate,
  Columns2,
  UserRoundPlus,
  Grid,
} from "lucide-react";
import { GeneratedMedia, GenerationHistoryItem } from "../types/workflow";
import { fetchComfyMediaBlob } from "../lib/comfyClient";
import {
  getLocalMediaUrl,
  saveMediaToLocalCache,
  getLocalCacheStats,
} from "../lib/mediaCache";
import {
  createEntity,
  createEntityFromMediaId,
} from "../lib/entityStore";
import { SaveEntityModal } from "./edit/SaveEntityModal";

interface OutputGalleryProps {
  currentMedia: GeneratedMedia | null;
  history: GenerationHistoryItem[];
  isGenerating: boolean;
  progressPercent: number;
  statusText: string;
  errorMessage?: string;
  endpoint: string;
  layoutMode?: "top" | "side";
  onToggleLayoutMode?: () => void;
  onSelectHistoryItem: (item: GenerationHistoryItem) => void;
  onClearHistory: () => void;
}

export const OutputGallery: React.FC<OutputGalleryProps> = ({
  currentMedia,
  history,
  isGenerating,
  progressPercent,
  statusText,
  errorMessage,
  endpoint,
  layoutMode = "top",
  onToggleLayoutMode,
  onSelectHistoryItem,
  onClearHistory,
}) => {
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [isResolvingBlob, setIsResolvingBlob] = useState(false);
  const [blobError, setBlobError] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<{ count: number; formattedSize: string }>({
    count: 0,
    formattedSize: "0 MB",
  });
  const [entitySaveOpen, setEntitySaveOpen] = useState(false);
  const [previewBg, setPreviewBg] = useState<"dark" | "checkerboard">("checkerboard");

  // Load local cache stats
  const refreshCacheStats = () => {
    getLocalCacheStats().then((stats) => {
      setCacheStats({
        count: stats.count,
        formattedSize: stats.formattedSize,
      });
    });
  };

  useEffect(() => {
    refreshCacheStats();
  }, [history.length, currentMedia]);

  // When currentMedia changes, resolve local blob URL from IndexedDB first
  useEffect(() => {
    if (!currentMedia) {
      setResolvedUrl(null);
      setBlobError(null);
      return;
    }

    let active = true;
    setIsResolvingBlob(true);
    setBlobError(null);

    // 1. Check local IndexedDB cache first
    if (currentMedia.id) {
      getLocalMediaUrl(currentMedia.id).then((localUrl) => {
        if (!active) return;
        if (localUrl) {
          setResolvedUrl(localUrl);
          setIsResolvingBlob(false);
          return;
        }
        // Fallback to fetching remote blob and saving to local cache
        fetchAndStore();
      });
    } else if (currentMedia.url.startsWith("blob:") || currentMedia.url.startsWith("data:")) {
      setResolvedUrl(currentMedia.url);
      setIsResolvingBlob(false);
    } else {
      fetchAndStore();
    }

    function fetchAndStore() {
      if (!currentMedia) return;
      fetchComfyMediaBlob(
        endpoint,
        currentMedia.filename,
        currentMedia.subfolder,
        currentMedia.type
      )
        .then(async ({ blob, localUrl }) => {
          if (!active) return;
          setResolvedUrl(localUrl);
          setIsResolvingBlob(false);
          const cacheId =
            currentMedia.id ||
            `media_${Date.now()}_${currentMedia.filename.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
          await saveMediaToLocalCache(
            cacheId,
            blob,
            currentMedia.filename,
            currentMedia.mimeType
          );
          refreshCacheStats();
        })
        .catch((err) => {
          if (!active) return;
          console.warn("Failed to fetch media blob:", err);
          setResolvedUrl(currentMedia.url);
          setIsResolvingBlob(false);
        });
    }

    return () => {
      active = false;
    };
  }, [currentMedia, endpoint]);

  const handleImageError = async () => {
    if (!currentMedia || isResolvingBlob) return;
    try {
      setIsResolvingBlob(true);
      const { blob, localUrl } = await fetchComfyMediaBlob(
        endpoint,
        currentMedia.filename,
        currentMedia.subfolder,
        currentMedia.type
      );
      setResolvedUrl(localUrl);
      const cacheId =
        currentMedia.id ||
        `media_${Date.now()}_${currentMedia.filename.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      await saveMediaToLocalCache(cacheId, blob, currentMedia.filename, currentMedia.mimeType);
      refreshCacheStats();
      setBlobError(null);
    } catch (err: any) {
      setBlobError(err.message || "Could not load image bytes");
    } finally {
      setIsResolvingBlob(false);
    }
  };

  const copyUrl = () => {
    const urlToCopy = resolvedUrl || currentMedia?.url;
    if (urlToCopy) {
      navigator.clipboard.writeText(urlToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async () => {
    if (!currentMedia) return;
    try {
      let downloadUrl = resolvedUrl || currentMedia.url;

      if (!downloadUrl.startsWith("blob:") && !downloadUrl.startsWith("data:")) {
        const fetched = await fetchComfyMediaBlob(
          endpoint,
          currentMedia.filename,
          currentMedia.subfolder,
          currentMedia.type
        );
        downloadUrl = fetched.localUrl;
        setResolvedUrl(downloadUrl);
      }

      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = currentMedia.filename || "generated-image.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      alert("Failed to download image: " + err.message);
    }
  };

  const activeMediaUrl = resolvedUrl || currentMedia?.url;

  return (
    <div className="flex flex-col gap-4">
      {/* Main View Area */}
      <div
        className={`relative border border-zinc-800 rounded-2xl overflow-hidden flex items-center justify-center shadow-xl transition-all ${
          previewBg === "checkerboard"
            ? "bg-[linear-gradient(45deg,#18181b_25%,transparent_25%),linear-gradient(-45deg,#18181b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#18181b_75%),linear-gradient(-45deg,transparent_75%,#18181b_75%)] bg-[size:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] bg-zinc-900"
            : "bg-zinc-900/90"
        } ${
          isFullscreen
            ? "fixed inset-4 z-50 aspect-auto bg-black/95 backdrop-blur-xl"
            : layoutMode === "top"
            ? "w-full aspect-[4/3] sm:aspect-[16/10] max-h-[560px]"
            : "w-full aspect-square"
        }`}
      >
        {/* Generating overlay */}
        {isGenerating && (
          <div className="absolute inset-0 z-20 bg-zinc-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <Sparkles className="w-6 h-6 text-indigo-400 absolute inset-0 m-auto" />
            </div>

            <div className="text-base font-semibold text-white mb-2">
              {statusText || "Rendering on ComfyUI..."}
            </div>

            {/* Progress bar */}
            <div className="w-64 max-w-full bg-zinc-800 rounded-full h-2 overflow-hidden mb-2">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.max(5, progressPercent)}%` }}
              />
            </div>
            <div className="text-xs text-zinc-400 font-mono">
              {progressPercent}% Complete
            </div>
          </div>
        )}

        {/* Error message */}
        {errorMessage && !isGenerating && (
          <div className="p-6 text-center max-w-md">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
            <div className="text-sm font-semibold text-rose-400 mb-1">
              Generation Error
            </div>
            <p className="text-xs text-zinc-400 font-mono break-words bg-zinc-950/80 p-3 rounded-lg border border-rose-900/30">
              {errorMessage}
            </p>
          </div>
        )}

        {/* Media Display */}
        {currentMedia && !isGenerating && activeMediaUrl ? (
          <div className="relative w-full h-full group flex items-center justify-center">
            {isResolvingBlob ? (
              <div className="flex flex-col items-center justify-center gap-2 text-zinc-400">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                <span className="text-xs font-mono">Loading from local cache...</span>
              </div>
            ) : currentMedia.mimeType === "video" ? (
              <video
                src={activeMediaUrl}
                controls
                autoPlay
                loop
                className="max-h-full max-w-full object-contain rounded-xl"
              />
            ) : (
              <img
                src={activeMediaUrl}
                alt="Generated Output"
                onError={handleImageError}
                className="max-h-full max-w-full object-contain rounded-xl"
              />
            )}

            {/* Hover Actions Toolbar */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-950/80 backdrop-blur-md p-1.5 rounded-xl border border-zinc-800 shadow-lg z-10">
              <button
                type="button"
                onClick={() =>
                  setPreviewBg((prev) => (prev === "checkerboard" ? "dark" : "checkerboard"))
                }
                title={
                  previewBg === "checkerboard"
                    ? "Switch to solid dark background"
                    : "Switch to transparent checkerboard background"
                }
                className={`p-2 rounded-lg transition-colors ${
                  previewBg === "checkerboard"
                    ? "text-fuchsia-400 bg-fuchsia-500/10"
                    : "text-zinc-300 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <Grid className="w-4 h-4" />
              </button>

              {onToggleLayoutMode && (
                <button
                  type="button"
                  onClick={onToggleLayoutMode}
                  title={layoutMode === "top" ? "Switch to Side-by-Side View" : "Switch to Canvas on Top"}
                  className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  {layoutMode === "top" ? (
                    <Columns2 className="w-4 h-4 text-indigo-400" />
                  ) : (
                    <LayoutTemplate className="w-4 h-4 text-indigo-400" />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={handleDownload}
                title="Download from local cache"
                className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setEntitySaveOpen(true)}
                title="Save as entity (usable as scene or reference in Identity Edit)"
                className="p-2 rounded-lg text-zinc-300 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
              >
                <UserRoundPlus className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={copyUrl}
                title="Copy media URL"
                className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title="Toggle Fullscreen"
                className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>

            {blobError && (
              <div className="absolute bottom-3 left-3 right-3 bg-rose-950/90 border border-rose-900/50 p-2.5 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate">{blobError}</span>
              </div>
            )}
          </div>
        ) : !isGenerating && !errorMessage ? (
          <div className="text-center p-8 text-zinc-500 flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-center mb-3 text-zinc-600">
              <ImageIcon className="w-8 h-8" />
            </div>
            <div className="text-sm font-medium text-zinc-400 mb-1">
              Ready to Generate
            </div>
            <p className="text-xs text-zinc-600 max-w-xs">
              Configure parameters below and click Generate (or press Ctrl+Enter).
            </p>
          </div>
        ) : null}
      </div>

      {/* History Feed & Local Storage Info */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
              <History className="w-3.5 h-3.5 text-indigo-400" />
              History ({history.length})
            </div>
            <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <HardDrive className="w-3 h-3" />
              <span>Local Cache: {cacheStats.formattedSize}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onToggleLayoutMode && (
              <button
                type="button"
                onClick={onToggleLayoutMode}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/40 transition-colors"
                title={layoutMode === "top" ? "Switch to Side View" : "Switch to Top View"}
              >
                {layoutMode === "top" ? (
                  <>
                    <Columns2 className="w-3 h-3 text-indigo-400" />
                    <span className="hidden xs:inline">Side View</span>
                  </>
                ) : (
                  <>
                    <LayoutTemplate className="w-3 h-3 text-indigo-400" />
                    <span className="hidden xs:inline">Top View</span>
                  </>
                )}
              </button>
            )}

            {history.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                title="Wipe all locally cached images from browser memory"
                className="text-[11px] text-zinc-400 hover:text-rose-400 flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800/60 hover:bg-rose-500/10 hover:border-rose-500/30 border border-zinc-700/40 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear Cache</span>
              </button>
            )}
          </div>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-4 text-xs text-zinc-600">
            No local cached renders yet
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto py-1">
            {history.map((item) => {
              const firstOutput = item.outputs[0];
              const isSelected =
                firstOutput && currentMedia?.filename === firstOutput.filename;

              return (
                <HistoryThumbnailItem
                  key={item.id}
                  output={firstOutput}
                  isSelected={Boolean(isSelected)}
                  timestamp={item.timestamp}
                  status={item.status}
                  onClick={() => onSelectHistoryItem(item)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Save the current output as a reusable entity */}
      <SaveEntityModal
        media={currentMedia}
        open={entitySaveOpen}
        onClose={() => setEntitySaveOpen(false)}
        createEntityFromMediaId={createEntityFromMediaId}
        createEntityFromBlob={createEntity}
      />
    </div>
  );
};

/** Individual thumbnail rendered directly from local IndexedDB */
const HistoryThumbnailItem: React.FC<{
  output?: GeneratedMedia;
  isSelected: boolean;
  timestamp: number;
  status: string;
  onClick: () => void;
}> = ({ output, isSelected, timestamp, status, onClick }) => {
  const [thumbUrl, setThumbUrl] = useState<string>(output?.url || "");

  useEffect(() => {
    let active = true;
    if (output?.id) {
      getLocalMediaUrl(output.id).then((localUrl) => {
        if (active && localUrl) {
          setThumbUrl(localUrl);
        }
      });
    } else if (output?.url) {
      setThumbUrl(output.url);
    }
    return () => {
      active = false;
    };
  }, [output?.id, output?.url]);

  return (
    <div
      onClick={onClick}
      className={`group relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border cursor-pointer transition-all ${
        isSelected
          ? "border-indigo-500 ring-2 ring-indigo-500/30 scale-105"
          : "border-zinc-800 hover:border-zinc-700 opacity-80 hover:opacity-100"
      }`}
    >
      {output ? (
        output.mimeType === "video" ? (
          <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
            <Film className="w-5 h-5 text-indigo-400" />
          </div>
        ) : (
          <img
            src={thumbUrl}
            alt="Thumbnail"
            className="w-full h-full object-cover"
          />
        )
      ) : (
        <div className="w-full h-full bg-zinc-950 flex items-center justify-center text-[10px] text-zinc-500">
          {status}
        </div>
      )}

      {/* Timestamp overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-black/70 text-[9px] text-zinc-300 px-1 py-0.5 text-center font-mono opacity-0 group-hover:opacity-100 transition-opacity">
        {new Date(timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
};
