import React from "react";
import { Maximize2, ArrowRightLeft } from "lucide-react";
import { ExtractedParameter } from "../../types/workflow";
import { ASPECT_RATIOS } from "../../lib/workflowParser";

interface DimensionFieldProps {
  parameters: ExtractedParameter[];
  onParameterChange: (paramId: string, value: any) => void;
}

export const DimensionField: React.FC<DimensionFieldProps> = ({
  parameters,
  onParameterChange,
}) => {
  const widthParam = parameters.find((p) => p.inputKey === "width");
  const heightParam = parameters.find((p) => p.inputKey === "height");
  const batchParam = parameters.find((p) => p.inputKey === "batch_size");

  const currentWidth = Number(widthParam?.currentValue || 1024);
  const currentHeight = Number(heightParam?.currentValue || 1024);

  const handleRatioClick = (w: number, h: number) => {
    if (widthParam) onParameterChange(widthParam.id, w);
    if (heightParam) onParameterChange(heightParam.id, h);
  };

  const handleSwap = () => {
    if (widthParam && heightParam) {
      const prevW = widthParam.currentValue;
      const prevH = heightParam.currentValue;
      onParameterChange(widthParam.id, prevH);
      onParameterChange(heightParam.id, prevW);
    }
  };

  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <label className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
          <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
          Resolution & Aspect Ratio
        </label>
        <div className="text-xs font-mono text-zinc-400">
          {currentWidth} × {currentHeight}
        </div>
      </div>

      {/* Quick Ratio Presets */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-3">
        {ASPECT_RATIOS.map((item) => {
          const isSelected =
            currentWidth === item.width && currentHeight === item.height;
          // Proportion-true preview box (max ~30px on the long edge)
          const scale = 30 / Math.max(item.width, item.height);
          const previewW = Math.max(6, Math.round(item.width * scale));
          const previewH = Math.max(6, Math.round(item.height * scale));
          return (
            <button
              key={item.ratio}
              type="button"
              onClick={() => handleRatioClick(item.width, item.height)}
              className={`px-2 py-2 rounded-lg text-center border text-xs font-medium transition-all ${
                isSelected
                  ? "bg-indigo-600 text-white border-indigo-500 shadow-sm shadow-indigo-600/30"
                  : "bg-zinc-950/60 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800"
              }`}
            >
              <div className="flex justify-center mb-1.5">
                <div
                  aria-hidden
                  className={`rounded-[3px] border ${
                    isSelected
                      ? "bg-white/90 border-white/60"
                      : "bg-zinc-700 border-zinc-600"
                  }`}
                  style={{ width: previewW, height: previewH }}
                />
              </div>
              <div className="font-semibold">{item.ratio}</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">
                {item.width}×{item.height}
              </div>
            </button>
          );
        })}
      </div>

      {/* Manual Dimensions Input */}
      <div className="flex items-center gap-2">
        {widthParam && (
          <div className="flex-1">
            <label className="text-[11px] text-zinc-400 block mb-1">Width (px)</label>
            <input
              type="number"
              step={16}
              min={128}
              max={4096}
              value={widthParam.currentValue ?? 1024}
              onChange={(e) =>
                onParameterChange(widthParam.id, Number(e.target.value))
              }
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100"
            />
          </div>
        )}

        {widthParam && heightParam && (
          <button
            type="button"
            onClick={handleSwap}
            title="Swap width & height"
            className="mt-5 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 transition-colors"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </button>
        )}

        {heightParam && (
          <div className="flex-1">
            <label className="text-[11px] text-zinc-400 block mb-1">Height (px)</label>
            <input
              type="number"
              step={16}
              min={128}
              max={4096}
              value={heightParam.currentValue ?? 1024}
              onChange={(e) =>
                onParameterChange(heightParam.id, Number(e.target.value))
              }
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100"
            />
          </div>
        )}

        {batchParam && (
          <div className="w-24">
            <label className="text-[11px] text-zinc-400 block mb-1">Batch</label>
            <input
              type="number"
              min={1}
              max={8}
              value={batchParam.currentValue ?? 1}
              onChange={(e) =>
                onParameterChange(batchParam.id, Number(e.target.value))
              }
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100"
            />
          </div>
        )}
      </div>
    </div>
  );
};
