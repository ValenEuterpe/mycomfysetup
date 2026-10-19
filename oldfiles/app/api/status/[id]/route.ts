import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  directPromptId,
  getRenderForUser,
  isDirectId,
  pumpQueue,
  queueEnabled,
  resolveDirect,
  resolveRender,
  toView,
} from "@/lib/renderQueue";

export const runtime = "nodejs";

/**
 * Where one job stands, and — as a side effect — a turn of the queue.
 *
 * `id` is our queue row id, not ComfyUI's prompt id. A queued job doesn't have a
 * ComfyUI id yet, which is the whole reason the client can't poll ComfyUI
 * directly any more.
 *
 * The pump is what makes the queue drain without a background worker: Vercel has
 * no long-running process, so every authenticated request takes one turn. A user
 * polling their own job therefore also starts the next person's, and the queue
 * moves for as long as anyone is watching anything.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // The no-database path: the id is a raw ComfyUI prompt id, there is no row, and
  // ComfyUI's own history is the only source of truth. See queueEnabled().
  if (isDirectId(params.id)) {
    const resolved = await resolveDirect(directPromptId(params.id));
    return NextResponse.json({
      job: {
        id: params.id,
        // `pending` means ComfyUI hasn't reported an outcome yet, which on this
        // path is indistinguishable from rendering — there is no queue to be
        // waiting in.
        status: resolved.status === "pending" ? "dispatched" : resolved.status,
        videoUrl: resolved.videoUrl,
        error: resolved.error,
        width: null,
        height: null,
      },
    });
  }

  if (!queueEnabled()) {
    return NextResponse.json({ error: "No such job." }, { status: 404 });
  }

  // Scoped to the caller. Job ids travel in URLs, so a row belonging to someone
  // else is indistinguishable from one that doesn't exist.
  const row = await getRenderForUser(params.id, user.id);
  if (!row) {
    return NextResponse.json({ error: "No such job." }, { status: 404 });
  }

  // Ask ComfyUI about this job before pumping, so a slot freed by this very job
  // finishing is available to the pump on the same request.
  const resolved = await resolveRender(row);

  // Never allowed to fail the response: the caller's own answer is already in
  // hand, and a queue hiccup must not turn their status check into an error.
  await pumpQueue();

  // Re-read only when the pump could have changed this row — that is, when it was
  // still waiting. Anything else is already settled.
  const fresh =
    resolved.status === "queued" ? (await getRenderForUser(params.id, user.id)) ?? resolved : resolved;

  return NextResponse.json({ job: await toView(fresh) });
}
