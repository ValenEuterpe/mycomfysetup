"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useApiKey } from "@/components/ApiKeyProvider";
import AspectFrame from "@/components/AspectFrame";
import {
  Dimensions,
  IMAGE_ASPECT_RATIOS,
  IMAGE_RATIOS,
  ImageAspectRatio,
} from "@/lib/aspect";
import {
  DEFAULT_ANIMA_NEGATIVE_PROMPT,
  DEFAULT_T2I_CFG,
  DEFAULT_T2I_SAMPLER,
  DEFAULT_T2I_SCHEDULER,
  DEFAULT_T2I_STEPS,
  T2IModelChoice,
} from "@/lib/workflows";
import { fetchAndStore } from "@/lib/mediaCache";
import { CharacterRecord, cleanTag } from "@/lib/characters";

type Props = {
  characters: CharacterRecord[];
  initialTag?: string | null;
  onOpenSettings: () => void;
};

export default function SceneStudio({ characters, initialTag, onOpenSettings }: Props) {
  const { authFetch, syncUsage } = useApiKey();

  // Scene prompt input
  const [sceneInput, setSceneInput] = useState(() => {
    if (initialTag) {
      return `#${initialTag} sitting in a cinematic neo-noir detective office during a midnight rainstorm, dramatic window venetian blind shadows`;
    }
    return "";
  });

  // Hashtag autocomplete state
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Expanded scene state from AI
  const [composedPrompt, setComposedPrompt] = useState("");
  const [settingNotes, setSettingNotes] = useState("");
  const [aiExpanding, setAiExpanding] = useState(false);
  const [expandError, setExpandError] = useState<string | null>(null);

  // Prefix & Postfix
  const [usePrefix, setUsePrefix] = useState(true);
  const [prefixText, setPrefixText] = useState("masterpiece, best quality, score_9, score_8, safe, ");
  const [usePostfix, setUsePostfix] = useState(true);
  const [postfixText, setPostfixText] = useState("high detail, photorealistic, 8k resolution, cinematic lighting, sharp focus.");

  // Image generation controls
  const [ratio, setRatio] = useState<ImageAspectRatio>("16:9 (Landscape)");
  const [model, setModel] = useState<T2IModelChoice>("anima");
  const [negativePrompt, setNegativePrompt] = useState(DEFAULT_ANIMA_NEGATIVE_PROMPT);
  const [seed, setSeed] = useState<string>("");

  // Rendering state
  const [renderStatus, setRenderStatus] = useState<"idle" | "queuing" | "queued" | "rendering" | "done" | "error">("idle");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [queueAt, setQueueAt] = useState<{ position: number; total: number } | null>(null);

  const SCENE_SESSION_STORAGE_KEY = "studio.sceneStudio.session";
  const LLM_STORAGE_KEY = "studio.llm.config";

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRef = useRef(true);
  const [isHydrated, setIsHydrated] = useState(false);

  // Restore cached scene session on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SCENE_SESSION_STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.sceneInput) setSceneInput(s.sceneInput);
        if (s.composedPrompt) setComposedPrompt(s.composedPrompt);
        if (s.settingNotes) setSettingNotes(s.settingNotes);
        if (typeof s.usePrefix === "boolean") setUsePrefix(s.usePrefix);
        if (s.prefixText) setPrefixText(s.prefixText);
        if (typeof s.usePostfix === "boolean") setUsePostfix(s.usePostfix);
        if (s.postfixText) setPostfixText(s.postfixText);
        if (s.ratio && IMAGE_RATIOS[s.ratio as ImageAspectRatio]) setRatio(s.ratio as ImageAspectRatio);
        if (s.model) setModel(s.model);
        if (s.negativePrompt) setNegativePrompt(s.negativePrompt);
        if (s.seed) setSeed(String(s.seed));
        if (s.imageUrl) {
          setImageUrl(s.imageUrl);
          setRenderStatus("done");
        }
      }
    } catch {}
    setIsHydrated(true);
  }, []);

  // Auto-save session to localStorage
  useEffect(() => {
    if (!isHydrated) return;
    try {
      const session = {
        sceneInput,
        composedPrompt,
        settingNotes,
        usePrefix,
        prefixText,
        usePostfix,
        postfixText,
        ratio,
        model,
        negativePrompt,
        seed,
        imageUrl,
      };
      window.localStorage.setItem(SCENE_SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {}
  }, [
    isHydrated,
    sceneInput,
    composedPrompt,
    settingNotes,
    usePrefix,
    prefixText,
    usePostfix,
    postfixText,
    ratio,
    model,
    negativePrompt,
    seed,
    imageUrl,
  ]);

  const handleDiscardScene = () => {
    if (
      !confirm(
        "Are you sure you want to discard this scene draft? This will clear the scene description, composed prompt, and rendered image.",
      )
    ) {
      return;
    }
    try {
      window.localStorage.removeItem(SCENE_SESSION_STORAGE_KEY);
    } catch {}
    setSceneInput("");
    setComposedPrompt("");
    setSettingNotes("");
    setImageUrl(null);
    setSeed("");
    setRenderStatus("idle");
    setRenderError(null);
    setExpandError(null);
  };

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  // Detect referenced characters in sceneInput or composedPrompt
  const referencedCharacters = useMemo(() => {
    const textToScan = `${sceneInput} ${composedPrompt}`;
    const matches = Array.from(textToScan.matchAll(/#([a-zA-Z0-9_-]+)/g)).map((m: any) => cleanTag(m[1] as string));
    const unique = Array.from(new Set(matches));
    return characters.filter((c) => unique.includes(cleanTag(c.tag)));
  }, [sceneInput, composedPrompt, characters]);

  // Filtered characters for autocomplete popover
  const matchingCharacters = useMemo(() => {
    if (!tagQuery) return characters;
    const q = tagQuery.toLowerCase();
    return characters.filter((c) => c.name.toLowerCase().includes(q) || cleanTag(c.tag).includes(q));
  }, [characters, tagQuery]);

  // Dimensions
  const controlDimensions = useMemo(() => {
    return IMAGE_RATIOS[ratio] || { width: 1216, height: 832 };
  }, [ratio]);

  const busy = renderStatus === "queuing" || renderStatus === "queued" || renderStatus === "rendering";

  // Full assembled prompt to generate
  const finalGenerationPrompt = useMemo(() => {
    const mainBody = composedPrompt.trim() || sceneInput.trim();
    const parts: string[] = [];
    if (usePrefix && prefixText.trim()) parts.push(prefixText.trim());
    if (mainBody) parts.push(mainBody);
    if (usePostfix && postfixText.trim()) parts.push(postfixText.trim());
    return parts.join("\n\n");
  }, [usePrefix, prefixText, composedPrompt, sceneInput, usePostfix, postfixText]);

  // Insert character tag into input
  const insertTag = (tag: string) => {
    const clean = cleanTag(tag);
    const cursor = textareaRef.current?.selectionStart ?? sceneInput.length;
    const before = sceneInput.slice(0, cursor);
    const after = sceneInput.slice(cursor);

    // Replace partial hashtag if in progress
    const hashIndex = before.lastIndexOf("#");
    let newText = "";
    if (showTagMenu && hashIndex >= 0) {
      newText = before.slice(0, hashIndex) + `#${clean} ` + after;
    } else {
      newText = before + (before.endsWith(" ") || before.length === 0 ? "" : " ") + `#${clean} ` + after;
    }

    setSceneInput(newText);
    setShowTagMenu(false);
    setTagQuery("");

    // Update prefix with LoRA tag
    const loraTag = `@${clean}`;
    if (!prefixText.includes(loraTag)) {
      setPrefixText((old) => old.trim() + (old.trim().endsWith(",") ? " " : ", ") + `${loraTag}, `);
    }
  };

  // Textarea change handler with hashtag detection
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setSceneInput(val);

    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const hashMatch = textBeforeCursor.match(/#([a-zA-Z0-9_-]*)$/);

    if (hashMatch) {
      setShowTagMenu(true);
      setTagQuery(hashMatch[1]);
    } else {
      setShowTagMenu(false);
      setTagQuery("");
    }
  };

  // Expand scene with AI
  const handleExpandScene = async () => {
    if (!sceneInput.trim()) {
      setExpandError("Please write a scene description first.");
      return;
    }

    setAiExpanding(true);
    setExpandError(null);

    try {
      let llmConfig: any = undefined;
      try {
        const raw = window.localStorage.getItem(LLM_STORAGE_KEY);
        if (raw) llmConfig = JSON.parse(raw);
      } catch {}

      const res = await authFetch("/api/llm/scene-expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneIntent: sceneInput.trim(),
          characterTags: referencedCharacters.map((c) => c.tag),
          llmConfig,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        if (data?.unconfigured) {
          onOpenSettings();
        }
        throw new Error(data?.error || "Failed to expand scene.");
      }

      setComposedPrompt(data.composedPrompt || sceneInput);
      setSettingNotes(data.settingAndPoses || "");
      if (data.suggestedPrefix) setPrefixText(data.suggestedPrefix);
      if (data.suggestedPostfix) setPostfixText(data.suggestedPostfix);
    } catch (err: any) {
      setExpandError(err.message || "Failed to expand scene with AI.");
    } finally {
      setAiExpanding(false);
    }
  };

  // Cache & show image
  const cacheAndShow = useCallback(
    async (id: string, url: string) => {
      setImageUrl(url);
      const blob = await fetchAndStore(id, url, (target) => authFetch(target));
      if (!blob || !liveRef.current) return;

      const objectUrl = URL.createObjectURL(blob);
      setImageUrl((old) => {
        if (old && old.startsWith("blob:")) URL.revokeObjectURL(old);
        return objectUrl;
      });
    },
    [authFetch],
  );

  // Poll scene render
  const pollJob = useCallback(
    (id: string) => {
      if (pollRef.current) clearTimeout(pollRef.current);

      const tick = async () => {
        if (!liveRef.current) return;
        try {
          const res = await authFetch(`/api/status/${id}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Status check failed.");
          if (!liveRef.current) return;

          const job = data.job;
          if (job.status === "done" && job.videoUrl) {
            setQueueAt(null);
            setRenderStatus("done");
            void cacheAndShow(job.id, job.videoUrl);
            if (job.workflowParams?.seed) setSeed(String(job.workflowParams.seed));
            return;
          }

          if (job.status === "error") {
            setQueueAt(null);
            setRenderError(job.error || "Scene render failed.");
            setRenderStatus("error");
            return;
          }

          if (job.status === "queued") {
            setQueueAt({ position: job.position ?? 1, total: job.queueTotal ?? 1 });
            setRenderStatus("queued");
            pollRef.current = setTimeout(tick, 2500);
            return;
          }

          setQueueAt(null);
          setRenderStatus("rendering");
          pollRef.current = setTimeout(tick, 2500);
        } catch (err: any) {
          if (!liveRef.current) return;
          setRenderError(err.message);
          setRenderStatus("error");
        }
      };

      tick();
    },
    [authFetch, cacheAndShow],
  );

  // Generate scene
  const handleGenerateScene = async () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setRenderError(null);
    setQueueAt(null);

    const promptToSend = finalGenerationPrompt.trim();
    if (!promptToSend) {
      setRenderError("Scene prompt is empty.");
      return;
    }

    try {
      setRenderStatus("queuing");

      const payload: Record<string, any> = {
        type: "t2i",
        prompt: promptToSend,
        negativePrompt: negativePrompt.trim() || undefined,
        aspectRatio: ratio,
        model,
        steps: DEFAULT_T2I_STEPS,
        cfg: DEFAULT_T2I_CFG,
        samplerName: DEFAULT_T2I_SAMPLER,
        scheduler: DEFAULT_T2I_SCHEDULER,
      };

      if (seed.trim()) {
        const s = Number(seed.trim());
        if (Number.isInteger(s) && s >= 0) payload.seed = s;
      }

      const res = await authFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      syncUsage(data);

      if (!res.ok) {
        throw new Error(data.error || "Failed to queue scene generation.");
      }

      const job = data.job;
      setJobId(job.id);
      if (job.workflowParams?.seed) setSeed(String(job.workflowParams.seed));

      if (job.status === "done" && job.videoUrl) {
        setRenderStatus("done");
        void cacheAndShow(job.id, job.videoUrl);
      } else {
        setRenderStatus(job.status === "queued" ? "queued" : "rendering");
        pollJob(job.id);
      }
    } catch (err: any) {
      setRenderError(err.message || "Failed to start scene render.");
      setRenderStatus("error");
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: "24px", alignItems: "start" }}>
      {/* LEFT: Scene Composer with #character Tags */}
      <div className="panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <h2 style={{ fontSize: "1.15rem", margin: "0 0 4px", fontWeight: 600 }}>Scene Studio</h2>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)" }}>
            Describe a scene and insert characters using <code style={{ color: "var(--blue)" }}>#character_name</code>. The AI will weave their exact physical descriptions into the environment and poses.
          </p>
        </div>

        {/* Quick character insert chips */}
        {characters.length > 0 && (
          <div>
            <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginBottom: "6px", fontWeight: 600 }}>
              AVAILABLE CHARACTERS (CLICK TO INSERT):
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {characters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => insertTag(c.tag)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid var(--panel-border)",
                    borderRadius: "16px",
                    padding: "3px 10px 3px 4px",
                    cursor: "pointer",
                    fontSize: "0.76rem",
                    color: "var(--text)",
                  }}
                >
                  {c.imageUrl ? (
                    <img
                      src={c.imageUrl}
                      alt={c.name}
                      style={{ width: "20px", height: "20px", borderRadius: "50%", objectFit: "cover" }}
                    />
                  ) : (
                    <span
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "rgba(79, 180, 255, 0.25)",
                        color: "var(--blue)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                      }}
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span>#{c.tag}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scene Textarea with Autocomplete */}
        <div style={{ position: "relative" }}>
          <label htmlFor="scene-intent" style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: "6px" }}>
            Scene Description & Character Poses
          </label>
          <textarea
            id="scene-intent"
            ref={textareaRef}
            value={sceneInput}
            onChange={handleInputChange}
            placeholder="e.g. In a cozy dimly-lit coffee shop in Paris on a rainy afternoon, #silvana is sitting at a wooden table sipping cappuccino, smiling at #marcus who is sitting opposite her wearing a leather jacket..."
            rows={4}
            style={{
              width: "100%",
              fontSize: "0.85rem",
              lineHeight: "1.5",
              padding: "10px 12px",
              background: "rgba(0, 0, 0, 0.3)",
              borderRadius: "8px",
            }}
          />

          {/* Autocomplete Menu */}
          {showTagMenu && matchingCharacters.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                zIndex: 20,
                background: "#181a20",
                border: "1px solid var(--panel-border)",
                borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
                maxHeight: "200px",
                overflowY: "auto",
                width: "280px",
                padding: "6px",
              }}
            >
              <div style={{ fontSize: "0.7rem", color: "var(--muted)", padding: "4px 8px" }}>
                Select a character to tag:
              </div>
              {matchingCharacters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => insertTag(c.tag)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "6px 8px",
                    background: "transparent",
                    border: "none",
                    borderRadius: "6px",
                    textAlign: "left",
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(79, 180, 255, 0.15)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {c.imageUrl ? (
                    <img
                      src={c.imageUrl}
                      alt={c.name}
                      style={{ width: "24px", height: "24px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <span
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        background: "rgba(79, 180, 255, 0.25)",
                        color: "var(--blue)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--blue)", fontFamily: "var(--font-mono), monospace" }}>
                      #{c.tag}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Referenced Character Badges */}
        {referencedCharacters.length > 0 && (
          <div
            style={{
              background: "rgba(79, 180, 255, 0.06)",
              border: "1px solid rgba(79, 180, 255, 0.2)",
              borderRadius: "8px",
              padding: "10px 14px",
            }}
          >
            <div style={{ fontSize: "0.74rem", color: "var(--blue)", fontWeight: 600, marginBottom: "8px" }}>
              ✓ DETECTED CHARACTERS ({referencedCharacters.length}) — EXACT DESCRIPTIONS BOUND:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {referencedCharacters.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "0.78rem" }}>
                  {c.imageUrl ? (
                    <img
                      src={c.imageUrl}
                      alt={c.name}
                      style={{ width: "34px", height: "34px", borderRadius: "6px", objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "34px",
                        height: "34px",
                        borderRadius: "6px",
                        background: "rgba(79, 180, 255, 0.2)",
                        color: "var(--blue)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.9rem",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <strong style={{ color: "var(--text)" }}>
                      {c.name} (#{c.tag}):
                    </strong>{" "}
                    <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                      {c.description.slice(0, 130)}…
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expand Scene Button */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ margin: 0, fontSize: "0.74rem", color: "var(--muted)" }}>
            The AI enriches atmosphere and poses while preserving character features verbatim.
          </p>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              className="history-btn"
              onClick={handleDiscardScene}
              disabled={!sceneInput && !composedPrompt && !imageUrl}
              title="Discard draft scene and reset"
              style={{
                padding: "8px 14px",
                fontSize: "0.82rem",
                color: "var(--red, #ff5252)",
                borderColor: "rgba(255, 82, 82, 0.35)",
              }}
            >
              🗑️ Discard Draft
            </button>
            <button
              type="button"
              className="history-btn"
              onClick={handleExpandScene}
              disabled={aiExpanding || !sceneInput.trim()}
              style={{
                padding: "8px 18px",
                fontSize: "0.82rem",
                borderColor: "var(--blue)",
                color: "var(--blue)",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {aiExpanding ? "Expanding Scene…" : "✨ Expand Scene with AI"}
            </button>
          </div>
        </div>

        {expandError && <div className="error-box" style={{ fontSize: "0.82rem" }}>{expandError}</div>}

        {/* Reviewed Composed Prompt Preview */}
        {composedPrompt && (
          <div style={{ borderTop: "1px solid var(--panel-border)", paddingTop: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label htmlFor="composed-prompt" style={{ fontSize: "0.78rem", fontWeight: 600, color: "#7bed9f", margin: 0 }}>
                ✓ AI-Expanded Scene Prompt
              </label>
              {settingNotes && (
                <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                  {settingNotes.slice(0, 48)}…
                </span>
              )}
            </div>
            <textarea
              id="composed-prompt"
              value={composedPrompt}
              onChange={(e) => setComposedPrompt(e.target.value)}
              rows={5}
              style={{
                width: "100%",
                fontSize: "0.82rem",
                lineHeight: "1.45",
                padding: "8px 10px",
                border: "1px solid rgba(123, 237, 159, 0.3)",
              }}
            />
          </div>
        )}

        {/* Prefix & Postfix Toggles */}
        <div style={{ borderTop: "1px solid var(--panel-border)", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div>
            <label style={{ fontSize: "0.74rem", color: "var(--muted)", textTransform: "none", display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
              <input
                type="checkbox"
                checked={usePrefix}
                onChange={(e) => setUsePrefix(e.target.checked)}
                style={{ accentColor: "var(--blue)" }}
              />
              Optional Prefix (Quality & LoRA tags)
            </label>
            {usePrefix && (
              <input
                type="text"
                value={prefixText}
                onChange={(e) => setPrefixText(e.target.value)}
                style={{ width: "100%", fontSize: "0.78rem", padding: "6px 8px", fontFamily: "var(--font-mono), monospace" }}
              />
            )}
          </div>

          <div>
            <label style={{ fontSize: "0.74rem", color: "var(--muted)", textTransform: "none", display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
              <input
                type="checkbox"
                checked={usePostfix}
                onChange={(e) => setUsePostfix(e.target.checked)}
                style={{ accentColor: "var(--blue)" }}
              />
              Optional Postfix (Lighting & Details)
            </label>
            {usePostfix && (
              <input
                type="text"
                value={postfixText}
                onChange={(e) => setPostfixText(e.target.value)}
                style={{ width: "100%", fontSize: "0.78rem", padding: "6px 8px", fontFamily: "var(--font-mono), monospace" }}
              />
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: In-Place Scene Image Generation & Preview */}
      <div className="panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <h3 style={{ fontSize: "1.05rem", margin: "0 0 4px", fontWeight: 600 }}>Scene Preview</h3>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--muted)" }}>
            Render the composed scene on ComfyUI with your selected aspect ratio.
          </p>
        </div>

        {/* Aspect Ratio & Model Selection */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div className="field" style={{ margin: 0 }}>
            <label style={{ fontSize: "0.74rem", marginBottom: "4px" }}>Aspect Ratio</label>
            <select
              value={ratio}
              onChange={(e) => setRatio(e.target.value as ImageAspectRatio)}
              style={{ width: "100%", fontSize: "0.8rem", padding: "6px" }}
              disabled={busy}
            >
              {IMAGE_ASPECT_RATIOS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label style={{ fontSize: "0.74rem", marginBottom: "4px" }}>Diffusion Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as T2IModelChoice)}
              style={{ width: "100%", fontSize: "0.8rem", padding: "6px" }}
              disabled={busy}
            >
              <option value="anima">🌸 Anima Base v1.0</option>
              <option value="basb">⚡ BAS Anime Plus</option>
            </select>
          </div>
        </div>

        {/* Render Button */}
        <button
          type="button"
          className="generate"
          onClick={handleGenerateScene}
          disabled={busy || (!sceneInput.trim() && !composedPrompt.trim())}
          style={{ width: "100%", padding: "10px", fontSize: "0.9rem" }}
        >
          {busy ? "Rendering Scene…" : "🎬 Render Scene Image"}
        </button>

        {renderError && <div className="error-box" style={{ fontSize: "0.82rem" }}>{renderError}</div>}

        {/* Live Scene Aspect Frame */}
        <div style={{ margin: "0 auto", width: "100%" }}>
          <AspectFrame
            dimensions={controlDimensions}
            videoUrl={imageUrl}
            rendering={busy}
            mediaType="image"
            placeholder="Rendered scene image will appear here"
            caption={`${controlDimensions.width} × ${controlDimensions.height} · ${model === "basb" ? "BAS Anime" : "Anima"}${seed ? ` · Seed: ${seed}` : ""}`}
          />

          {queueAt && (
            <div className="queue-panel" style={{ marginTop: "10px", padding: "10px" }}>
              <p className="queue-position" style={{ fontSize: "0.82rem", margin: "0 0 4px" }}>
                Queue position: {queueAt.position} of {queueAt.total}
              </p>
              <div className="beam" />
            </div>
          )}

          {busy && !queueAt && (
            <div className="status-line" style={{ marginTop: "10px", fontSize: "0.8rem" }}>
              Generating scene on ComfyUI GPU…
            </div>
          )}

          {renderStatus === "done" && imageUrl && (
            <div style={{ marginTop: "12px", display: "flex", justifyContent: "center" }}>
              <a
                href={imageUrl}
                download={`scene-${jobId || "render"}.png`}
                className="history-btn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.8rem",
                  padding: "6px 14px",
                  textDecoration: "none",
                }}
              >
                <span>💾</span> Download Scene Image
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
