"use client";

/**
 * The queue, for the owner.
 *
 * Written after a stall that couldn't be diagnosed from the outside: rows sitting
 * in `queued`, ComfyUI idle, and no way to tell whether a phantom in-flight row
 * was holding the only slot, a migration hadn't been run, or PostgREST couldn't
 * see the claim function. All three look identical from the user's side.
 *
 * So the layout leads with the comparison that explains most stalls — what we
 * think is on the GPU versus what ComfyUI says it has — and puts the RPC probe
 * right underneath it.
 */

import { useCallback, useEffect, useState } from "react";
import { useApiKey } from "./ApiKeyProvider";

type QueueRow = {
  id: string;
  user_id: string;
  status: string;
  prompt: string | null;
  type: string;
  aspect_ratio: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  comfy_prompt_id: string | null;
  error: string | null;
  last_error: string | null;
  attempts: number;
  created_at: string;
  dispatched_at: string | null;
  requeued_at: string | null;
};

type Diagnostics = {
  counts: Record<string, number>;
  active: QueueRow[];
  /** Owner and rank per active row, keyed by queue row id. Rank is null by default. */
  owners: Record<string, { username: string | null; rank: number | null }>;
  maxConcurrent: number;
  inFlight: number;
  /** In-flight rows ComfyUI denies knowing, old enough to be genuinely stuck. */
  blocked: number;
  /** In-flight rows ComfyUI hasn't registered yet. Normal; clears itself. */
  settling: number;
  comfy: { running: string[]; pending: string[]; error: string | null };
  rpcs: { name: string; ok: boolean; error: string | null }[];
  showPrompts?: boolean;
};

function ago(value: string | null): string {
  if (!value) return "—";
  const then = Date.parse(value);
  if (!Number.isFinite(then)) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h ago`;
}

/** Longer than this and the cell gets a snippet with an expand toggle. */
const SNIPPET_CHARS = 90;

/**
 * A prompt is often several hundred characters, which at full length pushes every
 * other column — status, age, the ComfyUI id, the actions — off the useful part of
 * the row. Collapsed by default so the table stays scannable, expandable in place
 * for when the text is what you're after.
 */
function PromptCell({ text }: { text: string | null }) {
  const [open, setOpen] = useState(false);

  if (!text) return <td className="queue-prompt-cell">—</td>;

  const long = text.length > SNIPPET_CHARS;
  if (!long) return <td className="queue-prompt-cell">{text}</td>;

  return (
    <td className="queue-prompt-cell">
      <span className={open ? "queue-prompt-full" : "queue-prompt-snippet"}>
        {open ? text : `${text.slice(0, SNIPPET_CHARS).trimEnd()}…`}
      </span>
      <button
        type="button"
        className="queue-prompt-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "Show less" : "Show more"}
      </button>
    </td>
  );
}

export default function AdminQueue() {
  const { authFetch } = useApiKey();

  const [data, setData] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/admin/queue");
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Couldn't read the queue.");
      setData(body as Diagnostics);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
    // Slow enough not to hammer ComfyUI's /queue, quick enough to watch a stall
    // clear after pressing something.
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  const act = async (action: string, id?: string) => {
    setBusy(id ? `${action}:${id}` : action);
    setNote(null);
    try {
      const res = await authFetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "That action failed.");

      if (body.diagnostics) setData(body.diagnostics as Diagnostics);

      if (action === "pump") {
        setNote(body.dispatched ? `Dispatched ${body.dispatched.id.slice(0, 8)}.` : "Nothing to dispatch.");
      } else if (action === "reconcile") {
        setNote(body.freed ? `Settled ${body.freed} in-flight job(s).` : "Nothing to settle.");
      } else if (action === "reap") {
        setNote(
          `Reconciled ${body.reconciled}, failed ${body.failed}, expired ${body.expired}.`,
        );
      } else {
        setNote("Done.");
      }
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const brokenRpcs = (data?.rpcs ?? []).filter((r) => !r.ok);

  // Decided on the server, which has the reconciler's rules and the grace period.
  // The first version of this panel inferred it here as "we think something is
  // rendering and ComfyUI's queue is empty" — and cried wolf, because a *finished*
  // render is also absent from the live queue. It reported a blocked queue for a
  // video that had rendered perfectly well.
  const blocked = data?.blocked ?? 0;

  return (
    <section className="admin-queue">
      <h2 className="admin-section-title">Render queue</h2>

      {error && <div className="error-box">{error}</div>}

      {data === null ? (
        <div className="beam" />
      ) : (
        <>
          <div className="panel queue-diag">
            <div className="queue-diag-figures">
              <div className="stat">
                <span className="stat-label">Waiting</span>
                <span className="stat-value">{data.counts.queued ?? 0}</span>
              </div>
              <div className="stat">
                <span className="stat-label">On the GPU (ours)</span>
                <span className={blocked > 0 ? "stat-value stat-value-full" : "stat-value"}>
                  {data.inFlight}
                  <span className="stat-of"> of {data.maxConcurrent}</span>
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">ComfyUI running / pending</span>
                <span className="stat-value">
                  {data.comfy.error ? "—" : `${data.comfy.running.length} / ${data.comfy.pending.length}`}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Done</span>
                <span className="stat-value">{data.counts.done ?? 0}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Failed</span>
                <span className="stat-value">{data.counts.error ?? 0}</span>
              </div>
            </div>

            {blocked > 0 && (
              <div className="queue-warning">
                <strong>{blocked} job{blocked === 1 ? " is" : "s are"} stuck.</strong> Marked as
                rendering, but ComfyUI has no record of {blocked === 1 ? "it" : "them"} — no longer
                running, not waiting, and nothing in its history. With a limit of{" "}
                {data.maxConcurrent}, that holds a slot for nothing. Reconcile clears it, and the
                pump does this automatically on each request, so it should not persist.
              </div>
            )}

            {/* Absent from ComfyUI's live queue but too new to judge. Called out so
                it doesn't look like the warning above with a number missing. */}
            {blocked === 0 && data.settling > 0 && (
              <div className="queue-note-block">
                {data.settling} job{data.settling === 1 ? "" : "s"} just sent — ComfyUI hasn&apos;t
                registered {data.settling === 1 ? "it" : "them"} yet. Normal; no action needed.
              </div>
            )}

            {data.comfy.error && (
              <div className="queue-warning">
                <strong>ComfyUI is unreachable:</strong> {data.comfy.error}
                <br />
                Nothing will dispatch until it responds. Jobs stay queued and keep their place — this
                is not data loss.
              </div>
            )}

            {brokenRpcs.length > 0 && (
              <div className="queue-warning">
                <strong>
                  {brokenRpcs.length} database function{brokenRpcs.length === 1 ? "" : "s"} not
                  callable.
                </strong>{" "}
                This alone stops the queue dead. Run the missing migration
                (004/005), then reload PostgREST&apos;s schema cache with{" "}
                <code>notify pgrst, &apos;reload schema&apos;;</code>
                <ul className="queue-rpc-list">
                  {brokenRpcs.map((r) => (
                    <li key={r.name}>
                      <code>{r.name}</code> — {r.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="queue-actions">
              <button
                type="button"
                className="queue-action"
                onClick={() => act("pump")}
                disabled={busy !== null}
              >
                {busy === "pump" ? "Dispatching…" : "Dispatch now"}
              </button>
              <button
                type="button"
                className="queue-action"
                onClick={() => act("reconcile")}
                disabled={busy !== null}
              >
                {busy === "reconcile" ? "Reconciling…" : "Collect finished / free stuck"}
              </button>
              <button
                type="button"
                className="queue-action"
                onClick={() => act("reap")}
                disabled={busy !== null}
              >
                {busy === "reap" ? "Sweeping…" : "Run full sweep"}
              </button>
              <button type="button" className="queue-action" onClick={load} disabled={busy !== null}>
                Refresh
              </button>
              {note && <span className="queue-note-inline">{note}</span>}
            </div>

            {/* Confirms the probe ran and everything is wired up, so a green
                readout is as informative as a red one. */}
            {brokenRpcs.length === 0 && (
              <p className="queue-rpc-ok">All {data.rpcs.length} queue functions callable.</p>
            )}
          </div>

          {data.active.length === 0 ? (
            <p className="queue-empty">Nothing queued or rendering.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>User</th>
                    {data.showPrompts !== false && <th>Prompt</th>}
                    <th>Output</th>
                    <th>Age</th>
                    <th>Tries</th>
                    <th>ComfyUI id</th>
                    <th>Last problem</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.active.map((row) => {
                    const known =
                      row.comfy_prompt_id !== null &&
                      (data.comfy.running.includes(row.comfy_prompt_id) ||
                        data.comfy.pending.includes(row.comfy_prompt_id));

                    // Same rule the server uses for `blocked`: unknown to ComfyUI
                    // *and* old enough that it would have registered by now.
                    // Without the age test a healthy just-dispatched job — and a
                    // finished one — both get flagged as broken.
                    const sentAt = row.dispatched_at ? Date.parse(row.dispatched_at) : NaN;
                    const settled = Number.isFinite(sentAt) && Date.now() - sentAt > 60000;
                    const stuck =
                      row.status === "dispatched" && !known && settled && data.comfy.error === null;
                    const fresh = row.status === "dispatched" && !known && !settled;
                    const owner = data.owners?.[row.id];

                    return (
                      <tr key={row.id}>
                        <td>
                          <span className={stuck ? "queue-badge queue-badge-bad" : "queue-badge"}>
                            {row.status}
                          </span>
                          {stuck && <span className="admin-sub">not in ComfyUI</span>}
                          {fresh && <span className="admin-sub">just sent</span>}
                        </td>
                        {/* Rows are listed in service order, so a prioritised
                            user appearing above an older job is the priority list
                            working, not a sorting bug. */}
                        <td>
                          <span className="queue-owner">{owner?.username ?? "—"}</span>
                          <span className="admin-sub">
                            {owner?.rank != null ? `priority #${owner.rank}` : "default"}
                          </span>
                        </td>
                        {data.showPrompts !== false && <PromptCell text={row.prompt} />}
                        <td className="admin-mono">
                          {row.width && row.height ? `${row.width}×${row.height}` : "—"}
                          {row.duration_seconds !== null && (
                            <span className="admin-sub">{row.duration_seconds}s · {row.type}</span>
                          )}
                        </td>
                        <td className="admin-mono">
                          {ago(row.created_at)}
                          {row.dispatched_at && (
                            <span className="admin-sub">sent {ago(row.dispatched_at)}</span>
                          )}
                        </td>
                        <td className="admin-number">{row.attempts}</td>
                        <td className="admin-mono">
                          {row.comfy_prompt_id ? row.comfy_prompt_id.slice(0, 8) : "—"}
                        </td>
                        <td className="queue-error-cell">{row.last_error ?? row.error ?? "—"}</td>
                        <td>
                          <div className="queue-row-actions">
                            <button
                              type="button"
                              className="queue-action queue-action-small"
                              onClick={() => act("requeue", row.id)}
                              disabled={busy !== null}
                            >
                              {busy === `requeue:${row.id}` ? "…" : "Requeue"}
                            </button>
                            <button
                              type="button"
                              className="queue-action queue-action-small queue-action-danger"
                              onClick={() => act("fail", row.id)}
                              disabled={busy !== null}
                            >
                              {busy === `fail:${row.id}` ? "…" : "Kill"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="admin-queue-foot">
            Listed in the order they will be served: priority-list members first by rank, then
            everyone else oldest-first. Killing a job refunds its render; requeuing keeps its place in
            line and resets its retry count. The queue is drained by ordinary requests — there is no
            background worker on Vercel — so it only advances while someone is using the site.
          </p>
        </>
      )}
    </section>
  );
}
