"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useApiKey } from "./ApiKeyProvider";

type InviteDoc = {
  code: string;
  prefix?: string | null;
  note?: string | null;
  created_at: string;
  expires_at?: string | null;
  is_used: boolean;
  used_by_user_id: string | null;
  used_by_username: string | null;
  used_at: string | null;
  daily_limit?: number;
};

export default function AdminInvites() {
  const { authFetch } = useApiKey();

  const [invites, setInvites] = useState<InviteDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state: Prefix & Count
  const [prefix, setPrefix] = useState("rum");
  const [count, setCount] = useState<number>(20);

  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [filterPrefix, setFilterPrefix] = useState<string>("all");

  const fetchInvites = useCallback(async () => {
    try {
      const res = await authFetch("/api/admin/invites");
      if (!res.ok) {
        throw new Error("Failed to load invites.");
      }
      const data = await res.json();
      setInvites(data.invites ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Error fetching invites.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccessMsg(null);

    const cleanPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    if (!cleanPrefix) {
      setError("Please specify a prefix (e.g. rum, val).");
      setCreating(false);
      return;
    }

    const numCount = Math.min(100, Math.max(1, Number(count) || 1));

    try {
      const res = await authFetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prefix: cleanPrefix,
          count: numCount,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to create invites.");
      }

      const data = await res.json();
      const createdList: InviteDoc[] = data.invites ?? [];
      setSuccessMsg(`Successfully generated ${createdList.length} invites with prefix "${cleanPrefix}".`);
      await fetchInvites();
    } catch (err: any) {
      setError(err?.message ?? "Error creating invites.");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (code: string) => {
    if (!confirm(`Revoke invite code ${code}?`)) return;

    try {
      const res = await authFetch(`/api/admin/invites?code=${encodeURIComponent(code)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to revoke invite.");
      }
      await fetchInvites();
    } catch (err: any) {
      alert(err.message || "Failed to revoke.");
    }
  };

  const getInviteUrl = (code: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://quackxvstudio.web.app";
    return `${origin}/?invite=${code}`;
  };

  const copyLink = (code: string) => {
    const url = getInviteUrl(code);
    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const prefixes = useMemo(() => {
    const set = new Set<string>();
    for (const inv of invites) {
      if (inv.prefix) set.add(inv.prefix.toUpperCase());
      else {
        const parts = inv.code.split("-");
        if (parts.length > 1) set.add(parts[0].toUpperCase());
      }
    }
    return Array.from(set).sort();
  }, [invites]);

  const filteredInvites = useMemo(() => {
    if (filterPrefix === "all") return invites;
    return invites.filter((inv) => {
      const p = inv.prefix?.toUpperCase() || inv.code.split("-")[0]?.toUpperCase();
      return p === filterPrefix;
    });
  }, [invites, filterPrefix]);

  const copyAllUnused = () => {
    const unused = filteredInvites.filter((inv) => !inv.is_used);
    if (unused.length === 0) return;
    const urls = unused.map((inv) => getInviteUrl(inv.code)).join("\n");
    navigator.clipboard.writeText(urls).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    });
  };

  return (
    <section className="panel" style={{ marginTop: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>Invite Codes</h2>
          <p style={{ margin: "4px 0 0", opacity: 0.6, fontSize: "0.85rem" }}>
            Generate prefix-based single-use invite codes in batches. User permissions and limits are configured after login.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {filteredInvites.some((inv) => !inv.is_used) && (
            <button
              type="button"
              onClick={copyAllUnused}
              className="admin-btn"
              style={{ padding: "6px 14px", color: "#3b82f6" }}
              title="Copy all active/unused links in current view"
            >
              {copiedAll ? "Copied All Unused!" : "Copy All Unused Links"}
            </button>
          )}
          <button
            type="button"
            onClick={fetchInvites}
            className="admin-btn"
            style={{ padding: "6px 14px" }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Creation form */}
      <form
        onSubmit={handleCreate}
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "24px",
        }}
      >
        <h3 style={{ margin: "0 0 12px", fontSize: "0.95rem", fontWeight: 600 }}>Batch Generate Invites</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", opacity: 0.7, marginBottom: "4px" }}>
              Invite Link Prefix (e.g. rum, val)
            </label>
            <input
              type="text"
              placeholder="e.g. rum, val"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toLowerCase())}
              required
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "4px",
                color: "#fff",
                fontFamily: "monospace",
                fontWeight: 600,
              }}
            />
            <span style={{ fontSize: "0.75rem", opacity: 0.5, marginTop: "4px", display: "block" }}>
              Generates links like: {getInviteUrl(`${(prefix.trim() || "rum").toUpperCase()}-XXXX-XXXX`)}
            </span>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", opacity: 0.7, marginBottom: "4px" }}>
              Number of Invites (Batch Count)
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              required
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "4px",
                color: "#fff",
              }}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={creating}
              className="generate"
              style={{ width: "100%", padding: "10px 20px" }}
            >
              {creating ? "Generating…" : `Generate ${count} Invites`}
            </button>
          </div>
        </div>
      </form>

      {successMsg && (
        <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", borderRadius: "6px", padding: "10px 14px", marginBottom: "16px", fontSize: "0.85rem" }}>
          {successMsg}
        </div>
      )}

      {error && <div className="error-box" style={{ marginBottom: "16px" }}>{error}</div>}

      {/* Filter by prefix */}
      {prefixes.length > 1 && (
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px", fontSize: "0.85rem" }}>
          <span style={{ opacity: 0.6 }}>Filter Prefix:</span>
          <button
            type="button"
            className="admin-btn"
            style={{
              padding: "3px 10px",
              background: filterPrefix === "all" ? "rgba(255,255,255,0.15)" : "transparent",
            }}
            onClick={() => setFilterPrefix("all")}
          >
            All ({invites.length})
          </button>
          {prefixes.map((p) => {
            const countForP = invites.filter((i) => (i.prefix?.toUpperCase() || i.code.split("-")[0]?.toUpperCase()) === p).length;
            return (
              <button
                key={p}
                type="button"
                className="admin-btn"
                style={{
                  padding: "3px 10px",
                  background: filterPrefix === p ? "rgba(255,255,255,0.15)" : "transparent",
                  fontFamily: "monospace",
                }}
                onClick={() => setFilterPrefix(p)}
              >
                {p} ({countForP})
              </button>
            );
          })}
        </div>
      )}

      {/* Invites list */}
      {loading ? (
        <p style={{ opacity: 0.5 }}>Loading invites…</p>
      ) : filteredInvites.length === 0 ? (
        <p style={{ opacity: 0.5 }}>No invite codes created yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", textAlign: "left", opacity: 0.6 }}>
                <th style={{ padding: "8px 10px" }}>Code</th>
                <th style={{ padding: "8px 10px" }}>Prefix</th>
                <th style={{ padding: "8px 10px" }}>Status</th>
                <th style={{ padding: "8px 10px" }}>Used By</th>
                <th style={{ padding: "8px 10px" }}>Created</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvites.map((inv) => {
                const isExpired = inv.expires_at && new Date(inv.expires_at).getTime() < Date.now();
                const codePrefix = inv.prefix?.toUpperCase() || inv.code.split("-")[0]?.toUpperCase() || "—";
                return (
                  <tr
                    key={inv.code}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      opacity: inv.is_used ? 0.6 : 1,
                    }}
                  >
                    <td style={{ padding: "10px", fontFamily: "monospace", fontWeight: 700 }}>
                      {inv.code}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: "4px", fontFamily: "monospace" }}>
                        {codePrefix}
                      </span>
                    </td>
                    <td style={{ padding: "10px" }}>
                      {inv.is_used ? (
                        <span style={{ color: "#10b981", background: "rgba(16,185,129,0.1)", padding: "2px 8px", borderRadius: "12px" }}>
                          Redeemed
                        </span>
                      ) : isExpired ? (
                        <span style={{ color: "#ef4444", background: "rgba(239,68,68,0.1)", padding: "2px 8px", borderRadius: "12px" }}>
                          Revoked
                        </span>
                      ) : (
                        <span style={{ color: "#3b82f6", background: "rgba(59,130,246,0.1)", padding: "2px 8px", borderRadius: "12px" }}>
                          Active
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px" }}>
                      {inv.used_by_username ? `${inv.used_by_username}` : "—"}
                    </td>
                    <td style={{ padding: "10px", opacity: 0.7 }}>
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "10px", textAlign: "right" }}>
                      {!inv.is_used && (
                        <>
                          <button
                            type="button"
                            onClick={() => copyLink(inv.code)}
                            className="admin-btn"
                            style={{ padding: "4px 10px", marginRight: "8px" }}
                          >
                            {copiedCode === inv.code ? "Copied!" : "Copy Link"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRevoke(inv.code)}
                            className="admin-btn"
                            style={{ padding: "4px 10px", color: "#ef4444" }}
                          >
                            Revoke
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
