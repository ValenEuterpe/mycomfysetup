"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApiKey } from "@/components/ApiKeyProvider";
import AspectFrame from "@/components/AspectFrame";
import UserSettingsModal from "@/components/UserSettingsModal";
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
  SUPPORTED_SAMPLERS,
  SUPPORTED_SCHEDULERS,
  T2IModelChoice,
} from "@/lib/workflows";
import { fetchAndStore } from "@/lib/mediaCache";
import { cleanTag } from "@/lib/characters";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type Iteration = {
  id: string;
  imageUrl: string;
  seed: number;
  prompt: string;
  coreDescription: string;
  prefix: string;
  postfix: string;
  name: string;
  tag: string;
  model: T2IModelChoice;
  aspectRatio: ImageAspectRatio;
  cfg: number;
  steps: number;
  samplerName: string;
  scheduler: string;
  negativePrompt: string;
};

const SUGGESTIONS = [
  "A stunning 28yo woman with long chestnut hair, emerald green eyes, and a butterfly tattoo on her left arm",
  "A rugged 40yo male with a neck tattoo, sharp jawline, short dark beard, and intense hazel eyes",
  "An athletic female cyberpunk runner with silver undercut hair, neon blue eyes, and delicate facial scars",
  "A handsome 32yo scholar with round glasses, messy dark curls, warm brown eyes, and a soft smile",
];

export default function CharacterMakerStudio() {
  const { authFetch, capabilities, syncUsage } = useApiKey();

  // Settings modal toggle
  const [showSettings, setShowSettings] = useState(false);
  const [hasLlmConfig, setHasLlmConfig] = useState<boolean | null>(null);

  // Chat conversation state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Welcome to the Character Maker! Describe the character you have in mind—mention age, facial features, hair, eyes, body build, tattoos, or style. I'll engineer a high-detail concept prompt and generate a preview on the right.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [aiThinking, setAiThinking] = useState(false);
  const [autoGenerate, setAutoGenerate] = useState(true);

  // Character specification
  const [charName, setCharName] = useState("Silvana");
  const [charTag, setCharTag] = useState("silvana");
  const [coreDescription, setCoreDescription] = useState(
    "A stunningly beautiful 28-year-old woman with flawless fair skin, long wavy chestnut brown hair cascading down to her mid-back, sharp almond-shaped green eyes with long thick lashes, full plump pink lips, high cheekbones, delicate nose, and a soft feminine jawline. She has a perfectly toned athletic yet curvy body, slim waist, and wide hips. On her left upper arm, a large detailed butterfly tattoo with vibrant purple and black wings and a delicate outline is clearly visible.",
  );

  // Prefix & Postfix
  const [usePrefix, setUsePrefix] = useState(true);
  const [prefixText, setPrefixText] = useState("masterpiece, best quality, score_9, score_8, safe, @silvana, ");
  const [usePostfix, setUsePostfix] = useState(true);
  const [postfixText, setPostfixText] = useState("high detail, photorealistic, 8k resolution, cinematic lighting, sharp focus.");

  // Sampling & Generation settings
  const [ratio, setRatio] = useState<ImageAspectRatio>("9:16 (Portrait)");
  const [model, setModel] = useState<T2IModelChoice>("anima");
  const [seed, setSeed] = useState<string>("");
  const [lockSeed, setLockSeed] = useState(false);
  const [steps, setSteps] = useState<number>(DEFAULT_T2I_STEPS);
  const [cfg, setCfg] = useState<number>(DEFAULT_T2I_CFG);
  const [samplerName, setSamplerName] = useState<string>(DEFAULT_T2I_SAMPLER);
  const [scheduler, setScheduler] = useState<string>(DEFAULT_T2I_SCHEDULER);
  const [negativePrompt, setNegativePrompt] = useState(DEFAULT_ANIMA_NEGATIVE_PROMPT);

  // Rendering state
  const [renderStatus, setRenderStatus] = useState<"idle" | "queuing" | "queued" | "rendering" | "done" | "error">("idle");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [queueAt, setQueueAt] = useState<{ position: number; total: number } | null>(null);

  // Iteration history
  const [iterations, setIterations] = useState<Iteration[]>([]);

  // Character save state
  const [savingCharacter, setSavingCharacter] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [serverImageUrl, setServerImageUrl] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const loadId = searchParams?.get("load");

  const [isHydrated, setIsHydrated] = useState(false);

  // Storage keys
  const SESSION_STORAGE_KEY = "studio.characterMaker.session";
  const LLM_STORAGE_KEY = "studio.llm.config";

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRef = useRef(true);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Restore cached session and check LLM config on mount
  useEffect(() => {
    // 1. Check cached LLM config
    try {
      const rawLlm = window.localStorage.getItem(LLM_STORAGE_KEY);
      if (rawLlm) {
        const parsed = JSON.parse(rawLlm);
        setHasLlmConfig(Boolean(parsed.baseUrl && parsed.model));
      } else {
        setHasLlmConfig(false);
      }
    } catch {
      setHasLlmConfig(false);
    }

    // 2. Restore cached character session
    try {
      const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (rawSession) {
        const s = JSON.parse(rawSession);
        if (Array.isArray(s.messages) && s.messages.length > 0) setMessages(s.messages);
        if (s.charName) setCharName(s.charName);
        if (s.charTag) setCharTag(s.charTag);
        if (s.coreDescription) setCoreDescription(s.coreDescription);
        if (typeof s.usePrefix === "boolean") setUsePrefix(s.usePrefix);
        if (s.prefixText) setPrefixText(s.prefixText);
        if (typeof s.usePostfix === "boolean") setUsePostfix(s.usePostfix);
        if (s.postfixText) setPostfixText(s.postfixText);
        if (s.ratio && IMAGE_RATIOS[s.ratio as ImageAspectRatio]) setRatio(s.ratio as ImageAspectRatio);
        if (s.model) setModel(s.model);
        if (s.seed) setSeed(String(s.seed));
        if (typeof s.lockSeed === "boolean") setLockSeed(s.lockSeed);
        if (typeof s.steps === "number") setSteps(s.steps);
        if (typeof s.cfg === "number") setCfg(s.cfg);
        if (s.samplerName) setSamplerName(s.samplerName);
        if (s.scheduler) setScheduler(s.scheduler);
        if (s.negativePrompt) setNegativePrompt(s.negativePrompt);
        if (s.currentImageUrl) {
          setCurrentImageUrl(s.currentImageUrl);
          setRenderStatus("done");
        }
        if (Array.isArray(s.iterations)) setIterations(s.iterations);
        if (typeof s.autoGenerate === "boolean") setAutoGenerate(s.autoGenerate);
      }
    } catch (err) {
      console.warn("Failed to parse cached session:", err);
    }

    setIsHydrated(true);
  }, [showSettings]);

  // Auto-save session to localStorage whenever state updates
  useEffect(() => {
    if (!isHydrated) return;
    try {
      const sessionData = {
        messages,
        charName,
        charTag,
        coreDescription,
        usePrefix,
        prefixText,
        usePostfix,
        postfixText,
        ratio,
        model,
        seed,
        lockSeed,
        steps,
        cfg,
        samplerName,
        scheduler,
        negativePrompt,
        currentImageUrl,
        iterations,
        autoGenerate,
      };
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    } catch {}
  }, [
    isHydrated,
    messages,
    charName,
    charTag,
    coreDescription,
    usePrefix,
    prefixText,
    usePostfix,
    postfixText,
    ratio,
    model,
    seed,
    lockSeed,
    steps,
    cfg,
    samplerName,
    scheduler,
    negativePrompt,
    currentImageUrl,
    iterations,
    autoGenerate,
  ]);

  // Discard current session and start fresh
  const handleDiscard = () => {
    if (
      !confirm(
        "Are you sure you want to discard this character session? This will clear the chat history, prompt draft, and preview image.",
      )
    ) {
      return;
    }

    try {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {}

    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Welcome to the Character Maker! Describe the character you have in mind—mention age, facial features, hair, eyes, body build, tattoos, or style. I'll engineer a high-detail concept prompt and generate a preview on the right.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setCharName("Silvana");
    setCharTag("silvana");
    setCoreDescription(
      "A stunningly beautiful 28-year-old woman with flawless fair skin, long wavy chestnut brown hair cascading down to her mid-back, sharp almond-shaped green eyes with long thick lashes, full plump pink lips, high cheekbones, delicate nose, and a soft feminine jawline. She has a perfectly toned athletic yet curvy body, slim waist, and wide hips. On her left upper arm, a large detailed butterfly tattoo with vibrant purple and black wings and a delicate outline is clearly visible.",
    );
    setPrefixText("masterpiece, best quality, score_9, score_8, safe, @silvana, ");
    setPostfixText("high detail, photorealistic, 8k resolution, cinematic lighting, sharp focus.");
    setCurrentImageUrl(null);
    setSeed("");
    setLockSeed(false);
    setIterations([]);
    setRenderStatus("idle");
    setSavedSuccess(null);
    setSaveError(null);
    setRenderError(null);
  };

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiThinking]);

  // Load existing character if ?load=<id> query parameter is present
  useEffect(() => {
    if (!loadId) return;
    let active = true;
    async function loadChar() {
      try {
        const res = await authFetch(`/api/characters/${encodeURIComponent(loadId as string)}`);
        const data = await res.json();
        if (active && res.ok && data?.character) {
          const c = data.character;
          if (c.name) setCharName(c.name);
          if (c.tag) setCharTag(c.tag);
          if (c.description) setCoreDescription(c.description);
          if (c.prefix) {
            setUsePrefix(true);
            setPrefixText(c.prefix);
          }
          if (c.postfix) {
            setUsePostfix(true);
            setPostfixText(c.postfix);
          }
          if (c.negativePrompt) setNegativePrompt(c.negativePrompt);
          if (c.workflowParams?.seed) setSeed(String(c.workflowParams.seed));
          if (typeof c.workflowParams?.cfg === "number") setCfg(c.workflowParams.cfg);
          if (typeof c.workflowParams?.steps === "number") setSteps(c.workflowParams.steps);
          if (c.workflowParams?.samplerName) setSamplerName(c.workflowParams.samplerName);
          if (c.workflowParams?.scheduler) setScheduler(c.workflowParams.scheduler);
          if (c.workflowParams?.model) setModel(c.workflowParams.model);
          if (c.workflowParams?.aspectRatio && IMAGE_RATIOS[c.workflowParams.aspectRatio as ImageAspectRatio]) {
            setRatio(c.workflowParams.aspectRatio as ImageAspectRatio);
          }
          if (c.imageUrl) {
            setCurrentImageUrl(c.imageUrl);
            setServerImageUrl(c.imageUrl);
            setRenderStatus("done");
          }
          setMessages((prev) => [
            ...prev,
            {
              id: "loaded-" + Date.now(),
              role: "assistant",
              content: `Loaded character "${c.name}" (#${c.tag}) from your backend roster! You can continue refining their traits with me or re-render a new preview on the right.`,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            },
          ]);
        }
      } catch (err) {
        console.error("Failed to load character:", err);
      }
    }
    void loadChar();
    return () => {
      active = false;
    };
  }, [loadId, authFetch]);

  // Compute full assembled positive prompt
  const fullAssembledPrompt = useMemo(() => {
    const parts: string[] = [];
    if (usePrefix && prefixText.trim()) parts.push(prefixText.trim());
    if (coreDescription.trim()) parts.push(coreDescription.trim());
    if (usePostfix && postfixText.trim()) parts.push(postfixText.trim());
    return parts.join("\n\n");
  }, [usePrefix, prefixText, coreDescription, usePostfix, postfixText]);

  const controlDimensions = useMemo(() => {
    return IMAGE_RATIOS[ratio] || { width: 832, height: 1216 };
  }, [ratio]);

  const busy = renderStatus === "queuing" || renderStatus === "queued" || renderStatus === "rendering";

  // Cache and display image
  const cacheAndShow = useCallback(
    async (id: string, url: string) => {
      setServerImageUrl(url);
      setCurrentImageUrl(url);
      const blob = await fetchAndStore(id, url, (target) => authFetch(target));
      if (!blob || !liveRef.current) return;

      const objectUrl = URL.createObjectURL(blob);
      setCurrentImageUrl((old) => {
        if (old && old.startsWith("blob:")) URL.revokeObjectURL(old);
        return objectUrl;
      });
    },
    [authFetch],
  );

  // Poll render job
  const pollJob = useCallback(
    (id: string, iterationPrompt: string, iterationDesc: string, iterationSeed: number) => {
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

            // Record exact seed returned
            const finalSeed = job.workflowParams?.seed ?? iterationSeed;
            setSeed(String(finalSeed));

            // Record iteration
            setIterations((prev) => [
              {
                id: job.id,
                imageUrl: job.videoUrl,
                seed: finalSeed,
                prompt: iterationPrompt,
                coreDescription: iterationDesc,
                prefix: prefixText,
                postfix: postfixText,
                name: charName,
                tag: charTag,
                model,
                aspectRatio: ratio,
                cfg,
                steps,
                samplerName,
                scheduler,
                negativePrompt,
              },
              ...prev,
            ]);
            return;
          }

          if (job.status === "error") {
            setQueueAt(null);
            setRenderError(job.error || "Image generation failed.");
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
    [authFetch, cacheAndShow, charName, charTag, cfg, steps, samplerName, scheduler, model, ratio, negativePrompt, prefixText, postfixText],
  );

  // Trigger generation
  const handleGenerate = async (customPrompt?: string, customDesc?: string) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setRenderError(null);
    setQueueAt(null);
    setCurrentJobId(null);

    const promptToUse = customPrompt || fullAssembledPrompt;
    const descToUse = customDesc || coreDescription;

    if (!promptToUse.trim()) {
      setRenderError("Character prompt is empty.");
      return;
    }

    try {
      setRenderStatus("queuing");

      // Resolve seed
      let numericSeed: number | undefined = undefined;
      if (lockSeed && seed.trim()) {
        const parsed = Number(seed.trim());
        if (Number.isInteger(parsed) && parsed >= 0) numericSeed = parsed;
      }

      const payload: Record<string, any> = {
        type: "t2i",
        prompt: promptToUse.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        aspectRatio: ratio,
        model,
        steps,
        cfg,
        samplerName,
        scheduler,
      };

      if (numericSeed !== undefined) {
        payload.seed = numericSeed;
      }

      const genRes = await authFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const genData = await genRes.json();
      syncUsage(genData);

      if (!genRes.ok) {
        throw new Error(genData.error || "Failed to queue image render.");
      }

      const job = genData.job;
      setCurrentJobId(job.id);

      const resolvedSeed = job.workflowParams?.seed ?? numericSeed ?? 0;
      if (numericSeed === undefined) {
        setSeed(String(resolvedSeed));
      }

      if (job.status === "done" && job.videoUrl) {
        setRenderStatus("done");
        void cacheAndShow(job.id, job.videoUrl);
      } else {
        setRenderStatus(job.status === "queued" ? "queued" : "rendering");
        pollJob(job.id, promptToUse, descToUse, resolvedSeed);
      }
    } catch (err: any) {
      setRenderError(err.message || "Failed to start generation.");
      setRenderStatus("error");
    }
  };

  // Submit chat turn
  const handleSendChat = async (e?: React.FormEvent, overrideText?: string) => {
    if (e) e.preventDefault();
    const text = (overrideText || chatInput).trim();
    if (!text || aiThinking) return;

    const userMsg: ChatMessage = {
      id: "msg-" + Date.now(),
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setChatInput("");
    setAiThinking(true);
    setSavedSuccess(null);
    setSaveError(null);

    try {
      let llmConfig: any = undefined;
      try {
        const raw = window.localStorage.getItem(LLM_STORAGE_KEY);
        if (raw) llmConfig = JSON.parse(raw);
      } catch {}

      const res = await authFetch("/api/llm/character-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          currentDescription: coreDescription,
          llmConfig,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        if (data?.unconfigured) {
          setHasLlmConfig(false);
          setShowSettings(true);
        }
        throw new Error(data?.error || "Failed to process chat message.");
      }

      const assistantMsg: ChatMessage = {
        id: "msg-" + (Date.now() + 1),
        role: "assistant",
        content: data.message,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Update character specs
      if (data.name) setCharName(data.name);
      if (data.tag) {
        const clean = cleanTag(data.tag);
        setCharTag(clean);
        setPrefixText(`masterpiece, best quality, score_9, score_8, safe, @${clean}, `);
      }
      if (data.coreDescription) setCoreDescription(data.coreDescription);
      if (data.negativePrompt) setNegativePrompt(data.negativePrompt);
      if (data.aspectRatio && IMAGE_RATIOS[data.aspectRatio as ImageAspectRatio]) {
        setRatio(data.aspectRatio as ImageAspectRatio);
      }

      // If auto-generate is enabled, trigger image generation right away!
      if (autoGenerate) {
        const newPromptParts: string[] = [];
        const newPrefix = `masterpiece, best quality, score_9, score_8, safe, @${cleanTag(data.tag || charTag)}, `;
        if (usePrefix) newPromptParts.push(newPrefix);
        newPromptParts.push(data.coreDescription);
        if (usePostfix && postfixText.trim()) newPromptParts.push(postfixText.trim());

        void handleGenerate(newPromptParts.join("\n\n"), data.coreDescription);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: "err-" + Date.now(),
          role: "assistant",
          content: `⚠️ ${err.message || "Something went wrong while contacting the AI assistant."}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setAiThinking(false);
    }
  };

  // Save character to library
  const handleSaveCharacter = async () => {
    if (!coreDescription.trim() || !charName.trim()) {
      setSaveError("Please provide a character name and description before saving.");
      return;
    }

    setSavingCharacter(true);
    setSaveError(null);
    setSavedSuccess(null);

    try {
      const finalTag = cleanTag(charTag || charName);
      const resolvedImageUrl =
        serverImageUrl || (currentImageUrl && !currentImageUrl.startsWith("blob:") ? currentImageUrl : null);

      const res = await authFetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: charName.trim() || "Untitled Character",
          tag: finalTag,
          description: coreDescription.trim(),
          prompt: fullAssembledPrompt,
          negativePrompt: negativePrompt.trim(),
          imageUrl: resolvedImageUrl,
          prefix: usePrefix ? prefixText : null,
          postfix: usePostfix ? postfixText : null,
          workflowParams: {
            seed: seed ? Number(seed) : undefined,
            model,
            steps,
            cfg,
            samplerName,
            scheduler,
            aspectRatio: ratio,
            width: controlDimensions.width,
            height: controlDimensions.height,
          },
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to save character.");
      }

      setSavedSuccess(`Character '${charName}' saved to your roster (#${finalTag})!`);
      setTimeout(() => setSavedSuccess(null), 6000);
    } catch (err: any) {
      setSaveError(err.message || "Failed to save character.");
    } finally {
      setSavingCharacter(false);
    }
  };

  // Restore previous iteration
  const restoreIteration = (it: Iteration) => {
    setCurrentImageUrl(it.imageUrl);
    setSeed(String(it.seed));
    setCharName(it.name);
    setCharTag(it.tag);
    setCoreDescription(it.coreDescription);
    setPrefixText(it.prefix);
    setPostfixText(it.postfix);
    setModel(it.model);
    setRatio(it.aspectRatio);
    setCfg(it.cfg);
    setSteps(it.steps);
    setSamplerName(it.samplerName);
    setScheduler(it.scheduler);
    setNegativePrompt(it.negativePrompt);
    setRenderStatus("done");
  };

  return (
    <div className="char-studio-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Missing LLM Notice */}
      {hasLlmConfig === false && (
        <div
          style={{
            background: "rgba(255, 155, 66, 0.12)",
            border: "1px solid rgba(255, 155, 66, 0.35)",
            borderRadius: "8px",
            padding: "12px 18px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.2rem" }}>⚙️</span>
            <div>
              <strong style={{ color: "var(--amber)", fontSize: "0.9rem" }}>AI Assistant not configured</strong>
              <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text)" }}>
                Set up an OpenAI-compatible endpoint URL and pick a model in Settings to chat with the character designer.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="history-btn"
            onClick={() => setShowSettings(true)}
            style={{ borderColor: "var(--amber)", color: "var(--amber)", fontWeight: 600, fontSize: "0.82rem" }}
          >
            Configure Settings
          </button>
        </div>
      )}

      {/* Main 2-Column Studio Grid */}
      <div
        className="char-maker-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.1fr",
          gap: "24px",
          alignItems: "start",
        }}
      >
        {/* LEFT COLUMN: Chat Interface */}
        <div
          className="panel"
          style={{
            display: "flex",
            flexDirection: "column",
            height: "760px",
            padding: "20px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingBottom: "12px",
              borderBottom: "1px solid var(--panel-border)",
              marginBottom: "12px",
            }}
          >
            <div>
              <h2 style={{ fontSize: "1.1rem", margin: 0, fontWeight: 600 }}>Character Designer Chat</h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
                Describe your desired character naturally. Refine step-by-step.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                type="button"
                onClick={handleDiscard}
                title="Discard current session and reset studio"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--muted)",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "3px 6px",
                  borderRadius: "4px",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red, #ff5252)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
              >
                🗑️ Discard
              </button>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.75rem",
                  color: "var(--muted)",
                  cursor: "pointer",
                  margin: 0,
                  textTransform: "none",
                  letterSpacing: 0,
                }}
              >
                <input
                  type="checkbox"
                  checked={autoGenerate}
                  onChange={(e) => setAutoGenerate(e.target.checked)}
                  style={{ accentColor: "var(--blue)" }}
                />
                Auto-generate preview
              </label>
            </div>
          </div>

          {/* Quick inspiration chips */}
          <div
            style={{
              display: "flex",
              gap: "6px",
              overflowX: "auto",
              paddingBottom: "8px",
              marginBottom: "10px",
              scrollbarWidth: "none",
            }}
          >
            {SUGGESTIONS.map((sug, i) => (
              <button
                key={i}
                type="button"
                className="history-btn"
                onClick={() => handleSendChat(undefined, sug)}
                disabled={aiThinking || busy}
                style={{
                  fontSize: "0.72rem",
                  padding: "4px 10px",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  borderRadius: "14px",
                  background: "rgba(255, 255, 255, 0.03)",
                }}
              >
                + {sug.slice(0, 34)}…
              </button>
            ))}
          </div>

          {/* Messages list */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              paddingRight: "6px",
              marginBottom: "8px",
            }}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: m.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "88%",
                    padding: "10px 14px",
                    borderRadius: m.role === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                    background: m.role === "user" ? "linear-gradient(135deg, rgba(79, 180, 255, 0.25), rgba(79, 180, 255, 0.15))" : "rgba(255, 255, 255, 0.05)",
                    border: m.role === "user" ? "1px solid rgba(79, 180, 255, 0.3)" : "1px solid rgba(255, 255, 255, 0.08)",
                    fontSize: "0.85rem",
                    lineHeight: "1.45",
                    color: "var(--text)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                </div>
                <span style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "3px", padding: "0 4px" }}>
                  {m.role === "user" ? "You" : "AI"} · {m.timestamp}
                </span>
              </div>
            ))}

            {aiThinking && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--blue)", fontSize: "0.82rem", padding: "8px" }}>
                <span className="dot" style={{ background: "var(--blue)" }} />
                <span>Designing character & engineering prompt…</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat input form container */}
          <div
            style={{
              flexShrink: 0,
              marginTop: "auto",
              paddingTop: "12px",
              borderTop: "1px solid var(--panel-border)",
            }}
          >
            <form
              onSubmit={(e) => handleSendChat(e)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                width: "100%",
              }}
            >
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChat();
                  }
                }}
                placeholder="Describe your character (e.g. 'I need a 40 year old male with a tattoo on his left arm' or 'no, make the tattoo on his neck instead')..."
                disabled={aiThinking}
                rows={3}
                style={{
                  width: "100%",
                  minHeight: "76px",
                  maxHeight: "140px",
                  fontSize: "0.85rem",
                  padding: "10px 12px",
                  resize: "vertical",
                  background: "rgba(0, 0, 0, 0.35)",
                  border: "1px solid var(--panel-border)",
                  borderRadius: "8px",
                  color: "var(--text)",
                  boxSizing: "border-box",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%",
                }}
              >
                <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                  Press <kbd style={{ background: "rgba(255,255,255,0.08)", padding: "1px 4px", borderRadius: "3px" }}>Enter</kbd> to send, <kbd style={{ background: "rgba(255,255,255,0.08)", padding: "1px 4px", borderRadius: "3px" }}>Shift+Enter</kbd> for newline
                </span>
                <button
                  type="submit"
                  className="generate"
                  disabled={aiThinking || !chatInput.trim()}
                  style={{
                    width: "auto",
                    padding: "8px 22px",
                    fontSize: "0.84rem",
                    borderRadius: "6px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {aiThinking ? "Thinking…" : "Send Message"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: Live Generation & Character Spec Inspector */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Preview & Status Panel */}
          <div className="panel" style={{ padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                  type="text"
                  value={charName}
                  onChange={(e) => {
                    setCharName(e.target.value);
                    const clean = cleanTag(e.target.value);
                    setCharTag(clean);
                    setPrefixText(`masterpiece, best quality, score_9, score_8, safe, @${clean}, `);
                  }}
                  placeholder="Character Name"
                  style={{
                    fontWeight: 700,
                    fontSize: "1.1rem",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px dashed var(--muted)",
                    padding: "2px 4px",
                    width: "160px",
                    color: "var(--text)",
                  }}
                />
                <span
                  style={{
                    fontSize: "0.78rem",
                    background: "rgba(79, 180, 255, 0.15)",
                    color: "var(--blue)",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    fontFamily: "var(--font-mono), monospace",
                  }}
                >
                  #{charTag}
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="history-btn"
                  onClick={handleDiscard}
                  title="Discard current character session and reset to default"
                  style={{
                    fontSize: "0.8rem",
                    padding: "6px 12px",
                    color: "var(--red, #ff5252)",
                    borderColor: "rgba(255, 82, 82, 0.35)",
                  }}
                >
                  🗑️ Discard
                </button>
                <button
                  type="button"
                  className="history-btn"
                  onClick={() => handleGenerate()}
                  disabled={busy}
                  style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                >
                  {busy ? "Rendering…" : "⚡ Re-render"}
                </button>
                <button
                  type="button"
                  className="generate"
                  onClick={handleSaveCharacter}
                  disabled={savingCharacter || !coreDescription.trim() || !charName.trim()}
                  title={
                    !charName.trim()
                      ? "Enter a character name to save"
                      : !coreDescription.trim()
                      ? "Character description is required"
                      : "Save character to your backend roster"
                  }
                  style={{
                    fontSize: "0.8rem",
                    padding: "6px 16px",
                    background: savedSuccess ? "rgba(46, 213, 115, 0.85)" : undefined,
                  }}
                >
                  {savingCharacter ? "Saving…" : "💾 Save Character"}
                </button>
              </div>
            </div>

            {/* Toasts */}
            {savedSuccess && (
              <div
                style={{
                  background: "rgba(46, 213, 115, 0.15)",
                  border: "1px solid rgba(46, 213, 115, 0.35)",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  marginBottom: "12px",
                  fontSize: "0.82rem",
                  color: "#7bed9f",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>✓ {savedSuccess}</span>
                <Link href="/characters" style={{ textDecoration: "underline", fontWeight: 600, color: "#7bed9f" }}>
                  View in Characters →
                </Link>
              </div>
            )}

            {saveError && (
              <div className="error-box" style={{ marginBottom: "12px", fontSize: "0.82rem" }}>
                {saveError}
              </div>
            )}

            {renderError && (
              <div className="error-box" style={{ marginBottom: "12px", fontSize: "0.82rem" }}>
                {renderError}
              </div>
            )}

            {/* Live Image Frame */}
            <div style={{ maxWidth: "440px", margin: "0 auto 16px" }}>
              <AspectFrame
                dimensions={controlDimensions}
                videoUrl={currentImageUrl}
                rendering={busy}
                mediaType="image"
                placeholder="Click Send in chat or 'Re-render' to generate your character"
                caption={`${controlDimensions.width} × ${controlDimensions.height} · ${model === "basb" ? "BAS Anime" : "Anima"} · Seed: ${seed || "Auto"}`}
              />

              {queueAt && (
                <div className="queue-panel" style={{ marginTop: "10px", padding: "10px" }}>
                  <p className="queue-position" style={{ fontSize: "0.85rem", margin: "0 0 4px" }}>
                    Queue position: {queueAt.position} of {queueAt.total}
                  </p>
                  <div className="beam" />
                </div>
              )}

              {busy && !queueAt && (
                <div className="status-line" style={{ marginTop: "10px", fontSize: "0.8rem" }}>
                  Generating character on GPU with {model === "basb" ? "BAS Anime Plus" : "Anima Base"}…
                </div>
              )}
            </div>

            {/* Iteration history thumbnails strip */}
            {iterations.length > 0 && (
              <div style={{ borderTop: "1px solid var(--panel-border)", paddingTop: "12px" }}>
                <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginBottom: "8px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  Session Iterations ({iterations.length})
                </div>
                <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "6px" }}>
                  {iterations.map((it, idx) => (
                    <button
                      key={it.id + idx}
                      type="button"
                      onClick={() => restoreIteration(it)}
                      title={`Iteration ${iterations.length - idx} (Seed: ${it.seed})`}
                      style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "6px",
                        overflow: "hidden",
                        border: it.imageUrl === currentImageUrl ? "2px solid var(--blue)" : "1px solid var(--panel-border)",
                        padding: 0,
                        background: "#000",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      <img src={it.imageUrl} alt="thumbnail" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Prompt Breakdown & Parameter Inspector */}
          <div className="panel" style={{ padding: "20px" }}>
            <h3 style={{ fontSize: "0.92rem", fontWeight: 600, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
              Character Prompt Specification
            </h3>

            {/* Optional Prefix */}
            <div style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <label style={{ fontSize: "0.76rem", color: "var(--muted)", margin: 0, textTransform: "none", display: "flex", alignItems: "center", gap: "6px" }}>
                  <input
                    type="checkbox"
                    checked={usePrefix}
                    onChange={(e) => setUsePrefix(e.target.checked)}
                    style={{ accentColor: "var(--blue)" }}
                  />
                  Optional Prefix (Quality tags & Character LoRA)
                </label>
              </div>
              {usePrefix && (
                <input
                  type="text"
                  value={prefixText}
                  onChange={(e) => setPrefixText(e.target.value)}
                  style={{ width: "100%", fontSize: "0.8rem", padding: "6px 10px", fontFamily: "var(--font-mono), monospace" }}
                />
              )}
            </div>

            {/* Core Description */}
            <div style={{ marginBottom: "12px" }}>
              <label htmlFor="core-desc" style={{ fontSize: "0.76rem", color: "var(--text)", fontWeight: 600, marginBottom: "4px" }}>
                Detailed Character Physical Description
              </label>
              <textarea
                id="core-desc"
                value={coreDescription}
                onChange={(e) => setCoreDescription(e.target.value)}
                rows={5}
                style={{ width: "100%", fontSize: "0.82rem", lineHeight: "1.45", padding: "8px 10px" }}
              />
              <p className="field-help" style={{ fontSize: "0.72rem", marginTop: "4px" }}>
                This is the exact descriptive paragraph saved to your library and reused in scenes.
              </p>
            </div>

            {/* Optional Postfix */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <label style={{ fontSize: "0.76rem", color: "var(--muted)", margin: 0, textTransform: "none", display: "flex", alignItems: "center", gap: "6px" }}>
                  <input
                    type="checkbox"
                    checked={usePostfix}
                    onChange={(e) => setUsePostfix(e.target.checked)}
                    style={{ accentColor: "var(--blue)" }}
                  />
                  Optional Postfix (Lighting & Resolution)
                </label>
              </div>
              {usePostfix && (
                <input
                  type="text"
                  value={postfixText}
                  onChange={(e) => setPostfixText(e.target.value)}
                  style={{ width: "100%", fontSize: "0.8rem", padding: "6px 10px", fontFamily: "var(--font-mono), monospace" }}
                />
              )}
            </div>

            {/* Exact Generation Parameters Accordion */}
            <details className="advanced" style={{ borderTop: "1px solid var(--panel-border)", paddingTop: "12px" }}>
              <summary style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                ⚙️ Generation Parameters & Sampler Controls
              </summary>

              <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
                {/* Seed Controls */}
                <div className="field" style={{ margin: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <label style={{ fontSize: "0.75rem", margin: 0 }}>Exact Seed</label>
                    <span style={{ fontSize: "0.72rem", color: lockSeed ? "#7bed9f" : "var(--muted)" }}>
                      {lockSeed ? "🔒 Seed Locked" : "Randomized per render"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="number"
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                      placeholder="Seed (blank = random)"
                      style={{ flex: 1, fontSize: "0.8rem", padding: "6px 8px" }}
                    />
                    <button
                      type="button"
                      className="history-btn"
                      onClick={() => setSeed(String(Math.floor(Math.random() * 1_000_000_000_000)))}
                      style={{ fontSize: "0.78rem" }}
                    >
                      🎲 Roll
                    </button>
                    <button
                      type="button"
                      className="history-btn"
                      onClick={() => setLockSeed(!lockSeed)}
                      style={{
                        fontSize: "0.78rem",
                        borderColor: lockSeed ? "#7bed9f" : undefined,
                        color: lockSeed ? "#7bed9f" : undefined,
                      }}
                    >
                      {lockSeed ? "🔒 Locked" : "🔓 Lock"}
                    </button>
                  </div>
                </div>

                {/* Model & Aspect Ratio */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: "0.75rem", marginBottom: "4px" }}>Model</label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value as T2IModelChoice)}
                      style={{ width: "100%", fontSize: "0.8rem", padding: "6px" }}
                    >
                      <option value="anima">🌸 Anima Base v1.0</option>
                      <option value="basb">⚡ BAS Anime Plus</option>
                    </select>
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: "0.75rem", marginBottom: "4px" }}>Aspect Ratio</label>
                    <select
                      value={ratio}
                      onChange={(e) => setRatio(e.target.value as ImageAspectRatio)}
                      style={{ width: "100%", fontSize: "0.8rem", padding: "6px" }}
                    >
                      {IMAGE_ASPECT_RATIOS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Steps & CFG */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div className="field" style={{ margin: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                      <label style={{ fontSize: "0.75rem", margin: 0 }}>Steps</label>
                      <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>{steps}</span>
                    </div>
                    <input
                      type="range"
                      min="15"
                      max="50"
                      value={steps}
                      onChange={(e) => setSteps(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "var(--blue)" }}
                    />
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                      <label style={{ fontSize: "0.75rem", margin: 0 }}>CFG Scale</label>
                      <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>{cfg.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="15"
                      step="0.5"
                      value={cfg}
                      onChange={(e) => setCfg(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "var(--blue)" }}
                    />
                  </div>
                </div>

                {/* Sampler & Scheduler */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: "0.75rem", marginBottom: "4px" }}>Sampler</label>
                    <select
                      value={samplerName}
                      onChange={(e) => setSamplerName(e.target.value)}
                      style={{ width: "100%", fontSize: "0.78rem", padding: "6px" }}
                    >
                      {SUPPORTED_SAMPLERS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: "0.75rem", marginBottom: "4px" }}>Scheduler</label>
                    <select
                      value={scheduler}
                      onChange={(e) => setScheduler(e.target.value)}
                      style={{ width: "100%", fontSize: "0.78rem", padding: "6px" }}
                    >
                      {SUPPORTED_SCHEDULERS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Negative Prompt */}
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: "0.75rem", marginBottom: "4px" }}>Negative Prompt</label>
                  <textarea
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    rows={2}
                    style={{ width: "100%", fontSize: "0.76rem" }}
                  />
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>

      {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
