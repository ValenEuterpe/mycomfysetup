"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApiKey } from "./ApiKeyProvider";
import UserSettingsModal from "./UserSettingsModal";

/** Small top-right strip shown once you're in. */
function AccountBar() {
  const { username, capabilities, logout } = useApiKey();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <div className="account-bar">
        <span className="account-badge">
          <span className="account-dot" />
          {username ? `Signed in as ${username}` : "Kemo Studio Active"}
        </span>
        {capabilities.canAccessImage && (
          <Link href="/text-to-image" className="admin-link">
            Images
          </Link>
        )}
        <Link href="/character-maker" className="admin-link">
          Character Maker
        </Link>
        <Link href="/characters" className="admin-link">
          Characters
        </Link>
        <Link href="/history" className="admin-link">
          History
        </Link>
        {capabilities.canAccessFilmmaking && (
          <Link href="/filmmaking" className="admin-link">
            Filmmaking
          </Link>
        )}
        {capabilities.canAdminister && (
          <Link href="/admin" className="admin-link">
            Admin
          </Link>
        )}
        <button
          type="button"
          className="admin-link"
          onClick={() => setShowSettings(true)}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            font: "inherit",
            padding: 0,
          }}
        >
          Settings
        </button>
        <button type="button" className="logout-btn" onClick={logout}>
          Log out
        </button>
      </div>

      {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}

function GateForm() {
  const { unlock, loginWithPassword, redeemInviteCode } = useApiKey();

  const [mode, setMode] = useState<"login" | "invite" | "key">("login");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [revealPassword, setRevealPassword] = useState(false);

  const [inviteCode, setInviteCode] = useState("");
  const [nickname, setNickname] = useState("");

  const [keyValue, setKeyValue] = useState("");
  const [revealKey, setRevealKey] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto-detect ?invite=CODE from URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const invite = params.get("invite");
      if (invite) {
        setInviteCode(invite.trim().toUpperCase());
        setMode("invite");
      }
    } catch {
      // ignore
    }
  }, []);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const user = loginUsername.trim();
    if (!user) {
      setError("Please enter your username.");
      return;
    }
    if (!loginPassword) {
      setError("Please enter your password.");
      return;
    }

    setSubmitting(true);
    const result = await loginWithPassword(user, loginPassword);
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
    }
  };

  const handleRedeemInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      setError("Please enter your invite code.");
      return;
    }

    setSubmitting(true);
    const result = await redeemInviteCode(code, nickname);
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
    }
  };

  const handleUnlockKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const key = keyValue.trim();
    if (!key) {
      setError("Please enter your key.");
      return;
    }

    setSubmitting(true);
    const result = await unlock(key);
    if (!result.ok) {
      if (result.isInviteCode && result.inviteCode) {
        setInviteCode(result.inviteCode);
        setMode("invite");
      }
      setError(result.error);
      setSubmitting(false);
    }
  };

  return (
    <main className="shell gate-shell">
      <div className="brand">
        <span className="dot" />
        KEMO STUDIO
      </div>

      <div className="panel gate-panel">
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "20px",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            paddingBottom: "12px",
          }}
        >
          <button
            type="button"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.9rem",
              color: mode === "login" ? "#fff" : "rgba(255,255,255,0.4)",
              borderBottom: mode === "login" ? "2px solid #3b82f6" : "2px solid transparent",
              paddingBottom: "6px",
            }}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.9rem",
              color: mode === "invite" ? "#fff" : "rgba(255,255,255,0.4)",
              borderBottom: mode === "invite" ? "2px solid #3b82f6" : "2px solid transparent",
              paddingBottom: "6px",
            }}
            onClick={() => {
              setMode("invite");
              setError(null);
            }}
          >
            Redeem Invite
          </button>
          <button
            type="button"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.9rem",
              color: mode === "key" ? "#fff" : "rgba(255,255,255,0.4)",
              borderBottom: mode === "key" ? "2px solid #3b82f6" : "2px solid transparent",
              paddingBottom: "6px",
            }}
            onClick={() => {
              setMode("key");
              setError(null);
            }}
          >
            Admin / Key
          </button>
        </div>

        {mode === "login" && (
          <form onSubmit={handlePasswordLogin}>
            <h1 className="gate-title">Welcome Back</h1>
            <p className="gate-sub">Sign in with your username and password.</p>

            <div className="field">
              <label htmlFor="login-username">Username</label>
              <div className="key-row">
                <input
                  id="login-username"
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Your username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="field" style={{ marginTop: "12px" }}>
              <label htmlFor="login-password">Password</label>
              <div className="key-row">
                <input
                  id="login-password"
                  type={revealPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  spellCheck={false}
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="reveal-btn"
                  onClick={() => setRevealPassword((v) => !v)}
                  aria-label={revealPassword ? "Hide password" : "Show password"}
                >
                  {revealPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button className="generate" type="submit" disabled={submitting} style={{ marginTop: "16px" }}>
              {submitting ? "Signing in…" : "Sign In"}
            </button>
          </form>
        )}

        {mode === "invite" && (
          <form onSubmit={handleRedeemInvite}>
            <h1 className="gate-title">Enter Your Invite Code</h1>
            <p className="gate-sub">Access is currently private. Each invite code can be used once.</p>

            <div className="field">
              <label htmlFor="invite-code">Invite code</label>
              <div className="key-row">
                <input
                  id="invite-code"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="e.g. RUM-XXXX-YYYY"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="field" style={{ marginTop: "12px" }}>
              <label htmlFor="nickname">Your Display Name</label>
              <div className="key-row">
                <input
                  id="nickname"
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="e.g. Valentine"
                  autoComplete="name"
                  spellCheck={false}
                  disabled={submitting}
                />
              </div>
            </div>

            <button className="generate" type="submit" disabled={submitting} style={{ marginTop: "16px" }}>
              {submitting ? "Redeeming…" : "Redeem & Enter Studio"}
            </button>
          </form>
        )}

        {mode === "key" && (
          <form onSubmit={handleUnlockKey}>
            <h1 className="gate-title">Access Key / Admin Login</h1>
            <p className="gate-sub">Enter your existing session key or owner key.</p>

            <div className="field">
              <label htmlFor="api-key">Access / Owner key</label>
              <div className="key-row">
                <input
                  id="api-key"
                  type={revealKey ? "text" : "password"}
                  value={keyValue}
                  onChange={(e) => setKeyValue(e.target.value)}
                  placeholder="usr_… or admin key"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="reveal-btn"
                  onClick={() => setRevealKey((v) => !v)}
                  aria-label={revealKey ? "Hide key" : "Show key"}
                >
                  {revealKey ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button className="generate" type="submit" disabled={submitting} style={{ marginTop: "16px" }}>
              {submitting ? "Checking…" : "Unlock Studio"}
            </button>
          </form>
        )}

        {error && <div className="error-box" style={{ marginTop: "16px" }}>{error}</div>}
      </div>
    </main>
  );
}

export default function ApiKeyGate({ children }: { children: React.ReactNode }) {
  const { status } = useApiKey();

  if (status === "checking") {
    return (
      <main className="shell gate-shell">
        <div className="gate-splash">
          <div className="beam" />
        </div>
      </main>
    );
  }

  if (status === "locked") return <GateForm />;

  return (
    <>
      <AccountBar />
      {children}
    </>
  );
}
