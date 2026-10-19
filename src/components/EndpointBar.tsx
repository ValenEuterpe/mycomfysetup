import React, { useState } from "react";
import { Link2, CheckCircle2, XCircle, RefreshCw, ChevronDown, History } from "lucide-react";
import { ComfyConnectionTestResult } from "../lib/comfyClient";

interface EndpointBarProps {
  endpoint: string;
  onEndpointChange: (url: string) => void;
  onTestConnection: () => void;
  isTesting: boolean;
  connectionResult: ComfyConnectionTestResult | null;
  endpointHistory: string[];
}

export const EndpointBar: React.FC<EndpointBarProps> = ({
  endpoint,
  onEndpointChange,
  onTestConnection,
  isTesting,
  connectionResult,
  endpointHistory,
}) => {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
            <Link2 className="w-3.5 h-3.5 text-indigo-400" />
            ComfyUI / Worker Relay Endpoint
          </label>
          {connectionResult && (
            <div className="text-xs flex items-center gap-1.5">
              {connectionResult.ok ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {connectionResult.message}
                </span>
              ) : (
                <span className="text-rose-400 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" />
                  {connectionResult.message}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="relative flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={endpoint}
              onChange={(e) => onEndpointChange(e.target.value)}
              placeholder="https://your-comfy-relay.workers.dev/?key=yourkey"
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-3.5 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 font-mono transition-colors pr-10"
            />
            {endpointHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                title="Endpoint history"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showHistory ? "rotate-180" : ""}`} />
              </button>
            )}

            {/* History dropdown */}
            {showHistory && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-20 py-1 overflow-hidden">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1 border-b border-zinc-800">
                  <History className="w-3 h-3" />
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
                    className="w-full text-left px-3 py-2 text-xs font-mono text-zinc-300 hover:bg-zinc-800 hover:text-white truncate transition-colors flex items-center justify-between"
                  >
                    <span className="truncate">{item}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onTestConnection}
            disabled={isTesting || !endpoint.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs sm:text-sm font-medium text-zinc-200 hover:text-white border border-zinc-700/60 transition-all shrink-0 active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? "animate-spin text-indigo-400" : ""}`} />
            <span>{isTesting ? "Testing..." : "Test Connection"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
