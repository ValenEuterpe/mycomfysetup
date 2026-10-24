import React, { useState } from "react";
import {
  Sparkles,
  Play,
  RotateCcw,
  Trash2,
  Copy,
  Check,
  Plus,
  Loader2,
  AlertCircle,
  Shirt,
  Tag,
  Filter,
  CheckCircle2,
  Info,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { VNAttire, VNCharacter, VNTab } from "../../types/visualNovel";
import { enhanceAttirePrompt } from "../../lib/llmClient";
import { generateAttirePreview } from "../../lib/visualNovelEngine";
import { saveMediaToLocalCache } from "../../lib/mediaCache";

interface AttireStudioProps {
  attires: VNAttire[];
  onSaveAttire: (attire: VNAttire) => void;
  onDeleteAttire: (id: string) => void;
  characters: VNCharacter[];
  onAssignToCharacter?: (charId: string, attire: VNAttire) => void;
  endpoint: string;
  onNavigateTab?: (tab: VNTab) => void;
}

export const AttireStudio: React.FC<AttireStudioProps> = ({
  attires,
  onSaveAttire,
  onDeleteAttire,
  characters,
  onAssignToCharacter,
  endpoint,
  onNavigateTab,
}) => {
  // New Attire Form
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"female" | "male" | "unisex">("unisex");
  const [category, setCategory] = useState<VNAttire["category"]>("casual");
  const [description, setDescription] = useState("");
  const [verbatimPrompt, setVerbatimPrompt] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | undefined>(undefined);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Filter state
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedGender, setSelectedGender] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [assigningAttire, setAssigningAttire] = useState<VNAttire | null>(null);

  // Step 1: AI Prompt Enhancement for Clothing
  const handleEnhance = async () => {
    if (!description.trim()) {
      setFormError("Please enter a basic description of the clothing first.");
      return;
    }
    setFormError(null);
    setIsEnhancing(true);

    try {
      const enhanced = await enhanceAttirePrompt(description, name, {
        gender,
        category,
      });
      setVerbatimPrompt(enhanced);
    } catch (err: any) {
      setFormError(`AI clothing enhancement failed: ${err.message}. Check LLM settings.`);
    } finally {
      setIsEnhancing(false);
    }
  };

  // Step 2: Generate Mannequin Preview Image with Anima
  const handleGeneratePreview = async (targetPrompt?: string, targetName?: string) => {
    const promptToRun = targetPrompt || verbatimPrompt.trim() || description.trim();
    if (!promptToRun) {
      setFormError("Please enter or generate a clothing prompt first.");
      return;
    }
    if (!endpoint.trim()) {
      setFormError("ComfyUI relay endpoint is not configured. Please check Settings.");
      return;
    }

    setFormError(null);
    setIsGenerating(true);
    setGenerateProgress("Submitting to Anima pipeline...");

    try {
      const media = await generateAttirePreview(
        endpoint,
        {
          verbatimPrompt: promptToRun,
          name: targetName || name || "Attire",
        },
        (pct, status) => {
          setGenerateProgress(`${status} (${pct}%)`);
        }
      );

      // Cache locally if possible
      try {
        const resp = await fetch(media.url);
        const blob = await resp.blob();
        await saveMediaToLocalCache(
          media.id || `attire_${Date.now()}`,
          blob,
          media.filename || "attire_preview.png",
          "image"
        );
      } catch {
        // non-critical cache failure
      }

      setPreviewImageUrl(media.url);
      setGenerateProgress("Render complete!");
    } catch (err: any) {
      setFormError(`Mannequin generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Step 3: Save to Wardrobe Catalog
  const handleSave = () => {
    const promptToSave = verbatimPrompt.trim() || description.trim();
    if (!name.trim()) {
      setFormError("Please give your attire a name.");
      return;
    }
    if (!promptToSave) {
      setFormError("Please provide a prompt describing the attire.");
      return;
    }

    const newAttire: VNAttire = {
      id: `attire_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim(),
      gender,
      category,
      userDescription: description.trim() || undefined,
      verbatimPrompt: promptToSave,
      previewImageUrl,
      createdAt: Date.now(),
    };

    onSaveAttire(newAttire);

    // Reset Form
    setName("");
    setGender("unisex");
    setCategory("casual");
    setDescription("");
    setVerbatimPrompt("");
    setPreviewImageUrl(undefined);
    setGenerateProgress("");
    setFormError(null);
  };

  const handleCopyPrompt = (prompt: string, id: string) => {
    navigator.clipboard.writeText(prompt);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered attires
  const filteredAttires = attires.filter((a) => {
    const matchesCat = selectedCategory === "all" || a.category === selectedCategory;
    const matchesGen = selectedGender === "all" || a.gender === selectedGender || a.gender === "unisex";
    return matchesCat && matchesGen;
  });

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Attire Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/60 border border-zinc-800 p-5 rounded-2xl shadow-lg">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Shirt className="w-5 h-5 text-fuchsia-400" />
            Wardrobe & Attire Studio
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20">
              Ghost Mannequin References
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed max-w-3xl">
            Design reusable outfits rendered on clean white headless mannequins (with zero human faces). Assign them as baseline attire for characters or switch clothes across your visual novel scenes.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className="text-xs text-zinc-400 font-medium">
            Total Attires: <strong className="text-white">{attires.length}</strong>
          </span>
        </div>
      </div>

      {/* Grid: Create Attire Left / Catalog Lookbook Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Create / Generate Attire Form */}
        <div className="lg:col-span-5 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-fuchsia-400" />
              Design New Attire
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Describe garments, cut, fabric, and footwear. AI expands it for Anima display.
            </p>
          </div>

          {formError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{formError}</span>
            </div>
          )}

          {/* Attire Name */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
              Attire Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tropical Vacation Sundress, Pilot Flight Gear"
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors shadow-inner"
            />
          </div>

          {/* Gender & Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                Gender Target
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-fuchsia-500 rounded-xl px-3 py-2 text-xs text-zinc-100 transition-colors shadow-inner"
              >
                <option value="unisex">Unisex</option>
                <option value="female">♀ Female</option>
                <option value="male">♂ Male</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-fuchsia-500 rounded-xl px-3 py-2 text-xs text-zinc-100 transition-colors shadow-inner capitalize"
              >
                <option value="casual">Casual</option>
                <option value="travel">Travel</option>
                <option value="formal">Formal</option>
                <option value="adventure">Adventure</option>
                <option value="uniform">Uniform</option>
                <option value="swimwear">Swimwear</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* Basic Clothing Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Clothing Description
              </label>
              <button
                type="button"
                onClick={handleEnhance}
                disabled={isEnhancing || !description.trim()}
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-fuchsia-500/10 hover:bg-fuchsia-500/20 border border-fuchsia-500/30 text-fuchsia-300 text-xs font-semibold transition-all disabled:opacity-40"
              >
                {isEnhancing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>{isEnhancing ? "Expanding..." : "✨ AI Improve Attire"}</span>
              </button>
            </div>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. A tucked-in, long-sleeved silk button-up ivory blouse with mother-of-pearl buttons, paired with tailored high-waisted pleated beige wool trousers cinched with a slim brown leather belt..."
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-fuchsia-500 rounded-xl p-3 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors resize-none shadow-inner"
            />
            <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[10px] text-zinc-500">
              <span className="font-semibold text-zinc-400">Lock Anchors:</span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">Garment & Fit (Tuck)</span>
              <span>•</span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">Fabrics (Silk, Wool, Denim)</span>
              <span>•</span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">Hardware (Buttons, Buckles)</span>
              <span>•</span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">Footwear & Belt</span>
            </div>
          </div>

          {/* Verbatim Anima Prompt (Editable) */}
          {verbatimPrompt && (
            <div className="bg-zinc-950/70 border border-fuchsia-500/30 rounded-xl p-3 flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-fuchsia-300 uppercase tracking-wider">
                Verbatim Attire Prompt (Sent to Anima / Scenes)
              </span>
              <textarea
                rows={3}
                value={verbatimPrompt}
                onChange={(e) => setVerbatimPrompt(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-fuchsia-500 rounded-lg p-2 text-xs text-zinc-200 font-mono transition-colors resize-none"
              />
            </div>
          )}

          {/* Mannequin Image Preview Card */}
          {previewImageUrl && (
            <div className="relative w-full aspect-[3/4] max-h-72 bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 shadow-md flex items-center justify-center">
              <img
                src={previewImageUrl}
                alt={name || "Attire Preview"}
                className="w-full h-full object-contain"
              />
              <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-md text-[10px] font-bold text-white">
                Mannequin Preview
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleGeneratePreview()}
              disabled={isGenerating || (!verbatimPrompt.trim() && !description.trim())}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs sm:text-sm font-semibold text-zinc-100 hover:text-white transition-all disabled:opacity-40 shadow-sm"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin text-fuchsia-400" />
              ) : (
                <Play className="w-4 h-4 text-fuchsia-400 fill-fuchsia-400" />
              )}
              <span>
                {isGenerating
                  ? generateProgress || "Generating on Mannequin..."
                  : "Generate Preview on Mannequin (Anima)"}
              </span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim() || (!verbatimPrompt.trim() && !description.trim())}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-xs sm:text-sm font-bold text-white transition-all disabled:opacity-40 shadow-md shadow-fuchsia-600/20"
            >
              <Check className="w-4 h-4" />
              <span>Save Attire to Wardrobe</span>
            </button>
          </div>
        </div>

        {/* Right: Wardrobe Lookbook Grid */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Filters Bar */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" />
                Category:
              </span>
              {["all", "travel", "casual", "formal", "adventure", "uniform"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors capitalize ${
                    selectedCategory === cat
                      ? "bg-fuchsia-600 text-white shadow-sm"
                      : "bg-zinc-800/80 text-zinc-300 hover:text-white hover:bg-zinc-700"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              {["all", "male", "female", "unisex"].map((gen) => (
                <button
                  key={gen}
                  type="button"
                  onClick={() => setSelectedGender(gen)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors capitalize ${
                    selectedGender === gen
                      ? "bg-indigo-600 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {gen}
                </button>
              ))}
            </div>
          </div>

          {/* Attire Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredAttires.map((attire) => {
              const isCopied = copiedId === attire.id;

              return (
                <div
                  key={attire.id}
                  className="bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between transition-all group"
                >
                  {/* Top Image Preview */}
                  <div className="relative w-full aspect-[4/3] bg-zinc-950 flex items-center justify-center overflow-hidden border-b border-zinc-800">
                    {attire.previewImageUrl ? (
                      <img
                        src={attire.previewImageUrl}
                        alt={attire.name}
                        className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 p-4 text-center">
                        <Shirt className="w-8 h-8 text-zinc-700" />
                        <span className="text-[11px] text-zinc-500">No mannequin preview</span>
                        <button
                          type="button"
                          onClick={() => handleGeneratePreview(attire.verbatimPrompt, attire.name)}
                          disabled={isGenerating}
                          className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-semibold text-zinc-300 hover:text-white transition-colors"
                        >
                          Generate Preview
                        </button>
                      </div>
                    )}

                    {/* Category & Gender Badges */}
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1">
                      <span className="px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-bold text-white border border-white/10 capitalize">
                        {attire.category}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-semibold text-zinc-300 border border-white/10">
                        {attire.gender === "male"
                          ? "♂ Male"
                          : attire.gender === "female"
                          ? "♀ Female"
                          : "⚥ Unisex"}
                      </span>
                    </div>

                    {attire.isPreset && (
                      <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-fuchsia-500/20 backdrop-blur-md text-[10px] font-bold text-fuchsia-300 border border-fuchsia-500/30">
                        Built-in
                      </span>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="p-4 flex flex-col gap-2 flex-1 justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1 group-hover:text-fuchsia-300 transition-colors">
                        {attire.name}
                      </h4>
                      <p className="text-[11px] text-zinc-400 font-mono line-clamp-3 leading-relaxed bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/80">
                        {attire.verbatimPrompt}
                      </p>
                    </div>

                    {/* Actions Bar */}
                    <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => handleCopyPrompt(attire.verbatimPrompt, attire.id)}
                        className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition-colors"
                        title="Copy exact clothing prompt"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Prompt</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-center gap-1">
                        {characters.length > 0 && onAssignToCharacter && (
                          <button
                            type="button"
                            onClick={() => setAssigningAttire(attire)}
                            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 hover:text-white transition-colors"
                            title="Assign to character"
                          >
                            Assign to Char
                          </button>
                        )}

                        {!attire.isPreset && (
                          <button
                            type="button"
                            onClick={() => onDeleteAttire(attire.id)}
                            className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                            title="Delete custom attire"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredAttires.length === 0 && (
            <div className="py-12 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/40">
              No attires found matching the selected filter.
            </div>
          )}
        </div>
      </div>

      {/* Quick Assign Modal */}
      {assigningAttire && onAssignToCharacter && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 shadow-2xl flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Shirt className="w-4 h-4 text-fuchsia-400" />
                Assign "{assigningAttire.name}" to Character
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Select which character will wear this attire as their baseline starting wardrobe:
              </p>
            </div>

            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
              {characters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onAssignToCharacter(c.id, assigningAttire);
                    setAssigningAttire(null);
                  }}
                  className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-fuchsia-500/50 hover:bg-zinc-900 transition-all text-left group"
                >
                  <div className="flex items-center gap-2.5">
                    {c.avatarUrl ? (
                      <img
                        src={c.avatarUrl}
                        alt={c.name}
                        className="w-9 h-9 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center text-xs text-zinc-400 font-bold">
                        {c.name.slice(0, 1)}
                      </div>
                    )}
                    <div>
                      <h4 className="text-xs font-bold text-white group-hover:text-fuchsia-300">
                        {c.name}
                      </h4>
                      <p className="text-[10px] text-zinc-500">
                        Current: {c.baselineOutfit || "None"}
                      </p>
                    </div>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-zinc-600 group-hover:text-fuchsia-400" />
                </button>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setAssigningAttire(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline Navigation Footer */}
      {onNavigateTab && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl mt-4">
          <button
            type="button"
            onClick={() => onNavigateTab("characters")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white transition"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Step 1: Cast</span>
          </button>

          <span className="text-xs text-zinc-500 font-mono hidden sm:inline">
            Pipeline: Step 2 of 5
          </span>

          <button
            type="button"
            onClick={() => onNavigateTab("sprites")}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-xs font-bold text-white transition shadow-md shadow-fuchsia-600/20"
          >
            <span>Proceed to Step 3: Sprites & Emotions</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
