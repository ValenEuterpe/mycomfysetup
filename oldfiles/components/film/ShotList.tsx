"use client";

import type { Shot } from "@/lib/film/project";

const STATUS: Record<Shot["status"], string> = {
  draft: "draft",
  queued: "in queue",
  rendering: "rendering",
  done: "done",
  error: "failed",
};

type Props = {
  shots: Shot[];
  selectedId: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onContinue: () => void;
  canContinue: boolean;
  continueDisabledReason: string | null;
  busy: boolean;
  busyShotId: string | null;
};

export default function ShotList({
  shots,
  selectedId,
  onSelect,
  onRemove,
  onContinue,
  canContinue,
  continueDisabledReason,
  busy,
  busyShotId,
}: Props) {
  return (
    <div className="film-shots">
      <h2 className="film-col-title">Shots</h2>
      <ol className="film-shot-list">
        {shots.map((shot, i) => {
          const inflight = shot.id === busyShotId && (shot.status === "queued" || shot.status === "rendering");
          return (
            <li key={shot.id} className="film-shot-row">
              <button
                type="button"
                className={`film-shot-btn${shot.id === selectedId ? " is-selected" : ""}`}
                onClick={() => onSelect(shot.id)}
              >
                <span className="film-shot-index">{i + 1}</span>
                <span className="film-shot-meta">
                  <span className="film-shot-len">{shot.durationSeconds}s</span>
                  <span className={`film-shot-status film-shot-status-${shot.status}`}>
                    {STATUS[shot.status]}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="film-shot-remove"
                onClick={() => onRemove(shot.id)}
                disabled={inflight}
                aria-label={shots.length <= 1 ? "Clear this sequence" : `Remove shot ${i + 1}`}
                title={
                  inflight
                    ? "Cancel the render first"
                    : shots.length <= 1
                      ? "Clear this sequence"
                      : "Remove this shot"
                }
              >
                ×
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="film-continue"
        onClick={onContinue}
        disabled={!canContinue || busy}
      >
        Continue to next shot
      </button>
      {continueDisabledReason && <p className="field-help">{continueDisabledReason}</p>}
    </div>
  );
}
