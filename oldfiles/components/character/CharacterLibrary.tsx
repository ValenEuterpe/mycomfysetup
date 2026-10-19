"use client";

import { useState } from "react";
import Link from "next/link";
import { CharacterRecord } from "@/lib/characters";
import { useApiKey } from "@/components/ApiKeyProvider";
import { fetchAndStore } from "@/lib/mediaCache";
import { IMAGE_RATIOS, ImageAspectRatio } from "@/lib/aspect";

type Props = {
  characters: CharacterRecord[];
  loading: boolean;
  onDeleteCharacter: (id: string) => Promise<void>;
  onUseInScene: (tag: string) => void;
};

export default function CharacterLibrary({
  characters,
  loading,
  onDeleteCharacter,
  onUseInScene,
}: Props) {
  const { authFetch, syncUsage } = useApiKey();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Cross-device fallback & on-demand rendering states
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [renderingId, setRenderingId] = useState<string | null>(null);
  const [renderErrors, setRenderErrors] = useState<Record<string, string>>({});

  const copyTag = (tag: string) => {
    navigator.clipboard.writeText(`#${tag}`);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  // Render a preview image on demand for prompt-only characters or across devices
  const handleRenderPreview = async (char: CharacterRecord) => {
    if (renderingId) return;
    setRenderingId(char.id);
    setRenderErrors((prev) => ({ ...prev, [char.id]: "" }));

    try {
      const p = char.workflowParams || {};
      const ratioChoice = p.aspectRatio || "9:16 (Portrait)";
      const dims = IMAGE_RATIOS[ratioChoice as ImageAspectRatio] || { width: 832, height: 1216 };

      const res = await authFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "t2i",
          prompt: char.prompt || char.description,
          negativePrompt: char.negativePrompt || undefined,
          aspectRatio: ratioChoice,
          width: p.width || dims.width,
          height: p.height || dims.height,
          seed: p.seed,
          steps: p.steps,
          cfg: p.cfg,
          samplerName: p.samplerName,
          scheduler: p.scheduler,
          modelChoice: p.model || "anima",
        }),
      });

      const data = await res.json();
      syncUsage(data);

      if (!res.ok) {
        throw new Error(data.error || "Failed to start generation.");
      }

      const job = data.job;
      if (job.status === "done" && job.videoUrl) {
        const blob = await fetchAndStore(job.id, job.videoUrl, (target) => authFetch(target));
        const url = blob ? URL.createObjectURL(blob) : job.videoUrl;
        setLocalPreviews((prev) => ({ ...prev, [char.id]: url }));
        setBrokenImages((prev) => ({ ...prev, [char.id]: false }));
        setRenderingId(null);

        // Persist server URL to backend so future loads have the image
        void authFetch("/api/characters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...char, imageUrl: job.videoUrl }),
        });
      } else {
        // Poll status
        const poll = async () => {
          try {
            const sRes = await authFetch(`/api/status/${job.id}`);
            const sData = await sRes.json();
            if (!sRes.ok) throw new Error(sData.error || "Status check failed.");
            if (sData.job?.status === "done" && sData.job?.videoUrl) {
              const videoUrl = sData.job.videoUrl;
              const blob = await fetchAndStore(job.id, videoUrl, (target) => authFetch(target));
              const url = blob ? URL.createObjectURL(blob) : videoUrl;
              setLocalPreviews((prev) => ({ ...prev, [char.id]: url }));
              setBrokenImages((prev) => ({ ...prev, [char.id]: false }));
              setRenderingId(null);

              void authFetch("/api/characters", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...char, imageUrl: videoUrl }),
              });
              return;
            }
            if (sData.job?.status === "error") {
              throw new Error(sData.job.error || "Render failed.");
            }
            setTimeout(poll, 2500);
          } catch (e: any) {
            setRenderErrors((prev) => ({ ...prev, [char.id]: e.message || "Failed to generate preview." }));
            setRenderingId(null);
          }
        };
        setTimeout(poll, 2500);
      }
    } catch (err: any) {
      setRenderErrors((prev) => ({ ...prev, [char.id]: err.message || "Failed to start generation." }));
      setRenderingId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)" }}>
        <div className="beam" style={{ maxWidth: "200px", margin: "0 auto 16px" }} />
        <p>Loading your character roster…</p>
      </div>
    );
  }

  if (characters.length === 0) {
    return (
      <div
        className="panel"
        style={{
          textAlign: "center",
          padding: "64px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <div style={{ fontSize: "3rem" }}>🎭</div>
        <h2 style={{ fontSize: "1.3rem", margin: 0, fontWeight: 600 }}>No Characters Saved Yet</h2>
        <p style={{ color: "var(--muted)", maxWidth: "42ch", margin: 0, lineHeight: 1.5, fontSize: "0.88rem" }}>
          Create persistent characters with ultra-detailed physical descriptions, custom tattoos, and exact seed tracking in the Character Maker.
        </p>
        <Link href="/character-maker" className="generate" style={{ textDecoration: "none", marginTop: "8px" }}>
          ✨ Create Your First Character
        </Link>
      </div>
    );
  }

  return (
    <div
      className="char-library-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: "20px",
      }}
    >
      {characters.map((char) => {
        const isExpanded = expandedId === char.id;
        const seed = char.workflowParams?.seed;
        const model = char.workflowParams?.model === "basb" ? "BAS Anime" : "Anima Base";

        const displayUrl = localPreviews[char.id] || char.imageUrl;
        const hasValidImage = Boolean(displayUrl && !brokenImages[char.id]);
        const isRendering = renderingId === char.id;

        return (
          <div
            key={char.id}
            className="panel"
            style={{
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              position: "relative",
              border: "1px solid var(--panel-border)",
              transition: "border-color 0.15s ease",
            }}
          >
            {/* Visual Header: Live Image or Stylized Prompt-Only Identity Badge */}
            {hasValidImage ? (
              <div
                style={{
                  width: "100%",
                  height: "260px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  background: "#050608",
                  position: "relative",
                }}
              >
                <img
                  src={displayUrl!}
                  alt={char.name}
                  onError={() => setBrokenImages((prev) => ({ ...prev, [char.id]: true }))}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    bottom: "8px",
                    right: "8px",
                    fontSize: "0.68rem",
                    background: "rgba(0, 0, 0, 0.75)",
                    backdropFilter: "blur(4px)",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    color: "var(--text)",
                  }}
                >
                  {model}
                </span>
              </div>
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "260px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  background:
                    "linear-gradient(135deg, rgba(79, 180, 255, 0.12), rgba(155, 89, 182, 0.15) 50%, #080a10 100%)",
                  border: "1px dashed rgba(79, 180, 255, 0.25)",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "20px",
                  textAlign: "center",
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, rgba(79, 180, 255, 0.35), rgba(155, 89, 182, 0.4))",
                    border: "2px solid rgba(79, 180, 255, 0.5)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.6rem",
                    fontWeight: 700,
                    marginBottom: "10px",
                    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
                  }}
                >
                  {char.name.charAt(0).toUpperCase()}
                </div>
                <span
                  style={{
                    fontSize: "0.76rem",
                    color: "var(--blue)",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono), monospace",
                  }}
                >
                  #{char.tag}
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "4px 0 14px" }}>
                  Prompt Identity &middot; {model}
                </span>

                <button
                  type="button"
                  className="history-btn"
                  onClick={() => handleRenderPreview(char)}
                  disabled={isRendering}
                  style={{
                    fontSize: "0.78rem",
                    padding: "6px 14px",
                    borderColor: "var(--blue)",
                    color: "var(--blue)",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {isRendering ? (
                    <>
                      <span className="dot" style={{ background: "var(--blue)" }} />
                      Generating Preview…
                    </>
                  ) : (
                    <>⚡ Render Preview</>
                  )}
                </button>

                {renderErrors[char.id] && (
                  <span style={{ fontSize: "0.7rem", color: "var(--danger)", marginTop: "6px" }}>
                    {renderErrors[char.id]}
                  </span>
                )}
              </div>
            )}

            {/* Title & Hashtag & Action Links */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "1.05rem",
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {char.name}
                </h3>
                <button
                  type="button"
                  onClick={() => copyTag(char.tag)}
                  title="Click to copy hashtag"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontSize: "0.82rem",
                    color: "var(--blue)",
                    fontFamily: "var(--font-mono), monospace",
                    marginTop: "2px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span>#{char.tag}</span>
                  <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                    {copiedTag === char.tag ? "✓ Copied" : "📋"}
                  </span>
                </button>
              </div>

              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                <Link
                  href={`/character-maker?load=${encodeURIComponent(char.id)}`}
                  className="history-btn"
                  title="Open character in Character Maker to edit or evolve"
                  style={{
                    fontSize: "0.76rem",
                    padding: "4px 10px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    textDecoration: "none",
                  }}
                >
                  ✏️ Edit
                </Link>
                <button
                  type="button"
                  className="history-btn"
                  onClick={() => onUseInScene(char.tag)}
                  style={{
                    fontSize: "0.76rem",
                    padding: "4px 10px",
                    borderColor: "var(--blue)",
                    color: "var(--blue)",
                    fontWeight: 600,
                  }}
                >
                  + Use in Scene
                </button>
              </div>
            </div>

            {/* Parameter Pills */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                fontSize: "0.72rem",
                color: "var(--muted)",
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              {seed !== undefined && (
                <span
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  Seed: {seed}
                </span>
              )}
              {char.workflowParams?.cfg && (
                <span
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  CFG: {char.workflowParams.cfg}
                </span>
              )}
              {char.workflowParams?.samplerName && (
                <span
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  {char.workflowParams.samplerName}
                </span>
              )}
            </div>

            {/* Core Description Accordion */}
            <div style={{ fontSize: "0.8rem", lineHeight: 1.45, color: "var(--text)" }}>
              <p
                style={{
                  margin: 0,
                  display: "-webkit-box",
                  WebkitLineClamp: isExpanded ? undefined : 3,
                  WebkitBoxOrient: "vertical",
                  overflow: isExpanded ? "visible" : "hidden",
                  color: "rgba(255, 255, 255, 0.85)",
                }}
              >
                {char.description}
              </p>
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : char.id)}
                style={{
                  background: "none",
                  border: "none",
                  padding: "4px 0 0",
                  cursor: "pointer",
                  color: "var(--muted)",
                  fontSize: "0.74rem",
                  textDecoration: "underline",
                }}
              >
                {isExpanded ? "Show less" : "Show full description"}
              </button>
            </div>

            {/* Footer Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "auto",
                paddingTop: "10px",
                borderTop: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                Added {new Date(char.createdAt).toLocaleDateString()}
              </span>

              <button
                type="button"
                onClick={async () => {
                  if (confirm(`Are you sure you want to delete character '${char.name}'?`)) {
                    setDeletingId(char.id);
                    await onDeleteCharacter(char.id);
                    setDeletingId(null);
                  }
                }}
                disabled={deletingId === char.id}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--danger)",
                  fontSize: "0.74rem",
                  cursor: "pointer",
                  padding: "2px 6px",
                }}
              >
                {deletingId === char.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
