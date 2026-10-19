import React from "react";
import { Sliders, Dices, Shuffle } from "lucide-react";
import { ExtractedParameter } from "../../types/workflow";
import { generateRandomSeed } from "../../lib/workflowInjector";

interface SamplerFieldProps {
  parameters: ExtractedParameter[];
  onParameterChange: (paramId: string, value: any) => void;
  randomizeSeedOnGenerate: boolean;
  onToggleRandomizeSeed: (val: boolean) => void;
}

export const SamplerField: React.FC<SamplerFieldProps> = ({
  parameters,
  onParameterChange,
  randomizeSeedOnGenerate,
  onToggleRandomizeSeed,
}) => {
  const seedParam = parameters.find(
    (p) => p.inputKey === "seed" || p.inputKey === "noise_seed"
  );
  const stepsParam = parameters.find((p) => p.inputKey === "steps");
  const cfgParam = parameters.find((p) => p.inputKey === "cfg");
  const denoiseParam = parameters.find((p) => p.inputKey === "denoise");
  const samplerNameParam = parameters.find((p) => p.inputKey === "sampler_name");
  const schedulerParam = parameters.find((p) => p.inputKey === "scheduler");

  const rollSeed = () => {
    if (seedParam) {
      onParameterChange(seedParam.id, generateRandomSeed());
    }
  };

  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <label className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-indigo-400" />
          Sampling & Generation Controls
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Seed Control */}
        {seedParam && (
          <div className="sm:col-span-2 bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-zinc-300">Seed</label>
              <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={randomizeSeedOnGenerate}
                  onChange={(e) => onToggleRandomizeSeed(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500"
                />
                <Shuffle className="w-3 h-3 text-indigo-400" />
                <span>Randomize each run</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={seedParam.currentValue ?? ""}
                onChange={(e) =>
                  onParameterChange(seedParam.id, Number(e.target.value))
                }
                disabled={randomizeSeedOnGenerate}
                className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-indigo-500 disabled:opacity-50 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100"
              />
              <button
                type="button"
                onClick={rollSeed}
                title="Roll new random seed"
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 transition-colors"
              >
                <Dices className="w-4 h-4 text-indigo-400" />
              </button>
            </div>
          </div>
        )}

        {/* Steps Slider */}
        {stepsParam && (
          <div>
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-zinc-300">Steps</span>
              <span className="font-mono text-indigo-400 font-semibold">
                {stepsParam.currentValue}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={stepsParam.currentValue ?? 30}
              onChange={(e) =>
                onParameterChange(stepsParam.id, Number(e.target.value))
              }
              className="w-full accent-indigo-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
            />
          </div>
        )}

        {/* CFG Scale Slider */}
        {cfgParam && (
          <div>
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-zinc-300">CFG Scale</span>
              <span className="font-mono text-indigo-400 font-semibold">
                {cfgParam.currentValue}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              step={0.5}
              value={cfgParam.currentValue ?? 4}
              onChange={(e) =>
                onParameterChange(cfgParam.id, Number(e.target.value))
              }
              className="w-full accent-indigo-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
            />
          </div>
        )}

        {/* Sampler Selector */}
        {samplerNameParam && (
          <div>
            <label className="text-xs text-zinc-300 block mb-1">Sampler</label>
            <select
              value={samplerNameParam.currentValue ?? ""}
              onChange={(e) =>
                onParameterChange(samplerNameParam.id, e.target.value)
              }
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100"
            >
              {samplerNameParam.options?.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Scheduler Selector */}
        {schedulerParam && (
          <div>
            <label className="text-xs text-zinc-300 block mb-1">Scheduler</label>
            <select
              value={schedulerParam.currentValue ?? ""}
              onChange={(e) =>
                onParameterChange(schedulerParam.id, e.target.value)
              }
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100"
            >
              {schedulerParam.options?.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Denoise Slider */}
        {denoiseParam && (
          <div className="sm:col-span-2">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-zinc-300">Denoise</span>
              <span className="font-mono text-indigo-400 font-semibold">
                {denoiseParam.currentValue}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={denoiseParam.currentValue ?? 1}
              onChange={(e) =>
                onParameterChange(denoiseParam.id, Number(e.target.value))
              }
              className="w-full accent-indigo-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
            />
          </div>
        )}
      </div>
    </div>
  );
};
