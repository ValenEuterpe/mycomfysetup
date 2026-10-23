import React, { useState } from "react";
import {
  FileText,
  Copy,
  Check,
  Download,
  Eye,
  Film,
  User,
  Sparkles,
  Layers,
  Code,
} from "lucide-react";
import { VNCharacter, VNScene } from "../../types/visualNovel";
import { buildScenePrompt } from "../../lib/visualNovelEngine";

interface StoryLedgerProps {
  storyPremise: string;
  firstSceneOutline: string;
  characters: VNCharacter[];
  scenes: VNScene[];
}

export const StoryLedger: React.FC<StoryLedgerProps> = ({
  storyPremise,
  firstSceneOutline,
  characters,
  scenes,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [activeView, setActiveView] = useState<"scenes" | "json">("scenes");

  // Build the complete ledger object
  const ledgerData = {
    exportedAt: new Date().toISOString(),
    storyPremise,
    firstSceneOutline,
    characters: characters.map((c) => ({
      name: c.name,
      gender: c.gender || "female",
      role: c.role || "Civilian Passenger",
      baselineOutfit: c.baselineOutfit || "casual traveler clothes",
      figureStyle: c.figureStyle || "Auto",
      faceShape: c.faceShape || "Auto",
      verbatimIdentityPrompt: c.verbatimIdentityPrompt,
    })),
    scenes: scenes.map((s) => ({
      sceneNumber: s.sceneNumber,
      title: s.title,
      sceneTone: s.sceneTone || "survival_dialogue",
      charactersPresent: s.charactersPresent,
      characterStates: s.characterStates || null,
      fullImagePrompt: buildScenePrompt(s, characters),
      narration: s.narration || null,
      dialogues: s.dialogues.map((d) => ({
        speaker: d.speaker,
        voiceCue: d.voiceCue || null,
        text: d.text,
      })),
      imageUrl: s.imageUrl || null,
    })),
  };

  const handleCopyPrompt = (promptText: string, idx: number) => {
    navigator.clipboard.writeText(promptText);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(ledgerData, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(ledgerData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `visual-novel-ledger-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full animate-in fade-in">
      {/* Header Bar */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-fuchsia-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              AI Story Ledger & Output Analysis
            </h2>
            <p className="text-xs text-zinc-400">
              Complete historical record of prompts, verbatim character identities, and raw LLM data
            </p>
          </div>
        </div>

        {/* View Switcher & Export Actions */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <div className="flex p-1 rounded-xl bg-zinc-950 border border-zinc-800 shrink-0">
            <button
              type="button"
              onClick={() => setActiveView("scenes")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeView === "scenes"
                  ? "bg-fuchsia-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Scenes Breakdown</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView("json")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeView === "json"
                  ? "bg-fuchsia-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Raw JSON</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopyJson}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-zinc-200 hover:text-white transition-colors"
            title="Copy full JSON"
          >
            {copiedJson ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">{copiedJson ? "Copied" : "Copy JSON"}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadJson}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-zinc-200 hover:text-white transition-colors"
            title="Download JSON Ledger file"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Story Summary Card */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-lg">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
          Story Parameters
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
            <span className="text-zinc-500 font-semibold block mb-1">STORY PREMISE</span>
            <p className="text-zinc-200 leading-relaxed">{storyPremise || "None"}</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
            <span className="text-zinc-500 font-semibold block mb-1">FIRST SCENE OUTLINE</span>
            <p className="text-zinc-200 leading-relaxed">{firstSceneOutline || "None"}</p>
          </div>
        </div>

        {/* Character Identities in this Run */}
        {characters.length > 0 && (
          <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/60">
            <span className="text-zinc-500 font-semibold text-xs uppercase tracking-wider">
              Character Identities Used
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {characters.map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-xl bg-zinc-950/50 border border-zinc-800 text-xs flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-fuchsia-400" />
                      {c.name}
                      <span className="text-[10px] font-normal text-zinc-400">({c.role || "Civilian Passenger"})</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                      {c.gender === "male" ? "♂ Male" : "♀ Female"}
                    </span>
                  </div>
                  {c.baselineOutfit && (
                    <div className="text-[11px] text-fuchsia-300/90 font-medium">
                      <span className="text-zinc-500 font-normal">Baseline Attire: </span>
                      {c.baselineOutfit}
                    </div>
                  )}
                  <p className="text-[11px] text-zinc-400 font-mono line-clamp-2 leading-relaxed">
                    {c.verbatimIdentityPrompt}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Content: Scenes Breakdown or Raw JSON */}
      {activeView === "scenes" ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Film className="w-4 h-4 text-fuchsia-400" />
              Generated Scenes Ledger ({scenes.length})
            </h3>
            <span className="text-xs text-zinc-500">
              Review full diffusion prompts sent to Anima
            </span>
          </div>

          {scenes.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/40">
              No scenes generated yet. Plan and generate a visual novel story first.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {scenes.map((scene, idx) => {
                const fullPrompt = buildScenePrompt(scene, characters);
                const isCopied = copiedIndex === idx;

                return (
                  <div
                    key={scene.id}
                    className="bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl flex flex-col md:flex-row gap-4 p-4 sm:p-5"
                  >
                    {/* Scene Image Preview */}
                    <div className="w-full md:w-56 aspect-[16/10] md:aspect-auto rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center relative">
                      {scene.imageUrl ? (
                        <img
                          src={scene.imageUrl}
                          alt={scene.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[11px] text-zinc-600">Pending render...</span>
                      )}
                      <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-md text-[10px] font-bold text-white">
                        Scene {scene.sceneNumber}
                      </span>
                    </div>

                    {/* Scene Details */}
                    <div className="flex-1 min-w-0 flex flex-col gap-3 justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-white">
                              Scene {scene.sceneNumber}: {scene.title}
                            </h4>
                            {scene.sceneTone && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                {scene.sceneTone.replace("_", " ")}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded-md">
                            Cast: {scene.charactersPresent.join(", ") || "None"}
                          </span>
                        </div>

                        {/* Active Character States (Wardrobe & Expressions) */}
                        {scene.characterStates && scene.characterStates.length > 0 && (
                          <div className="bg-zinc-950/60 rounded-xl p-2.5 mb-2 border border-zinc-800/60 flex flex-col gap-1 text-[11px]">
                            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                              Narrative State (Wardrobe Evolution & Expressions):
                            </span>
                            {scene.characterStates.map((cs) => (
                              <div key={cs.name} className="flex flex-wrap items-center gap-1.5 text-zinc-300">
                                <span className="font-bold text-fuchsia-300">{cs.name}:</span>
                                <span className="text-zinc-400">outfit:</span>
                                <span className="text-zinc-200 font-medium">{cs.outfit}</span>
                                <span className="text-zinc-600">•</span>
                                <span className="text-zinc-400 italic">[{cs.expressionTags || cs.emotion}]</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Narration */}
                        {scene.narration && (
                          <p className="text-xs text-zinc-300 italic mb-2 leading-relaxed bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/60">
                            "{scene.narration}"
                          </p>
                        )}

                        {/* Dialogues */}
                        {scene.dialogues.length > 0 && (
                          <div className="flex flex-col gap-1 mb-2.5">
                            {scene.dialogues.map((d) => (
                              <div key={d.id} className="text-xs leading-relaxed">
                                <span className="font-bold text-fuchsia-400 mr-1.5">
                                  {d.speaker}:
                                </span>
                                {d.voiceCue && (
                                  <span className="text-[10px] text-zinc-400 italic mr-1">
                                    [{d.voiceCue}]
                                  </span>
                                )}
                                <span className="text-zinc-200">"{d.text}"</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Full Prompt Box */}
                      <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                            Full ComfyUI Anima Prompt Sent:
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyPrompt(fullPrompt, idx)}
                            className="flex items-center gap-1 text-[11px] font-medium text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy Prompt</span>
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-[11px] text-zinc-300 font-mono line-clamp-3 leading-relaxed break-all">
                          {fullPrompt}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Raw JSON Viewer */
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-3 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Code className="w-4 h-4 text-fuchsia-400" />
              Complete JSON Payload
            </span>
            <button
              type="button"
              onClick={handleCopyJson}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 hover:text-white transition-colors"
            >
              {copiedJson ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 overflow-x-auto text-xs text-zinc-300 font-mono max-h-[550px] leading-relaxed">
            {JSON.stringify(ledgerData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
