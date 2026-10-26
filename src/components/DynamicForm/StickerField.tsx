import React from "react";
import { Scissors, Sparkles, Palette, Layers, Sliders } from "lucide-react";
import { ExtractedParameter } from "../../types/workflow";

interface StickerFieldProps {
  parameters: ExtractedParameter[];
  onParameterChange: (paramId: string, value: any) => void;
}

const COLOR_PRESETS = [
  { label: "White", value: "#FFFFFF", border: "border-zinc-300" },
  { label: "Dark", value: "#18181B", border: "border-zinc-700" },
  { label: "Pink", value: "#EC4899", border: "border-pink-500" },
  { label: "Gold", value: "#F59E0B", border: "border-amber-500" },
  { label: "Cyan", value: "#06B6D4", border: "border-cyan-500" },
  { label: "Emerald", value: "#10B981", border: "border-emerald-500" },
  { label: "Purple", value: "#A855F7", border: "border-purple-500" },
  { label: "Red", value: "#EF4444", border: "border-red-500" },
];

const THICKNESS_PRESETS = [
  { label: "0px (Clean Alpha)", value: 0 },
  { label: "2px (Subtle)", value: 2 },
  { label: "4px (Sticker)", value: 4 },
  { label: "8px (Bold)", value: 8 },
  { label: "12px (Pop)", value: 12 },
];

export const StickerField: React.FC<StickerFieldProps> = ({
  parameters,
  onParameterChange,
}) => {
  const thicknessParam = parameters.find(
    (p) =>
      p.inputKey === "width" ||
      p.inputKey === "thickness" ||
      p.label.toLowerCase().includes("thickness")
  );

  const colorParam = parameters.find(
    (p) =>
      p.inputKey === "color" ||
      p.type === "color" ||
      p.label.toLowerCase().includes("color")
  );

  const sensitivityParam = parameters.find(
    (p) => p.inputKey === "sensitivity"
  );

  const thickness = Number(thicknessParam?.currentValue ?? 2);
  const color = String(colorParam?.currentValue ?? "#FFFFFF");
  const sensitivity = sensitivityParam ? Number(sensitivityParam.currentValue ?? 1) : null;

  // Generate CSS drop shadow for the live preview badge
  const previewFilter =
    thickness > 0
      ? `drop-shadow(${thickness}px 0 0 ${color}) drop-shadow(-${thickness}px 0 0 ${color}) drop-shadow(0 ${thickness}px 0 ${color}) drop-shadow(0 -${thickness}px 0 ${color})`
      : undefined;

  return (
    <div className="bg-zinc-900/80 border border-fuchsia-500/30 rounded-2xl p-4 sm:p-5 flex flex-col gap-5 shadow-lg shadow-fuchsia-950/20">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-fuchsia-600 to-indigo-600 flex items-center justify-center shadow-md shadow-fuchsia-500/20">
            <Scissors className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
              Sticker & Background Removal
              <span className="text-[10px] font-normal text-fuchsia-400 bg-fuchsia-500/10 border border-fuchsia-500/20 px-1.5 py-0.5 rounded">
                RMBG-2.0
              </span>
            </span>
            <p className="text-[11px] text-zinc-400">
              Outputs transparent PNG with customizable sticker outline highlight
            </p>
          </div>
        </div>

        {/* Live Mini Preview Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800">
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
            Preview:
          </span>
          <div className="w-9 h-9 rounded-lg bg-[linear-gradient(45deg,#27272a_25%,transparent_25%),linear-gradient(-45deg,#27272a_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#27272a_75%),linear-gradient(-45deg,transparent_75%,#27272a_75%)] bg-[size:8px_8px] bg-zinc-950 flex items-center justify-center overflow-hidden border border-zinc-800">
            <div
              style={{ filter: previewFilter }}
              className="transition-all duration-150 flex items-center justify-center"
            >
              <Sparkles className="w-4 h-4 text-fuchsia-400 fill-fuchsia-500" />
            </div>
          </div>
          <span className="text-[11px] font-mono text-zinc-300">
            {thickness === 0 ? "Clean Alpha" : `${thickness}px`}
          </span>
        </div>
      </div>

      {/* Grid: Thickness & Color Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Thickness Control */}
        {thicknessParam && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-fuchsia-400" />
                Outline Thickness
              </span>
              <span className="font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 text-[11px]">
                {thickness === 0 ? "0 px (None)" : `${thickness} px`}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={30}
                step={1}
                value={thickness}
                onChange={(e) =>
                  onParameterChange(thicknessParam.id, Number(e.target.value))
                }
                className="flex-1 accent-fuchsia-500 h-2 bg-zinc-950 rounded-lg cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={50}
                value={thickness}
                onChange={(e) =>
                  onParameterChange(thicknessParam.id, Math.max(0, Number(e.target.value) || 0))
                }
                className="w-16 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white text-center font-mono focus:border-fuchsia-500 focus:outline-none"
              />
            </div>

            {/* Quick Thickness Presets */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {THICKNESS_PRESETS.map((p) => {
                const isActive = thickness === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => onParameterChange(thicknessParam.id, p.value)}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                      isActive
                        ? "bg-fuchsia-600 text-white shadow-sm"
                        : "bg-zinc-950 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Color Control */}
        {colorParam && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-fuchsia-400" />
                Outline / Side Color
              </span>
              <span className="font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 text-[11px]">
                {color.toUpperCase()}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex items-center">
                <input
                  type="color"
                  value={color.startsWith("#") ? color : "#FFFFFF"}
                  onChange={(e) => onParameterChange(colorParam.id, e.target.value)}
                  className="w-9 h-9 rounded-lg bg-transparent border-0 cursor-pointer p-0 appearance-none"
                />
              </div>
              <input
                type="text"
                value={color}
                onChange={(e) => onParameterChange(colorParam.id, e.target.value)}
                placeholder="#FFFFFF"
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono uppercase focus:border-fuchsia-500 focus:outline-none"
              />
            </div>

            {/* Color Swatch Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {COLOR_PRESETS.map((cp) => {
                const isSelected = color.toLowerCase() === cp.value.toLowerCase();
                return (
                  <button
                    key={cp.value}
                    type="button"
                    onClick={() => onParameterChange(colorParam.id, cp.value)}
                    title={cp.label}
                    className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all ${
                      isSelected
                        ? "scale-110 ring-2 ring-fuchsia-500 ring-offset-2 ring-offset-zinc-900 border-white"
                        : "border-zinc-700/80 hover:scale-105"
                    }`}
                    style={{ backgroundColor: cp.value }}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sensitivity (RMBG) if available */}
      {sensitivityParam && (
        <div className="border-t border-zinc-800/80 pt-3 flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Sliders className="w-3.5 h-3.5 text-zinc-500" />
            <span>Matting Sensitivity:</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={3}
              step={0.1}
              value={sensitivity ?? 1}
              onChange={(e) =>
                onParameterChange(sensitivityParam.id, Number(e.target.value))
              }
              className="w-32 accent-fuchsia-500 h-1.5 bg-zinc-950 rounded cursor-pointer"
            />
            <span className="font-mono text-zinc-400 text-[11px] w-8 text-right">
              {sensitivity?.toFixed(1) ?? "1.0"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
