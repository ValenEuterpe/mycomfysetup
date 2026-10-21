import React from "react";
import { UploadCloud, Boxes, X, ImagePlus } from "lucide-react";

export interface SlotSource {
  /** object URL for preview (blob: or data:) */
  previewUrl: string;
  /** display label, e.g. entity name or file name */
  label: string;
  /** backing media id in IndexedDB (entity.mediaId or generated media id) */
  mediaId?: string;
  /** raw file when uploaded directly (not yet in entity library) */
  file?: File;
  /** detached blob (e.g. chained output) */
  blob?: Blob;
}

interface ImageSlotProps {
  title: string;
  subtitle?: string;
  accent: "indigo" | "fuchsia";
  source: SlotSource | null;
  onPickFromLibrary: () => void;
  onUploadFile: (file: File) => void;
  onClear: () => void;
}

const ACCENTS = {
  indigo: {
    ring: "hover:border-indigo-500/60",
    chip: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
    btn: "text-indigo-300 hover:text-indigo-200",
  },
  fuchsia: {
    ring: "hover:border-fuchsia-500/60",
    chip: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20",
    btn: "text-fuchsia-300 hover:text-fuchsia-200",
  },
};

export const ImageSlot: React.FC<ImageSlotProps> = ({
  title,
  subtitle,
  accent,
  source,
  onPickFromLibrary,
  onUploadFile,
  onClear,
}) => {
  const a = ACCENTS[accent];
  const fileRef = React.useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onUploadFile(f);
    e.currentTarget.value = "";
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-0.5">
        <span className={`text-[11px] font-bold uppercase tracking-wider ${a.btn} flex items-center gap-1.5`}>
          <ImagePlus className="w-3.5 h-3.5" />
          {title}
        </span>
        {subtitle && <span className="text-[10px] text-zinc-500">{subtitle}</span>}
      </div>

      <div
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          fileRef.current?.click();
        }}
        className={`relative aspect-[4/3] rounded-xl border-2 border-dashed border-zinc-800 ${a.ring} bg-zinc-950/50 cursor-pointer overflow-hidden transition-colors group`}
      >
        {source?.previewUrl ? (
          <>
            <img src={source.previewUrl} alt={title} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-2 py-1.5 bg-gradient-to-t from-black/85 to-transparent">
              <span className="text-[11px] text-zinc-200 font-medium truncate max-w-[75%]">{source.label}</span>
              <button
                type="button"
                onClick={onClear}
                className="p-1 rounded-md bg-zinc-950/80 hover:bg-rose-900/70 text-rose-400 opacity-80 group-hover:opacity-100"
                title="Clear slot"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-zinc-600 group-hover:text-zinc-400">
            <UploadCloud className="w-6 h-6" />
            <span className="text-[11px]">Click or drop an image</span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPickFromLibrary}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition-colors"
        >
          <Boxes className="w-3.5 h-3.5" />
          From library
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition-colors"
        >
          <UploadCloud className="w-3.5 h-3.5" />
          Upload
        </button>
      </div>

      <input type="file" ref={fileRef} className="hidden" accept="image/*" onChange={handleFile} />
    </div>
  );
};

export function slotFromEntity(id: string, mediaId: string, label: string, previewUrl: string): SlotSource {
  return { previewUrl, label, mediaId };
}

export function slotFromFile(file: File): SlotSource {
  return { previewUrl: URL.createObjectURL(file), label: file.name, file };
}

export async function slotFromMediaBlob(blob: Blob, label: string, mediaId?: string): Promise<SlotSource> {
  return { previewUrl: URL.createObjectURL(blob), label, blob, mediaId };
}
