"use client";

/**
 * The priority list: an explicit, ordered membership.
 *
 * Replaces ranking every user with an integer, which made a studio where nobody
 * had been deliberately prioritised still display a full ordered list of everyone.
 * A user is either on this list with a rank, or a default user with no rank at
 * all — the list is exactly as long as the number of people actually prioritised.
 *
 * `users` is passed in rather than fetched here: the parent already has it for the
 * table below, the add-picker needs it to offer non-members, and sharing one copy
 * means a rank change refreshes both views from a single source of truth.
 */

import { useMemo, useState } from "react";
import { useApiKey } from "./ApiKeyProvider";

type Member = {
  user_id: string;
  username: string | null;
  rank: number;
  note: string | null;
  added_at: string;
};

type MinimalUser = { id: string; username: string | null };

type Props = {
  users: MinimalUser[];
  members: Member[];
  loading: boolean;
  /** Reload both the member list and the user table after a change. */
  onChanged: () => Promise<void> | void;
};

export default function PriorityList({ users, members, loading, onChanged }: Props) {
  const { authFetch } = useApiKey();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [addId, setAddId] = useState("");
  const [note, setNote] = useState("");

  /** Only non-members are offerable, so the picker can't add a duplicate. */
  const candidates = useMemo(() => {
    const taken = new Set(members.map((m) => m.user_id));
    return users
      .filter((u) => !taken.has(u.id))
      .sort((a, b) => (a.username ?? "").localeCompare(b.username ?? ""));
  }, [users, members]);

  const act = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const res = await authFetch("/api/admin/priority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "That change failed.");
      // Refetched rather than patched locally: the server renumbers the whole list
      // to keep ranks dense, so more rows can change than the ones touched here.
      await onChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    if (!addId) return;
    await act({ action: "add", id: addId, note: note.trim() || null }, "add");
    setAddId("");
    setNote("");
  };

  return (
    <section className="admin-priority">
      <h2 className="admin-section-title">Priority list</h2>

      <p className="admin-rank-note">
        <strong>#1 is served first.</strong> Members&apos; renders are dispatched before everyone
        else&apos;s; anyone not on this list is served in the order they arrived. Priority applies to
        renders already waiting, not just future ones — moving someone up lifts the job they have in
        the queue right now.
      </p>

      {error && <div className="error-box">{error}</div>}

      <div className="panel">
        {loading ? (
          <div className="beam" />
        ) : members.length === 0 ? (
          <p className="field-help">
            Nobody is prioritised. Every render is served in the order it was requested — which is
            usually what you want. Add someone below to move their renders ahead.
          </p>
        ) : (
          <ol className="priority-list">
            {members.map((member, index) => (
              <li key={member.user_id} className="priority-item">
                <span className="priority-rank">#{member.rank}</span>

                <span className="priority-name">
                  {/* A member whose profile row has gone still shows, so an entry
                      can't affect ordering while being invisible here. */}
                  {member.username ?? <span className="priority-orphan">unknown user</span>}
                  {member.note && <span className="admin-sub">{member.note}</span>}
                </span>

                <span className="priority-actions">
                  <button
                    type="button"
                    className="admin-rank-btn"
                    title="Serve sooner"
                    aria-label={`Move ${member.username ?? "user"} up`}
                    disabled={busy !== null || index === 0}
                    onClick={() => act({ action: "move", id: member.user_id, direction: "up" }, member.user_id)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="admin-rank-btn"
                    title="Serve later"
                    aria-label={`Move ${member.username ?? "user"} down`}
                    disabled={busy !== null || index === members.length - 1}
                    onClick={() => act({ action: "move", id: member.user_id, direction: "down" }, member.user_id)}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="priority-remove"
                    disabled={busy !== null}
                    onClick={() => act({ action: "remove", id: member.user_id }, member.user_id)}
                  >
                    {busy === member.user_id ? "…" : "Remove"}
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="priority-add">
          <label htmlFor="priority-add-user">Add a user</label>
          <div className="priority-add-row">
            <select
              id="priority-add-user"
              value={addId}
              onChange={(e) => setAddId(e.target.value)}
              disabled={busy !== null || candidates.length === 0}
            >
              <option value="">
                {candidates.length === 0 ? "Everyone is already on the list" : "Choose a user…"}
              </option>
              {candidates.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username ?? user.id.slice(0, 8)}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              maxLength={200}
              disabled={busy !== null}
            />
            <button
              type="button"
              className="queue-action"
              onClick={add}
              disabled={busy !== null || !addId}
            >
              {busy === "add" ? "Adding…" : "Add"}
            </button>
          </div>
          <p className="field-help">
            New members join at the bottom of the list, so adding someone never silently outranks the
            people already on it.
          </p>
        </div>
      </div>
    </section>
  );
}
