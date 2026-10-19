import React from "react";
import { Sparkles, Ban } from "lucide-react";
import { ExtractedParameter } from "../../types/workflow";

interface PromptFieldProps {
  param: ExtractedParameter;
  onChange: (value: string) => void;
}

export const PromptField: React.FC<PromptFieldProps> = ({ param, onChange }) => {
  const isNegative = param.isNegative;

  return (
    <div className={`p-4 rounded-xl border transition-all ${
      isNegative
        ? "bg-rose-950/20 border-rose-900/30 focus-within:border-rose-500/50"
        : "bg-zinc-900/80 border-zinc-800 focus-within:border-indigo-500/50"
    }`}>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
          {isNegative ? (
            <>
              <Ban className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-rose-300">Negative Prompt</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-zinc-200">Positive Prompt</span>
            </>
          )}
        </label>
        <span className="text-[11px] text-zinc-500 font-mono">
          Node #{param.nodeId} ({param.nodeTitle})
        </span>
      </div>

      <textarea
        value={param.currentValue ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={isNegative ? 2 : 4}
        placeholder={
          isNegative
            ? "low quality, blurry, deformed hands, extra limbs..."
            : "Describe your scene, subject, details, lighting..."
        }
        className={`w-full bg-zinc-950/70 border rounded-lg p-3 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition-colors resize-y ${
          isNegative
            ? "border-rose-900/40 focus:border-rose-500/60"
            : "border-zinc-800 focus:border-indigo-500"
        }`}
      />
    </div>
  );
};
