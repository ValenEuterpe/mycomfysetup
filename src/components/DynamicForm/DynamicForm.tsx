import React, { useState } from "react";
import { ChevronDown, Cpu, Wrench } from "lucide-react";
import { ExtractedParameter } from "../../types/workflow";
import { PromptField } from "./PromptField";
import { DimensionField } from "./DimensionField";
import { SamplerField } from "./SamplerField";
import { MediaUploadField } from "./MediaUploadField";

interface DynamicFormProps {
  parameters: ExtractedParameter[];
  onParameterChange: (paramId: string, value: any) => void;
  randomizeSeedOnGenerate: boolean;
  onToggleRandomizeSeed: (val: boolean) => void;
  endpoint: string;
}

export const DynamicForm: React.FC<DynamicFormProps> = ({
  parameters,
  onParameterChange,
  randomizeSeedOnGenerate,
  onToggleRandomizeSeed,
  endpoint,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Group parameters by category
  const promptParams = parameters.filter((p) => p.category === "prompt");
  const dimensionParams = parameters.filter((p) => p.category === "dimension");
  const samplerParams = parameters.filter((p) => p.category === "sampler");
  const mediaParams = parameters.filter((p) => p.category === "media");
  const modelParams = parameters.filter((p) => p.category === "model");
  const otherParams = parameters.filter(
    (p) => p.category === "primitive" || p.category === "generic"
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Prompts Section */}
      {promptParams.map((param) => (
        <PromptField
          key={param.id}
          param={param}
          onChange={(val) => onParameterChange(param.id, val)}
        />
      ))}

      {/* Dimensions & Aspect Ratio */}
      {dimensionParams.length > 0 && (
        <DimensionField
          parameters={dimensionParams}
          onParameterChange={onParameterChange}
        />
      )}

      {/* Media / Image Uploads (Placed right under Resolution block) */}
      {mediaParams.map((param) => (
        <MediaUploadField
          key={param.id}
          param={param}
          endpoint={endpoint}
          onChange={(val) => onParameterChange(param.id, val)}
        />
      ))}

      {/* Sampler Controls */}
      {samplerParams.length > 0 && (
        <SamplerField
          parameters={samplerParams}
          onParameterChange={onParameterChange}
          randomizeSeedOnGenerate={randomizeSeedOnGenerate}
          onToggleRandomizeSeed={onToggleRandomizeSeed}
        />
      )}

      {/* Model & Checkpoints (if present) */}
      {modelParams.length > 0 && (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
          <label className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            Model & LoRA Loaders
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {modelParams.map((param) => (
              <div key={param.id}>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="text-zinc-300 truncate">{param.label}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    #{param.nodeId}
                  </span>
                </div>
                {param.type === "number" ? (
                  <input
                    type="number"
                    step={param.step || 0.1}
                    min={param.min || 0}
                    max={param.max || 2}
                    value={param.currentValue ?? ""}
                    onChange={(e) =>
                      onParameterChange(param.id, Number(e.target.value))
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100"
                  />
                ) : (
                  <input
                    type="text"
                    value={param.currentValue ?? ""}
                    onChange={(e) => onParameterChange(param.id, e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Advanced / Other Node Literals (Collapsible) */}
      {otherParams.length > 0 && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full px-4 py-3 text-left flex items-center justify-between text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800/40 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Wrench className="w-3.5 h-3.5 text-indigo-400" />
              Advanced Graph Inputs ({otherParams.length})
            </span>
            <ChevronDown
              className={`w-4 h-4 text-zinc-400 transition-transform ${
                showAdvanced ? "rotate-180" : ""
              }`}
            />
          </button>

          {showAdvanced && (
            <div className="p-4 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-950/40">
              {otherParams.map((param) => (
                <div key={param.id} className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/60">
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-zinc-300 font-medium truncate">
                      {param.label}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      #{param.nodeId} ({param.classType})
                    </span>
                  </div>

                  {param.type === "boolean" ? (
                    <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={Boolean(param.currentValue)}
                        onChange={(e) =>
                          onParameterChange(param.id, e.target.checked)
                        }
                        className="rounded border-zinc-700 bg-zinc-950 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>{param.currentValue ? "True / Enabled" : "False / Disabled"}</span>
                    </label>
                  ) : param.type === "number" ? (
                    <input
                      type="number"
                      step={param.step || 1}
                      value={param.currentValue ?? ""}
                      onChange={(e) =>
                        onParameterChange(param.id, Number(e.target.value))
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded px-2.5 py-1.5 text-xs font-mono text-zinc-100"
                    />
                  ) : (
                    <input
                      type="text"
                      value={param.currentValue ?? ""}
                      onChange={(e) => onParameterChange(param.id, e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded px-2.5 py-1.5 text-xs font-mono text-zinc-100"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
