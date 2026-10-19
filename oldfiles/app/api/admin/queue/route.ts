import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { shouldShowPrompts } from "@/lib/adminConfig";
import {
  failRenderAsAdmin,
  pumpQueue,
  queueDiagnostics,
  reapStale,
  requeueRender,
} from "@/lib/renderQueue";

export const runtime = "nodejs";

const forbidden = () => NextResponse.json({ error: "Owner access required." }, { status: 403 });

async function getSanitizedDiagnostics() {
  const diag = await queueDiagnostics();
  const showPrompts = shouldShowPrompts();
  if (!showPrompts) {
    diag.active = diag.active.map((row) => ({ ...row, prompt: null }));
  }
  return { ...diag, showPrompts };
}

export async function GET(req: NextRequest) {
  if (!(await requireOwner(req))) return forbidden();
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase isn't configured on the server." }, { status: 500 });
  }

  // Pump queue to clear any finished/idle items
  await pumpQueue();

  return NextResponse.json(await getSanitizedDiagnostics());
}

export async function POST(req: NextRequest) {
  if (!(await requireOwner(req))) return forbidden();
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase isn't configured on the server." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";
  const id = typeof body?.id === "string" ? body.id : "";

  switch (action) {
    case "pump":
    case "reconcile": {
      const row = await pumpQueue();
      return NextResponse.json({
        ok: true,
        dispatched: row ? { id: row.id, comfyPromptId: row.comfy_prompt_id } : null,
        diagnostics: await getSanitizedDiagnostics(),
      });
    }

    case "reap": {
      const result = await reapStale();
      return NextResponse.json({ ok: true, ...result, diagnostics: await getSanitizedDiagnostics() });
    }

    case "requeue": {
      if (!id) {
        return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
      }
      const row = await requeueRender(id);
      if (!row) {
        return NextResponse.json(
          { error: "Couldn't requeue that job — it may have already finished." },
          { status: 409 },
        );
      }
      await pumpQueue();
      return NextResponse.json({ ok: true, diagnostics: await getSanitizedDiagnostics() });
    }

    case "fail": {
      if (!id) {
        return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
      }
      const row = await failRenderAsAdmin(id);
      if (!row) {
        return NextResponse.json({ error: "No such job." }, { status: 404 });
      }
      await pumpQueue();
      return NextResponse.json({ ok: true, diagnostics: await getSanitizedDiagnostics() });
    }

    default:
      return NextResponse.json(
        { error: "action must be one of: pump, reconcile, reap, requeue, fail." },
        { status: 400 },
      );
  }
}
