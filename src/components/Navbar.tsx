import React, { useState } from "react";
import {
  Sparkles,
  Code2,
  Network,
  RotateCcw,
  Settings,
  Menu,
  X,
  Link2,
  ImagePlus,
  Wand2,
  Film,
} from "lucide-react";
import { ComfyConnectionTestResult } from "../lib/comfyClient";

export type StudioPage = "generate" | "edit" | "novel";

interface NavbarProps {
  connectionStatus: ComfyConnectionTestResult | null;
  isTestingConnection: boolean;
  onOpenSettings: () => void;
  onOpenExport: () => void;
  onOpenGraph: () => void;
  onResetParams: () => void;
  activePage: StudioPage;
  onNavigate: (page: StudioPage) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  connectionStatus,
  isTestingConnection,
  onOpenSettings,
  onOpenExport,
  onOpenGraph,
  onResetParams,
  activePage,
  onNavigate,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleMobileAction = (action: () => void) => {
    action();
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-40 px-3 sm:px-4 py-2.5 sm:py-3 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-bold text-sm sm:text-base text-zinc-100 tracking-tight">
                ComfyUI <span className="hidden xs:inline">Universal</span> Studio
              </span>
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Serverless
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden lg:block">
              Dynamic API JSON Runner on Cloudflare
            </p>
          </div>
        </div>

        {/* Right Desktop Actions */}
        <div className="hidden md:flex items-center gap-2 lg:gap-2.5">
          {/* Page tabs */}
          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <button
              type="button"
              onClick={() => onNavigate("generate")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activePage === "generate"
                  ? "bg-indigo-600/90 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate
            </button>
            <button
              type="button"
              onClick={() => onNavigate("edit")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activePage === "edit"
                  ? "bg-fuchsia-600/90 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              Identity Edit
            </button>
            <button
              type="button"
              onClick={() => onNavigate("novel")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activePage === "novel"
                  ? "bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              Visual Novel
            </button>
          </div>

          {/* Connection status pill (Clickable to open settings) */}
          <button
            type="button"
            onClick={onOpenSettings}
            title="Click to configure relay endpoint"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors hover:brightness-110 cursor-pointer ${
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
              className={`w-2 h-2 rounded-full shrink-0 ${
                isTestingConnection
                  ? "bg-amber-400 animate-pulse"
                  : connectionStatus?.ok
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                  : connectionStatus
                  ? "bg-rose-400"
                  : "bg-zinc-500"
              }`}
            />
            <span className="truncate max-w-[140px] lg:max-w-none">
              {isTestingConnection
                ? "Pinging..."
                : connectionStatus?.ok
                ? `Connected (${connectionStatus.latencyMs}ms)`
                : connectionStatus
                ? "Offline"
                : "Configure Relay"}
            </span>
          </button>

          {/* Reset parameters button */}
          <button
            type="button"
            onClick={onResetParams}
            title="Reset parameters to defaults"
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Raw Graph Inspector */}
          <button
            type="button"
            onClick={onOpenGraph}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors"
          >
            <Network className="w-3.5 h-3.5 text-indigo-400" />
            <span>Graph Inspector</span>
          </button>

          {/* Export API & Code */}
          <button
            type="button"
            onClick={onOpenExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors"
          >
            <Code2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Export API</span>
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 shadow-sm shadow-indigo-500/25 transition-all active:scale-95"
            title="Relay & Connection Settings"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>

        {/* Right Mobile Actions */}
        <div className="flex md:hidden items-center gap-1.5">
          {/* Page tabs (compact) */}
          <div className="flex items-center p-0.5 rounded-lg bg-zinc-900 border border-zinc-800">
            <button
              type="button"
              onClick={() => onNavigate("generate")}
              className={`px-2 py-1 rounded-md text-[10px] font-semibold ${
                activePage === "generate" ? "bg-indigo-600 text-white" : "text-zinc-400"
              }`}
              title="Generate page"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate("edit")}
              className={`px-2 py-1 rounded-md text-[10px] font-semibold ${
                activePage === "edit" ? "bg-fuchsia-600 text-white" : "text-zinc-400"
              }`}
              title="Identity Edit page"
            >
              <Wand2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Quick status dot button */}
          <button
            type="button"
            onClick={onOpenSettings}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border ${
              connectionStatus?.ok
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : connectionStatus
                ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                : "bg-zinc-800/50 text-zinc-400 border-zinc-800"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connectionStatus?.ok
                  ? "bg-emerald-400"
                  : connectionStatus
                  ? "bg-rose-400"
                  : "bg-zinc-500"
              }`}
            />
            <span>{connectionStatus?.ok ? "Online" : "Offline"}</span>
          </button>

          {/* Mobile Settings Icon button */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800"
            title="Settings"
          >
            <Settings className="w-4 h-4 text-indigo-400" />
          </button>

          {/* Mobile Hamburger Toggle */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1.5 rounded-lg text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800 transition-colors"
            aria-label="Toggle Navigation Menu"
          >
            {isMobileMenuOpen ? (
              <X className="w-4 h-4 text-zinc-200" />
            ) : (
              <Menu className="w-4 h-4 text-zinc-200" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Collapsible Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden mt-2 pt-2 border-t border-zinc-800/80 flex flex-col gap-1.5 animate-in slide-in-from-top-2 duration-150">
          {/* Page navigation */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => handleMobileAction(() => onNavigate("generate"))}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium border transition-colors ${
                activePage === "generate"
                  ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40"
                  : "text-zinc-300 bg-zinc-900/80 border-zinc-800/60"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Generate
            </button>
            <button
              type="button"
              onClick={() => handleMobileAction(() => onNavigate("edit"))}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium border transition-colors ${
                activePage === "edit"
                  ? "bg-fuchsia-600/20 text-fuchsia-300 border-fuchsia-500/40"
                  : "text-zinc-300 bg-zinc-900/80 border-zinc-800/60"
              }`}
            >
              <Wand2 className="w-4 h-4" />
              Identity Edit
            </button>
            <button
              type="button"
              onClick={() => handleMobileAction(() => onNavigate("novel"))}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium border transition-colors ${
                activePage === "novel"
                  ? "bg-fuchsia-600/20 text-fuchsia-300 border-fuchsia-500/40"
                  : "text-zinc-300 bg-zinc-900/80 border-zinc-800/60"
              }`}
            >
              <Film className="w-4 h-4" />
              Visual Novel
            </button>
          </div>

          {/* Settings in mobile menu */}
          <button
            type="button"
            onClick={() => handleMobileAction(onOpenSettings)}
            className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-xs font-medium text-zinc-200 hover:text-white bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800/60 transition-colors text-left"
          >
            <span className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-indigo-400" />
              <span>Endpoint & Relay Settings</span>
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                connectionStatus?.ok
                  ? "text-emerald-400 bg-emerald-500/10"
                  : "text-rose-400 bg-rose-500/10"
              }`}
            >
              {connectionStatus?.ok ? "Connected" : "Offline"}
            </span>
          </button>

          {/* Export API */}
          <button
            type="button"
            onClick={() => handleMobileAction(onOpenExport)}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-xs font-medium text-zinc-200 hover:text-white bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800/60 transition-colors text-left"
          >
            <Code2 className="w-4 h-4 text-indigo-400" />
            <span>Export Dynamic API & Code</span>
          </button>

          {/* Graph Inspector */}
          <button
            type="button"
            onClick={() => handleMobileAction(onOpenGraph)}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-xs font-medium text-zinc-200 hover:text-white bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800/60 transition-colors text-left"
          >
            <Network className="w-4 h-4 text-indigo-400" />
            <span>Graph Node Inspector</span>
          </button>

          {/* Reset Parameters */}
          <button
            type="button"
            onClick={() => handleMobileAction(onResetParams)}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-rose-400 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800/60 transition-colors text-left"
          >
            <RotateCcw className="w-4 h-4 text-zinc-400" />
            <span>Reset Inputs to Default</span>
          </button>
        </div>
      )}
    </header>
  );
};
