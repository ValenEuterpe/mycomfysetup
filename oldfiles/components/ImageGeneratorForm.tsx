"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApiKey } from "./ApiKeyProvider";
import AspectFrame from "./AspectFrame";
import {
  Dimensions,
  IMAGE_ASPECT_RATIOS,
  IMAGE_RATIOS,
  ImageAspectRatio,
} from "@/lib/aspect";
import {
  DEFAULT_ANIMA_NEGATIVE_PROMPT,
  DEFAULT_T2I_CFG,
  DEFAULT_T2I_DENOISE,
  DEFAULT_T2I_SAMPLER,
  DEFAULT_T2I_SCHEDULER,
  DEFAULT_T2I_STEPS,
  SUPPORTED_SAMPLERS,
  SUPPORTED_SCHEDULERS,
  T2IModelChoice,
} from "@/lib/workflows";
import { fetchAndStore } from "@/lib/mediaCache";

type Status = "idle" | "queuing" | "queued" | "rendering" | "done" | "error";

type Job = {
  id: string;
  type?: string;
  status: "queued" | "dispatched" | "done" | "error" | "cancelled";
  videoUrl: string | null;
  error: string | null;
  position?: number;
  queueTotal?: number;
  width: number | null;
  height: number | null;
};

const POLL_INTERVAL_MS = 3000;
const TILE_EDGE = 38;

function tileSize({ width, height }: Dimensions) {
  const scale = TILE_EDGE / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

const SHORT_LABELS: Record<ImageAspectRatio, { short: string; name: string }> = {
  "1:1 (Square)": { short: "1:1", name: "Square" },
  "9:16 (Portrait)": { short: "9:16", name: "Portrait" },
  "16:9 (Landscape)": { short: "16:9", name: "Landscape" },
  "3:4 (Portrait)": { short: "3:4", name: "Portrait Standard" },
  "4:3 (Landscape)": { short: "4:3", name: "Landscape Standard" },
};

export default function ImageGeneratorForm() {
  const { authFetch, capabilities, quota, imageQuota, refresh, syncUsage } = useApiKey();
  const searchParams = useSearchParams();

  const [prompt, setPrompt] = useState(() => searchParams.get("prompt") ?? "");
  const [negativePrompt, setNegativePrompt] = useState(DEFAULT_ANIMA_NEGATIVE_PROMPT);
  const [ratio, setRatio] = useState<ImageAspectRatio>("1:1 (Square)");

  // Advanced sampling & model settings (gated by capabilities.canAccessAdvanced)
  const [model, setModel] = useState<T2IModelChoice>("anima");
  const [seed, setSeed] = useState<string>("");
  const [steps, setSteps] = useState<number>(DEFAULT_T2I_STEPS);
  const [cfg, setCfg] = useState<number>(DEFAULT_T2I_CFG);
  const [samplerName, setSamplerName] = useState<string>(DEFAULT_T2I_SAMPLER);
  const [scheduler, setScheduler] = useState<string>(DEFAULT_T2I_SCHEDULER);
  const [denoise, setDenoise] = useState<number>(DEFAULT_T2I_DENOISE);

  const resetSamplingDefaults = () => {
    setSeed("");
    setSteps(DEFAULT_T2I_STEPS);
    setCfg(DEFAULT_T2I_CFG);
    setSamplerName(DEFAULT_T2I_SAMPLER);
    setScheduler(DEFAULT_T2I_SCHEDULER);
    setDenoise(DEFAULT_T2I_DENOISE);
  };

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [queueAt, setQueueAt] = useState<{ position: number; total: number } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [resumedDimensions, setResumedDimensions] = useState<Dimensions | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRef = useRef(true);

  const busy = status === "queuing" || status === "queued" || status === "rendering";

  const controlDimensions = useMemo(() => {
    return IMAGE_RATIOS[ratio] || { width: 1024, height: 1024 };
  }, [ratio]);

  const dimensions = resumedDimensions ?? controlDimensions;

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

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

  const applyJob = useCallback(
    (job: Job) => {
      setJobId(job.id);

      if (job.width && job.height) {
        setResumedDimensions({ width: job.width, height: job.height });
      }

      if (job.status === "done" && job.videoUrl) {
        setQueueAt(null);
        setStatus("done");
        void cacheAndShow(job.id, job.videoUrl);
        return true;
      }

      if (job.status === "error") {
        setQueueAt(null);
        setError(job.error || "Image generation failed.");
        setStatus("error");
        return true;
      }

      if (job.status === "cancelled") {
        setQueueAt(null);
        setStatus("idle");
        setJobId(null);
        setResumedDimensions(null);
        return true;
      }

      if (job.status === "queued") {
        setQueueAt({ position: job.position ?? 1, total: job.queueTotal ?? 1 });
        setStatus("queued");
        return false;
      }

      // dispatched / rendering
      setQueueAt(null);
      setStatus("rendering");
      return false;
    },
    [cacheAndShow],
  );

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

          const settled = applyJob(data.job as Job);
          if (!settled) pollRef.current = setTimeout(tick, POLL_INTERVAL_MS);
        } catch (err: any) {
          if (!liveRef.current) return;
          setError(err.message);
          setStatus("error");
        }
      };

      tick();
    },
    [authFetch, applyJob],
  );

  // Resume active job on mount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await authFetch("/api/jobs");
        if (!res.ok) return;
        const data = await res.json();
        const jobs = (data.jobs ?? []) as Job[];
        if (cancelled || !liveRef.current || jobs.length === 0) return;

        // Pick the latest job that is active or recently done if it's text-to-image
        const latest = jobs[jobs.length - 1];
        const settled = applyJob(latest);
        if (!settled) pollJob(latest.id);
      } catch {
        // quiet fail on initial resume
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authFetch, applyJob, pollJob]);

  const onCancel = async () => {
    if (!jobId) return;
    setCancelling(true);
    try {
      const res = await authFetch(`/api/jobs?id=${encodeURIComponent(jobId)}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status !== 409) setError(data?.error || "Couldn't cancel that job.");
        return;
      }
      if (pollRef.current) clearTimeout(pollRef.current);
      setStatus("idle");
      setQueueAt(null);
      setJobId(null);
      setResumedDimensions(null);
      refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pollRef.current) clearTimeout(pollRef.current);
    setError(null);
    setQueueAt(null);
    setJobId(null);
    setResumedDimensions(null);
    setImageUrl((old) => {
      if (old && old.startsWith("blob:")) URL.revokeObjectURL(old);
      return null;
    });

    if (!prompt.trim()) {
      setError("Write a prompt first.");
      return;
    }

    try {
      setStatus("queuing");
      const payload: Record<string, any> = {
        type: "t2i",
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        aspectRatio: ratio,
      };

      if (canAdvanced) {
        payload.model = model;
        if (seed.trim()) {
          const s = Number(seed.trim());
          if (Number.isInteger(s) && s >= 0) payload.seed = s;
        }
        payload.steps = steps;
        payload.cfg = cfg;
        payload.samplerName = samplerName;
        payload.scheduler = scheduler;
        payload.denoise = denoise;
      }

      const genRes = await authFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const genData = await genRes.json();
      syncUsage(genData);
      if (!genRes.ok) throw new Error(genData.error || "Failed to queue image generation.");

      const job = genData.job as Job;
      const settled = applyJob(job);
      if (!settled) pollJob(job.id);
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  };

  const effectiveImageQuota = imageQuota ?? quota;
  const hasImageAccess = capabilities.canAccessImage !== false;
  const canAdvanced = capabilities.canAccessAdvanced;
  const atLimit = effectiveImageQuota !== null && effectiveImageQuota.used >= effectiveImageQuota.limit;

  const buttonLabel =
    !hasImageAccess
      ? "Image access disabled"
      : status === "queued"
        ? "Waiting in queue…"
        : busy
          ? "Generating image…"
          : atLimit
            ? "Daily image limit reached"
            : "Generate image";

  return (
    <form className="studio" onSubmit={onSubmit}>
      <div className="studio-controls panel">
        {canAdvanced && (
          <div className="field">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label id="model-label" style={{ margin: 0 }}>Model</label>
              <span style={{ fontSize: 10, padding: "2px 6px", background: "rgba(255, 255, 255, 0.08)", borderRadius: 4, color: "var(--accent)" }}>
                Advanced Tier
              </span>
            </div>
            <div className="ratio-grid" style={{ gridTemplateColumns: "1fr 1fr" }} role="radiogroup" aria-labelledby="model-label">
              <button
                type="button"
                role="radio"
                aria-checked={model === "anima"}
                className={model === "anima" ? "ratio-tile ratio-tile-on" : "ratio-tile"}
                onClick={() => setModel("anima")}
                disabled={busy}
                style={{ padding: "8px 12px", minHeight: 48, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}
              >
                <span style={{ fontWeight: 600, fontSize: 12 }}>🌸 Anima Base v1.0</span>
                <span style={{ fontSize: 10, color: "var(--muted)" }}>Foundation anime model</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={model === "basb"}
                className={model === "basb" ? "ratio-tile ratio-tile-on" : "ratio-tile"}
                onClick={() => setModel("basb")}
                disabled={busy}
                style={{ padding: "8px 12px", minHeight: 48, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}
              >
                <span style={{ fontWeight: 600, fontSize: 12 }}>⚡ BAS Anime Plus</span>
                <span style={{ fontSize: 10, color: "var(--muted)" }}>Enhanced styling model</span>
              </button>
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="image-prompt">Prompt</label>
          <textarea
            id="image-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the character, composition, lighting, style, colors..."
            disabled={busy}
            rows={4}
          />
        </div>

        <div className="field">
          <label id="ratio-label">Aspect ratio</label>
          <div className="ratio-grid" role="radiogroup" aria-labelledby="ratio-label">
            {IMAGE_ASPECT_RATIOS.map((option) => {
              const selected = option === ratio;
              const dims = IMAGE_RATIOS[option];
              const shape = tileSize(dims);
              const labels = SHORT_LABELS[option];

              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  className={selected ? "ratio-tile ratio-tile-on" : "ratio-tile"}
                  onClick={() => setRatio(option)}
                  disabled={busy}
                  title={option}
                >
                  <span className="ratio-shape-box">
                    <span
                      className="ratio-shape"
                      style={{ width: shape.width, height: shape.height }}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="ratio-short">{labels.short}</span>
                  <span className="ratio-dims">
                    {dims.width}&times;{dims.height}
                  </span>
                  <span className="sr-only">{labels.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <details className="advanced" style={{ marginBottom: 22 }}>
          <summary>
            {canAdvanced ? "Advanced Settings & Sampling (Unlocked)" : "Negative prompt & style control"}
          </summary>
          <div className="field advanced-field" style={{ marginTop: 12 }}>
            <label htmlFor="negative-prompt" style={{ fontSize: 12, color: "var(--muted)" }}>
              Negative prompt (exclusions)
            </label>
            <textarea
              id="negative-prompt"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="Undesired traits, deformities, bad quality..."
              disabled={busy}
              rows={3}
              style={{ minHeight: 80, fontSize: 13 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
              <button
                type="button"
                className="history-btn"
                onClick={() => setNegativePrompt(DEFAULT_ANIMA_NEGATIVE_PROMPT)}
                disabled={busy || negativePrompt === DEFAULT_ANIMA_NEGATIVE_PROMPT}
                style={{ fontSize: 11, padding: "4px 8px" }}
              >
                Reset to default
              </button>
            </div>
            <p className="field-help" style={{ marginTop: 6 }}>
              Calibrated for Anima base + Silvana style LoRA to prevent artifacts and bad anatomy.
            </p>
          </div>

          {canAdvanced && (
            <div style={{ marginTop: 16, borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.02em" }}>
                  KSampler Controls
                </span>
                <button
                  type="button"
                  className="history-btn"
                  onClick={resetSamplingDefaults}
                  disabled={busy}
                  style={{ fontSize: 11, padding: "3px 8px" }}
                >
                  Reset all defaults
                </button>
              </div>

              {/* Seed */}
              <div className="field" style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <label htmlFor="sampler-seed" style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                    Seed
                  </label>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    {seed === "" ? "Randomized" : `Custom: ${seed}`}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    id="sampler-seed"
                    type="number"
                    min="0"
                    placeholder="Random (leave blank)"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    disabled={busy}
                    style={{ flex: 1, fontSize: 12, padding: "6px 10px" }}
                  />
                  <button
                    type="button"
                    className="history-btn"
                    onClick={() => setSeed(String(Math.floor(Math.random() * 1_000_000_000_000)))}
                    disabled={busy}
                    title="Generate random seed"
                    style={{ fontSize: 12, padding: "6px 10px" }}
                  >
                    🎲 Roll
                  </button>
                  {seed !== "" && (
                    <button
                      type="button"
                      className="history-btn"
                      onClick={() => setSeed("")}
                      disabled={busy}
                      title="Clear to random"
                      style={{ fontSize: 12, padding: "6px 10px" }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Steps & CFG */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div className="field" style={{ margin: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <label htmlFor="sampler-steps" style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                      Steps
                    </label>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{steps}</span>
                  </div>
                  <input
                    id="sampler-steps"
                    type="range"
                    min="10"
                    max="60"
                    step="1"
                    value={steps}
                    onChange={(e) => setSteps(Number(e.target.value))}
                    disabled={busy}
                    style={{ width: "100%", accentColor: "var(--accent)" }}
                  />
                </div>

                <div className="field" style={{ margin: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <label htmlFor="sampler-cfg" style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                      CFG Scale
                    </label>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{cfg.toFixed(1)}</span>
                  </div>
                  <input
                    id="sampler-cfg"
                    type="range"
                    min="1"
                    max="20"
                    step="0.5"
                    value={cfg}
                    onChange={(e) => setCfg(Number(e.target.value))}
                    disabled={busy}
                    style={{ width: "100%", accentColor: "var(--accent)" }}
                  />
                </div>
              </div>

              {/* Sampler & Scheduler */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="sampler-name" style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4, display: "block" }}>
                    Sampler
                  </label>
                  <select
                    id="sampler-name"
                    value={samplerName}
                    onChange={(e) => setSamplerName(e.target.value)}
                    disabled={busy}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      fontSize: 12,
                      background: "rgba(255, 255, 255, 0.05)",
                      color: "inherit",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: 6,
                    }}
                  >
                    {SUPPORTED_SAMPLERS.map((s) => (
                      <option key={s} value={s} style={{ background: "#18181b", color: "#fff" }}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="sampler-scheduler" style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4, display: "block" }}>
                    Scheduler
                  </label>
                  <select
                    id="sampler-scheduler"
                    value={scheduler}
                    onChange={(e) => setScheduler(e.target.value)}
                    disabled={busy}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      fontSize: 12,
                      background: "rgba(255, 255, 255, 0.05)",
                      color: "inherit",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: 6,
                    }}
                  >
                    {SUPPORTED_SCHEDULERS.map((s) => (
                      <option key={s} value={s} style={{ background: "#18181b", color: "#fff" }}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Denoise */}
              <div className="field" style={{ margin: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <label htmlFor="sampler-denoise" style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                    Denoise Strength
                  </label>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{denoise.toFixed(2)}</span>
                </div>
                <input
                  id="sampler-denoise"
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={denoise}
                  onChange={(e) => setDenoise(Number(e.target.value))}
                  disabled={busy}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
              </div>
            </div>
          )}
        </details>

        <button className="generate" type="submit" disabled={busy || atLimit || !hasImageAccess}>
          {buttonLabel}
        </button>

        <p className="fast-note">
          <span className="fast-note-icon" aria-hidden="true">
            🎨
          </span>
          {canAdvanced && model === "basb" ? "BAS Better Anime Style" : "Anima Base Model (v1.0)"} &middot; {canAdvanced ? steps : 30}-step {canAdvanced ? samplerName : "Euler"} sampler
        </p>

        {!hasImageAccess ? (
          <p className="quota-note quota-note-full">
            Image generation is disabled for your account.
          </p>
        ) : effectiveImageQuota && (
          <p className={atLimit ? "quota-note quota-note-full" : "quota-note"}>
            {atLimit
              ? `Daily limit reached (${effectiveImageQuota.used} of ${effectiveImageQuota.limit}) — resets at midnight UTC`
              : `${effectiveImageQuota.used} of ${effectiveImageQuota.limit} image renders used today`}
          </p>
        )}

        {status === "error" && error && <div className="error-box">{error}</div>}
      </div>

      <div className="studio-output">
        <div className="studio-output-inner">
          <AspectFrame
            dimensions={dimensions}
            videoUrl={imageUrl}
            rendering={busy}
            mediaType="image"
            placeholder="Your image will appear here"
            caption={`${dimensions.width} × ${dimensions.height} · ${canAdvanced && model === "basb" ? "BAS Anime" : "Anima"}`}
          />

          {status === "done" && imageUrl && (
            <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
              <a
                href={imageUrl}
                download={`anima-${jobId ?? "image"}.png`}
                className="history-btn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 16px",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download Image
              </a>
            </div>
          )}

          {status === "queued" && queueAt && (
            <div className="queue-panel" role="status">
              <p className="queue-position">
                <strong>{queueAt.position}</strong> of {queueAt.total} in the queue
              </p>
              <p className="queue-note">
                Your request hasn&apos;t reached the GPU yet. It starts automatically when jobs ahead
                of it finish — you can safely close this page.
              </p>
              <div className="beam" />
              <button type="button" className="queue-cancel" onClick={onCancel} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Cancel this render"}
              </button>
            </div>
          )}

          {busy && status !== "queued" && (
            <div className="status-line" role="status">
              {status === "queuing" && "Adding to the render queue…"}
              {status === "rendering" && "Generating image on GPU with Anima — usually 10–25s…"}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
