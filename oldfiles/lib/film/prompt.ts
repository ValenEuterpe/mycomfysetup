/**
 * Assemble the filmmaking desk into the single prompt MiniMax H3 actually takes.
 *
 * Two input modes, one output string:
 * - simple: the box is the prompt; style/scene/ambience prepend if filled
 * - beats: timed units with action + in-beat dialogue + foley
 */

export type PromptMode = "simple" | "beats";

export type ActionSpan = {
  id: string;
  from: number;
  to: number;
  text: string;
  dialogue: string;
  foley: string;
};

export type FilmPromptInput = {
  style: string;
  context: string;
  mode: PromptMode;
  simplePrompt: string;
  spans: ActionSpan[];
  ambience: string;
};

/** Longest prompt the queue will store. Keep in step with enqueueRender. */
export const MAX_PROMPT_CHARS = 4000;

function trim(value: string): string {
  return value.trim();
}

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0";
  const rounded = Math.round(seconds * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function spanBlock(span: ActionSpan): string | null {
  const action = trim(span.text);
  const dialogue = trim(span.dialogue);
  const foley = trim(span.foley);
  if (!action && !dialogue && !foley) return null;
  const lines = [`[${fmtTime(span.from)}-${fmtTime(span.to)}s]`];
  if (action) lines.push(`Action: ${action}`);
  if (dialogue) lines.push(`Dialogue: ${dialogue}`);
  if (foley) lines.push(`Foley: ${foley}`);
  return lines.join("\n");
}

function styleScenePrefix(style: string, context: string): string[] {
  const parts: string[] = [];
  const s = trim(style);
  const c = trim(context);
  if (s) parts.push(`[Style]\n${s}`);
  if (c) parts.push(`[Scene]\n${c}`);
  return parts;
}

export function assembleBeatsBody(spans: ActionSpan[]): string {
  return spans.map(spanBlock).filter((block): block is string => block !== null).join("\n\n");
}

export function assembleFilmPrompt(input: FilmPromptInput): string {
  const parts = styleScenePrefix(input.style, input.context);

  if (input.mode === "simple") {
    const body = trim(input.simplePrompt);
    if (body) parts.push(body);
  } else {
    const beats = assembleBeatsBody(input.spans);
    if (beats) parts.push(beats);
  }

  const ambience = trim(input.ambience);
  if (ambience) parts.push(`[Ambience]\n${ambience}`);

  return parts.join("\n\n");
}

export function promptIsEmpty(input: FilmPromptInput): boolean {
  if (input.mode === "simple") return trim(input.simplePrompt).length === 0;
  return assembleBeatsBody(input.spans).length === 0;
}

export function newActionSpan(
  from: number,
  to: number,
  text = "",
  dialogue = "",
  foley = "",
): ActionSpan {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `span-${from}-${to}`,
    from,
    to,
    text,
    dialogue,
    foley,
  };
}
