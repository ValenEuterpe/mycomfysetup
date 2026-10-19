"use client";

import RatioPicker from "@/components/RatioPicker";
import {
  MAX_DURATION,
  MIN_DURATION,
  actualDuration,
  type AspectRatio,
} from "@/lib/aspect";
import { assembleFilmPrompt, newActionSpan, type ActionSpan, type PromptMode } from "@/lib/film/prompt";

type Props = {
  styleBible: string;
  onStyleBible: (value: string) => void;
  context: string;
  onContext: (value: string) => void;
  promptMode: PromptMode;
  onPromptMode: (mode: PromptMode) => void;
  simplePrompt: string;
  onSimplePrompt: (value: string) => void;
  spans: ActionSpan[];
  onSpans: (spans: ActionSpan[]) => void;
  ambience: string;
  onAmbience: (value: string) => void;
  duration: number;
  onDuration: (value: number) => void;
  ratio: AspectRatio;
  onRatio: (value: AspectRatio) => void;
  ratioLocked: boolean;
  fast: boolean;
  onFast: (value: boolean) => void;
  canDisableFastMode: boolean;
  busy: boolean;
  atLimit: boolean;
  quotaNote: string | null;
  atLimitNote: boolean;
  submitLabel: string;
  costNote: string;
  intent: string;
  onIntent: (value: string) => void;
  onEnhance: () => void;
  enhancing: boolean;
  enhancerReady: boolean;
};

export default function PromptDesk({
  styleBible,
  onStyleBible,
  context,
  onContext,
  promptMode,
  onPromptMode,
  simplePrompt,
  onSimplePrompt,
  spans,
  onSpans,
  ambience,
  onAmbience,
  duration,
  onDuration,
  ratio,
  onRatio,
  ratioLocked,
  fast,
  onFast,
  canDisableFastMode,
  busy,
  atLimit,
  quotaNote,
  atLimitNote,
  submitLabel,
  costNote,
  intent,
  onIntent,
  onEnhance,
  enhancing,
  enhancerReady,
}: Props) {
  const snapped = actualDuration(duration);
  const durationNote =
    Math.abs(snapped - duration) < 0.05 ? null : `Rounds up to ${snapped.toFixed(2)}s`;

  const updateSpan = (id: string, patch: Partial<ActionSpan>) =>
    onSpans(spans.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addSpan = () => {
    const last = spans[spans.length - 1];
    const from = last ? last.to : 0;
    const to = Math.min(duration, from + Math.max(1, duration - from) || duration);
    onSpans([...spans, newActionSpan(from, to || duration)]);
  };

  const switchMode = (next: PromptMode) => {
    if (next === promptMode) return;
    if (next === "beats" && simplePrompt.trim() && !spans.some((s) => s.text.trim())) {
      const first = spans[0] ?? newActionSpan(0, duration);
      onSpans([{ ...first, text: simplePrompt }]);
    }
    if (next === "simple" && !simplePrompt.trim()) {
      onSimplePrompt(
        assembleFilmPrompt({
          style: "",
          context: "",
          mode: "beats",
          simplePrompt: "",
          spans,
          ambience: "",
        }),
      );
    }
    onPromptMode(next);
  };

  return (
    <div className="film-desk">
      <div className="field">
        <label htmlFor="film-style">Style</label>
        <p className="field-help">Look, lens, grade. Carried every shot — “keep the same style.”</p>
        <textarea
          id="film-style"
          value={styleBible}
          onChange={(e) => onStyleBible(e.target.value)}
          placeholder="35mm, overcast daylight, muted teal-and-amber grade, shallow depth of field…"
          disabled={busy}
        />
      </div>

      <div className="field">
        <label htmlFor="film-scene">Scene</label>
        <p className="field-help">Who, wardrobe, where, time of day. Edit only when the world changes.</p>
        <textarea
          id="film-scene"
          value={context}
          onChange={(e) => onContext(e.target.value)}
          placeholder="A woman in a wool coat, kitchen at night, fluorescent under-cabinet light…"
          disabled={busy}
        />
      </div>

      <div className="field">
        <label>Prompt</label>
        <div className="film-mode-toggle" role="tablist" aria-label="Prompt mode">
          <button
            type="button"
            role="tab"
            aria-selected={promptMode === "simple"}
            className={promptMode === "simple" ? "is-active" : ""}
            onClick={() => switchMode("simple")}
            disabled={busy}
          >
            Simple
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={promptMode === "beats"}
            className={promptMode === "beats" ? "is-active" : ""}
            onClick={() => switchMode("beats")}
            disabled={busy}
          >
            Beats
          </button>
        </div>
      </div>

      {promptMode === "simple" ? (
        <div className="field">
          <textarea
            id="film-simple"
            value={simplePrompt}
            onChange={(e) => onSimplePrompt(e.target.value)}
            placeholder="The full prompt for this shot. Style and scene above are prepended if filled."
            disabled={busy}
          />
        </div>
      ) : (
        <div className="field">
          <p className="field-help">
            One beat per span. Dialogue belongs in the beat it is spoken — not in a separate box.
          </p>
          <div className="film-spans">
            {spans.map((span) => (
              <div key={span.id} className="film-span">
                <div className="film-span-times">
                  <input
                    type="number"
                    min={0}
                    max={duration}
                    step={0.5}
                    value={span.from}
                    onChange={(e) => updateSpan(span.id, { from: Number(e.target.value) })}
                    disabled={busy}
                    aria-label="From seconds"
                  />
                  <span className="film-span-dash">–</span>
                  <input
                    type="number"
                    min={0}
                    max={duration}
                    step={0.5}
                    value={span.to}
                    onChange={(e) => updateSpan(span.id, { to: Number(e.target.value) })}
                    disabled={busy}
                    aria-label="To seconds"
                  />
                  <span className="film-span-unit">s</span>
                  {spans.length > 1 && (
                    <button
                      type="button"
                      className="film-span-remove"
                      onClick={() => onSpans(spans.filter((s) => s.id !== span.id))}
                      disabled={busy}
                      aria-label="Remove beat"
                    >
                      ×
                    </button>
                  )}
                </div>
                <textarea
                  className="film-span-text"
                  value={span.text}
                  onChange={(e) => updateSpan(span.id, { text: e.target.value })}
                  placeholder="Action — what happens in this window"
                  disabled={busy}
                />
                <textarea
                  className="film-span-text film-span-dialogue"
                  value={span.dialogue}
                  onChange={(e) => updateSpan(span.id, { dialogue: e.target.value })}
                  placeholder="Dialogue — who, the line, the delivery. Empty if silent."
                  disabled={busy}
                />
                <textarea
                  className="film-span-text film-span-foley"
                  value={span.foley}
                  onChange={(e) => updateSpan(span.id, { foley: e.target.value })}
                  placeholder="Foley — footsteps, cloth, a latch. Empty if none."
                  disabled={busy}
                />
              </div>
            ))}
          </div>
          <button type="button" className="film-add-span" onClick={addSpan} disabled={busy}>
            Add beat
          </button>
        </div>
      )}

      <div className="field">
        <label htmlFor="film-ambience">Ambience</label>
        <textarea
          id="film-ambience"
          className="film-audio-box"
          value={ambience}
          onChange={(e) => onAmbience(e.target.value)}
          placeholder="Room tone, rain, distant traffic. Carries into the next shot."
          disabled={busy}
        />
      </div>

      <div className="field">
        <label htmlFor="film-intent">Enhance from a short note</label>
        <textarea
          id="film-intent"
          className="film-audio-box"
          value={intent}
          onChange={(e) => onIntent(e.target.value)}
          placeholder="woman in a kitchen at night, she hears something outside, looks at the door"
          disabled={busy || enhancing}
        />
        <button
          type="button"
          className="film-enhance"
          onClick={onEnhance}
          disabled={busy || enhancing || !enhancerReady || !intent.trim()}
        >
          {enhancing ? "Enhancing…" : enhancerReady ? "Enhance prompt" : "Enhancer not configured"}
        </button>
        <p className="field-help">
          Fills style, scene, and {promptMode === "simple" ? "the prompt" : "the beats"}. You edit before generating.
        </p>
      </div>

      <div className="field">
        <label id="film-ratio-label">Aspect ratio</label>
        <RatioPicker
          value={ratio}
          onChange={(value) => {
            if (value === "auto") return;
            onRatio(value);
          }}
          disabled={busy || ratioLocked}
        />
        {ratioLocked && (
          <p className="field-help">Locked for this sequence — a mid-chain ratio change would stretch the anchor.</p>
        )}
      </div>

      <div className="field">
        <label htmlFor="film-duration">Duration — {duration}s</label>
        <input
          id="film-duration"
          type="range"
          className="duration-slider"
          min={MIN_DURATION}
          max={MAX_DURATION}
          step={1}
          value={duration}
          onChange={(e) => onDuration(Number(e.target.value))}
          disabled={busy}
        />
        <div className="duration-scale" aria-hidden="true">
          <span>{MIN_DURATION}s</span>
          <span>{MAX_DURATION}s</span>
        </div>
        {durationNote && <p className="field-help">{durationNote}</p>}
      </div>

      {canDisableFastMode ? (
        <details className="advanced">
          <summary>Advanced settings</summary>
          <div className="field advanced-field">
            <label htmlFor="film-fast" className="checkbox-label">
              <input
                id="film-fast"
                type="checkbox"
                checked={fast}
                onChange={(e) => onFast(e.target.checked)}
                disabled={busy}
              />
              Fast mode
            </label>
            <p className="field-help">
              8-step turbo LoRA — quicker render, softer detail. Uncheck for a full 20-step render.
            </p>
          </div>
        </details>
      ) : (
        <p className="fast-note">
          <span className="fast-note-icon" aria-hidden="true">
            ⚡
          </span>
          Fast mode: on — 8-step turbo render
        </p>
      )}

      <button className="generate" type="submit" disabled={busy || atLimit}>
        {submitLabel}
      </button>
      <p className="field-help">{costNote}</p>

      {quotaNote && (
        <p className={atLimitNote ? "quota-note quota-note-full" : "quota-note"}>{quotaNote}</p>
      )}
    </div>
  );
}
