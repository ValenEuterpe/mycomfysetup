"use client";

import { useEffect, useRef, useState } from "react";
import { useApiKey } from "./ApiKeyProvider";

type Props = {
  onClose: () => void;
};

export const LLM_STORAGE_KEY = "studio.llm.config";

export type StoredLlmConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export default function UserSettingsModal({ onClose }: Props) {
  const { authFetch, username } = useApiKey();

  const [loading, setLoading] = useState(true);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Personal API key state
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  // OpenAI-compatible LLM endpoint state (cached in localStorage)
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [showLlmApiKey, setShowLlmApiKey] = useState(false);
  const [llmModel, setLlmModel] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [testingLlm, setTestingLlm] = useState(false);
  const [savingLlm, setSavingLlm] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [llmSuccess, setLlmSuccess] = useState<string | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [customModelMode, setCustomModelMode] = useState(false);

  const closeRef = useRef<HTMLButtonElement>(null);

  // Load existing credential status, API key, and cached LLM settings on mount
  useEffect(() => {
    let active = true;

    async function checkStatus() {
      try {
        // Read LLM settings directly from client cache
        try {
          const cached = window.localStorage.getItem(LLM_STORAGE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.baseUrl) setLlmBaseUrl(parsed.baseUrl);
            if (parsed.apiKey) setLlmApiKey(parsed.apiKey);
            if (parsed.model) {
              setLlmModel(parsed.model);
              setAvailableModels([parsed.model]);
            }
          }
        } catch {}

        const [credRes, keyRes] = await Promise.all([
          authFetch("/api/user/credentials"),
          authFetch("/api/user/apikey"),
        ]);
        const credData = await credRes.json().catch(() => null);
        const keyData = await keyRes.json().catch(() => null);

        if (active && credRes.ok && credData?.ok) {
          setHasCredentials(Boolean(credData.hasCredentials));
          if (credData.loginUsername) {
            setLoginUsername(credData.loginUsername);
          } else if (username) {
            // Suggest their current display name as login username (cleaned)
            setLoginUsername(username.toLowerCase().replace(/[^a-z0-9_-]/g, ""));
          }
        }

        if (active && keyRes.ok && keyData?.ok) {
          setApiKey(keyData.apiKey || "");
          setIsOwner(Boolean(keyData.isOwner));
        }
      } catch (err: any) {
        console.error("Failed to check settings:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    checkStatus();
    return () => {
      active = false;
    };
  }, [authFetch, username]);

  const copyApiKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rotateApiKey = async () => {
    setRotating(true);
    setError(null);
    try {
      const res = await authFetch("/api/user/apikey", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to rotate API key.");
      }
      setApiKey(data.apiKey);
      setConfirmRotate(false);
      setSuccess("API key rotated successfully. Previous key has been revoked.");
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRotating(false);
    }
  };

  const testLlmEndpoint = async () => {
    const cleanUrl = llmBaseUrl.trim();
    if (!cleanUrl) {
      setLlmTestResult({ ok: false, message: "Please enter an endpoint URL first." });
      return;
    }

    setTestingLlm(true);
    setLlmTestResult(null);
    setLlmError(null);

    try {
      const res = await authFetch("/api/llm/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: cleanUrl,
          apiKey: llmApiKey.includes("••••") ? undefined : llmApiKey.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to reach endpoint.");
      }

      const models: string[] = Array.isArray(data.models) ? data.models : [];
      setAvailableModels(models);
      setLlmTestResult({
        ok: true,
        message: `✓ Connected (${data.count || models.length} model${models.length === 1 ? "" : "s"} found)`,
      });

      if (models.length > 0 && (!llmModel || !models.includes(llmModel))) {
        // Automatically select the first model or a smart default
        const best = models.find((m) => m.includes("gpt-4") || m.includes("llama-3") || m.includes("claude") || m.includes("qwen")) || models[0];
        setLlmModel(best);
      }
    } catch (err: any) {
      setLlmTestResult({
        ok: false,
        message: `✕ ${err.message || "Failed to connect to endpoint"}`,
      });
    } finally {
      setTestingLlm(false);
    }
  };

  const saveLlmSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = llmBaseUrl.trim();
    if (!cleanUrl) {
      setLlmError("Please enter an endpoint URL.");
      return;
    }
    if (!llmModel.trim()) {
      setLlmError("Please select or enter a model.");
      return;
    }

    setSavingLlm(true);
    setLlmError(null);
    setLlmSuccess(null);

    try {
      const config: StoredLlmConfig = {
        baseUrl: cleanUrl,
        apiKey: llmApiKey.trim(),
        model: llmModel.trim(),
      };
      window.localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(config));

      setLlmSuccess("AI Assistant & Character Maker settings saved to local cache!");
      setTimeout(() => setLlmSuccess(null), 4000);
    } catch (err: any) {
      setLlmError("Failed to save settings to browser cache.");
    } finally {
      setSavingLlm(false);
    }
  };

  const clearLlmSettings = () => {
    try {
      window.localStorage.removeItem(LLM_STORAGE_KEY);
      setLlmBaseUrl("");
      setLlmApiKey("");
      setLlmModel("");
      setAvailableModels([]);
      setLlmTestResult(null);
      setLlmSuccess("AI configuration cleared from browser cache.");
      setTimeout(() => setLlmSuccess(null), 3000);
    } catch {}
  };

  // Trap Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cleanUser = loginUsername.trim();
    if (!cleanUser || cleanUser.length < 3) {
      setError("Username must be at least 3 characters long.");
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(cleanUser)) {
      setError("Username can only contain letters, numbers, hyphens, and underscores.");
      return;
    }

    if (!password) {
      setError("Please enter a password.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch("/api/user/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginUsername: cleanUser,
          password,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to save credentials.");
      }

      setHasCredentials(true);
      setSuccess("Your login credentials have been saved! You can now use them to sign in from any device.");
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err.message || "Failed to save credentials.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Account Settings"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "480px" }}
      >
        <header className="modal-head">
          <div>
            <h2 className="modal-title">Account Settings</h2>
            <p className="modal-sub">
              {username ? `Signed in as ${username}` : "Device Login Credentials"}
            </p>
          </div>
          <button ref={closeRef} type="button" className="modal-close" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="modal-body" style={{ maxHeight: "calc(80vh - 80px)", overflowY: "auto", paddingRight: "4px" }}>
          {loading ? (
            <p style={{ color: "var(--muted)", padding: "12px 0" }}>Loading settings…</p>
          ) : (
            <>
              {/* Personal API Key Section */}
              <div style={{ marginBottom: "20px", paddingBottom: "18px", borderBottom: "1px solid var(--panel-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text)" }}>
                    Personal API Key
                  </label>
                  {isOwner && (
                    <span style={{ fontSize: "0.72rem", background: "rgba(255, 170, 0, 0.15)", color: "#ffa502", padding: "2px 6px", borderRadius: "4px" }}>
                      Owner Key
                    </span>
                  )}
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: "10px", lineHeight: "1.4" }}>
                  Use this key with OpenAI-compatible clients and tools at <code>/v1/images/generations</code>.
                </p>

                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                  <input
                    type={showApiKey ? "text" : "password"}
                    readOnly
                    value={apiKey || ""}
                    placeholder={loading ? "Loading..." : "No API key"}
                    style={{
                      flex: 1,
                      fontFamily: "var(--font-mono), monospace",
                      fontSize: "0.82rem",
                      background: "rgba(0, 0, 0, 0.25)",
                      border: "1px solid var(--panel-border)",
                      borderRadius: "6px",
                      padding: "8px 10px",
                      color: "var(--text)",
                    }}
                  />
                  <button
                    type="button"
                    className="history-btn"
                    onClick={() => setShowApiKey(!showApiKey)}
                    title={showApiKey ? "Hide API key" : "Show API key"}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    className="history-btn"
                    onClick={copyApiKey}
                    disabled={!apiKey}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                </div>

                {!isOwner ? (
                  <div style={{ marginTop: "8px" }}>
                    {!confirmRotate ? (
                      <button
                        type="button"
                        className="history-btn"
                        onClick={() => setConfirmRotate(true)}
                        style={{ fontSize: "0.75rem", color: "var(--muted)" }}
                      >
                        Rotate API Key
                      </button>
                    ) : (
                      <div
                        style={{
                          background: "rgba(255, 71, 87, 0.08)",
                          border: "1px solid rgba(255, 71, 87, 0.3)",
                          borderRadius: "6px",
                          padding: "10px 12px",
                          fontSize: "0.8rem",
                          color: "#ff6b81",
                        }}
                      >
                        <p style={{ margin: "0 0 8px 0", lineHeight: "1.4" }}>
                          Rotating your API key will immediately invalidate your previous key. Any external apps or scripts using it will stop working until updated.
                        </p>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            type="button"
                            className="history-btn"
                            disabled={rotating}
                            onClick={rotateApiKey}
                            style={{ borderColor: "#ff4757", color: "#ff4757", fontWeight: 600 }}
                          >
                            {rotating ? "Rotating…" : "Yes, rotate key"}
                          </button>
                          <button
                            type="button"
                            className="history-btn"
                            disabled={rotating}
                            onClick={() => setConfirmRotate(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "4px 0 0" }}>
                    Owner key is managed via the <code>OWNER_API_KEY</code> environment variable.
                  </p>
                )}
              </div>

              {/* OpenAI-Compatible LLM Settings (Character Maker & Scene Studio) */}
              <div style={{ marginBottom: "20px", paddingBottom: "18px", borderBottom: "1px solid var(--panel-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text)" }}>
                    OpenAI-Compatible AI Endpoint
                  </label>
                  <span style={{ fontSize: "0.72rem", background: "rgba(79, 180, 255, 0.15)", color: "var(--blue)", padding: "2px 6px", borderRadius: "4px" }}>
                    Character Maker & Scenes
                  </span>
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: "12px", lineHeight: "1.4" }}>
                  Connect any OpenAI-compatible API (e.g. OpenAI, OpenRouter, Groq, Ollama, LMStudio) to power the Character Maker chat and Scene Studio prompt expander.
                </p>

                {llmError && (
                  <div className="error-box" style={{ marginBottom: "12px", fontSize: "0.82rem" }}>
                    {llmError}
                  </div>
                )}

                {llmSuccess && (
                  <div
                    style={{
                      background: "rgba(46, 213, 115, 0.12)",
                      border: "1px solid rgba(46, 213, 115, 0.3)",
                      borderRadius: "6px",
                      color: "#7bed9f",
                      padding: "8px 12px",
                      marginBottom: "12px",
                      fontSize: "0.82rem",
                    }}
                  >
                    {llmSuccess}
                  </div>
                )}

                <div className="field" style={{ marginBottom: "10px" }}>
                  <label htmlFor="llm-base-url" style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                    Endpoint Base URL
                  </label>
                  <input
                    id="llm-base-url"
                    type="url"
                    value={llmBaseUrl}
                    onChange={(e) => {
                      setLlmBaseUrl(e.target.value);
                      setLlmTestResult(null);
                    }}
                    placeholder="e.g. https://api.openai.com/v1 or http://localhost:11434/v1"
                    disabled={savingLlm || testingLlm}
                    style={{
                      width: "100%",
                      fontFamily: "var(--font-mono), monospace",
                      fontSize: "0.82rem",
                    }}
                  />
                </div>

                <div className="field" style={{ marginBottom: "10px" }}>
                  <label htmlFor="llm-api-key" style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                    API Key
                  </label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      id="llm-api-key"
                      type={showLlmApiKey ? "text" : "password"}
                      value={llmApiKey}
                      onChange={(e) => setLlmApiKey(e.target.value)}
                      placeholder="sk-... (leave blank for local Ollama / LMStudio)"
                      disabled={savingLlm || testingLlm}
                      style={{
                        flex: 1,
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "0.82rem",
                      }}
                    />
                    <button
                      type="button"
                      className="history-btn"
                      onClick={() => setShowLlmApiKey(!showLlmApiKey)}
                      style={{ fontSize: "0.78rem" }}
                    >
                      {showLlmApiKey ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "12px" }}>
                  <button
                    type="button"
                    className="history-btn"
                    onClick={testLlmEndpoint}
                    disabled={testingLlm || !llmBaseUrl.trim()}
                    style={{
                      padding: "6px 14px",
                      fontSize: "0.8rem",
                      borderColor: "var(--blue)",
                      color: "var(--blue)",
                      fontWeight: 600,
                    }}
                  >
                    {testingLlm ? "Testing Connection…" : "⚡ Test Endpoint"}
                  </button>

                  {llmTestResult && (
                    <span
                      style={{
                        fontSize: "0.78rem",
                        color: llmTestResult.ok ? "#7bed9f" : "#ff6b81",
                        lineHeight: 1.3,
                      }}
                    >
                      {llmTestResult.message}
                    </span>
                  )}
                </div>

                {/* Model Selection */}
                <div className="field" style={{ marginBottom: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <label htmlFor="llm-model" style={{ fontSize: "0.78rem", color: "var(--muted)", margin: 0 }}>
                      Selected Model
                    </label>
                    <button
                      type="button"
                      onClick={() => setCustomModelMode(!customModelMode)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--muted)",
                        fontSize: "0.72rem",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      {customModelMode ? "Select from list" : "Type custom model"}
                    </button>
                  </div>

                  {!customModelMode && availableModels.length > 0 ? (
                    <select
                      id="llm-model"
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      disabled={savingLlm || testingLlm}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        fontSize: "0.82rem",
                        background: "rgba(0, 0, 0, 0.25)",
                        color: "var(--text)",
                        border: "1px solid var(--panel-border)",
                        borderRadius: "6px",
                      }}
                    >
                      {availableModels.map((m) => (
                        <option key={m} value={m} style={{ background: "#18181b", color: "#fff" }}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="llm-model"
                      type="text"
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      placeholder="e.g. gpt-4o, llama-3.3-70b-instruct, qwen-2.5-72b"
                      disabled={savingLlm || testingLlm}
                      style={{
                        width: "100%",
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "0.82rem",
                      }}
                    />
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button
                    type="button"
                    className="history-btn"
                    onClick={clearLlmSettings}
                    style={{ fontSize: "0.76rem", color: "var(--muted)", padding: "4px 10px" }}
                  >
                    Clear AI Config
                  </button>
                  <button
                    type="button"
                    className="generate"
                    onClick={saveLlmSettings}
                    disabled={savingLlm || !llmBaseUrl.trim() || !llmModel.trim()}
                    style={{ padding: "6px 16px", fontSize: "0.82rem" }}
                  >
                    {savingLlm ? "Saving AI Settings…" : "Save AI Settings"}
                  </button>
                </div>
              </div>

              {/* Cross-Device Login Credentials Form */}
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text)", display: "block", marginBottom: "4px" }}>
                    Cross-Device Password Login
                  </label>
                  <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: 0, lineHeight: "1.4" }}>
                    Configure credentials to sign into this account from other devices or browsers.
                  </p>
                </div>

                <div
                  style={{
                    background: hasCredentials ? "rgba(46, 213, 115, 0.08)" : "rgba(59, 130, 246, 0.08)",
                    border: hasCredentials ? "1px solid rgba(46, 213, 115, 0.25)" : "1px solid rgba(59, 130, 246, 0.25)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    marginBottom: "14px",
                    fontSize: "0.82rem",
                    lineHeight: "1.4",
                    color: hasCredentials ? "#7bed9f" : "#93c5fd",
                  }}
                >
                  {hasCredentials ? (
                    <>
                      <strong>✓ Password login active.</strong> You can log in from any browser using your username and password.
                    </>
                  ) : (
                    <>
                      <strong>Set up login:</strong> Create a username & password to sign back in if you switch devices or clear cookies.
                    </>
                  )}
                </div>

                {error && (
                  <div className="error-box" style={{ marginBottom: "14px" }}>
                    {error}
                  </div>
                )}

                {success && (
                  <div
                    style={{
                      background: "rgba(46, 213, 115, 0.12)",
                      border: "1px solid rgba(46, 213, 115, 0.3)",
                      borderRadius: "6px",
                      color: "#7bed9f",
                      padding: "10px 14px",
                      marginBottom: "14px",
                      fontSize: "0.85rem",
                    }}
                  >
                    {success}
                  </div>
                )}

              <div className="field" style={{ marginBottom: "14px" }}>
                <label htmlFor="settings-login-username">Login Username</label>
                <input
                  id="settings-login-username"
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="e.g. creative_user"
                  autoComplete="username"
                  disabled={saving}
                  style={{ width: "100%" }}
                />
                <p className="field-help" style={{ fontSize: "0.75rem", marginTop: "4px" }}>
                  Used to log in on other devices. Letters, numbers, hyphens, and underscores only.
                </p>
              </div>

              <div className="field" style={{ marginBottom: "14px" }}>
                <label htmlFor="settings-password">
                  {hasCredentials ? "New Password" : "Password"}
                </label>
                <input
                  id="settings-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={hasCredentials ? "Leave blank to keep existing password" : "At least 6 characters"}
                  autoComplete="new-password"
                  disabled={saving}
                  style={{ width: "100%" }}
                />
              </div>

              <div className="field" style={{ marginBottom: "20px" }}>
                <label htmlFor="settings-confirm-password">Confirm Password</label>
                <input
                  id="settings-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  disabled={saving}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="history-btn"
                  onClick={onClose}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="generate"
                  disabled={saving || !loginUsername || !password}
                  style={{ padding: "8px 20px" }}
                >
                  {saving ? "Saving…" : hasCredentials ? "Update Credentials" : "Save Credentials"}
                </button>
              </div>
            </form>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
