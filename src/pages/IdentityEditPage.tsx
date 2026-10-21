import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Layers,
  Loader2,
  AlertCircle,
  Camera,
  Wand2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Shuffle,
  CircleStop,
  ImagePlus,
  UserRoundPlus,
  Save,
} from "lucide-react";
import { GeneratedMedia } from "../types/workflow";
import { fetchComfyMediaBlob } from "../lib/comfyClient";
import {
  getLocalMediaUrl,
  getMediaBlob,
  saveMediaToLocalCache,
} from "../lib/mediaCache";
import {
  createEntity,
  createEntityFromMediaId,
  listEntities,
} from "../lib/entityStore";
import type { Entity } from "../types/entity";
import {
  detectEditNodeCaps,
  computeResolution,
  fillPromptTemplate,
  PlacementCaps,
} from "../lib/krea2EditWorkflow";
import {
  runEditPass,
  invalidateRelayFilename,
} from "../lib/editRunner";
import { slotFromFile } from "../components/edit/ImageSlot";
import { RATIO_PRESETS } from "../lib/ratios";
import { DeliveryPrefs } from "../lib/storage";
import {
  EditorResultRef,
  loadEditorResults,
  saveEditorResults,
  clearEditorResults,
} from "../lib/editorStorage";
import { ImageSlot, SlotSource } from "../components/edit/ImageSlot";
import { EntityPickerModal } from "../components/edit/EntityPickerModal";
import { SaveEntityModal } from "../components/edit/SaveEntityModal";
import { PassBuilder, EditPass, PassStateInfo } from "../components/edit/PassBuilder";

interface IdentityEditPageProps {
  endpoint: string;
  connected: boolean;
  deliveryPrefs: DeliveryPrefs;
}

const PROMPT_CHIPS: { label: string; snippet: string; title: string }[] = [
  {
    label: "Full body",
    snippet: "Full body shot of [NAME]",
    title:
      "Always declare how much of the person is visible — otherwise it copies the head-and-shoulders crop of the reference",
  },
  {
    label: "Identity lock",
    snippet: "Preserve the exact facial identity, face shape, and hairstyle of [NAME].",
    title: "Strong identity preservation phrasing",
  },
  {
    label: "Named outfit",
    snippet: "wearing a concrete outfit (e.g. a dark green wool coat and black jeans)",
    title:
      "Name the outfit explicitly — clothing otherwise carries over from the reference photo",
  },
  {
    label: "On the left",
    snippet: "on the left side of the scene",
    title: "Say where the person goes so they don't replace earlier people",
  },
  {
    label: "On the right",
    snippet: "on the right side of the scene",
    title: "Say where the person goes so they don't replace earlier people",
  },
  {
    label: "Watching",
    snippet: "standing in the foreground, watching the others",
    title: "Foreground/observer placement for later passes",
  },
];

const SYS_PROMPT_SUGGESTION =
  "You are an expert photo editor. Apply the requested edit while strictly preserving the subject's facial identity, pose plausibility, lighting and art style of the source image.";

export const IdentityEditPage: React.FC<IdentityEditPageProps> = ({
  endpoint,
  connected,
  deliveryPrefs,
}) => {
  /* Slots */
  const [sceneSlot, setSceneSlot] = useState<SlotSource | null>(null);
  const [refSlot, setRefSlot] = useState<SlotSource | null>(null);
  const [refPlacement, setRefPlacement] = useState("beside");
  const [scenePlacement, setScenePlacement] = useState("aligned");
  const [refBoost, setRefBoost] = useState(2.5);
  const [sceneBoost, setSceneBoost] = useState(1);

  /* Node capability detection */
  const [caps, setCaps] = useState<PlacementCaps | null>(null);
  const [capsLoading, setCapsLoading] = useState(false);
  const [fitMode, setFitMode] = useState<"fit" | "crop">("fit");

  /* Prompt panel */
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [groundingPx, setGroundingPx] = useState(768);

  /* Sampling panel */
  const [steps, setSteps] = useState(8);
  const [cfg, setCfg] = useState(1);
  const [seed, setSeed] = useState(423516491587350);
  const [randomizeSeed, setRandomizeSeed] = useState(true);
  const [loraStrength, setLoraStrength] = useState(1);
  const [ratioId, setRatioId] = useState("1:1");
  const [megapixels, setMegapixels] = useState(1);

  /* Multi-pass */
  const [passes, setPasses] = useState<EditPass[]>([]);
  const [passStates, setPassStates] = useState<Record<string, PassStateInfo>>({});

  /* Execution */
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPassRunning, setIsPassRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [passStatusText, setPassStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);

  /* Output */
  const [currentOutput, setCurrentOutput] = useState<GeneratedMedia | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [passOutputs, setPassOutputs] = useState<GeneratedMedia[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [editorResults, setEditorResults] = useState<EditorResultRef[]>(loadEditorResults);

  /* Pickers */
  const [scenePickerOpen, setScenePickerOpen] = useState(false);
  const [refPickerOpen, setRefPickerOpen] = useState(false);

  const stopRequestedRef = useRef(false);

  const resolution = computeResolution(ratioId, megapixels);

  /* ---------------- entity library ---------------- */
  const refreshEntities = useCallback(async () => {
    try {
      setEntities(await listEntities());
    } catch {
      /* IndexedDB unavailable */
    }
  }, []);

  const [entities, setEntities] = useState<Entity[]>([]);

  useEffect(() => {
    refreshEntities();
  }, [refreshEntities]);

  /* Prefill the scene slot with the last generation handed off from the T2I page */
  const handoffPrefilled = useRef(false);
  useEffect(() => {
    if (handoffPrefilled.current) return;
    handoffPrefilled.current = true;
    try {
      const raw = sessionStorage.getItem("comfy_studio_last_output");
      if (!raw) return;
      sessionStorage.removeItem("comfy_studio_last_output");
      const media: GeneratedMedia = JSON.parse(raw);
      getLocalMediaUrl(media.id || media.filename).then((url) => {
        if (url) {
          setSceneSlot({ previewUrl: url, label: media.filename, mediaId: media.id });
        }
      });
    } catch {
      /* handoff absent or malformed */
    }
  }, []);

  const entityMap = new Map(entities.map((e) => [e.id, e]));

  const buildSlotFromEntity = async (entity: Entity): Promise<SlotSource> => {
    const url = await getLocalMediaUrl(entity.mediaId);
    return { previewUrl: url || "", label: entity.name, mediaId: entity.mediaId };
  };

  /* ---------------- caps detection ---------------- */
  const refreshCaps = useCallback(async () => {
    if (!endpoint) return;
    setCapsLoading(true);
    const detected = await detectEditNodeCaps(endpoint);
    setCaps(detected);
    setCapsLoading(false);
  }, [endpoint]);

  useEffect(() => {
    refreshCaps();
  }, [refreshCaps]);

  /* ---------------- output url resolution ---------------- */
  useEffect(() => {
    let active = true;
    if (!currentOutput) {
      setOutputUrl(null);
      return;
    }
    if (currentOutput.url.startsWith("blob:")) {
      setOutputUrl(currentOutput.url);
      return;
    }
    getLocalMediaUrl(currentOutput.id || currentOutput.filename).then((url) => {
      if (active) setOutputUrl(url || currentOutput.url);
    });
    return () => {
      active = false;
    };
  }, [currentOutput]);

  /* ---------------- helpers ---------------- */
  const makeBuildOpts = useCallback(
    (seedOverride: number) => {
      const wh = computeResolution(ratioId, megapixels);
      return {
        prompt: fillPromptTemplate(prompt),
        systemPrompt: systemPrompt || undefined,
        groundingPx,
        fitMode,
        loraStrength,
        steps,
        cfg,
        seed: seedOverride,
        outWidth: wh.width,
        outHeight: wh.height,
        placementCaps: caps,
      };
    },
    [
      prompt,
      systemPrompt,
      groundingPx,
      fitMode,
      loraStrength,
      steps,
      cfg,
      ratioId,
      megapixels,
      caps,
    ]
  );

  const deliverIfEnabled = useCallback(
    async (media: GeneratedMedia, positivePrompt: string) => {
      if (!deliveryPrefs.sendToTelegram) return;
      try {
        await fetch("/api/deliver", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: "telegram",
            media: [
              { filename: media.filename, subfolder: media.subfolder, type: media.type },
            ],
            prompts: { positive: positivePrompt },
          }),
        });
      } catch {
        /* delivery is best-effort */
      }
    },
    [deliveryPrefs.sendToTelegram]
  );

  const persistResult = useCallback((media: GeneratedMedia, label: string, passCount: number) => {
    const entry: EditorResultRef = { media, passCount, label, timestamp: Date.now() };
    const next = [entry, ...loadEditorResults().slice(0, 29)];
    saveEditorResults(next);
    setEditorResults(next);
  }, []);

  /** Builds a chainable SlotSource from a generated output (local-cache backed). */
  const slotFromGeneratedMedia = useCallback(
    async (media: GeneratedMedia, label: string): Promise<SlotSource> => {
      let blob: Blob | null = null;
      if (media.id) blob = await getMediaBlob(media.id);
      if (!blob) {
        try {
          const fetched = await fetchComfyMediaBlob(
            endpoint,
            media.filename,
            media.subfolder,
            media.type
          );
          blob = fetched.blob;
          const cacheId =
            media.id || `media_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          await saveMediaToLocalCache(cacheId, blob, media.filename, "image");
          media = { ...media, id: cacheId };
        } catch {
          /* fall back to the remote url below */
        }
      }
      const url = blob ? URL.createObjectURL(blob) : media.url;
      return { previewUrl: url, label, mediaId: media.id, blob: blob || undefined };
    },
    [endpoint]
  );

  const slotFromEditorResult = async (ref: EditorResultRef): Promise<SlotSource | null> => {
    const url = await getLocalMediaUrl(ref.media.id || ref.media.filename);
    if (!url) return null;
    return { previewUrl: url, label: ref.label, mediaId: ref.media.id };
  };

  /* ---------------- single run ---------------- */
  const handleRun = async () => {
    if (isGenerating || isPassRunning) return;
    if (!sceneSlot) {
      setError("Pick or upload Image 1 (scene) first.");
      return;
    }
    setError(null);
    setIsGenerating(true);
    setProgress(5);
    setStatusText("Uploading sources...");

    const usedSeed = randomizeSeed
      ? Math.floor(Math.random() * 2147483647)
      : Math.abs(Math.floor(Number(seed)) || 0);

    try {
      const result = await runEditPass({
        endpoint,
        scene: { source: sceneSlot },
        reference: refSlot ? { source: refSlot } : undefined,
        buildOpts: {
          ...makeBuildOpts(usedSeed),
          refBoost,
          refBoostScene: sceneBoost,
          placementRef: refPlacement,
          placementScene: scenePlacement,
        },
        onProgress: (pct, text) => {
          setProgress(Math.max(10, pct));
          setStatusText(text);
        },
      });
      const media = result.media[0];
      setCurrentOutput(media);
      setPassOutputs((prev) => [media, ...prev].slice(0, 12));
      persistResult(media, "Single edit", 1);
      setStatusText("Completed!");
      setProgress(100);
      deliverIfEnabled(media, makeBuildOpts(usedSeed).prompt);
    } catch (err: any) {
      console.error(err);
      const msg = String(err?.message || err);
      if (/not found|unknown file/i.test(msg)) {
        if (sceneSlot?.mediaId) invalidateRelayFilename(sceneSlot.mediaId);
        if (refSlot?.mediaId) invalidateRelayFilename(refSlot.mediaId);
        setError(`${msg} — source uploads were invalidated; press Run again.`);
      } else {
        setError(msg || "Edit failed.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  /* ---------------- multi-pass run ---------------- */
  const handleRunPasses = async () => {
    if (isGenerating || isPassRunning) return;
    if (!endpoint.trim()) {
      setError("No relay endpoint configured.");
      return;
    }
    if (passes.length === 0) {
      setError("Add at least one pass first.");
      return;
    }
    for (const p of passes) {
      if (!p.entityId || !entityMap.has(p.entityId)) {
        setError("Every pass needs an entity from the library.");
        return;
      }
    }
    setError(null);
    setPassOutputs([]);
    setIsPassRunning(true);
    stopRequestedRef.current = false;

    const initialStates: Record<string, PassStateInfo> = {};
    passes.forEach((p) => (initialStates[p.id] = { status: "pending" }));
    setPassStates(initialStates);

    /** Image 1 of the next pass = output of the previous pass (or the user's scene). */
    let chain: { source: SlotSource; media: GeneratedMedia | null } | null = sceneSlot
      ? { source: sceneSlot, media: null }
      : null;

    let failedAt: number | null = null;

    try {
      for (let i = 0; i < passes.length; i++) {
        if (stopRequestedRef.current) break;

        const pass = passes[i];
        const entity = entityMap.get(pass.entityId!)!;
        setPassStates((prev) => ({ ...prev, [pass.id]: { status: "running" } }));
        setPassStatusText(`Pass ${i + 1}/${passes.length}: adding ${entity.name}...`);
        setProgress(5);

        const usedSeed = randomizeSeed
          ? Math.floor(Math.random() * 2147483647)
          : Math.abs(Math.floor(Number(seed)) || 0);
        const filledPrompt = fillPromptTemplate(pass.prompt, entity.name);
        const wh = computeResolution(ratioId, megapixels);

        try {
          let media: GeneratedMedia;

          if (chain) {
            if (i === 0 && !chain.media) {
              // First pass with a user-picked scene. Prompt may already be the
              // scene edit — reference is the first entity.
              const result = await runEditPass({
                endpoint,
                scene: { source: chain.source },
                reference: { source: await buildSlotFromEntity(entity) },
                buildOpts: {
                  ...makeBuildOpts(usedSeed),
                  prompt:
                    filledPrompt ||
                    `Full body shot of ${entity.name} in the scene, preserving the exact facial identity of ${entity.name}.`,
                  refBoost,
                  refBoostScene: 1,
                  placementRef: pass.placement,
                  placementScene: "aligned",
                },
                onProgress: (pct) => setProgress(pct),
              });
              media = result.media[0];
            } else {
              // Subsequent passes: previous output is scene, entity is image 2.
              const chainedSlot = await slotFromGeneratedMedia(
                chain.media!,
                `Pass ${i} output (${chain.media!.filename})`
              );
              const result = await runEditPass({
                endpoint,
                scene: { source: chainedSlot },
                reference: { source: await buildSlotFromEntity(entity) },
                buildOpts: {
                  ...makeBuildOpts(usedSeed),
                  prompt: filledPrompt,
                  refBoost,
                  refBoostScene: 1,
                  placementRef: pass.placement,
                  placementScene: "aligned",
                },
                onProgress: (pct) => setProgress(pct),
              });
              media = result.media[0];
            }
          } else {
            // No scene at all: recompose the entity itself, full body.
            const result = await runEditPass({
              endpoint,
              scene: { source: await buildSlotFromEntity(entity) },
              buildOpts: {
                ...makeBuildOpts(usedSeed),
                prompt: `Full body shot of ${entity.name}. ${filledPrompt}`.trim(),
                refBoost: 2.5,
              },
              onProgress: (pct) => setProgress(pct),
            });
            media = result.media[0];
          }

          const chainedSlot = await slotFromGeneratedMedia(
            media,
            `Pass ${i + 1} output (${entity.name})`
          );
          chain = { source: chainedSlot, media };

          setPassStates((prev) => ({
            ...prev,
            [pass.id]: { status: "done", message: media.filename },
          }));
          setPassOutputs((prev) => [media, ...prev].slice(0, 12));
          setCurrentOutput(media);
          persistResult(media, `Pass ${i + 1}: ${entity.name}`, i + 1);
          deliverIfEnabled(media, filledPrompt);
        } catch (passErr: any) {
          failedAt = i;
          setPassStates((prev) => ({
            ...prev,
            [pass.id]: { status: "failed", message: passErr?.message || "Pass failed." },
          }));
          break;
        }
      }

      if (failedAt !== null) {
        setPassStatusText(`Stopped at pass ${failedAt + 1} — keeping last good output.`);
      } else if (stopRequestedRef.current) {
        setPassStatusText("Stopped by request — last completed output kept.");
      } else {
        setPassStatusText(`All ${passes.length} passes completed.`);
      }
      setProgress(100);
    } finally {
      setIsPassRunning(false);
      stopRequestedRef.current = false;
    }
  };

  const stopPasses = () => {
    stopRequestedRef.current = true;
    setPassStatusText("Stopping after current pass...");
  };

  /* ---------------- render ---------------- */
  const busy = isGenerating || isPassRunning;
  const supportsPlacement = caps?.supportsPlacement ?? false;
  const placementOptions = caps?.placementOptions || ["aligned", "beside"];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: slots, dials, passes */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {!connected && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Relay endpoint is offline — runs and uploads will fail until connected.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <ImageSlot
              title="Image 1 — Scene"
              subtitle="first pass, then chain"
              accent="indigo"
              source={sceneSlot}
              onPickFromLibrary={() => setScenePickerOpen(true)}
              onUploadFile={(f) => setSceneSlot(slotFromFile(f))}
              onClear={() => setSceneSlot(null)}
            />
            <div className="flex flex-col gap-2">
              <ImageSlot
                title="Image 2 — Person"
                subtitle="entity library"
                accent="fuchsia"
                source={refSlot}
                onPickFromLibrary={() => setRefPickerOpen(true)}
                onUploadFile={async (f) => {
                  try {
                    const created = await createEntity(
                      f,
                      f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ")
                    );
                    await refreshEntities();
                    const url = await getLocalMediaUrl(created.mediaId);
                    setRefSlot({
                      previewUrl: url || "",
                      label: created.name,
                      mediaId: created.mediaId,
                    });
                  } catch {
                    setRefSlot(slotFromFile(f));
                  }
                }}
                onClear={() => setRefSlot(null)}
              />
            </div>
          </div>

          {/* Reference dials */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                Reference dials
              </span>
              {capsLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />
              ) : (
                <button
                  type="button"
                  onClick={refreshCaps}
                  className="text-[10px] text-zinc-500 hover:text-zinc-200 flex items-center gap-1"
                  title="Re-check node pack capabilities via /object_info"
                >
                  <RefreshCw className="w-3 h-3" />
                  {caps?.supportsPlacement ? "V2 pack (placement)" : caps ? "V1 pack (no placement)" : "Detect pack"}
                </button>
              )}
            </div>

            {supportsPlacement ? (
              <div className="flex flex-col gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-400">
                    Image 1 (scene) — ref_position_a
                  </span>
                  <div className="flex gap-1.5 items-center">
                    <select
                      value={scenePlacement}
                      onChange={(e) => setScenePlacement(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-lg bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-200 outline-none focus:border-indigo-500"
                    >
                      {placementOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1.5" title="ref_boost_a — raise when the scene barely changes">
                      <span className="text-[10px] text-zinc-600">boost_a</span>
                      <input
                        type="number"
                        value={sceneBoost}
                        min={0}
                        max={12}
                        step={0.5}
                        onChange={(e) =>
                          setSceneBoost(Math.min(12, Math.max(0, Number(e.target.value) || 0)))
                        }
                        className="w-16 px-2 py-1.5 rounded-lg bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-200 outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-400">
                    Image 2 (person) — ref_position
                  </span>
                  <div className="flex gap-1.5 items-center">
                    <select
                      value={refPlacement}
                      onChange={(e) => setRefPlacement(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-lg bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-200 outline-none focus:border-fuchsia-500"
                    >
                      {placementOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1.5" title="ref_boost — person identity strength (2–3 recommended)">
                      <span className="text-[10px] text-zinc-600">boost</span>
                      <input
                        type="number"
                        value={refBoost}
                        min={0}
                        max={12}
                        step={0.5}
                        onChange={(e) =>
                          setRefBoost(Math.min(12, Math.max(0, Number(e.target.value) || 0)))
                        }
                        className="w-16 px-2 py-1.5 rounded-lg bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-200 outline-none focus:border-fuchsia-500"
                      />
                    </div>
                  </div>
                </label>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-400" title="Older node packs don't expose ref_position — fit_mode decides source framing">
                    fit_mode (source framing)
                  </span>
                  <select
                    value={fitMode}
                    onChange={(e) => setFitMode(e.target.value as "fit" | "crop")}
                    className="px-2 py-1 rounded-lg bg-zinc-950/60 border border-zinc-800 text-[11px] text-zinc-200 outline-none focus:border-indigo-500"
                  >
                    <option value="fit">fit</option>
                    <option value="crop">crop</option>
                  </select>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-400">ref_boost</span>
                  <input
                    type="number"
                    value={refBoost}
                    min={0}
                    max={12}
                    step={0.5}
                    onChange={(e) =>
                      setRefBoost(Math.min(12, Math.max(0, Number(e.target.value) || 0)))
                    }
                    className="w-20 px-2 py-1 rounded-lg bg-zinc-950/60 border border-zinc-800 text-[11px] text-zinc-200 outline-none focus:border-fuchsia-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Multi-pass builder */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                <UserRoundPlus className="w-3.5 h-3.5 text-fuchsia-400" />
                Multi-pass builder
              </span>
              <span className="text-[10px] text-zinc-600">one entity per pass</span>
            </div>

            <PassBuilder
              passes={passes}
              onUpdate={setPasses}
              entities={entities}
              placementOptions={placementOptions}
              disabled={busy}
              running={isPassRunning}
              passStates={passStates}
            />

            {passes.length > 0 && (
              <div className="flex gap-2">
                {isPassRunning ? (
                  <button
                    type="button"
                    onClick={stopPasses}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white text-sm font-bold transition-all"
                  >
                    <CircleStop className="w-4 h-4" />
                    Stop after current pass
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRunPasses}
                    disabled={busy || !connected}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 disabled:opacity-50 text-white text-sm font-bold shadow-lg shadow-fuchsia-500/20 transition-all active:scale-[0.99]"
                  >
                    <Layers className="w-4 h-4" />
                    Run {passes.length} pass{passes.length > 1 ? "es" : ""} in sequence
                  </button>
                )}
              </div>
            )}

            {(passStatusText || isPassRunning) && (
              <div className="flex flex-col gap-1.5">
                {isPassRunning && (
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(5, progress)}%` }}
                    />
                  </div>
                )}
                <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                  {isPassRunning && <Loader2 className="w-3 h-3 animate-spin text-fuchsia-400" />}
                  {passStatusText}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: prompt, sampling, output */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Prompt panel */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
                Prompt
              </label>
              <span className="text-[10px] text-zinc-600">
                [NAME] is replaced with the entity name in passes
              </span>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder={'e.g. "Full body, [NAME] sits astride a brown horse on the left side of the field, wearing a waxed brown coat, holding the reins. Preserve the exact facial identity of [NAME]."'}
              className="w-full rounded-xl bg-zinc-950/70 border border-zinc-800 px-3.5 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-indigo-500 resize-y"
            />

            <div className="flex flex-wrap gap-1.5">
              {PROMPT_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  title={chip.title}
                  disabled={busy}
                  onClick={() => {
                    const sep = prompt.trim() ? (/[.!,]$/.test(prompt.trim()) ? " " : ", ") : "";
                    setPrompt(`${prompt}${sep}${chip.snippet}`);
                  }}
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors disabled:opacity-40"
                >
                  + {chip.label}
                </button>
              ))}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowSystemPrompt((s) => !s)}
                className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {showSystemPrompt ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
                System prompt (advanced)
              </button>
              {showSystemPrompt && (
                <div className="mt-2 flex flex-col gap-2">
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={3}
                    placeholder={SYS_PROMPT_SUGGESTION}
                    className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-indigo-500 resize-y"
                  />
                  <button
                    type="button"
                    onClick={() => setSystemPrompt(SYS_PROMPT_SUGGESTION)}
                    className="self-start text-[10px] text-indigo-400 hover:text-indigo-300"
                  >
                    insert suggestion
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <label
                className="text-[11px] text-zinc-400 shrink-0"
                title="Grounding token budget — lower this when the composition doubles or splits"
              >
                grounding_px
              </label>
              <input
                type="range"
                min={384}
                max={768}
                step={32}
                value={groundingPx}
                onChange={(e) => setGroundingPx(Number(e.target.value))}
                className="flex-1 accent-indigo-500"
              />
              <span className="text-xs font-mono text-zinc-300 w-10 text-right">{groundingPx}</span>
            </div>
            <p className="text-[10px] text-zinc-600 -mt-2">
              Composition doubled or split? Lower this value.
            </p>
          </div>

          {/* Sampling panel */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3">
            <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
              Sampling
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Steps</span>
                <input
                  type="number"
                  value={steps}
                  min={1}
                  max={64}
                  onChange={(e) =>
                    setSteps(Math.min(64, Math.max(1, Math.round(Number(e.target.value) || 8))))
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-950/70 border border-zinc-800 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">CFG</span>
                <input
                  type="number"
                  value={cfg}
                  min={0.5}
                  max={12}
                  step={0.5}
                  onChange={(e) => setCfg(Math.min(12, Math.max(0.5, Number(e.target.value) || 1)))}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-950/70 border border-zinc-800 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Seed</span>
                <div className="flex gap-0">
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(Math.abs(Math.floor(Number(e.target.value) || 0)))}
                    disabled={randomizeSeed}
                    className="w-full px-2.5 py-1.5 rounded-l-lg bg-zinc-950/70 border border-zinc-800 text-xs text-zinc-100 outline-none focus:border-indigo-500 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setSeed(Math.floor(Math.random() * 2147483647))}
                    disabled={randomizeSeed}
                    className="px-2 rounded-r-lg bg-zinc-900 hover:bg-zinc-800 border border-l-0 border-zinc-800 text-zinc-400 disabled:opacity-40"
                    title="Roll a random seed once"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                  </button>
                </div>
              </label>
              <label className="flex items-end gap-2 pb-1.5">
                <input
                  type="checkbox"
                  checked={randomizeSeed}
                  onChange={(e) => setRandomizeSeed(e.target.checked)}
                  className="accent-indigo-500"
                />
                <span className="text-[11px] text-zinc-400">Random each run</span>
              </label>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-[11px] text-zinc-400 shrink-0">
                LoRA strength
              </label>
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={loraStrength}
                onChange={(e) => setLoraStrength(Number(e.target.value))}
                className="flex-1 accent-indigo-500"
              />
              <span className="text-xs font-mono text-zinc-300 w-9 text-right">
                {loraStrength.toFixed(2)}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {RATIO_PRESETS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRatioId(r.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                      ratioId === r.id
                        ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/40"
                        : "bg-zinc-950/60 text-zinc-400 border-zinc-800 hover:border-zinc-600"
                    }`}
                    title={r.label}
                  >
                    {r.id}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="text-[10px] text-zinc-600"
                  title="Krea-2 is trained near 1MP — above ~2MP quality degrades"
                >
                  Megapixels (keep ≤ 2)
                </span>
                <input
                  type="range"
                  min={0.25}
                  max={2}
                  step={0.05}
                  value={megapixels}
                  onChange={(e) => setMegapixels(Number(e.target.value))}
                  className="flex-1 accent-indigo-500"
                />
                <span className="text-xs font-mono text-zinc-300 w-12 text-right">
                  {megapixels.toFixed(2)} MP
                </span>
              </div>
              <p className="text-[10px] text-zinc-600 font-mono">
                Output: {resolution.width} × {resolution.height}
              </p>
            </div>

            <button
              type="button"
              onClick={handleRun}
              disabled={busy || !sceneSlot || !connected}
              className="mt-1 flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-indigo-500/25 transition-all active:scale-[0.99]"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{statusText || "Generating..."}</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white text-white" />
                  <span>Run edit</span>
                </>
              )}
            </button>

            {isGenerating && (
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(5, progress)}%` }}
                />
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Output panel */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden flex flex-col">
            <div className="relative bg-zinc-950/80 aspect-video flex items-center justify-center group">
              {busy && (
                <div className="absolute inset-0 z-10 bg-zinc-950/70 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                  <span className="text-xs text-zinc-300 font-mono">
                    {statusText || passStatusText || "Working..."}
                  </span>
                </div>
              )}
              {outputUrl && !busy ? (
                <img src={outputUrl} alt="edit output" className="max-h-full max-w-full object-contain" />
              ) : !outputUrl && !busy ? (
                <div className="text-center p-6 text-zinc-600 flex flex-col items-center gap-2">
                  <Camera className="w-8 h-8" />
                  <span className="text-xs">Output appears here</span>
                </div>
              ) : null}

              {currentOutput && !busy && (
                <div className="absolute top-2.5 right-2.5 flex gap-1.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-20">
                  <button
                    type="button"
                    onClick={() => setSaveModalOpen(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-950/90 hover:bg-indigo-600 text-[11px] font-semibold text-indigo-300 hover:text-white border border-zinc-800 transition-colors"
                    title="Save as entity for reuse as scene or reference"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save as entity
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!currentOutput) return;
                      const slot = await slotFromGeneratedMedia(currentOutput, "Editor output");
                      setSceneSlot(slot);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-950/90 hover:bg-zinc-800 text-[11px] font-semibold text-zinc-300 border border-zinc-800 transition-colors"
                    title="Use this output as Image 1 for the next edit or pass"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    Use as Image 1
                  </button>
                </div>
              )}
            </div>

            {passOutputs.length > 0 && (
              <div className="flex gap-2 p-2.5 border-t border-zinc-800 overflow-x-auto">
                {passOutputs.map((m, i) => (
                  <PassOutputThumb
                    key={`${m.id || m.filename}_${i}`}
                    media={m}
                    active={currentOutput?.filename === m.filename}
                    onClick={() => setCurrentOutput(m)}
                  />
                ))}
              </div>
            )}

            {editorResults.length > 0 && (
              <div className="flex items-center gap-2 p-2.5 border-t border-zinc-800">
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider shrink-0">
                  Recent
                </span>
                <div className="flex gap-1.5 overflow-x-auto">
                  {editorResults.map((r) => (
                    <EditorResultThumb
                      key={`${r.media.id || r.media.filename}_${r.timestamp}`}
                      result={r}
                      onClick={() => setCurrentOutput(r.media)}
                      onUseAsScene={async () => {
                        const slot = await slotFromEditorResult(r);
                        if (slot) setSceneSlot(slot);
                      }}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      clearEditorResults();
                      setEditorResults([]);
                    }}
                    className="shrink-0 self-center px-1.5 py-0.5 text-[10px] text-zinc-600 hover:text-rose-400"
                    title="Clear saved editor results"
                  >
                    clear
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pickers */}
      <EntityPickerModal
        open={scenePickerOpen}
        title="Pick entity for Image 1 (scene)"
        onClose={() => setScenePickerOpen(false)}
        onSelect={async (entity) => setSceneSlot(await buildSlotFromEntity(entity))}
      />
      <EntityPickerModal
        open={refPickerOpen}
        title="Pick entity for Image 2 (person)"
        onClose={() => setRefPickerOpen(false)}
        onSelect={async (entity) => setRefSlot(await buildSlotFromEntity(entity))}
      />
      <SaveEntityModal
        media={currentOutput}
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSaved={() => refreshEntities()}
        createEntityFromMediaId={createEntityFromMediaId}
        createEntityFromBlob={createEntity}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Output strip thumbnails                                             */
/* ------------------------------------------------------------------ */

const PassOutputThumb: React.FC<{
  media: GeneratedMedia;
  active: boolean;
  onClick: () => void;
}> = ({ media, active, onClick }) => {
  const [url, setUrl] = useState<string>(media.url);

  useEffect(() => {
    let active = true;
    if (!media.url.startsWith("blob:")) {
      getLocalMediaUrl(media.id || media.filename).then((u) => {
        if (active && u) setUrl(u);
      });
    }
    return () => {
      active = false;
    };
  }, [media.id, media.filename, media.url]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border transition-all ${
        active
          ? "border-indigo-500 ring-2 ring-indigo-500/30"
          : "border-zinc-800 hover:border-zinc-600 opacity-80 hover:opacity-100"
      }`}
      title={media.filename}
    >
      <img src={url} alt="pass output" className="w-full h-full object-cover" />
    </button>
  );
};

const EditorResultThumb: React.FC<{
  result: EditorResultRef;
  onClick: () => void;
  onUseAsScene: () => void;
}> = ({ result, onClick, onUseAsScene }) => {
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    let active = true;
    getLocalMediaUrl(result.media.id || result.media.filename).then((u) => {
      if (!active) return;
      setUrl(u || result.media.url);
    });
    return () => {
      active = false;
    };
  }, [result.media.id, result.media.filename]);

  return (
    <div className="relative shrink-0 group">
      <button
        type="button"
        onClick={onClick}
        className="w-12 h-12 rounded-lg overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-all"
        title={`${result.label} (${result.passCount} pass${result.passCount > 1 ? "es" : ""})`}
      >
        {url ? (
          <img src={url} alt={result.label} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-zinc-900" />
        )}
      </button>
      <button
        type="button"
        onClick={onUseAsScene}
        title="Use as Image 1"
        className="absolute -top-1 -left-1 p-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <ImagePlus className="w-3 h-3" />
      </button>
    </div>
  );
};
