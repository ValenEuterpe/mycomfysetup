import React, { useState } from "react";
import {
  Code2,
  Copy,
  Check,
  Download,
  Terminal,
  FileCode,
  Braces,
  BookOpen,
  X,
} from "lucide-react";
import { ComfyWorkflowGraph, ExtractedParameter } from "../types/workflow";
import {
  generateCurlCommand,
  generateTypeScriptCode,
  generatePythonCode,
  generateJsonSchema,
  generateOpenApiSpec,
} from "../lib/codeGenerators";
import { injectWorkflowParameters } from "../lib/workflowInjector";

interface CodeExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  endpoint: string;
  workflowGraph: ComfyWorkflowGraph;
  parameters: ExtractedParameter[];
}

type TabType = "curl" | "typescript" | "python" | "schema" | "openapi" | "json";

export const CodeExportModal: React.FC<CodeExportModalProps> = ({
  isOpen,
  onClose,
  endpoint,
  workflowGraph,
  parameters,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("curl");
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  let codeContent = "";
  let fileExtension = "txt";

  switch (activeTab) {
    case "curl":
      codeContent = generateCurlCommand(endpoint, workflowGraph, parameters);
      fileExtension = "sh";
      break;
    case "typescript":
      codeContent = generateTypeScriptCode(endpoint, workflowGraph, parameters);
      fileExtension = "ts";
      break;
    case "python":
      codeContent = generatePythonCode(endpoint, workflowGraph, parameters);
      fileExtension = "py";
      break;
    case "schema":
      codeContent = JSON.stringify(generateJsonSchema(parameters), null, 2);
      fileExtension = "json";
      break;
    case "openapi":
      codeContent = JSON.stringify(
        generateOpenApiSpec(endpoint, parameters),
        null,
        2
      );
      fileExtension = "json";
      break;
    case "json":
      codeContent = JSON.stringify(
        injectWorkflowParameters(workflowGraph, parameters),
        null,
        2
      );
      fileExtension = "json";
      break;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([codeContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comfy-export.${fileExtension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Code2 className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Export Dynamic API & Code
              </h3>
              <p className="text-xs text-zinc-400">
                Generated dynamically from current workflow inputs and relay endpoint
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

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-zinc-800 bg-zinc-950/40 overflow-x-auto">
          {[
            { id: "curl", label: "cURL", icon: Terminal },
            { id: "typescript", label: "TypeScript", icon: FileCode },
            { id: "python", label: "Python", icon: FileCode },
            { id: "schema", label: "JSON Schema", icon: Braces },
            { id: "openapi", label: "OpenAPI 3.0", icon: BookOpen },
            { id: "json", label: "Injected JSON", icon: Braces },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
                  isActive
                    ? "border-indigo-500 text-white bg-zinc-900"
                    : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Code Content Area */}
        <div className="relative flex-1 p-6 overflow-hidden flex flex-col bg-zinc-950">
          <div className="absolute top-4 right-8 flex items-center gap-2 z-10">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 hover:text-white border border-zinc-700/60 shadow-sm transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 hover:text-white border border-zinc-700/60 shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
          </div>

          <pre className="flex-1 overflow-auto text-xs font-mono text-zinc-300 bg-zinc-950 p-4 rounded-xl border border-zinc-900 select-all leading-relaxed">
            <code>{codeContent}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
