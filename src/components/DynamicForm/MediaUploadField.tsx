import React, { useRef, useState } from "react";
import { UploadCloud, Image as ImageIcon, Loader2 } from "lucide-react";
import { ExtractedParameter } from "../../types/workflow";
import { uploadImageToComfy } from "../../lib/comfyClient";

interface MediaUploadFieldProps {
  param: ExtractedParameter;
  endpoint: string;
  onChange: (filename: string) => void;
}

export const MediaUploadField: React.FC<MediaUploadFieldProps> = ({
  param,
  endpoint,
  onChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");

  const handleFile = async (file: File) => {
    setUploadError("");
    setIsUploading(true);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const res = await uploadImageToComfy(endpoint, file);
      onChange(res.name);
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload image to relay");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
          {param.label}
        </label>
        <span className="text-[11px] text-zinc-500 font-mono">
          Node #{param.nodeId}
        </span>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="hidden"
      />

      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-zinc-800 hover:border-indigo-500/50 rounded-xl p-4 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 bg-zinc-950/40"
      >
        {previewUrl ? (
          <div className="relative max-h-48 overflow-hidden rounded-lg">
            <img
              src={previewUrl}
              alt="Uploaded input"
              className="max-h-48 object-contain rounded-lg"
            />
            {isUploading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
              </div>
            )}
          </div>
        ) : (
          <>
            <UploadCloud className="w-8 h-8 text-zinc-500" />
            <div className="text-xs text-zinc-300">
              <span className="text-indigo-400 font-medium">Click to upload</span> or drag and drop image
            </div>
            <div className="text-[10px] text-zinc-500">
              Current value: {param.currentValue || "None"}
            </div>
          </>
        )}
      </div>

      {uploadError && (
        <p className="text-xs text-rose-400 mt-2 bg-rose-500/10 p-2 rounded border border-rose-500/20">
          {uploadError}
        </p>
      )}
    </div>
  );
};
