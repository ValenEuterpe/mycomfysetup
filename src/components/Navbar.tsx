import React from "react";
import { Sparkles, Code2, Network, RotateCcw, Activity } from "lucide-react";
import { ComfyConnectionTestResult } from "../lib/comfyClient";

interface NavbarProps {
  connectionStatus: ComfyConnectionTestResult | null;
  isTestingConnection: boolean;
  onOpenExport: () => void;
  onOpenGraph: () => void;
  onResetParams: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  connectionStatus,
  isTestingConnection,
  onOpenExport,
  onOpenGraph,
  onResetParams,
}) => {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-30 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-zinc-100 tracking-tight">
                ComfyUI Universal Studio
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Serverless
              </span>
            </div>
            <p className="text-xs text-zinc-400 hidden sm:block">
              Dynamic API JSON Runner on Cloudflare
            </p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Connection status pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              isTestingConnection
                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                : connectionStatus?.ok
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : connectionStatus
                ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                : "bg-zinc-800/50 text-zinc-400 border-zinc-800"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isTestingConnection
                  ? "bg-amber-400 animate-pulse"
                  : connectionStatus?.ok
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                  : connectionStatus
                  ? "bg-rose-400"
                  : "bg-zinc-500"
              }`}
            />
            <span className="hidden md:inline">
              {isTestingConnection
                ? "Pinging Relay..."
                : connectionStatus?.ok
                ? `Connected (${connectionStatus.latencyMs}ms)`
                : connectionStatus
                ? "Connection Error"
                : "Not Connected"}
            </span>
            <span className="md:hidden">
              {isTestingConnection ? "..." : connectionStatus?.ok ? "Online" : "Offline"}
            </span>
          </div>

          {/* Reset form button */}
          <button
            onClick={onResetParams}
            title="Reset parameters to defaults"
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Raw Graph Inspector */}
          <button
            onClick={onOpenGraph}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors"
          >
            <Network className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Graph Inspector</span>
          </button>

          {/* Export API & Code */}
          <button
            onClick={onOpenExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 shadow-sm shadow-indigo-500/30 transition-all active:scale-95"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Export API</span>
          </button>
        </div>
      </div>
    </header>
  );
};
