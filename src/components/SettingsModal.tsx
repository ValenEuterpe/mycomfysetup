import React, { useState, useEffect } from "react";
import {
  Settings,
  Link2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  History,
  X,
  ShieldCheck,
  Bot,
  Key,
  Server,
  Layers,
} from "lucide-react";
import { ComfyConnectionTestResult } from "../lib/comfyClient";
import {
  loadLlmConfig,
  saveLlmConfig,
  fetchAvailableModels,
} from "../lib/llmClient";
import { LlmConfig } from "../types/visualNovel";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  endpoint: string;
  onEndpointChange: (url: string) => void;
  onTestConnection: () => void;
  isTesting: boolean;
  connectionResult: ComfyConnectionTestResult | null;
  endpointHistory: string[];
}

type SettingsTab = "comfy" | "llm";

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  endpoint,
  onEndpointChange,
  onTestConnection,
  isTesting,
  connectionResult,
  endpointHistory,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("comfy");
  const [showHistory, setShowHistory] = useState(false);

  // LLM State
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(loadLlmConfig);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelsStatus, setModelsStatus] = useState<{
    ok?: boolean;
    message?: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLlmConfig(loadLlmConfig());
      setModelsStatus(null);
    }
  }, [isOpen]);

  const handleLlmChange = (changes: Partial<LlmConfig>) => {
    const updated = saveLlmConfig(changes);
    setLlmConfig(updated);
  };

  const handleFetchModels = async () => {
    if (isFetchingModels) return;
    setIsFetchingModels(true);
    setModelsStatus(null);

    try {
      const models = await fetchAvailableModels(llmConfig.baseUrl, llmConfig.apiKey);
      if (models.length === 0) {
        setModelsStatus({
          ok: false,
          message: "No models returned by endpoint.",
        });
      } else {
        setModelsStatus({
          ok: true,
          message: `Loaded ${models.length} model${models.length === 1 ? "" : "s"}!`,
        });
        const currentModelValid = models.includes(llmConfig.selectedModel);
        if (!currentModelValid && models.length > 0) {
          handleLlmChange({
            availableModels: models,
            selectedModel: models[0],
          });
        } else {
          handleLlmChange({ availableModels: models });
        }
      }
    } catch (err: any) {
      setModelsStatus({
        ok: false,
        message: err.message || "Failed to fetch models.",
      });
    } finally {
      setIsFetchingModels(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl flex flex-col shadow-2xl overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Settings className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Studio & AI Settings
              </h3>
              <p className="text-xs text-zinc-400">
                Configure ComfyUI image relay and OpenAI-compatible LLM
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-zinc-800 bg-zinc-950/40 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("comfy")}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "comfy"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            ComfyUI Relay
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("llm")}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "llm"
                ? "border-fuchsia-500 text-fuchsia-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            Visual Novel LLM
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-4 bg-zinc-950/60 overflow-y-auto">
          {activeTab === "comfy" ? (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                    <Link2 className="w-3.5 h-3.5 text-indigo-400" />
                    Relay / Server Endpoint URL
                  </label>
                  {connectionResult && (
                    <div className="text-xs flex items-center gap-1.5">
                      {connectionResult.ok ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {connectionResult.message}
                        </span>
                      ) : (
                        <span className="text-rose-400 flex items-center gap-1 font-medium">
                          <XCircle className="w-3.5 h-3.5" />
                          {connectionResult.message}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={endpoint}
                    onChange={(e) => onEndpointChange(e.target.value)}
                    placeholder="https://your-comfy-relay.workers.dev/?key=yourkey"
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 font-mono transition-colors pr-10 shadow-inner"
                  />
                  {endpointHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowHistory(!showHistory)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                      title="Endpoint history"
                    >
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${
                          showHistory ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  )}

                  {/* History Dropdown */}
                  {showHistory && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-20 py-1 overflow-hidden">
                      <div className="px-3.5 py-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-zinc-800">
                        <History className="w-3 h-3 text-indigo-400" />
                        Recent Endpoints
                      </div>
                      {endpointHistory.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            onEndpointChange(item);
                            setShowHistory(false);
                          }}
                          className="w-full text-left px-3.5 py-2.5 text-xs font-mono text-zinc-300 hover:bg-zinc-800 hover:text-white truncate transition-colors flex items-center justify-between"
                        >
                          <span className="truncate">{item}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 mt-2">
                  Supports personal keys via query string (e.g. <code className="text-zinc-400">?key=YOUR_KEY</code>) or custom headers.
                </p>
              </div>

              {/* Test Connection Button */}
              <button
                type="button"
                onClick={onTestConnection}
                disabled={isTesting || !endpoint.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs sm:text-sm font-medium text-zinc-200 hover:text-white border border-zinc-700/60 transition-all active:scale-[0.99] shadow-sm"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isTesting ? "animate-spin text-indigo-400" : ""}`}
                />
                <span>{isTesting ? "Testing Connection..." : "Test Connection"}</span>
              </button>
            </>
          ) : (
            <>
              {/* LLM Base URL */}
              <div>
                <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider mb-2">
                  <Server className="w-3.5 h-3.5 text-fuchsia-400" />
                  OpenAI-Compatible Base URL
                </label>
                <input
                  type="text"
                  value={llmConfig.baseUrl}
                  onChange={(e) => handleLlmChange({ baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 font-mono transition-colors shadow-inner"
                />

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    { name: "OpenAI", url: "https://api.openai.com/v1" },
                    { name: "OpenRouter", url: "https://openrouter.ai/api/v1" },
                    { name: "Groq", url: "https://api.groq.com/openai/v1" },
                    { name: "Ollama (Local)", url: "http://localhost:11434/v1" },
                  ].map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => handleLlmChange({ baseUrl: p.url })}
                      className="px-2 py-1 rounded-md text-[10px] font-medium bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* LLM API Key */}
              <div>
                <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider mb-2">
                  <Key className="w-3.5 h-3.5 text-fuchsia-400" />
                  API Key
                </label>
                <input
                  type="password"
                  value={llmConfig.apiKey}
                  onChange={(e) => handleLlmChange({ apiKey: e.target.value })}
                  placeholder="sk-... (leave empty for local Ollama)"
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 font-mono transition-colors shadow-inner"
                />
              </div>

              {/* Fetch Models & Model Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                    <Layers className="w-3.5 h-3.5 text-fuchsia-400" />
                    Model Selection
                  </label>
                  {modelsStatus && (
                    <span
                      className={`text-[11px] flex items-center gap-1 font-medium ${
                        modelsStatus.ok ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {modelsStatus.ok ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      {modelsStatus.message}
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <select
                    value={llmConfig.selectedModel}
                    onChange={(e) => handleLlmChange({ selectedModel: e.target.value })}
                    className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-zinc-100 transition-colors"
                  >
                    {llmConfig.availableModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    {!llmConfig.availableModels.includes(llmConfig.selectedModel) &&
                      llmConfig.selectedModel && (
                        <option value={llmConfig.selectedModel}>
                          {llmConfig.selectedModel}
                        </option>
                      )}
                  </select>

                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={isFetchingModels || !llmConfig.baseUrl.trim()}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium text-zinc-200 hover:text-white border border-zinc-700 transition-colors shrink-0"
                    title="Fetch models from endpoint"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        isFetchingModels ? "animate-spin text-fuchsia-400" : ""
                      }`}
                    />
                    <span>{isFetchingModels ? "Loading..." : "Load Models"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1.5">
                  Used by the Visual Novel Maker for character bodily identity enhancement and story scene narration.
                </p>
              </div>
            </>
          )}

          {/* Security & Local Storage Badge */}
          <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/80 p-3.5 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-zinc-400 leading-relaxed">
              <span className="text-zinc-200 font-medium">Local & Private:</span> Your endpoints, keys, and model preferences are saved only in your browser's <code className="text-zinc-300">localStorage</code>.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 border-t border-zinc-800 bg-zinc-900 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white shadow-sm transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
