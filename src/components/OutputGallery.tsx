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
} from "lucide-react";
import { GeneratedMedia, GenerationHistoryItem } from "../types/workflow";
import { fetchComfyMediaBlob } from "../lib/comfyClient";

interface OutputGalleryProps {
  currentMedia: GeneratedMedia | null;
  history: GenerationHistoryItem[];
  isGenerating: boolean;
  progressPercent: number;
  statusText: string;
  errorMessage?: string;
  endpoint: string;
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
  onSelectHistoryItem,
  onClearHistory,
}) => {
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [isResolvingBlob, setIsResolvingBlob] = useState(false);
  const [blobError, setBlobError] = useState<string | null>(null);

  // When currentMedia changes, resolve blob URL if needed
  useEffect(() => {
    if (!currentMedia) {
      setResolvedUrl(null);
      setBlobError(null);
      return;
    }

    if (currentMedia.url.startsWith("blob:") || currentMedia.url.startsWith("data:")) {
      setResolvedUrl(currentMedia.url);
      setBlobError(null);
      return;
    }

    // Attempt authenticated blob fetch
    let active = true;
    setIsResolvingBlob(true);
    setBlobError(null);

    fetchComfyMediaBlob(
      endpoint,
      currentMedia.filename,
      currentMedia.subfolder,
      currentMedia.type
    )
      .then(({ localUrl }) => {
        if (active) {
          setResolvedUrl(localUrl);
          setIsResolvingBlob(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.warn("Failed to resolve blob URL:", err);
          // Fall back to original URL
          setResolvedUrl(currentMedia.url);
          setIsResolvingBlob(false);
        }
      });

    return () => {
      active = false;
    };
  }, [currentMedia, endpoint]);

  const handleImageError = async () => {
    if (!currentMedia || isResolvingBlob) return;
    try {
      setIsResolvingBlob(true);
      const { localUrl } = await fetchComfyMediaBlob(
        endpoint,
        currentMedia.filename,
        currentMedia.subfolder,
        currentMedia.type
      );
      setResolvedUrl(localUrl);
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
        className={`relative bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden aspect-square flex items-center justify-center shadow-xl transition-all ${
          isFullscreen
            ? "fixed inset-4 z-50 aspect-auto bg-black/95 backdrop-blur-xl"
            : ""
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
                <span className="text-xs font-mono">Loading image bytes...</span>
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
            <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-950/80 backdrop-blur-md p-1.5 rounded-xl border border-zinc-800 shadow-lg z-10">
              <button
                type="button"
                onClick={handleDownload}
                title="Download media"
                className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <Download className="w-4 h-4" />
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
              Configure parameters on the left and hit Generate (or press Ctrl+Enter).
            </p>
          </div>
        ) : null}
      </div>

      {/* History Feed */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
            <History className="w-3.5 h-3.5 text-indigo-400" />
            History ({history.length})
          </div>
          {history.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              title="Clear generation history"
              className="text-[11px] text-zinc-500 hover:text-rose-400 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="text-center py-4 text-xs text-zinc-600">
            No previous renders yet
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto py-1">
            {history.map((item) => {
              const firstOutput = item.outputs[0];
              const isSelected =
                firstOutput && currentMedia?.filename === firstOutput.filename;

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectHistoryItem(item)}
                  className={`group relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border cursor-pointer transition-all ${
                    isSelected
                      ? "border-indigo-500 ring-2 ring-indigo-500/30 scale-105"
                      : "border-zinc-800 hover:border-zinc-700 opacity-80 hover:opacity-100"
                  }`}
                >
                  {firstOutput ? (
                    firstOutput.mimeType === "video" ? (
                      <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
                        <Film className="w-5 h-5 text-indigo-400" />
                      </div>
                    ) : (
                      <img
                        src={firstOutput.url}
                        alt="Thumbnail"
                        className="w-full h-full object-cover"
                      />
                    )
                  ) : (
                    <div className="w-full h-full bg-zinc-950 flex items-center justify-center text-[10px] text-zinc-500">
                      {item.status}
                    </div>
                  )}

                  {/* Timestamp overlay */}
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 text-[9px] text-zinc-300 px-1 py-0.5 text-center font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                    {new Date(item.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
