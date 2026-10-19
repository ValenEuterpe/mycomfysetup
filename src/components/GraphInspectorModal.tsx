import React, { useState } from "react";
import { Network, X, Search, Layers } from "lucide-react";
import { ComfyWorkflowGraph } from "../types/workflow";

interface GraphInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflowGraph: ComfyWorkflowGraph;
}

export const GraphInspectorModal: React.FC<GraphInspectorModalProps> = ({
  isOpen,
  onClose,
  workflowGraph,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  if (!isOpen) return null;

  const nodeEntries = Object.entries(workflowGraph);
  const filteredNodes = nodeEntries.filter(([id, node]) => {
    const q = searchTerm.toLowerCase();
    const title = node._meta?.title?.toLowerCase() || "";
    const classType = node.class_type?.toLowerCase() || "";
    return id.includes(q) || title.includes(q) || classType.includes(q);
  });

  const activeNode = selectedNodeId
    ? workflowGraph[selectedNodeId]
    : filteredNodes[0]?.[1];
  const activeId = selectedNodeId || filteredNodes[0]?.[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Network className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                ComfyUI Graph Node Inspector
              </h3>
              <p className="text-xs text-zinc-400">
                {nodeEntries.length} Total Nodes Detected in Workflow
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

        {/* Content Split: Node List & Node Detail */}
        <div className="flex-1 flex overflow-hidden">
          {/* Node Sidebar */}
          <div className="w-72 border-r border-zinc-800 flex flex-col bg-zinc-950/40">
            <div className="p-3 border-b border-zinc-800">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter nodes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40">
              {filteredNodes.map(([id, node]) => {
                const isSelected = id === activeId;
                return (
                  <button
                    key={id}
                    onClick={() => setSelectedNodeId(id)}
                    className={`w-full text-left p-3 text-xs transition-colors ${
                      isSelected
                        ? "bg-indigo-600/15 text-indigo-300 border-l-2 border-indigo-500"
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                    }`}
                  >
                    <div className="font-semibold text-zinc-200 truncate">
                      {node._meta?.title || node.class_type}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5 flex justify-between">
                      <span>#{id}</span>
                      <span>{node.class_type}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Node JSON & Inspector */}
          <div className="flex-1 p-6 overflow-y-auto bg-zinc-950">
            {activeNode ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" />
                      {activeNode._meta?.title || activeNode.class_type}
                    </h4>
                    <p className="text-xs text-zinc-500 font-mono">
                      Node ID: #{activeId} | Class: {activeNode.class_type}
                    </p>
                  </div>
                </div>

                <div>
                  <h5 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Raw Node Definition
                  </h5>
                  <pre className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 text-xs font-mono text-zinc-200 overflow-x-auto leading-relaxed">
                    <code>{JSON.stringify(activeNode, null, 2)}</code>
                  </pre>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 text-xs text-zinc-500">
                No node selected
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
