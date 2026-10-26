import React, { useEffect, useState, useCallback } from "react";
import { Play, Sparkles, AlertCircle } from "lucide-react";
import {
  ComfyWorkflowGraph,
  ExtractedParameter,
  GeneratedMedia,
  GenerationHistoryItem,
} from "./types/workflow";
import { parseWorkflowParameters } from "./lib/workflowParser";
import {
  injectWorkflowParameters,
  generateRandomSeed,
} from "./lib/workflowInjector";
import {
  testComfyConnection,
  queuePrompt,
  pollPromptCompletion,
  ComfyConnectionTestResult,
} from "./lib/comfyClient";
import {
  loadSavedEndpoint,
  saveEndpoint,
  loadEndpointHistory,
  loadGenerationHistory,
  saveGenerationItem,
  clearGenerationHistory,
  loadCustomPresets,
  saveCustomPreset,
  loadDeliveryPrefs,
  saveDeliveryPrefs,
  DeliveryPrefs,
  WorkflowPreset,
  DEFAULT_ENDPOINT,
} from "./lib/storage";

// Components
import { Navbar, StudioPage } from "./components/Navbar";
import { SettingsModal } from "./components/SettingsModal";
import { WorkflowBar } from "./components/WorkflowBar";
import { DynamicForm } from "./components/DynamicForm/DynamicForm";
import { OutputGallery } from "./components/OutputGallery";
import { CodeExportModal } from "./components/CodeExportModal";
import { GraphInspectorModal } from "./components/GraphInspectorModal";
import { DeliveryToggles } from "./components/DeliveryToggles";
import { IdentityEditPage } from "./pages/IdentityEditPage";
import { VisualNovelPage } from "./pages/VisualNovelPage";
import { VNTab } from "./types/visualNovel";

/** Reads the current hash or path route; unknown -> generate. */
function readCurrentPage(): StudioPage {
  const path = location.pathname.toLowerCase();
  if (path.startsWith("/novel") || path.startsWith("/vn")) return "novel";
  const hash = location.hash.replace(/^#\/?/, "").toLowerCase();
  if (hash === "edit") return "edit";
  if (hash === "novel" || hash === "vn") return "novel";
  return "generate";
}

export const App: React.FC = () => {
  // 1. Endpoint & Connection State
  const [endpoint, setEndpoint] = useState<string>(loadSavedEndpoint());
  const [endpointHistory, setEndpointHistory] = useState<string[]>(loadEndpointHistory());
  const [connectionStatus, setConnectionStatus] = useState<ComfyConnectionTestResult | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);

  // 2. Workflow & Dynamic Parameters State
  const [workflowGraph, setWorkflowGraph] = useState<ComfyWorkflowGraph>({});
  const [parameters, setParameters] = useState<ExtractedParameter[]>([]);
  const [randomizeSeedOnGenerate, setRandomizeSeedOnGenerate] = useState<boolean>(true);
  const [currentWorkflowName, setCurrentWorkflowName] = useState<string>("Anima Base v1.0");

  // Presets
  const [presets, setPresets] = useState<WorkflowPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>("anima-base");

  // 3. Execution & Media Generation State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [currentMedia, setCurrentMedia] = useState<GeneratedMedia | null>(null);
  const [history, setHistory] = useState<GenerationHistoryItem[]>(loadGenerationHistory());

  // Delivery preferences (browser display / Telegram push)
  const [deliveryPrefs, setDeliveryPrefs] = useState<DeliveryPrefs>(loadDeliveryPrefs);

  const handleDeliveryPrefsChange = (prefs: DeliveryPrefs) => {
    setDeliveryPrefs(prefs);
    saveDeliveryPrefs(prefs);
  };

  // 4. Modals
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showGraphModal, setShowGraphModal] = useState<boolean>(false);

  // Visual Novel Navigation State
  const [vnTab, setVnTab] = useState<VNTab>("characters");
  const [vnCharCount, setVnCharCount] = useState<number>(0);
  const [vnAttireCount, setVnAttireCount] = useState<number>(0);
  const [vnSceneCount, setVnSceneCount] = useState<number>(0);

  // 5. Hash routing between Generate, Identity Edit, and Visual Novel pages
  const [page, setPage] = useState<StudioPage>(readCurrentPage);
  const navigate = useCallback((next: StudioPage) => {
    location.hash = next === "edit" ? "#/edit" : next === "novel" ? "#/novel" : "#/generate";
    // hashchange listener keeps state in sync; set directly too in case hash is unchanged
    setPage(next);
  }, []);

  useEffect(() => {
    const onHash = () => setPage(readCurrentPage());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Load initial preset workflow
  useEffect(() => {
    async function initWorkflow() {
      try {
        const [animaRes, kromaRes, stickerRes] = await Promise.allSettled([
          fetch("/workflows/anima-base-api.json").then((r) => (r.ok ? r.json() : null)),
          fetch("/workflows/kroma-upscale-api.json").then((r) => (r.ok ? r.json() : null)),
          fetch("/workflows/anima-removebg-sticker.json").then((r) => (r.ok ? r.json() : null)),
        ]);

        const builtInPresets: WorkflowPreset[] = [];

        const animaJson = animaRes.status === "fulfilled" && animaRes.value ? animaRes.value : null;
        if (animaJson) {
          builtInPresets.push({
            id: "anima-base",
            name: "Anima Base",
            description: "Anima Base Text-to-Image with LoRA",
            workflowJson: JSON.stringify(animaJson),
          });
        }

        const kromaJson = kromaRes.status === "fulfilled" && kromaRes.value ? kromaRes.value : null;
        if (kromaJson) {
          builtInPresets.push({
            id: "kroma",
            name: "Krea-2 (Kroma)",
            description: "Krea-2 / Kroma generation + upscale",
            workflowJson: JSON.stringify(kromaJson),
          });
        }

        const stickerJson = stickerRes.status === "fulfilled" && stickerRes.value ? stickerRes.value : null;
        if (stickerJson) {
          builtInPresets.push({
            id: "anima-sticker",
            name: "Anima Sticker",
            description: "Anima with RMBG-2.0 background removal and customizable sticker outline",
            workflowJson: JSON.stringify(stickerJson),
          });
        }

        // Set initial active workflow graph
        const initialPreset =
          builtInPresets.find((p) => p.id === activePresetId) || builtInPresets[0];

        if (initialPreset) {
          const json: ComfyWorkflowGraph = JSON.parse(initialPreset.workflowJson);
          setWorkflowGraph(json);
          const parsed = parseWorkflowParameters(json);
          setParameters(parsed);
          setCurrentWorkflowName(initialPreset.name);
          setActivePresetId(initialPreset.id);
        }

        const custom = loadCustomPresets().filter(
          (c) => !builtInPresets.some((b) => b.id === c.id)
        );
        setPresets([...builtInPresets, ...custom]);
      } catch (err) {
        console.error("Failed to load initial workflow:", err);
      }
    }

    initWorkflow();
  }, []);

  // Pull the ComfyUI relay endpoint from server secrets (if authed & configured).
  // Falls back to the localStorage endpoint otherwise.
  useEffect(() => {
    async function loadRelayConfig() {
      try {
        const res = await fetch("/api/config", { cache: "no-store" });
        if (!res.ok) return; // 401 = password gate not passed yet
        const cfg = await res.json();
        if (cfg?.configured && cfg.endpoint) {
          const withKey = cfg.key ? `${cfg.endpoint}?key=${encodeURIComponent(cfg.key)}` : cfg.endpoint;
          setEndpoint(withKey);
          saveEndpoint(withKey);
          handleTestConnection(withKey);
        }
      } catch {
        // config endpoint unavailable — keep localStorage endpoint
      }
    }
    loadRelayConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ping endpoint on start
  const handleTestConnection = useCallback(async (targetEndpoint?: string) => {
    const url = (targetEndpoint || endpoint).trim();
    if (!url) return;

    setIsTestingConnection(true);
    const result = await testComfyConnection(url);
    setConnectionStatus(result);
    setIsTestingConnection(false);

    if (result.ok) {
      saveEndpoint(url);
      setEndpointHistory(loadEndpointHistory());
    }
  }, [endpoint]);

  useEffect(() => {
    if (endpoint) {
      handleTestConnection(endpoint);
    }
  }, []);

  // Update a single parameter value
  const handleParameterChange = (paramId: string, value: any) => {
    setParameters((prev) =>
      prev.map((p) => (p.id === paramId ? { ...p, currentValue: value } : p))
    );
  };

  // Reset parameters to original defaults from workflow JSON
  const handleResetParams = () => {
    setParameters((prev) =>
      prev.map((p) => ({ ...p, currentValue: p.defaultValue }))
    );
  };

  // Switch presets
  const handleSelectPreset = (presetId: string) => {
    const found = presets.find((p) => p.id === presetId);
    if (found) {
      try {
        const json: ComfyWorkflowGraph = JSON.parse(found.workflowJson);
        setWorkflowGraph(json);
        const parsed = parseWorkflowParameters(json);
        setParameters(parsed);
        setActivePresetId(presetId);
        setCurrentWorkflowName(found.name);
      } catch (err) {
        console.error("Failed to parse preset JSON:", err);
      }
    }
  };

  // Upload custom workflow JSON file
  const handleUploadWorkflowFile = async (file: File) => {
    try {
      const text = await file.text();
      const json: ComfyWorkflowGraph = JSON.parse(text);
      const name = file.name.replace(/\.json$/i, "");

      setWorkflowGraph(json);
      const parsed = parseWorkflowParameters(json);
      setParameters(parsed);
      setCurrentWorkflowName(name);

      // Create new preset
      const newPreset: WorkflowPreset = {
        id: `custom_${Date.now()}`,
        name,
        description: "Uploaded custom workflow",
        workflowJson: text,
        isCustom: true,
      };

      saveCustomPreset(newPreset);
      setPresets((prev) => [newPreset, ...prev]);
      setActivePresetId(newPreset.id);
    } catch (err: any) {
      alert("Invalid ComfyUI workflow JSON: " + err.message);
    }
  };

  // Paste custom workflow JSON
  const handlePasteWorkflowJson = (jsonStr: string, name?: string) => {
    try {
      const json: ComfyWorkflowGraph = JSON.parse(jsonStr);
      const presetName = name || `Custom ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

      setWorkflowGraph(json);
      const parsed = parseWorkflowParameters(json);
      setParameters(parsed);
      setCurrentWorkflowName(presetName);

      const newPreset: WorkflowPreset = {
        id: `custom_${Date.now()}`,
        name: presetName,
        description: "Pasted custom workflow",
        workflowJson: jsonStr,
        isCustom: true,
      };

      saveCustomPreset(newPreset);
      setPresets((prev) => [newPreset, ...prev]);
      setActivePresetId(newPreset.id);
    } catch (err: any) {
      alert("Invalid ComfyUI workflow JSON: " + err.message);
    }
  };

  // Download current injected workflow JSON
  const handleExportWorkflowJson = () => {
    const injected = injectWorkflowParameters(workflowGraph, parameters);
    const blob = new Blob([JSON.stringify(injected, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentWorkflowName.toLowerCase().replace(/\s+/g, "-")}-api.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Execute Generation
  const handleGenerate = async () => {
    if (isGenerating) return;
    if (!endpoint.trim()) {
      setErrorMessage("Please enter your ComfyUI relay endpoint URL first.");
      return;
    }

    setErrorMessage(undefined);
    setIsGenerating(true);
    setProgressPercent(5);
    setStatusText("Preparing workflow...");

    const startTime = Date.now();
    let currentParams = [...parameters];

    // Roll random seed if enabled
    if (randomizeSeedOnGenerate) {
      const newSeed = generateRandomSeed();
      currentParams = currentParams.map((p) =>
        p.inputKey === "seed" || p.inputKey === "noise_seed"
          ? { ...p, currentValue: newSeed }
          : p
      );
      setParameters(currentParams);
    }

    try {
      // 1. Inject parameters into graph
      const injectedWorkflow = injectWorkflowParameters(workflowGraph, currentParams);
      const clientId = `universal_studio_${Math.random().toString(36).substring(2, 9)}`;

      // 2. Queue prompt
      setStatusText("Submitting to ComfyUI relay...");
      setProgressPercent(15);
      const queueRes = await queuePrompt(endpoint, injectedWorkflow, clientId);

      if (!queueRes || !queueRes.prompt_id) {
        throw new Error("No prompt_id returned from ComfyUI /prompt endpoint.");
      }

      setStatusText("Queued in GPU pipeline...");
      setProgressPercent(25);

      // 3. Poll for completion
      const mediaOutputs = await pollPromptCompletion(
        endpoint,
        queueRes.prompt_id,
        (pct, text) => {
          setProgressPercent(Math.max(25, pct));
          setStatusText(text);
        }
      );

      if (!mediaOutputs || mediaOutputs.length === 0) {
        throw new Error("Generation completed but no output images or videos were found.");
      }

      // Delivery step: push to Telegram when enabled
      if (deliveryPrefs.sendToTelegram) {
        setStatusText("Sending to Telegram...");
        const refs = mediaOutputs.map((m) => ({
          filename: m.filename,
          subfolder: m.subfolder,
          type: m.type,
        }));
        const prompts = {
          positive: currentParams.find((p) => p.category === "prompt" && !p.isNegative)?.currentValue,
          negative: currentParams.find((p) => p.category === "prompt" && p.isNegative)?.currentValue,
        };
        const deliverRes = await fetch("/api/deliver", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: "telegram",
            media: refs,
            prompts,
          }),
        });
        if (!deliverRes.ok) {
          const j = await deliverRes.json().catch(() => null);
          throw new Error(j?.error || `Telegram delivery failed (${deliverRes.status}).`);
        }
      }

      // Display only when the "load in browser" toggle is on
      if (deliveryPrefs.loadInBrowser) {
        const firstMedia = mediaOutputs[0];
        setCurrentMedia(firstMedia);
      }
      // Hand the output to the Identity Edit studio (scene prefill)
      try {
        sessionStorage.setItem(
          "comfy_studio_last_output",
          JSON.stringify(mediaOutputs[0])
        );
      } catch {}
      setProgressPercent(100);
      setStatusText(
        deliveryPrefs.sendToTelegram
          ? deliveryPrefs.loadInBrowser
            ? "Completed & delivered to Telegram!"
            : "Delivered to Telegram!"
          : "Completed!"
      );

      // 5. Save to local history
      const durationMs = Date.now() - startTime;
      const historyItem: GenerationHistoryItem = {
        id: `gen_${Date.now()}`,
        promptId: queueRes.prompt_id,
        timestamp: Date.now(),
        status: "completed",
        progress: 100,
        workflowName: currentWorkflowName,
        parameters: Object.fromEntries(
          currentParams.map((p) => [p.inputKey, p.currentValue])
        ),
        outputs: mediaOutputs,
        durationMs,
      };

      saveGenerationItem(historyItem);
      setHistory(loadGenerationHistory());
    } catch (err: any) {
      console.error("Generation failed:", err);
      setErrorMessage(err.message || "Failed to generate image.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Keyboard shortcut: Ctrl+Enter / Cmd+Enter to generate (Generate page only)
  useEffect(() => {
    if (page !== "generate") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleGenerate();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleGenerate, page]);

  // Restore history item parameters into form
  const handleSelectHistoryItem = (item: GenerationHistoryItem) => {
    if (item.outputs && item.outputs.length > 0) {
      setCurrentMedia(item.outputs[0]);
    }
    // Optionally restore parameters
    if (item.parameters) {
      setParameters((prev) =>
        prev.map((p) => {
          if (p.inputKey in item.parameters) {
            return { ...p, currentValue: item.parameters[p.inputKey] };
          }
          return p;
        })
      );
    }
  };

  const handleClearHistory = () => {
    if (confirm("Clear all generation history?")) {
      clearGenerationHistory();
      setHistory([]);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 font-sans selection:bg-indigo-600 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        connectionStatus={connectionStatus}
        isTestingConnection={isTestingConnection}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenExport={() => setShowExportModal(true)}
        onOpenGraph={() => setShowGraphModal(true)}
        onResetParams={handleResetParams}
        activePage={page}
        onNavigate={navigate}
        vnTab={vnTab}
        onVnTabChange={setVnTab}
        vnCharacterCount={vnCharCount}
        vnAttireCount={vnAttireCount}
        vnSceneCount={vnSceneCount}
      />

      {page === "edit" ? (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
          <IdentityEditPage
            endpoint={endpoint}
            connected={!!connectionStatus?.ok}
            deliveryPrefs={deliveryPrefs}
          />
        </main>
      ) : page === "novel" ? (
        <VisualNovelPage
          endpoint={endpoint}
          onOpenSettings={() => setShowSettingsModal(true)}
          activeTab={vnTab}
          onTabChange={setVnTab}
          onCountsChange={(chars, scenes, attires) => {
            setVnCharCount(chars);
            setVnSceneCount(scenes);
            if (attires !== undefined) setVnAttireCount(attires);
          }}
        />
      ) : (
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Workflow Switcher & File Dropzone */}
        <WorkflowBar
          currentWorkflowName={currentWorkflowName}
          presets={presets}
          activePresetId={activePresetId}
          onSelectPreset={handleSelectPreset}
          onUploadWorkflowFile={handleUploadWorkflowFile}
          onPasteWorkflowJson={handlePasteWorkflowJson}
          onExportWorkflowJson={handleExportWorkflowJson}
        />

        {/* Split Studio: Parameters Left / Canvas Output Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Dynamic Parameter Form */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* Generate Primary Button */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full relative group overflow-hidden py-3.5 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold text-sm sm:text-base shadow-xl shadow-indigo-500/25 transition-all duration-200 active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              {isGenerating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{statusText || "Generating..."}</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-white text-white" />
                  <span>Generate Image</span>
                  <span className="text-xs opacity-75 font-normal ml-1">
                    (Ctrl+Enter)
                  </span>
                </>
              )}
            </button>

            {/* Delivery options: browser display / Telegram push */}
            <DeliveryToggles prefs={deliveryPrefs} onChange={handleDeliveryPrefsChange} />

            {/* Continue editing: Identity Edit handoff */}
            <div className="flex items-center justify-between gap-2 bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-2.5">
              <span className="text-[11px] text-zinc-400">
                Generated something interesting? Save it as an entity or add characters to it.
              </span>
              <button
                type="button"
                onClick={() => navigate("edit")}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-fuchsia-300 hover:text-white bg-fuchsia-500/10 border border-fuchsia-500/30 hover:bg-fuchsia-500/20 transition-colors"
              >
                Open Identity Edit
              </button>
            </div>

            {/* Dynamic Form Controls */}
            <DynamicForm
              parameters={parameters}
              workflowGraph={workflowGraph}
              onParameterChange={handleParameterChange}
              randomizeSeedOnGenerate={randomizeSeedOnGenerate}
              onToggleRandomizeSeed={setRandomizeSeedOnGenerate}
              endpoint={endpoint}
            />
          </div>

          {/* Right Column: Output Viewer & History */}
          <div className="lg:col-span-5 sticky top-20 flex flex-col gap-4">
            <OutputGallery
              currentMedia={currentMedia}
              history={history}
              isGenerating={isGenerating}
              progressPercent={progressPercent}
              statusText={statusText}
              errorMessage={errorMessage}
              endpoint={endpoint}
              onSelectHistoryItem={handleSelectHistoryItem}
              onClearHistory={handleClearHistory}
            />
          </div>
        </div>
      </main>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        endpoint={endpoint}
        onEndpointChange={(val) => {
          setEndpoint(val);
          saveEndpoint(val);
        }}
        onTestConnection={() => handleTestConnection()}
        isTesting={isTestingConnection}
        connectionResult={connectionStatus}
        endpointHistory={endpointHistory}
      />

      {/* Code Export Modal */}
      <CodeExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        endpoint={endpoint}
        workflowGraph={workflowGraph}
        parameters={parameters}
      />

      {/* Graph Inspector Modal */}
      <GraphInspectorModal
        isOpen={showGraphModal}
        onClose={() => setShowGraphModal(false)}
        workflowGraph={workflowGraph}
      />
    </div>
  );
};
