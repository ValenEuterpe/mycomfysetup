import { NextRequest, NextResponse } from "next/server";
import { reapStale } from "@/lib/renderQueue";

export const runtime = "nodejs";

/**
 * Without this Next prerenders the route and *runs the reaper during the build*,
 * which would sweep the live queue every time you deploy. It only ever expires
 * work that has already timed out, so the damage is bounded — but a build is not
 * a scheduled job and must not behave like one.
 */
export const dynamic = "force-dynamic";

/**
 * Janitor for rows nobody came back for.
 *
 * Explicitly a backstop, not the mechanism. The queue is drained by the pump
 * inside ordinary requests — Vercel has no background worker, so whoever is on
 * the site moves the line along. On the free tier cron runs once a day with up to
 * an hour of drift, which is far too coarse to dispatch renders with, but exactly
 * right for sweeping up:
 *
 * - `dispatched` rows past the timeout. Usually a ComfyUI restart, which loses
 *   the job from its in-memory history and would otherwise leave the row
 *   in-flight forever, permanently consuming a concurrency slot. Failed, and the
 *   render refunded.
 * - `queued` rows older than a day. Abandoned. Cancelled rather than dispatched,
 *   so nothing surfaces and renders long after anyone cares.
 *
 * Vercel signs cron invocations with CRON_SECRET when it's set. Without it this
 * endpoint is unauthenticated — harmless in itself, since it only ever expires
 * work that has already timed out, but it should be set so nobody can poke it.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Not authorised." }, { status: 401 });
    }
  }

  const result = await reapStale();
  return NextResponse.json({ ok: true, ...result });
}
