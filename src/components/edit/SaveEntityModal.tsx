import React from "react";
import { X, Save, UserPlus } from "lucide-react";
import type { GeneratedMedia } from "../../types/workflow";

interface SaveEntityModalProps {
  media: GeneratedMedia | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (entityName: string) => void;
  createEntityFromMediaId: (mediaId: string, name: string, notes?: string) => Promise<unknown>;
  createEntityFromBlob: (
    blob: Blob,
    name: string,
    notes?: string,
    filenameHint?: string
  ) => Promise<unknown>;
}

const DEFAULT_NOTES = "";

export const SaveEntityModal: React.FC<SaveEntityModalProps> = ({
  media,
  open,
  onClose,
  onSaved,
  createEntityFromMediaId,
  createEntityFromBlob,
}) => {
  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState(DEFAULT_NOTES);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(`Entity ${new Date().toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`);
      setNotes(DEFAULT_NOTES);
      setError(null);
    }
  }, [open]);

  if (!open || !media) return null;

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      // Generated images are already cached in IndexedDB keyed by their media id;
      // only fall back to re-downloading the bytes when an id is missing.
      if (media.id) {
        await createEntityFromMediaId(media.id, name, notes);
      } else {
        const blob = await (await fetch(media.url)).blob();
        await createEntityFromBlob(blob, name, notes, media.filename);
      }
      onSaved?.(name);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save entity.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
            <UserPlus className="w-4 h-4 text-indigo-400" />
            Save image as entity
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-start gap-3">
            <img
              src={media.url}
              alt="entity preview"
              className="w-16 h-16 rounded-lg object-cover border border-zinc-700 bg-zinc-950"
            />
            <div className="flex-1 flex flex-col gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Entity name (hero, cafe alley...)"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 outline-none"
              />
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          <p className="text-[11px] text-zinc-500">
            Saved locally in your browser cache — usable as scene or reference in the Identity
            Edit studio.
          </p>

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">{error}</p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !name.trim()}
            className="mt-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.99]"
          >
            {busy ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {busy ? "Saving..." : "Save entity"}
          </button>
        </div>
      </div>
    </div>
  );
};
