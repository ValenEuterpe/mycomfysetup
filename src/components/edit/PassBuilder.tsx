import React, { useState } from "react";
import {
  Layers,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Boxes,
  UserRound,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Circle,
} from "lucide-react";
import { Entity } from "../../types/entity";
import { EntityPickerModal } from "./EntityPickerModal";
import { fillPromptTemplate } from "../../lib/krea2EditWorkflow";

export interface EditPass {
  id: string;
  entityId: string | null;
  placement: string;
  /** template supporting [NAME] placeholder for the entity name */
  prompt: string;
}

export type PassRunStatus = "pending" | "running" | "done" | "failed";

export interface PassStateInfo {
  status: PassRunStatus;
  message?: string;
  mediaCount?: number;
}

interface PassBuilderProps {
  passes: EditPass[];
  onUpdate: (passes: EditPass[]) => void;
  entities: Entity[];
  placementOptions: string[];
  animation?: boolean;
  disabled?: boolean;
  running?: boolean;
  passStates: Record<string, PassStateInfo>;
}

export const newPass = (): EditPass => ({
  id: `pass_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  entityId: null,
  placement: "beside",
  prompt: "",
});

const PASS_PROMPT_PLACEHOLDER =
  'e.g. "Full body, [NAME] sits astride a brown horse on the left side of the field, wearing a waxed brown coat, holding the reins."';

export const PassBuilder: React.FC<PassBuilderProps> = ({
  passes,
  onUpdate,
  entities,
  placementOptions,
  disabled,
  running,
  passStates,
}) => {
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const update = (id: string, changes: Partial<EditPass>) => {
    onUpdate(passes.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  };

  const remove = (id: string) => onUpdate(passes.filter((p) => p.id !== id));

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= passes.length) return;
    const next = [...passes];
    [next[index], next[target]] = [next[target], next[index]];
    onUpdate(next);
  };

  const entityMap = new Map(entities.map((e) => [e.id, e]));

  if (passes.length === 0) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onUpdate([newPass()])}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-zinc-800 hover:border-fuchsia-500/40 text-xs text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40"
      >
        <Layers className="w-4 h-4 text-fuchsia-400" />
        Add multi-pass steps (place several characters one pass at a time)
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {passes.map((pass, i) => {
        const entity = pass.entityId ? entityMap.get(pass.entityId) : undefined;
        const state = passStates[pass.id];
        const p = fillPromptTemplate(pass.prompt, entity?.name || "[NAME]");
        const previewVisible = pass.prompt.includes("[NAME]") && entity;

        return (
          <div
            key={pass.id}
            className={`relative rounded-xl border bg-zinc-900/70 transition-all ${
              state?.status === "running"
                ? "border-indigo-500/60 ring-1 ring-indigo-500/30"
                : state?.status === "done"
                ? "border-emerald-500/40"
                : state?.status === "failed"
                ? "border-rose-500/40"
                : "border-zinc-800"
            }`}
          >
            {/* header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/70">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/20 flex items-center justify-center text-[10px] font-bold">
                  {i + 1}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
                  Pass {i + 1}
                </span>
                {state?.status === "running" && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                )}
                {state?.status === "done" && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
                {state?.status === "failed" && (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                )}
                {state?.status === "pending" && running && (
                  <Circle className="w-3 h-3 text-zinc-600" />
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={disabled || i === 0}
                  onClick={() => move(i, -1)}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                  title="Move up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={disabled || i === passes.length - 1}
                  onClick={() => move(i, 1)}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                  title="Move down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => remove(pass.id)}
                  className="p-1 rounded text-zinc-500 hover:text-rose-400 disabled:opacity-30"
                  title="Delete pass"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* body */}
            <div className="p-3 flex flex-col gap-2">
              <div className="flex gap-2">
                {/* entity chip/button */}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setPickerFor(pass.id)}
                  className={`flex flex-1 items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    entity
                      ? "bg-fuchsia-500/10 text-fuchsia-200 border-fuchsia-500/30"
                      : "bg-zinc-950/60 text-zinc-400 border-zinc-800 hover:border-fuchsia-500/40"
                  }`}
                  title="Pick the entity this pass adds"
                >
                  {entity ? (
                    <UserRound className="w-3.5 h-3.5" />
                  ) : (
                    <Boxes className="w-3.5 h-3.5" />
                  )}
                  <span className="truncate">{entity ? entity.name : "Pick entity (image 2)"}</span>
                </button>

                {/* placement */}
                <select
                  value={pass.placement}
                  disabled={disabled || !entity}
                  onChange={(e) => update(pass.id, { placement: e.target.value })}
                  className="px-2 py-2 rounded-lg bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-200 outline-none focus:border-indigo-500 disabled:opacity-40 cursor-pointer"
                  title="Where the person sits relative to the scene (ref_position)"
                >
                  {placementOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                value={pass.prompt}
                disabled={disabled}
                rows={2}
                placeholder={PASS_PROMPT_PLACEHOLDER}
                onChange={(e) => update(pass.id, { prompt: e.target.value })}
                className="w-full rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-fuchsia-500/50 resize-y"
              />

              {previewVisible && p !== pass.prompt && (
                <p className="text-[10px] text-zinc-500 bg-zinc-950/40 border border-zinc-800/60 rounded-lg px-2 py-1 font-mono line-clamp-2">
                  {p}
                </p>
              )}

              {state?.message && (
                <p
                  className={`text-[11px] px-2 py-1 rounded-lg border ${
                    state.status === "failed"
                      ? "text-rose-300 bg-rose-500/10 border-rose-500/20"
                      : "text-zinc-400 bg-zinc-950/40 border-zinc-800"
                  }`}
                >
                  {state.message}
                </p>
              )}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        disabled={disabled || running}
        onClick={() => onUpdate([...passes, newPass()])}
        className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors disabled:opacity-40"
      >
        <Plus className="w-3.5 h-3.5" />
        Add pass
      </button>

      <EntityPickerModal
        open={pickerFor !== null}
        title="Pick entity for this pass"
        selectedId={passes.find((p) => p.id === pickerFor)?.entityId}
        onClose={() => setPickerFor(null)}
        onSelect={(entity) => {
          if (pickerFor) update(pickerFor, { entityId: entity.id });
        }}
      />
    </div>
  );
};
