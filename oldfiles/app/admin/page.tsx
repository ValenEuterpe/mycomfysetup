"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApiKey } from "@/components/ApiKeyProvider";
import AdminQueue from "@/components/AdminQueue";
import PriorityList from "@/components/PriorityList";
import AdminInvites from "@/components/AdminInvites";

/** One entry on the priority list. Only ranked users have one. */
type PriorityMember = {
  user_id: string;
  username: string | null;
  rank: number;
  note: string | null;
  added_at: string;
};

type AdminUser = {
  id: string;
  username: string | null;
  ip: string | null;
  generations: number;
  generations_today: number;
  quota_date: string;
  daily_generation_limit: number;
  is_active: boolean;
  admin_disabled: boolean;
  can_access_advanced: boolean;
  /** Present after 008. Treat missing as off so an unmigrated listing still renders. */
  can_access_filmmaking?: boolean;
  can_access_video?: boolean;
  can_access_image?: boolean;
  daily_video_limit?: number;
  daily_image_limit?: number;
  video_generations_today?: number;
  image_generations_today?: number;
  /**
   * Place on the priority list, or null for a default user — which is the normal
   * case, and deliberately not a number. Ranking is managed by the priority list,
   * not per-row here.
   */
  priority_rank: number | null;
  last_login_at: string | null;
  created_at: string;
};

/** One entry in a user's prompt log. `prompt` is null once pruned. */
type PromptEntry = {
  /** A queue-row uuid since 004 — it used to be a bigint. */
  id: string;
  prompt: string | null;
  pruned: boolean;
  type: string;
  aspect_ratio: string | null;
  duration_seconds: number | null;
  fast: boolean;
  comfy_prompt_id: string | null;
  created_at: string;
  /** How the render ended: queued, dispatched, done, error, cancelled. */
  status: string;
};

/** The booleans the PATCH route accepts. Keep in step with `EDITABLE_FLAGS`. */
type ToggleField =
  | "can_access_advanced"
  | "can_access_filmmaking"
  | "can_access_video"
  | "can_access_image"
  | "is_active"
  | "admin_disabled";

/** Matches `daily_generation_limit`'s range in the PATCH route. */
const LIMIT_MAX = 1000;

/**
 * Columns the user table can be sorted by.
 *
 * Sorted on the client. At this scale it is instant, it costs no API surface, and
 * it means changing the sort doesn't refetch — which matters because the default
 * sort *is* the priority ranking, and re-sorting must not disturb it on the server.
 */
type SortKey =
  | "priority"
  | "name"
  | "joined"
  | "generations"
  | "video"
  | "image"
  | "videoLimit"
  | "imageLimit"
  | "advanced"
  | "filmmaking"
  | "lastSeen";

type SortDirection = "asc" | "desc";

/**
 * Mirrors `utcDay` in lib/quota.ts, inlined rather than imported so this client
 * component doesn't drag the server-only Supabase helper into the bundle.
 */
function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A row whose `quota_date` has rolled over has spent nothing today, however
 * large counters still read — the reset lands on that user's next
 * render, not at midnight. Same rule the server applies on read.
 */
function usedToday(user: AdminUser): number {
  return user.quota_date === utcDay() ? user.generations_today : 0;
}

function usedVideoToday(user: AdminUser): number {
  return user.quota_date === utcDay() ? (user.video_generations_today ?? 0) : 0;
}

function usedImageToday(user: AdminUser): number {
  return user.quota_date === utcDay() ? (user.image_generations_today ?? 0) : 0;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Prompt-log entries need the time of day too, not just the date. */
function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The floating window behind a username: everything that user has asked the GPU
 * for, newest first, with a prune control.
 *
 * Pruning clears the prompt *text* and keeps the entries — so the record of when
 * someone rendered, and with what settings, survives. That's why a pruned row
 * still occupies a line here instead of disappearing.
 */
function PromptLogModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { authFetch } = useApiKey();
  const [prompts, setPrompts] = useState<PromptEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Two-step prune: the first click arms it, the second commits. */
  const [confirming, setConfirming] = useState(false);
  const [pruning, setPruning] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const label = user.username ?? "this user";

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authFetch(`/api/admin/users/${user.id}/prompts`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Couldn't load the prompt log.");
      setPrompts(data.prompts ?? []);
    } catch (err: any) {
      setError(err.message);
      setPrompts([]);
    }
  }, [authFetch, user.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Escape closes it, and focus starts on the close button so the keyboard has
  // somewhere sensible to land.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const prune = async () => {
    setError(null);
    setPruning(true);
    try {
      const res = await authFetch(`/api/admin/users/${user.id}/prompts`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Prune failed.");
      // Reflect the server's semantics exactly: content gone, entries kept.
      setPrompts((list) =>
        (list ?? []).map((entry) => ({ ...entry, prompt: null, pruned: true })),
      );
      setConfirming(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPruning(false);
    }
  };

  const unpruned = (prompts ?? []).filter((entry) => !entry.pruned).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      {/* The click guard keeps a click inside the window from closing it. */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Prompt log for ${label}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 className="modal-title">{user.username ?? "—"}</h2>
            <p className="modal-sub">
              {prompts === null
                ? "Loading prompt log…"
                : `${prompts.length} logged ${prompts.length === 1 ? "render" : "renders"}` +
                  (prompts.length ? ` · ${unpruned} with text` : "")}
            </p>
          </div>
          <button ref={closeRef} type="button" className="modal-close" onClick={onClose}>
            Close
          </button>
        </header>

        {error && <div className="error-box">{error}</div>}

        <div className="modal-body">
          {prompts === null ? (
            <div className="beam" />
          ) : prompts.length === 0 ? (
            <p className="field-help">No renders logged for this user yet.</p>
          ) : (
            <ul className="prompt-log">
              {prompts.map((entry) => (
                <li key={entry.id} className="prompt-entry">
                  <div className="prompt-meta">
                    <span>{formatDateTime(entry.created_at)}</span>
                    <span>{entry.type === "i2v" ? "image → video" : "text → video"}</span>
                    <span>{entry.fast ? "fast · 8 steps" : "full · 20 steps"}</span>
                    {entry.aspect_ratio && <span>{entry.aspect_ratio}</span>}
                    {entry.duration_seconds !== null && <span>{entry.duration_seconds}s</span>}
                    {/* Since 004 a row exists from the moment a render is
                        requested, so an entry may not have produced anything.
                        'done' is the unremarkable case and stays unlabelled. */}
                    {entry.status && entry.status !== "done" && (
                      <span className="prompt-status">{entry.status}</span>
                    )}
                  </div>
                  {entry.pruned || entry.prompt === null ? (
                    <p className="prompt-text prompt-pruned">Prompt pruned</p>
                  ) : (
                    <p className="prompt-text">{entry.prompt}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="modal-foot">
          <p className="field-help">
            Pruning clears the prompt text. The entries, their timestamps and settings stay.
          </p>
          {confirming ? (
            <div className="modal-confirm">
              <button
                type="button"
                className="modal-danger"
                disabled={pruning}
                onClick={prune}
              >
                {pruning ? "Pruning…" : `Yes, clear ${unpruned} prompts`}
              </button>
              <button
                type="button"
                className="modal-close"
                disabled={pruning}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="modal-danger"
              disabled={prompts === null || unpruned === 0}
              onClick={() => setConfirming(true)}
            >
              Prune prompts
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

/**
 * A sortable column heading.
 *
 * A real button inside the `th` rather than a click handler on the cell, so it is
 * keyboard-reachable and announced as a control. `aria-sort` on the header is what
 * tells a screen reader which column the table is ordered by.
 */
function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <th scope="col" aria-sort={isActive ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="admin-sort-btn" onClick={() => onSort(sortKey)}>
        {label}
        <span className="admin-sort-arrow" aria-hidden="true">
          {isActive ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

type AdminConfig = {
  showIpAddress: boolean;
  showPrompts: boolean;
};

function UserTable({
  users,
  members,
  loading,
  error: loadError,
  onReload,
  config,
}: {
  users: AdminUser[];
  members: PriorityMember[];
  loading: boolean;
  error: string | null;
  onReload: () => Promise<void>;
  config?: AdminConfig;
}) {
  const { authFetch } = useApiKey();
  const [error, setError] = useState<string | null>(null);
  /** ids currently mid-PATCH, so their controls lock instead of double-firing. */
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  /** The row whose prompt log is open, or null. */
  const [openUser, setOpenUser] = useState<AdminUser | null>(null);
  /**
   * Defaults to priority, which puts ranked users at the top. Unlike the previous
   * version this is not "the ranking" — it is a sort, and most users have no rank
   * at all.
   */
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  /** Local edits are optimistic; a failure reloads from the server. */
  const [localUsers, setLocalUsers] = useState<AdminUser[]>(users);
  useEffect(() => setLocalUsers(users), [users]);

  /** Click a header to sort by it; click again to flip the direction. */
  const sortBy = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    // Rank 1 is best, and names read A–Z; every other column is most useful
    // highest-first.
    setSortDir(key === "name" || key === "priority" ? "asc" : "desc");
  };

  const sorted = useMemo(() => {
    const factor = sortDir === "asc" ? 1 : -1;
    const value = (user: AdminUser): number | string => {
      switch (sortKey) {
        case "priority":
          // Unranked users sort after every ranked one, in both directions —
          // "sorted by priority" should never put default users above members.
          return user.priority_rank ?? Number.MAX_SAFE_INTEGER;
        case "name":
          return (user.username ?? "").toLowerCase();
        case "joined":
          return Date.parse(user.created_at) || 0;
        case "generations":
          return user.generations;
        case "video":
          return user.can_access_video !== false ? 1 : 0;
        case "image":
          return user.can_access_image !== false ? 1 : 0;
        case "videoLimit":
          return user.daily_video_limit ?? 10;
        case "imageLimit":
          return user.daily_image_limit ?? 20;
        case "advanced":
          return user.can_access_advanced ? 1 : 0;
        case "filmmaking":
          return user.can_access_filmmaking ? 1 : 0;
        case "lastSeen":
          // Never-signed-in sorts as oldest rather than as "now".
          return user.last_login_at ? Date.parse(user.last_login_at) || 0 : 0;
      }
    };

    // Copied before sorting: sort() mutates, and mutating state is how you get a
    // list that doesn't re-render.
    return [...localUsers].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv)) * factor;
      }
      if (av === bv) {
        // Stable, meaningful tiebreak rather than whatever order sort() lands on.
        return (a.username ?? "").localeCompare(b.username ?? "");
      }
      return (av - bv) * factor;
    });
  }, [localUsers, sortKey, sortDir]);

  /**
   * Optimistic PATCH: the row updates now and rolls back to `revert` if the
   * server disagrees. `revert` is passed explicitly rather than snapshotted here
   * so the caller decides what "before" means for its own control.
   */
  const patchUser = useCallback(
    async (id: string, fields: Partial<AdminUser>, revert: Partial<AdminUser>) => {
      setError(null);
      setSaving((s) => ({ ...s, [id]: true }));
      setLocalUsers((list) => list.map((u) => (u.id === id ? { ...u, ...fields } : u)));

      try {
        const res = await authFetch(`/api/admin/users/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Update failed.");
      } catch (err: any) {
        setError(err.message);
        setLocalUsers((list) => list.map((u) => (u.id === id ? { ...u, ...revert } : u)));
      } finally {
        setSaving((s) => ({ ...s, [id]: false }));
      }
    },
    [authFetch],
  );

  const toggle = (user: AdminUser, field: ToggleField, next: boolean) =>
    patchUser(user.id, { [field]: next }, { [field]: !next });



  const setVideoLimit = (user: AdminUser, raw: string) => {
    const next = Number(raw);
    if (!Number.isInteger(next) || next < 0 || next > LIMIT_MAX) return;
    if (next === (user.daily_video_limit ?? 10)) return;
    patchUser(
      user.id,
      { daily_video_limit: next },
      { daily_video_limit: user.daily_video_limit ?? 10 },
    );
  };

  const setImageLimit = (user: AdminUser, raw: string) => {
    const next = Number(raw);
    if (!Number.isInteger(next) || next < 0 || next > LIMIT_MAX) return;
    if (next === (user.daily_image_limit ?? 20)) return;
    patchUser(
      user.id,
      { daily_image_limit: next },
      { daily_image_limit: user.daily_image_limit ?? 20 },
    );
  };

  const resetToday = (user: AdminUser) =>
    patchUser(
      user.id,
      { generations_today: 0, video_generations_today: 0, image_generations_today: 0, quota_date: utcDay() },
      {
        generations_today: user.generations_today,
        video_generations_today: user.video_generations_today ?? 0,
        image_generations_today: user.image_generations_today ?? 0,
        quota_date: user.quota_date,
      },
    );

  if (loading) {
    return (
      <div className="panel">
        <div className="beam" />
      </div>
    );
  }

  return (
    <div className="panel admin-list">
      <h2 className="admin-section-title">Studio users</h2>

      {(error || loadError) && <div className="error-box">{error ?? loadError}</div>}

      {localUsers.length === 0 ? (
        <p className="field-help">
          Nobody has signed in yet. Rows appear here on their own the first time someone uses their existing
          key.
        </p>
      ) : (
        <>
          <p className="admin-rank-note">
            <strong>#</strong> is a user&apos;s place on the priority list, managed above — a dash
            means default treatment, which is normal. Click any column heading to sort; sorting only
            changes what you see.
          </p>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <SortHeader label="#" sortKey="priority" active={sortKey} dir={sortDir} onSort={sortBy} />
                  <SortHeader label="User" sortKey="name" active={sortKey} dir={sortDir} onSort={sortBy} />
                  {config?.showIpAddress !== false && <th scope="col">IP</th>}
                  <SortHeader
                    label="Video"
                    sortKey="video"
                    active={sortKey}
                    dir={sortDir}
                    onSort={sortBy}
                  />
                  <SortHeader
                    label="Vid Limit"
                    sortKey="videoLimit"
                    active={sortKey}
                    dir={sortDir}
                    onSort={sortBy}
                  />
                  <SortHeader
                    label="Image"
                    sortKey="image"
                    active={sortKey}
                    dir={sortDir}
                    onSort={sortBy}
                  />
                  <SortHeader
                    label="Img Limit"
                    sortKey="imageLimit"
                    active={sortKey}
                    dir={sortDir}
                    onSort={sortBy}
                  />
                  <SortHeader
                    label="Advanced"
                    sortKey="advanced"
                    active={sortKey}
                    dir={sortDir}
                    onSort={sortBy}
                  />
                  <SortHeader
                    label="Film"
                    sortKey="filmmaking"
                    active={sortKey}
                    dir={sortDir}
                    onSort={sortBy}
                  />
                  <th scope="col">Active</th>
                  <th scope="col">Disabled</th>
                  <SortHeader
                    label="Total"
                    sortKey="generations"
                    active={sortKey}
                    dir={sortDir}
                    onSort={sortBy}
                  />
                  <SortHeader label="Joined" sortKey="joined" active={sortKey} dir={sortDir} onSort={sortBy} />
                  <SortHeader
                    label="Last seen"
                    sortKey="lastSeen"
                    active={sortKey}
                    dir={sortDir}
                    onSort={sortBy}
                  />
                </tr>
              </thead>
              <tbody>
                {sorted.map((user) => (
                  <tr key={user.id}>
                    <td>
                      {/* Read-only. Reordering lives in the priority list above */}
                      {user.priority_rank === null ? (
                        <span className="admin-rank-none" title="Default: served in arrival order">
                          —
                        </span>
                      ) : (
                        <span className="admin-rank-number">#{user.priority_rank}</span>
                      )}
                    </td>
                    <td>
                      {config?.showPrompts !== false ? (
                        <button
                          type="button"
                          className="admin-username-btn"
                          onClick={() => setOpenUser(user)}
                          title="View prompt log"
                        >
                          {user.username ?? "—"}
                        </button>
                      ) : (
                        <span className="admin-username">{user.username ?? "—"}</span>
                      )}
                    </td>
                    {config?.showIpAddress !== false && (
                      <td className="admin-mono">{user.ip ?? "—"}</td>
                    )}
                    <td>
                      <input
                        type="checkbox"
                        checked={user.can_access_video !== false}
                        disabled={saving[user.id]}
                        aria-label={`Video access for ${user.username ?? "user"}`}
                        onChange={(e) => toggle(user, "can_access_video", e.target.checked)}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-number"
                        type="number"
                        min={0}
                        max={LIMIT_MAX}
                        defaultValue={user.daily_video_limit ?? 10}
                        key={`${user.id}:vid:${user.daily_video_limit ?? 10}`}
                        disabled={saving[user.id]}
                        style={{ width: "65px" }}
                        aria-label={`Daily video limit for ${user.username ?? "user"}`}
                        onBlur={(e) => setVideoLimit(user, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={user.can_access_image !== false}
                        disabled={saving[user.id]}
                        aria-label={`Image access for ${user.username ?? "user"}`}
                        onChange={(e) => toggle(user, "can_access_image", e.target.checked)}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-number"
                        type="number"
                        min={0}
                        max={LIMIT_MAX}
                        defaultValue={user.daily_image_limit ?? 20}
                        key={`${user.id}:img:${user.daily_image_limit ?? 20}`}
                        disabled={saving[user.id]}
                        style={{ width: "65px" }}
                        aria-label={`Daily image limit for ${user.username ?? "user"}`}
                        onBlur={(e) => setImageLimit(user, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={user.can_access_advanced}
                        disabled={saving[user.id]}
                        aria-label={`Advanced access for ${user.username ?? "user"}`}
                        onChange={(e) => toggle(user, "can_access_advanced", e.target.checked)}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={user.can_access_filmmaking === true}
                        disabled={saving[user.id]}
                        aria-label={`Filmmaking access for ${user.username ?? "user"}`}
                        onChange={(e) => toggle(user, "can_access_filmmaking", e.target.checked)}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={user.is_active}
                        disabled={saving[user.id]}
                        aria-label={`Active for ${user.username ?? "user"}`}
                        onChange={(e) => toggle(user, "is_active", e.target.checked)}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={user.admin_disabled}
                        disabled={saving[user.id]}
                        aria-label={`Disabled for ${user.username ?? "user"}`}
                        onChange={(e) => toggle(user, "admin_disabled", e.target.checked)}
                      />
                    </td>
                    <td className="admin-mono">
                      <div>{user.generations}</div>
                      {(usedVideoToday(user) > 0 || usedImageToday(user) > 0 || usedToday(user) > 0) && (
                        <button
                          type="button"
                          className="admin-reset"
                          disabled={saving[user.id]}
                          onClick={() => resetToday(user)}
                          title="Reset today's used quota to 0"
                          style={{ marginTop: "4px" }}
                        >
                          Reset Day
                        </button>
                      )}
                    </td>
                    <td className="admin-mono">{formatDate(user.created_at)}</td>
                    <td className="admin-mono">{formatDate(user.last_login_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {config?.showPrompts !== false && openUser && (
        <PromptLogModal user={openUser} onClose={() => setOpenUser(null)} />
      )}
    </div>
  );
}

export default function AdminPage() {
  const { authFetch, capabilities } = useApiKey();

  // Users and priority members are loaded together, here, because both surfaces
  // need both lists: the priority list offers non-members to add, and the user
  // table shows each row's rank. One fetch pair and one reload keeps them from
  // disagreeing about who is ranked where.
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [members, setMembers] = useState<PriorityMember[]>([]);
  const [config, setConfig] = useState<AdminConfig>({
    showIpAddress: true,
    showPrompts: true,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [usersRes, membersRes] = await Promise.all([
        authFetch("/api/admin/users"),
        authFetch("/api/admin/priority"),
      ]);

      const usersData = await usersRes.json().catch(() => null);
      if (!usersRes.ok) throw new Error(usersData?.error || "Couldn't load users.");
      setUsers(usersData.users ?? []);
      if (usersData?.config) {
        setConfig({
          showIpAddress: usersData.config.showIpAddress !== false,
          showPrompts: usersData.config.showPrompts !== false,
        });
      }

      // The member list failing is survivable — the user table is still useful,
      // and the priority section shows its own error.
      const membersData = await membersRes.json().catch(() => null);
      if (membersRes.ok) setMembers(membersData.members ?? []);
      else setError(membersData?.error || "Couldn't load the priority list.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (capabilities.canAdminister) load();
  }, [capabilities.canAdminister, load]);

  return (
    <main className="shell shell-wide">
      <Link href="/" className="brand">
        <span className="dot" />
        STUDIO
      </Link>

      <h1 className="title">Admin</h1>

      {capabilities.canAdminister ? (
        <>
          <p className="subtitle">
            Manage user profiles, single-use invite codes, the live render queue, and GPU priority rankings backed by Supabase PostgreSQL.
          </p>
          <AdminInvites />
          <AdminQueue />
          <PriorityList users={users} members={members} loading={loading} onChanged={load} />
          <UserTable users={users} members={members} loading={loading} error={error} onReload={load} config={config} />
        </>
      ) : (
        <>
          <p className="subtitle">This area is limited to the studio owner.</p>
          <div className="panel">
            <p className="field-help">Not available on this account.</p>
          </div>
        </>
      )}
    </main>
  );
}


