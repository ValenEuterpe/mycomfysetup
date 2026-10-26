import React, { useRef, useState } from "react";
import {
  FileJson,
  Upload,
  Clipboard,
  Download,
  Plus,
  Check,
  Sparkles,
  Wand2,
  Scissors,
} from "lucide-react";
import { WorkflowPreset } from "../lib/storage";

interface WorkflowBarProps {
  currentWorkflowName: string;
  presets: WorkflowPreset[];
  activePresetId: string;
  onSelectPreset: (presetId: string) => void;
  onUploadWorkflowFile: (file: File) => void;
  onPasteWorkflowJson: (jsonStr: string, name?: string) => void;
  onExportWorkflowJson: () => void;
}

export const WorkflowBar: React.FC<WorkflowBarProps> = ({
  currentWorkflowName,
  presets,
  activePresetId,
  onSelectPreset,
  onUploadWorkflowFile,
  onPasteWorkflowJson,
  onExportWorkflowJson,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedJson, setPastedJson] = useState("");
  const [pastedName, setPastedName] = useState("");
  const [pasteError, setPasteError] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadWorkflowFile(file);
    }
  };

  const handlePasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasteError("");
    try {
      JSON.parse(pastedJson);
      onPasteWorkflowJson(pastedJson, pastedName.trim() || undefined);
      setShowPasteModal(false);
      setPastedJson("");
      setPastedName("");
    } catch (err: any) {
      setPasteError("Invalid JSON syntax: " + err.message);
    }
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
      {/* Preset Selector */}
      <div className="flex items-center gap-2 overflow-x-auto max-w-full py-1">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 shrink-0 mr-1">
          <FileJson className="w-3.5 h-3.5 text-indigo-400" />
          Workflow:
        </span>
        {presets.map((preset) => {
          const isActive = preset.id === activePresetId;
          const lower = (preset.id + " " + preset.name).toLowerCase();
          const isSticker = lower.includes("sticker") || lower.includes("removebg") || lower.includes("cutout");
          const isKroma = lower.includes("kroma") || lower.includes("krea");
          const isAnima = !isSticker && !isKroma && lower.includes("anima");

          const activeClass = isSticker
            ? "bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-sm shadow-fuchsia-600/30"
            : isKroma
            ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm shadow-purple-600/30"
            : isAnima
            ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
            : "bg-zinc-700 text-white shadow-sm";

          return (
            <button
              key={preset.id}
              onClick={() => onSelectPreset(preset.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                isActive
                  ? activeClass
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
              }`}
            >
              {isSticker && <Scissors className="w-3.5 h-3.5 text-fuchsia-300 shrink-0" />}
              {isKroma && <Wand2 className="w-3.5 h-3.5 text-purple-300 shrink-0" />}
              {isAnima && <Sparkles className="w-3.5 h-3.5 text-indigo-300 shrink-0" />}
              {!isSticker && !isKroma && !isAnima && isActive && (
                <Check className="w-3 h-3 text-indigo-200 shrink-0" />
              )}
              <span>{preset.name}</span>
            </button>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".json,application/json"
          className="hidden"
        />

        {/* Upload File */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 hover:text-white border border-zinc-700/60 transition-colors"
          title="Upload ComfyUI API JSON file"
        >
          <Upload className="w-3.5 h-3.5 text-indigo-400" />
          <span>Load JSON File</span>
        </button>

        {/* Paste JSON */}
        <button
          type="button"
          onClick={() => setShowPasteModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 hover:text-white border border-zinc-700/60 transition-colors"
          title="Paste raw ComfyUI API JSON"
        >
          <Clipboard className="w-3.5 h-3.5 text-indigo-400" />
          <span>Paste JSON</span>
        </button>

        {/* Download JSON */}
        <button
          type="button"
          onClick={onExportWorkflowJson}
          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 transition-colors"
          title="Download current workflow JSON"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Paste Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileJson className="w-5 h-5 text-indigo-400" />
                Paste ComfyUI API Workflow JSON
              </h3>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="text-zinc-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePasteSubmit} className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  Preset Name (optional)
                </label>
                <input
                  type="text"
                  value={pastedName}
                  onChange={(e) => setPastedName(e.target.value)}
                  placeholder="e.g. My Flux / SDXL Workflow"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  JSON Content (API Format)
                </label>
                <textarea
                  value={pastedJson}
                  onChange={(e) => setPastedJson(e.target.value)}
                  placeholder='{ "1": { "inputs": { ... }, "class_type": "..." } }'
                  rows={10}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs font-mono text-zinc-200 focus:border-indigo-500 resize-none"
                />
              </div>

              {pasteError && (
                <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg">
                  {pasteError}
                </div>
              )}

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowPasteModal(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!pastedJson.trim()}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white shadow-sm"
                >
                  Load Workflow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
