import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { capabilitiesFor } from "@/lib/permissions";
import { MAX_DURATION, MIN_DURATION, isValidDuration } from "@/lib/aspect";

export const runtime = "nodejs";

const BASE_URL = process.env.FILM_ENHANCE_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
const API_KEY = process.env.FILM_ENHANCE_API_KEY?.trim() ?? "";
const MODEL = process.env.FILM_ENHANCE_MODEL?.trim() ?? "";

function enhancerConfigured(): boolean {
  return Boolean(BASE_URL && API_KEY && MODEL);
}

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 20;
const hits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  return false;
}

const SYSTEM = `You are a prompt engineer for MiniMax H3, a joint audio-video model.
The user gives a short intent. You return a production-ready H3 prompt as JSON only.

Rules:
- H3 front-loads action. Never write "then, then, then" paragraphs. Use chronological time spans.
- Joint A/V: every beat needs sound or an explicit silence. Name dialogue (who, line, delivery), foley, and ambience.
- Anatomy: body, face, hands, wardrobe. Identity drifts without it.
- Camera: one move per beat. No stacked crane+dolly+whip.
- Lighting: direction, quality, colour. Ban the word "cinematic" as a token.
- If hasFirstFrame is true: do not re-describe the opening still as a new scene. Describe motion FROM it.
- If previousAssembled is present: continue identity, wardrobe, and space. Only the new action changes.
- Style is look/lens/grade. Scene is who/where/when. Keep them distinct.
- Keep the assembled result under 3500 characters.
- Output JSON only, no markdown, matching the schema exactly.

Schema:
{
  "style": string,
  "scene": string,
  "simplePrompt": string,
  "beats": [{ "from": number, "to": number, "action": string, "dialogue": string, "foley": string }],
  "ambience": string
}

When mode is "simple", fill simplePrompt with the full chronological prompt body (not including style/scene/ambience headings) and still fill beats as a best-effort breakdown.
When mode is "beats", fill beats covering 0..durationSeconds with no gaps, and still fill simplePrompt as a flattened fallback.
Empty dialogue or foley is "".`;

type Beat = { from: number; to: number; action: string; dialogue: string; foley: string };

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseBeats(raw: unknown, duration: number): Beat[] {
  if (!Array.isArray(raw)) return [];
  const beats: Beat[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const from = asNumber(row.from) ?? 0;
    const to = asNumber(row.to) ?? duration;
    beats.push({
      from: Math.max(0, Math.min(duration, from)),
      to: Math.max(0, Math.min(duration, to)),
      action: asString(row.action),
      dialogue: asString(row.dialogue),
      foley: asString(row.foley),
    });
  }
  return beats;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!capabilitiesFor(user).canAccessFilmmaking) {
    return NextResponse.json({ error: "Filmmaking is not enabled for this account." }, { status: 403 });
  }
  return NextResponse.json({ configured: enhancerConfigured() });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!capabilitiesFor(user).canAccessFilmmaking) {
    return NextResponse.json({ error: "Filmmaking is not enabled for this account." }, { status: 403 });
  }
  if (!enhancerConfigured()) {
    return NextResponse.json({ error: "Prompt enhancer isn't configured on the server." }, { status: 503 });
  }
  if (rateLimited(user.id)) {
    return NextResponse.json({ error: "Enhancer rate limit reached. Try again in an hour." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const intent = typeof body.intent === "string" ? body.intent.trim() : "";
  if (!intent) return NextResponse.json({ error: "Write a short note to enhance." }, { status: 400 });
  if (intent.length > 2000) {
    return NextResponse.json({ error: "That note is too long (2000 characters max)." }, { status: 400 });
  }

  const mode = body.mode === "simple" ? "simple" : "beats";
  const duration = Number(body.durationSeconds);
  if (!isValidDuration(duration)) {
    return NextResponse.json(
      { error: `Duration must be between ${MIN_DURATION} and ${MAX_DURATION} seconds.` },
      { status: 400 },
    );
  }

  const payload = {
    intent,
    mode,
    durationSeconds: duration,
    hasFirstFrame: body.hasFirstFrame === true,
    style: typeof body.style === "string" ? body.style.slice(0, 2000) : "",
    scene: typeof body.scene === "string" ? body.scene.slice(0, 2000) : "",
    previousAssembled:
      typeof body.previousAssembled === "string" ? body.previousAssembled.slice(0, 4000) : "",
  };

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: JSON.stringify(payload) },
  ];

  async function complete(withJsonFormat: boolean): Promise<Response> {
    return fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        ...(withJsonFormat ? { response_format: { type: "json_object" } } : {}),
        messages,
      }),
    });
  }

  let completion: Response;
  try {
    completion = await complete(true);
    // Some OpenAI-compatible providers reject response_format. Retry once without it.
    if (!completion.ok && (completion.status === 400 || completion.status === 422)) {
      completion = await complete(false);
    }
  } catch (err) {
    console.error("[film/enhance] provider unreachable:", err);
    return NextResponse.json({ error: "Couldn't reach the enhancer." }, { status: 502 });
  }

  if (!completion.ok) {
    const detail = await completion.text().catch(() => "");
    console.error("[film/enhance] provider error:", completion.status, detail.slice(0, 500));
    return NextResponse.json({ error: "The enhancer refused that request." }, { status: 502 });
  }

  const data = await completion.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "The enhancer returned an empty prompt." }, { status: 502 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = extractJson(text) as Record<string, unknown>;
  } catch {
    console.error("[film/enhance] non-JSON response");
    return NextResponse.json({ error: "The enhancer returned something we couldn't use." }, { status: 502 });
  }

  return NextResponse.json({
    style: asString(parsed.style),
    scene: asString(parsed.scene),
    simplePrompt: asString(parsed.simplePrompt),
    beats: parseBeats(parsed.beats, duration),
    ambience: asString(parsed.ambience),
  });
}
