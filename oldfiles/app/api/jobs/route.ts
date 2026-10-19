import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  cancelRender,
  listActiveRenders,
  pumpQueue,
  queueEnabled,
  resolveRender,
  toView,
} from "@/lib/renderQueue";

export const runtime = "nodejs";

/**
 * The caller's unfinished jobs.
 *
 * This is what makes a render survive a refresh or a closed tab. Until now the
 * ComfyUI prompt id lived only in React state, so reloading the page lost the
 * job entirely — it kept rendering on the GPU with nobody left watching. Now the
 * job is a row, and the studio asks for it on mount.
 *
 * Also takes a turn of the queue, so simply opening the studio helps drain it.
 */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // No database means no rows to resume from. An empty list rather than an error:
  // the studio treats "nothing to resume" as the normal case, and on this path it
  // always is.
  if (!queueEnabled()) {
    return NextResponse.json({ jobs: [] });
  }

  const rows = await listActiveRenders(user.id);
  if (rows === null) {
    return NextResponse.json(
      { error: "Couldn't read the render queue. Has 004 been run?" },
      { status: 502 },
    );
  }

  // Settle any that have finished since the last look, before pumping — a job
  // that just completed frees the slot the pump is about to fill.
  const resolved = await Promise.all(rows.map(resolveRender));

  await pumpQueue();

  // Re-listed rather than reusing `resolved`, because the pump may have just
  // dispatched one of these very rows.
  const after = (await listActiveRenders(user.id)) ?? resolved;

  return NextResponse.json({ jobs: await Promise.all(after.map(toView)) });
}

/**
 * Withdraw a queued job.
 *
 * Only works before dispatch: a render already on the GPU has burned time that
 * can't be given back, so there is deliberately no way to interrupt one. The 409
 * says so plainly rather than pretending the cancel worked.
 */
export async function DELETE(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing job id." }, { status: 400 });
  }

  const row = await cancelRender(id, user.id);
  if (!row) {
    return NextResponse.json(
      { error: "That job has already started or finished — too late to cancel it." },
      { status: 409 },
    );
  }

  return NextResponse.json({ job: await toView(row) });
}
