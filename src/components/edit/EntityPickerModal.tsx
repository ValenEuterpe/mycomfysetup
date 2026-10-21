import React, { useCallback, useEffect, useState } from "react";
import { X, Plus, Trash2, Pencil, Check, Loader2, UploadCloud, Boxes } from "lucide-react";
import type { Entity } from "../../types/entity";
import {
  createEntity,
  deleteEntity,
  listEntities,
  updateEntity,
  getEntityImageUrl,
} from "../../lib/entityStore";

interface EntityPickerModalProps {
  open: boolean;
  title?: string;
  selectedId?: string | null;
  onClose: () => void;
  onSelect?: (entity: Entity) => void;
}

export const EntityPickerModal: React.FC<EntityPickerModalProps> = ({
  open,
  title = "Saved entities",
  selectedId,
  onClose,
  onSelect,
}) => {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listEntities();
      setEntities(list);
      const urls: Record<string, string> = {};
      await Promise.all(
        list.map(async (e) => {
          const url = await getEntityImageUrl(e.mediaId);
          if (url) urls[e.id] = url;
        })
      );
      setThumbUrls(urls);
    } catch (err) {
      setError("Failed to load entity library.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setError(null);
      cancelPending();
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cancelPending = () => {
    setPendingFile(null);
    setPendingPreview(null);
    setPendingName("");
  };

  const handlePickFile = (file: File) => {
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
    const stripped = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
    setPendingName(stripped || "New entity");
  };

  const handleCreateFromUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await pendingFile.slice(0, pendingFile.size, pendingFile.type);
      // Downscale oversized uploads to ~1.2MP to keep model inputs in the trained range
      const optimized = await downscaleToMegapixels(blob, 1.2);
      await createEntity(optimized, pendingName);
      cancelPending();
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (e: Entity) => {
    if (!confirm(`Delete entity "${e.name}"? This only removes the local reference.`)) return;
    await deleteEntity(e.id);
    await refresh();
  };

  const startRename = (e: Entity) => {
    setRenamingId(e.id);
    setRenameValue(e.name);
  };

  const commitRename = async () => {
    if (!renamingId) return;
    await updateEntity(renamingId, { name: renameValue });
    setRenamingId(null);
    await refresh();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
            <Boxes className="w-4 h-4 text-indigo-400" />
            {title}
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Upload new entity */}
          <div className="flex flex-col gap-2 bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
            {pendingPreview ? (
              <div className="flex items-center gap-3 flex-wrap">
                <img src={pendingPreview} alt="new entity" className="w-14 h-14 rounded-lg object-cover border border-indigo-500/40" />
                <input
                  value={pendingName}
                  onChange={(e) => setPendingName(e.target.value)}
                  className="flex-1 min-w-[160px] bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 outline-none"
                  placeholder="Entity name"
                />
                <div className="flex items-center gap-2">
                  {uploading ? (
                    <div className="w-9 h-9 flex items-center justify-center text-indigo-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCreateFromUpload}
                      className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Add
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={cancelPending}
                    className="px-2 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs flex items-center"
                    title="Discard"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-zinc-800 hover:border-indigo-500/50 rounded-lg cursor-pointer text-xs text-zinc-400 transition-colors">
                <UploadCloud className="w-4 h-4 text-indigo-400" />
                <span className="font-medium text-zinc-200">Upload image</span>
                <span className="hidden sm:inline">— saved locally, auto-scaled near 1 MP</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePickFile(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            )}
          </div>

          {/* Library grid */}
          {loading ? (
            <div className="flex justify-center py-10 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            </div>
          ) : entities.length === 0 ? (
            <div className="text-center py-10 text-zinc-500 text-sm">
              No entities yet — generate an image and hit <span className="text-indigo-400 font-medium">Save as entity</span>,
              or upload one above.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {entities.map((e) => {
                const isSel = selectedId === e.id;
                return (
                  <div
                    key={e.id}
                    className={`relative group rounded-xl overflow-hidden border bg-zinc-950 transition-all ${
                      isSel ? "border-indigo-500 ring-2 ring-indigo-500/30" : "border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelect?.(e);
                        onClose();
                      }}
                      className="block w-full text-left"
                    >
                      {thumbUrls[e.id] ? (
                        <img src={thumbUrls[e.id]} alt={e.name} className="w-full aspect-square object-cover" />
                      ) : (
                        <div className="w-full aspect-square bg-zinc-900 flex items-center justify-center text-zinc-600">
                          <Plus className="w-5 h-5" />
                        </div>
                      )}
                    </button>

                    {/* action rail */}
                    <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => startRename(e)}
                        className="p-1.5 rounded-md bg-zinc-950/80 hover:bg-zinc-800 text-zinc-300"
                        title="Rename"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(e)}
                        className="p-1.5 rounded-md bg-zinc-950/80 hover:bg-rose-900/70 text-rose-400"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="px-2 py-1.5 bg-zinc-900/90 border-t border-zinc-800">
                      {renamingId === e.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={renameValue}
                            onChange={(e2) => setRenameValue(e2.target.value)}
                            onKeyDown={(e2) => e2.key === "Enter" && commitRename()}
                            autoFocus
                            className="w-full bg-zinc-950 border border-indigo-500/50 rounded px-1.5 py-1 text-xs text-zinc-100 outline-none"
                          />
                          <button type="button" onClick={commitRename} className="p-1 text-emerald-400 hover:text-emerald-300">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-zinc-200 truncate">{e.name}</span>
                          {e.notes && <span className="text-[10px] text-zinc-500 truncate">{e.notes}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {error && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">{error}</p>}
        </div>
      </div>
    </div>
  );
};

/**
 * Downscales an image Blob so width*height <= mpTarget when the source is larger.
 * Keeps entity uploads inside the identity-edit sweet-spot resolution.
 */
export async function downscaleToMegapixels(blob: Blob, mpTarget: number): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob);
    const curPx = bmp.width * bmp.height;
    const targetPx = mpTarget * 1_000_000;
    if (curPx <= targetPx) {
      bmp.close?.();
      return blob;
    }
    const scale = Math.sqrt(targetPx / curPx);
    const w = Math.max(8, Math.round(bmp.width * scale / 8) * 8);
    const h = Math.max(8, Math.round(bmp.height * scale / 8) * 8);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png", 0.95)
    );
    return out || blob;
  } catch {
    return blob;
  }
}
