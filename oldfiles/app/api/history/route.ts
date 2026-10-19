import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listRenders, queueEnabled, toView } from "@/lib/renderQueue";

export const runtime = "nodejs";

/**
 * The caller's own render history.
 *
 * Distinct from /api/admin/users/[id]/prompts, which is owner-only and reads
 * anyone's log. This one is scoped to whoever is asking and needs no privilege.
 *
 * Metadata only — the videos are cached in the browser (see lib/mediaCache.ts).
 * `videoUrl` is still returned for finished rows, so an entry whose blob has been
 * evicted or cleared can fall back to streaming from the ComfyUI box while the
 * file is still there. That is the difference between history that degrades to
 * "video no longer cached" and history that degrades to nothing.
 *
 * Deliberately no pumpQueue() here: this page shows finished work, and someone
 * reading their history isn't necessarily waiting on anything. The studio's own
 * routes do the pumping.
 */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // History is the queue table read backwards, so without a database there is
  // none. Empty rather than an error — the page then shows its "nothing yet"
  // state, which is accurate.
  if (!queueEnabled()) {
    return NextResponse.json({ entries: [] });
  }

  const rows = await listRenders(user.id);
  if (rows === null) {
    return NextResponse.json(
      { error: "Couldn't read your history. Has 004 been run?" },
      { status: 502 },
    );
  }

  return NextResponse.json({ entries: await Promise.all(rows.map(toView)) });
}
