import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  UserPlus,
  Play,
  RotateCcw,
  Trash2,
  Check,
  ChevronRight,
  ChevronLeft,
  Volume2,
  Film,
  BookOpen,
  Layers,
  AlertCircle,
  Loader2,
  Settings as SettingsIcon,
  Plus,
  Info,
  Cloud,
  FileText,
  Shirt,
} from "lucide-react";
import { VNCharacter, VNScene, VNStory, VNTab, VNAttire } from "../types/visualNovel";
import { StoryLedger } from "../components/novel/StoryLedger";
import { AttireStudio } from "../components/novel/AttireStudio";
import {
  loadVNCharacters,
  saveVNCharacter,
  deleteVNCharacter,
  fetchCharactersFromKV,
  loadVNStories,
  saveVNStory,
  loadVNAttires,
  saveVNAttire,
  deleteVNAttire,
  fetchAttiresFromKV,
} from "../lib/storage";
import {
  enhanceCharacterPrompt,
  enhanceCharacterProfile,
  enhanceAttirePrompt,
  planVisualNovelScenes,
  loadLlmConfig,
} from "../lib/llmClient";
import {
  generateCharacterPortrait,
  generateAttirePreview,
  executeAnimaGeneration,
  buildScenePrompt,
} from "../lib/visualNovelEngine";
import { saveMediaToLocalCache } from "../lib/mediaCache";

interface VisualNovelPageProps {
  endpoint: string;
  onOpenSettings: () => void;
  activeTab?: VNTab;
  onTabChange?: (tab: VNTab) => void;
  onCountsChange?: (characterCount: number, sceneCount: number, attireCount?: number) => void;
}

export const VisualNovelPage: React.FC<VisualNovelPageProps> = ({
  endpoint,
  onOpenSettings,
  activeTab: controlledTab,
  onTabChange,
  onCountsChange,
}) => {
  const [internalTab, setInternalTab] = useState<VNTab>("characters");
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: VNTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  // Character State
  const [characters, setCharacters] = useState<VNCharacter[]>(loadVNCharacters);
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>(() => {
    const chars = loadVNCharacters();
    return chars.slice(0, 2).map((c) => c.id);
  });

  // New Character Creation Form
  const [charName, setCharName] = useState("");
  const [charGender, setCharGender] = useState<"female" | "male">("female");
  const [charRole, setCharRole] = useState("Civilian Passenger");
  const [charBaselineOutfit, setCharBaselineOutfit] = useState("");
  const [charBaselineAttireId, setCharBaselineAttireId] = useState<string | undefined>(undefined);
  const [isWardrobeModalOpen, setIsWardrobeModalOpen] = useState(false);
  const [charPrompt, setCharPrompt] = useState("");
  const [figureStyle, setFigureStyle] = useState("Auto");
  const [faceShape, setFaceShape] = useState("Auto");
  const [enhancedPrompt, setEnhancedPrompt] = useState("");
  const [charAvatarUrl, setCharAvatarUrl] = useState<string | undefined>(undefined);
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState(false);
  const [portraitStatus, setPortraitStatus] = useState("");
  const [charFormError, setCharFormError] = useState<string | null>(null);
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(false);

  // Attire Studio State
  const [attires, setAttires] = useState<VNAttire[]>(loadVNAttires);

  // Story & Generation State
  const [storyPremise, setStoryPremise] = useState(
    "A man and a woman survive a plane crash and are trapped on a deserted, mysterious tropical island"
  );
  const [firstSceneOutline, setFirstSceneOutline] = useState(
    "A commercial airliner experiences severe engine failure during a lightning storm and violently plunges downward toward the ocean"
  );
  const [sceneCount, setSceneCount] = useState(4);
  const [scenes, setScenes] = useState<VNScene[]>([]);
  const [isPlanningStory, setIsPlanningStory] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [currentGeneratingSceneId, setCurrentGeneratingSceneId] = useState<string | null>(null);

  // Reader State
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [autoPlayTimer, setAutoPlayTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  // Continue Story prompt state
  const [continuePrompt, setContinuePrompt] = useState("");
  const [isContinuing, setIsContinuing] = useState(false);

  // Refresh characters & attires from storage & sync with Cloudflare KV memory on mount
  useEffect(() => {
    // 1. Initial load from browser local storage
    const chars = loadVNCharacters();
    setCharacters(chars);
    if (chars.length > 0 && selectedCharIds.length === 0) {
      setSelectedCharIds(chars.slice(0, 2).map((c) => c.id));
    }

    // 2. Fetch and merge from Cloudflare KV memory
    fetchCharactersFromKV().then((kvChars) => {
      if (kvChars && kvChars.length > 0) {
        setCharacters(kvChars);
        setIsCloudSynced(true);
      }
    });

    // 3. Fetch attires from Cloudflare KV memory
    fetchAttiresFromKV().then((kvAttires) => {
      if (kvAttires && kvAttires.length > 0) {
        setAttires(kvAttires);
      }
    });
  }, []);

  // Keep parent counts updated for top navigation badges
  useEffect(() => {
    onCountsChange?.(characters.length, scenes.length, attires.length);
  }, [characters.length, scenes.length, attires.length, onCountsChange]);

  // Attire Actions
  const handleSaveAttire = (attire: VNAttire) => {
    saveVNAttire(attire);
    setAttires(loadVNAttires());
  };

  const handleDeleteAttire = (id: string) => {
    deleteVNAttire(id);
    setAttires(loadVNAttires());
  };

  const handleAssignAttireToCharacter = (charId: string, attire: VNAttire) => {
    const char = characters.find((c) => c.id === charId);
    if (!char) return;
    const updatedChar: VNCharacter = {
      ...char,
      baselineOutfit: attire.verbatimPrompt,
      baselineAttireId: attire.id,
    };
    saveVNCharacter(updatedChar);
    setCharacters(loadVNCharacters());
  };

  // Character selection toggle (Max 3 characters)
  const toggleCharSelection = (id: string) => {
    setSelectedCharIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((cId) => cId !== id);
      }
      if (prev.length >= 3) {
        alert("Maximum of 3 characters allowed per visual novel story!");
        return prev;
      }
      return [...prev, id];
    });
  };

  // Step 1: AI Prompt Enhancement (Focusing on bodily and facial proportions)
  const handleEnhancePrompt = async () => {
    if (!charPrompt.trim()) {
      setCharFormError("Please enter a character description first.");
      return;
    }
    setCharFormError(null);
    setIsEnhancingPrompt(true);

    try {
      const profile = await enhanceCharacterProfile(charPrompt, charName, {
        gender: charGender,
        figureStyle: figureStyle !== "Auto" ? figureStyle : undefined,
        faceShape: faceShape !== "Auto" ? faceShape : undefined,
        role: charRole.trim() || undefined,
        baselineOutfit: charBaselineOutfit.trim() || undefined,
      });
      setEnhancedPrompt(profile.verbatimIdentityPrompt);
      if (!charBaselineOutfit.trim()) {
        setCharBaselineOutfit(profile.baselineOutfit);
      }
      if (!charRole.trim() || charRole === "Civilian Passenger") {
        setCharRole(profile.role);
      }
    } catch (err: any) {
      setCharFormError(
        `AI prompt enhancement failed: ${err.message}. Make sure your LLM endpoint is configured in Settings.`
      );
    } finally {
      setIsEnhancingPrompt(false);
    }
  };

  // Step 1.5: Generate Character Portrait with Anima
  const handleGeneratePortrait = async () => {
    const promptToUse = enhancedPrompt.trim() || charPrompt.trim();
    if (!promptToUse) {
      setCharFormError("Please enter or enhance a character prompt first.");
      return;
    }
    if (!endpoint.trim()) {
      setCharFormError("ComfyUI relay endpoint is not configured. Please check Settings.");
      return;
    }

    setCharFormError(null);
    setIsGeneratingPortrait(true);
    setPortraitStatus("Initiating Anima generation...");

    try {
      const media = await generateCharacterPortrait(
        endpoint,
        {
          name: charName || "Character",
          verbatimIdentityPrompt: promptToUse,
        },
        (pct, status) => {
          setPortraitStatus(`${status} (${pct}%)`);
        }
      );

      setCharAvatarUrl(media.url);
      setPortraitStatus("Portrait generated successfully!");
    } catch (err: any) {
      setCharFormError(`Portrait generation failed: ${err.message}`);
    } finally {
      setIsGeneratingPortrait(false);
    }
  };

  // Save Character
  const handleSaveCharacter = () => {
    const finalPrompt = enhancedPrompt.trim() || charPrompt.trim();
    if (!charName.trim()) {
      setCharFormError("Please give your character a name.");
      return;
    }
    if (!finalPrompt) {
      setCharFormError("Please provide a prompt describing the character's appearance.");
      return;
    }

    const newChar: VNCharacter = {
      id: `char_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: charName.trim(),
      gender: charGender,
      role: charRole.trim() || "Civilian Passenger",
      baselineOutfit: charBaselineOutfit.trim() || undefined,
      baselineAttireId: charBaselineAttireId,
      userPrompt: charPrompt.trim(),
      figureStyle: figureStyle !== "Auto" ? figureStyle : undefined,
      faceShape: faceShape !== "Auto" ? faceShape : undefined,
      verbatimIdentityPrompt: finalPrompt,
      avatarUrl: charAvatarUrl,
      createdAt: Date.now(),
    };

    saveVNCharacter(newChar);
    const updated = loadVNCharacters();
    setCharacters(updated);
    setIsCloudSynced(true);

    // Auto-select if under 3
    if (selectedCharIds.length < 3) {
      setSelectedCharIds((prev) => [...prev, newChar.id]);
    }

    // Reset Form
    setCharName("");
    setCharGender("female");
    setCharRole("Civilian Passenger");
    setCharBaselineOutfit("");
    setCharBaselineAttireId(undefined);
    setCharPrompt("");
    setFigureStyle("Auto");
    setFaceShape("Auto");
    setEnhancedPrompt("");
    setCharAvatarUrl(undefined);
    setPortraitStatus("");
    setCharFormError(null);
  };

  // Delete Character
  const handleDeleteCharacter = (id: string) => {
    deleteVNCharacter(id);
    setCharacters(loadVNCharacters());
    setSelectedCharIds((prev) => prev.filter((cId) => cId !== id));
  };

  // Generate an individual scene's image using Anima
  const generateSceneImageRun = async (sceneToRun: VNScene, allChars: VNCharacter[]) => {
    if (!endpoint.trim()) {
      throw new Error("ComfyUI relay endpoint is not configured.");
    }

    setCurrentGeneratingSceneId(sceneToRun.id);
    setScenes((prev) =>
      prev.map((s) =>
        s.id === sceneToRun.id
          ? { ...s, isGenerating: true, error: undefined, progressPercent: 10, statusText: "Queuing Anima..." }
          : s
      )
    );

    try {
      const composedPrompt = buildScenePrompt(sceneToRun, allChars);

      const media = await executeAnimaGeneration(endpoint, {
        positivePrompt: composedPrompt,
        width: 1216,
        height: 832,
        onProgress: (pct, text) => {
          setScenes((prev) =>
            prev.map((s) =>
              s.id === sceneToRun.id
                ? { ...s, progressPercent: pct, statusText: text }
                : s
            )
          );
        },
      });

      // Update scene with generated image URL
      setScenes((prev) =>
        prev.map((s) =>
          s.id === sceneToRun.id
            ? {
                ...s,
                imageUrl: media.url,
                mediaId: media.id,
                isGenerating: false,
                progressPercent: 100,
                statusText: "Ready",
              }
            : s
        )
      );
    } catch (err: any) {
      setScenes((prev) =>
        prev.map((s) =>
          s.id === sceneToRun.id
            ? {
                ...s,
                isGenerating: false,
                error: err.message || "Failed to generate scene image.",
              }
            : s
        )
      );
      throw err;
    } finally {
      setCurrentGeneratingSceneId(null);
    }
  };

  // Step 3, 4, 5: Plan Story & Generate Scenes One-by-One
  const handlePlanAndGenerateStory = async () => {
    const activeChars = characters.filter((c) => selectedCharIds.includes(c.id));
    if (activeChars.length === 0) {
      setStoryError("Please select at least 1 character from your roster.");
      setActiveTab("characters");
      return;
    }
    if (!storyPremise.trim()) {
      setStoryError("Please write where you expect the story to go.");
      return;
    }
    if (!firstSceneOutline.trim()) {
      setStoryError("Please write how you expect the first scene to go.");
      return;
    }
    if (!endpoint.trim()) {
      setStoryError("ComfyUI relay endpoint is not configured. Please open Settings.");
      return;
    }

    setStoryError(null);
    setIsPlanningStory(true);

    try {
      // 1. LLM Plans the sequence of scenes
      const plannedScenes = await planVisualNovelScenes(
        activeChars,
        storyPremise,
        firstSceneOutline,
        sceneCount
      );

      setScenes(plannedScenes);
      setIsPlanningStory(false);

      // 2. Generate images one by one with Anima
      for (const scene of plannedScenes) {
        try {
          await generateSceneImageRun(scene, activeChars);
        } catch (sceneErr) {
          console.error(`Error generating scene ${scene.sceneNumber}:`, sceneErr);
          // Continue to next scene even if one fails
        }
      }

      // Switch to Reader when done
      setActiveTab("reader");
      setCurrentSceneIndex(0);
      setCurrentDialogueIndex(0);
    } catch (err: any) {
      setStoryError(`Story generation failed: ${err.message}`);
      setIsPlanningStory(false);
    }
  };

  // Continue Story with Next Scene
  const handleContinueStory = async () => {
    if (!continuePrompt.trim()) return;
    const activeChars = characters.filter((c) => selectedCharIds.includes(c.id));
    setIsContinuing(true);

    try {
      const nextSceneNum = scenes.length + 1;
      const plannedNext = await planVisualNovelScenes(
        activeChars,
        `Overall Premise: ${storyPremise}`,
        `Next Scene Beat: ${continuePrompt}`,
        1,
        scenes // Narrative Engine history: preserves clothing states, setting, and dialogue dynamics
      );

      if (plannedNext.length > 0) {
        const newScene = {
          ...plannedNext[0],
          sceneNumber: nextSceneNum,
        };
        const updatedScenes = [...scenes, newScene];
        setScenes(updatedScenes);
        setContinuePrompt("");

        // Generate image for new scene
        await generateSceneImageRun(newScene, activeChars);
        setCurrentSceneIndex(updatedScenes.length - 1);
        setCurrentDialogueIndex(0);
      }
    } catch (err: any) {
      alert(`Failed to add next scene: ${err.message}`);
    } finally {
      setIsContinuing(false);
    }
  };

  // Reader advance logic
  const handleNextDialogue = () => {
    const currentScene = scenes[currentSceneIndex];
    if (!currentScene) return;

    if (currentDialogueIndex < (currentScene.dialogues?.length || 1) - 1) {
      setCurrentDialogueIndex((prev) => prev + 1);
    } else if (currentSceneIndex < scenes.length - 1) {
      setCurrentSceneIndex((prev) => prev + 1);
      setCurrentDialogueIndex(0);
    }
  };

  const handlePrevDialogue = () => {
    if (currentDialogueIndex > 0) {
      setCurrentDialogueIndex((prev) => prev - 1);
    } else if (currentSceneIndex > 0) {
      const prevScene = scenes[currentSceneIndex - 1];
      setCurrentSceneIndex((prev) => prev - 1);
      setCurrentDialogueIndex(Math.max(0, (prevScene.dialogues?.length || 1) - 1));
    }
  };

  // Keyboard navigation for Reader Mode
  useEffect(() => {
    if (activeTab !== "reader") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        handleNextDialogue();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevDialogue();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, currentSceneIndex, currentDialogueIndex, scenes]);

  // Autoplay effect
  useEffect(() => {
    if (!isAutoPlay) {
      if (autoPlayTimer) clearInterval(autoPlayTimer);
      return;
    }

    const timer = setInterval(() => {
      handleNextDialogue();
    }, 4500);

    setAutoPlayTimer(timer);
    return () => clearInterval(timer);
  }, [isAutoPlay, currentSceneIndex, currentDialogueIndex, scenes]);

  const activeCharacters = characters.filter((c) => selectedCharIds.includes(c.id));
  const currentScene = scenes[currentSceneIndex];
  const currentDialogue = currentScene?.dialogues?.[currentDialogueIndex];
  const speakerChar = characters.find(
    (c) => c.name.toLowerCase() === currentDialogue?.speaker?.toLowerCase()
  );

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-100 min-h-screen">
      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 flex flex-col gap-6">
        {/* ========================================================================= */}
        {/* TAB 1: CHARACTERS (Step 1 & 2) */}
        {/* ========================================================================= */}
        {activeTab === "characters" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Create / Enhance Character Form */}
            <div className="lg:col-span-7 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 sm:p-6 flex flex-col gap-5 shadow-xl">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-fuchsia-400" />
                    Step 1: Create Your Character
                  </h2>
                  <span className="text-[11px] font-medium text-fuchsia-400/90 bg-fuchsia-500/10 px-2 py-0.5 rounded-md border border-fuchsia-500/20">
                    Bodily Consistency Focus
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Describe your character. The AI expands their physical identity (bodily proportions, face, hair, and eye color) while minimizing clothing. Because Anima does not do img2img, this exact verbatim prompt will be repeated across every story image to keep their appearance consistent.
                </p>
              </div>

              {charFormError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{charFormError}</span>
                </div>
              )}

              {/* Character Name & Gender */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-8">
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                    Character Name
                  </label>
                  <input
                    type="text"
                    value={charName}
                    onChange={(e) => setCharName(e.target.value)}
                    placeholder="e.g. Elena, Captain Mark, Aoi"
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors shadow-inner"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                    Gender Anchor
                  </label>
                  <div className="flex p-1 rounded-xl bg-zinc-950 border border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setCharGender("female")}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        charGender === "female"
                          ? "bg-fuchsia-600 text-white shadow-sm"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      ♀ Female
                    </button>
                    <button
                      type="button"
                      onClick={() => setCharGender("male")}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        charGender === "male"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      ♂ Male
                    </button>
                  </div>
                </div>
              </div>

              {/* Role & Baseline Attire */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-5">
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                    Role / Archetype
                  </label>
                  <input
                    type="text"
                    value={charRole}
                    onChange={(e) => setCharRole(e.target.value)}
                    placeholder="e.g. Civilian Passenger, Teacher, Doctor"
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-fuchsia-500 rounded-xl px-4 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors shadow-inner"
                  />
                </div>
                <div className="sm:col-span-7">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                      Baseline Starting Attire
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsWardrobeModalOpen(true)}
                      className="text-[10px] text-fuchsia-400 hover:text-fuchsia-300 font-semibold flex items-center gap-1 underline underline-offset-2"
                    >
                      <Shirt className="w-3 h-3" />
                      Browse Wardrobe ({attires.length})
                    </button>
                  </div>
                  <input
                    type="text"
                    value={charBaselineOutfit}
                    onChange={(e) => {
                      setCharBaselineOutfit(e.target.value);
                      setCharBaselineAttireId(undefined);
                    }}
                    placeholder="e.g. casual grey t-shirt, dark denim jeans, white sneakers"
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-fuchsia-500 rounded-xl px-4 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors shadow-inner"
                  />
                </div>
              </div>

              {/* Quick Outfit Presets */}
              <div className="flex flex-wrap items-center gap-1.5 -mt-2">
                <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mr-1">
                  Presets:
                </span>
                {[
                  {
                    label: "Civilian Casual",
                    outfit:
                      charGender === "male"
                        ? "casual grey crewneck t-shirt, dark denim jeans, white sneakers"
                        : "casual white linen shirt, dark blue jeans, white sneakers",
                  },
                  {
                    label: "Summer Vacation",
                    outfit:
                      charGender === "male"
                        ? "short-sleeve floral shirt, khaki shorts, boat shoes"
                        : "light floral sundress, sunhat, leather sandals",
                  },
                  {
                    label: "Office Casual",
                    outfit:
                      charGender === "male"
                        ? "light blue collared shirt, dark grey slacks, leather shoes"
                        : "silk button-up blouse, tailored trousers, flats",
                  },
                  {
                    label: "Outdoor Adventure",
                    outfit: "windbreaker jacket, rugged cargo pants, hiking boots",
                  },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setCharBaselineOutfit(preset.outfit)}
                    className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* User Character Description */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Basic Character Description
                  </label>
                  <button
                    type="button"
                    onClick={handleEnhancePrompt}
                    disabled={isEnhancingPrompt || !charPrompt.trim()}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-fuchsia-500/10 hover:bg-fuchsia-500/20 border border-fuchsia-500/30 text-fuchsia-300 hover:text-fuchsia-200 text-xs font-semibold transition-all disabled:opacity-40"
                  >
                    {isEnhancingPrompt ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>{isEnhancingPrompt ? "Expanding Identity..." : "✨ AI Improve Prompt"}</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={charPrompt}
                  onChange={(e) => setCharPrompt(e.target.value)}
                  placeholder="e.g. A 22-year-old athletic pilot woman with long silver hair tied in a high ponytail, striking blue eyes, confident smile..."
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 rounded-xl p-3 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors resize-none shadow-inner"
                />

                {/* Figure Silhouette & Body Proportions Options */}
                <div className="flex flex-col gap-1.5 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                      Figure Silhouette & Body Proportions (Optional Guide)
                    </span>
                    <span className="text-[10px] text-fuchsia-400 font-medium">
                      {figureStyle === "Auto" ? "AI Inferred" : figureStyle}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Auto",
                      "Hourglass",
                      "Curvy",
                      "Pear-shaped",
                      "Athletic / Toned",
                      "Slender / Lean",
                      "Chubby / Plump",
                      "Stocky / Heavyset",
                      "Petite",
                      "Tall & Statuesque",
                    ].map((style) => (
                      <button
                        key={style}
                        type="button"
                        onClick={() => setFigureStyle(style)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          figureStyle === style
                            ? "bg-fuchsia-600 text-white shadow-sm"
                            : "bg-zinc-800/80 text-zinc-300 hover:text-white hover:bg-zinc-700"
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Face Structure / Jawline Options */}
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                      Face Shape & Jawline (Optional Guide)
                    </span>
                    <span className="text-[10px] text-fuchsia-400 font-medium">
                      {faceShape === "Auto" ? "AI Inferred" : faceShape}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Auto",
                      "Oval Face",
                      "Round Face",
                      "Heart-shaped",
                      "Sharp Angular Jaw",
                      "Soft Rounded Jaw",
                    ].map((shape) => (
                      <button
                        key={shape}
                        type="button"
                        onClick={() => setFaceShape(shape)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          faceShape === shape
                            ? "bg-fuchsia-600 text-white shadow-sm"
                            : "bg-zinc-800/80 text-zinc-300 hover:text-white hover:bg-zinc-700"
                        }`}
                      >
                        {shape}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Improved Verbatim Prompt */}
              {enhancedPrompt && (
                <div className="bg-zinc-950/70 border border-fuchsia-500/30 rounded-xl p-3.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-fuchsia-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
                      Verbatim Identity Prompt (Will Be Repeated in Scenes)
                    </span>
                    <span className="text-[10px] text-zinc-400">Editable</span>
                  </div>
                  <textarea
                    rows={4}
                    value={enhancedPrompt}
                    onChange={(e) => setEnhancedPrompt(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-fuchsia-500 rounded-lg p-2.5 text-xs text-zinc-200 font-mono transition-colors resize-none"
                  />
                  <p className="text-[10px] text-zinc-400 italic">
                    Pure bodily proportions, figure silhouette, and facial structure. Style, quality, expressions, and clothing are intentionally excluded.
                  </p>
                </div>
              )}

              {/* Action Buttons: Generate Portrait & Save */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleGeneratePortrait}
                  disabled={isGeneratingPortrait || (!enhancedPrompt.trim() && !charPrompt.trim())}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs sm:text-sm font-semibold text-zinc-100 hover:text-white transition-all disabled:opacity-40 shadow-sm"
                >
                  {isGeneratingPortrait ? (
                    <Loader2 className="w-4 h-4 animate-spin text-fuchsia-400" />
                  ) : (
                    <Play className="w-4 h-4 text-fuchsia-400 fill-fuchsia-400" />
                  )}
                  <span>{isGeneratingPortrait ? "Generating with Anima..." : "Generate Portrait (Anima)"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveCharacter}
                  disabled={!charName.trim() || (!enhancedPrompt.trim() && !charPrompt.trim())}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-xs sm:text-sm font-semibold text-white transition-all disabled:opacity-40 shadow-md shadow-fuchsia-600/20"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Character to Roster</span>
                </button>
              </div>

              {portraitStatus && (
                <p className="text-xs text-zinc-400 text-center animate-in fade-in">
                  {portraitStatus}
                </p>
              )}
            </div>

            {/* Right: Character Preview & Roster */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* Active Portrait Preview */}
              {charAvatarUrl && (
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex flex-col items-center gap-3 shadow-xl">
                  <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider self-start">
                    Generated Portrait Preview
                  </span>
                  <div className="relative w-full aspect-[2/3] max-h-[340px] rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-inner">
                    <img
                      src={charAvatarUrl}
                      alt={charName || "Character Portrait"}
                      className="w-full h-full object-cover object-top"
                    />
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3">
                      <span className="text-sm font-bold text-white block">
                        {charName || "Unnamed Character"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Saved Characters Library */}
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">Your Character Roster</h3>
                      <span
                        className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20"
                        title="Characters backed up to Cloudflare KV memory"
                      >
                        <Cloud className="w-3 h-3" />
                        <span>Cloud KV</span>
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      Select up to 3 characters for your story
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                    Selected: {selectedCharIds.length} / 3 max
                  </span>
                </div>

                {characters.length === 0 ? (
                  <div className="py-8 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-xl">
                    No characters saved yet. Create your first character above!
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 max-h-[460px] overflow-y-auto pr-1">
                    {characters.map((c) => {
                      const isSelected = selectedCharIds.includes(c.id);
                      return (
                        <div
                          key={c.id}
                          className={`p-3 rounded-xl border transition-all flex items-start gap-3 ${
                            isSelected
                              ? "bg-fuchsia-950/20 border-fuchsia-500/50"
                              : "bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700"
                          }`}
                        >
                          {/* Avatar Thumbnail */}
                          <div className="w-14 h-18 rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
                            {c.avatarUrl ? (
                              <img
                                src={c.avatarUrl}
                                alt={c.name}
                                className="w-full h-full object-cover object-top"
                              />
                            ) : (
                              <UserPlus className="w-5 h-5 text-zinc-600" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-1.5 truncate">
                                <h4 className="text-sm font-bold text-white truncate">
                                  {c.name}
                                </h4>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                  c.gender === "male"
                                    ? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                                    : "bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20"
                                }`}>
                                  {c.gender === "male" ? "♂ Male" : "♀ Female"}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteCharacter(c.id)}
                                className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                                title="Delete Character"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {c.baselineOutfit && (
                              <p className="text-[10px] text-fuchsia-300/90 font-medium truncate mb-0.5">
                                <span className="text-zinc-500 font-normal">Attire: </span>
                                {c.baselineOutfit}
                              </p>
                            )}
                            <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                              {c.verbatimIdentityPrompt}
                            </p>
                          </div>

                          {/* Selection Checkbox */}
                          <button
                            type="button"
                            onClick={() => toggleCharSelection(c.id)}
                            className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors shrink-0 mt-1 ${
                              isSelected
                                ? "bg-fuchsia-600 text-white shadow-sm"
                                : "border border-zinc-700 text-transparent hover:border-zinc-500"
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {characters.length > 0 && (
                  <div className="flex flex-col sm:flex-row gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("wardrobe")}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
                    >
                      <Shirt className="w-3.5 h-3.5 text-fuchsia-400" />
                      <span>Wardrobe Studio ({attires.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("story")}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-xs font-semibold text-white transition-colors shadow-sm"
                    >
                      <span>Proceed to Story Setup ({selectedCharIds.length} selected)</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: WARDROBE & ATTIRE STUDIO (Lookbook & Mannequin References) */}
        {/* ========================================================================= */}
        {activeTab === "wardrobe" && (
          <AttireStudio
            attires={attires}
            onSaveAttire={handleSaveAttire}
            onDeleteAttire={handleDeleteAttire}
            characters={characters}
            onAssignToCharacter={handleAssignAttireToCharacter}
            endpoint={endpoint}
          />
        )}

        {/* ========================================================================= */}
        {/* TAB 2: STORY & SCENES (Step 3, 4, 5) */}
        {/* ========================================================================= */}
        {activeTab === "story" && (
          <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
            {/* Story Outline Card */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 sm:p-6 flex flex-col gap-5 shadow-xl">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-fuchsia-400" />
                  Step 2: Story Direction & Opening Scene
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Outline where the story will go and how it begins. The Anima pipeline will generate scenes one by one using the verbatim character descriptions to maintain visual identity.
                </p>
              </div>

              {storyError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{storyError}</span>
                </div>
              )}

              {/* Active Cast Pill */}
              <div className="p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-zinc-300 block mb-0.5">
                    Active Story Cast ({activeCharacters.length} / 3 max)
                  </span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {activeCharacters.map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20"
                      >
                        {c.name}
                      </span>
                    ))}
                    {activeCharacters.length === 0 && (
                      <span className="text-xs text-amber-400">
                        No characters selected! Please go back and select 1 to 3 characters.
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("characters")}
                  className="text-xs text-zinc-400 hover:text-white underline underline-offset-4"
                >
                  Manage Cast
                </button>
              </div>

              {/* Story Premise (Where you expect the story to go) */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Step 3: Where you expect the story to go (Overall Premise)
                </label>
                <textarea
                  rows={3}
                  value={storyPremise}
                  onChange={(e) => setStoryPremise(e.target.value)}
                  placeholder="e.g. A man and a woman are trapped on a deserted island, trying to survive while discovering strange ancient ruins..."
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 rounded-xl p-3 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors resize-none shadow-inner"
                />
              </div>

              {/* First Scene Outline (How you expect the first scene to go) */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Step 4: How you expect the first scene to go (Opening Beat)
                </label>
                <textarea
                  rows={3}
                  value={firstSceneOutline}
                  onChange={(e) => setFirstSceneOutline(e.target.value)}
                  placeholder="e.g. A plane is falling down through dark thunderstorm clouds, cockpit alarms blaring, sheer panic..."
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 rounded-xl p-3 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors resize-none shadow-inner"
                />
              </div>

              {/* Scene Count & Generate Button */}
              <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                <div className="flex items-center gap-2 self-start sm:self-center">
                  <span className="text-xs font-semibold text-zinc-400">Scenes:</span>
                  {[3, 4, 5, 6].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setSceneCount(num)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                        sceneCount === num
                          ? "bg-fuchsia-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handlePlanAndGenerateStory}
                  disabled={isPlanningStory || !!currentGeneratingSceneId}
                  className="w-full sm:flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-indigo-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-sm font-bold text-white transition-all disabled:opacity-50 shadow-lg shadow-fuchsia-600/25 active:scale-[0.99]"
                >
                  {isPlanningStory ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Play className="w-5 h-5 fill-white" />
                  )}
                  <span>
                    {isPlanningStory
                      ? "LLM Planning Story Scenes..."
                      : currentGeneratingSceneId
                      ? "Generating Scene Images (Anima)..."
                      : "Generate Visual Novel (Scenes One by One)"}
                  </span>
                </button>
              </div>
            </div>

            {/* Generated Scenes List (Studio View) */}
            {scenes.length > 0 && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Film className="w-4 h-4 text-fuchsia-400" />
                    Story Scenes ({scenes.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("ledger")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 hover:text-white border border-zinc-700/60 shadow-sm transition-colors"
                      title="Inspect full AI outputs, verbatim prompts, dialogues, and ledger JSON"
                    >
                      <FileText className="w-3.5 h-3.5 text-fuchsia-400" />
                      <span>Story Ledger</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("reader")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-xs font-semibold text-white shadow-sm transition-colors"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Launch Reader Mode</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {scenes.map((scene, idx) => (
                    <div
                      key={scene.id}
                      className={`bg-zinc-900/90 border rounded-2xl overflow-hidden flex flex-col shadow-lg transition-all ${
                        scene.isGenerating
                          ? "border-fuchsia-500 ring-2 ring-fuchsia-500/20"
                          : "border-zinc-800"
                      }`}
                    >
                      {/* Image Frame */}
                      <div className="relative w-full aspect-[16/10] bg-zinc-950 flex items-center justify-center overflow-hidden border-b border-zinc-800">
                        {scene.imageUrl ? (
                          <img
                            src={scene.imageUrl}
                            alt={scene.title}
                            className="w-full h-full object-cover"
                          />
                        ) : scene.isGenerating ? (
                          <div className="flex flex-col items-center gap-2 p-4 text-center">
                            <Loader2 className="w-8 h-8 animate-spin text-fuchsia-400" />
                            <span className="text-xs font-medium text-fuchsia-300">
                              {scene.statusText || "Rendering Anima scene..."}
                            </span>
                            {scene.progressPercent !== undefined && (
                              <div className="w-36 h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-1">
                                <div
                                  className="h-full bg-fuchsia-500 transition-all duration-300"
                                  style={{ width: `${scene.progressPercent}%` }}
                                />
                              </div>
                            )}
                          </div>
                        ) : scene.error ? (
                          <div className="p-4 text-center flex flex-col items-center gap-2">
                            <AlertCircle className="w-6 h-6 text-rose-400" />
                            <span className="text-xs text-rose-300">{scene.error}</span>
                            <button
                              type="button"
                              onClick={() => generateSceneImageRun(scene, activeCharacters)}
                              className="text-xs font-semibold text-white bg-zinc-800 px-3 py-1 rounded-lg hover:bg-zinc-700 transition-colors"
                            >
                              Retry Image
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-600">Pending image queue...</span>
                        )}

                        {/* Scene Badge */}
                        <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-[10px] font-bold text-white border border-white/10">
                          Scene {scene.sceneNumber}: {scene.title}
                        </div>
                      </div>

                      {/* Scene Text & Dialogues */}
                      <div className="p-4 flex flex-col gap-2.5 flex-1 justify-between bg-zinc-900/60">
                        {scene.narration && (
                          <p className="text-xs text-zinc-300 italic leading-relaxed bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-800/80">
                            "{scene.narration}"
                          </p>
                        )}

                        <div className="flex flex-col gap-1.5">
                          {scene.dialogues.slice(0, 3).map((d) => (
                            <div key={d.id} className="text-xs leading-relaxed">
                              <span className="font-bold text-fuchsia-400 mr-1.5">
                                {d.speaker}:
                              </span>
                              {d.voiceCue && (
                                <span className="text-[10px] text-zinc-500 italic mr-1">
                                  [{d.voiceCue}]
                                </span>
                              )}
                              <span className="text-zinc-200">"{d.text}"</span>
                            </div>
                          ))}
                          {scene.dialogues.length > 3 && (
                            <span className="text-[10px] text-zinc-500">
                              +{scene.dialogues.length - 3} more lines
                            </span>
                          )}
                        </div>

                        {/* Regenerate Button */}
                        <div className="pt-2 flex items-center justify-between border-t border-zinc-800/60 mt-2">
                          <span className="text-[10px] text-zinc-500">
                            Present: {scene.charactersPresent.join(", ") || "None"}
                          </span>
                          <button
                            type="button"
                            onClick={() => generateSceneImageRun(scene, activeCharacters)}
                            disabled={scene.isGenerating || !!currentGeneratingSceneId}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                            title="Regenerate this scene's image"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: VISUAL NOVEL READER (Interactive Player) */}
        {/* ========================================================================= */}
        {activeTab === "reader" && (
          <div className="flex flex-col gap-4 max-w-5xl mx-auto w-full">
            {/* Cinematic Stage Box (Pure Artwork Viewport) */}
            <div className="relative w-full aspect-[16/9] bg-black rounded-2xl sm:rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl flex flex-col justify-between select-none">
              {/* Scene Background Image */}
              {currentScene?.imageUrl ? (
                <img
                  src={currentScene.imageUrl}
                  alt={currentScene.title}
                  className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 to-zinc-950 flex flex-col items-center justify-center p-6 text-center">
                  {currentScene?.isGenerating ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-10 h-10 animate-spin text-fuchsia-400" />
                      <span className="text-sm font-semibold text-fuchsia-300">
                        {currentScene.statusText || "Rendering Anima scene..."}
                      </span>
                      {currentScene.progressPercent !== undefined && (
                        <div className="w-48 h-2 bg-zinc-800 rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 transition-all duration-300"
                            style={{ width: `${currentScene.progressPercent}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Film className="w-10 h-10 text-zinc-700" />
                      <span className="text-sm text-zinc-400 font-medium">
                        {currentScene ? "No image rendered yet for this scene" : "No scenes available"}
                      </span>
                      {currentScene && (
                        <button
                          type="button"
                          onClick={() => generateSceneImageRun(currentScene, activeCharacters)}
                          className="mt-2 text-xs font-semibold text-white bg-zinc-800 hover:bg-zinc-700 px-3.5 py-1.5 rounded-xl border border-zinc-700 transition-colors"
                        >
                          Render Image Now
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Scene Top Info Bar (HUD overlay) */}
              <div className="relative z-10 p-3 sm:p-4 flex items-center justify-between bg-gradient-to-b from-black/85 via-black/40 to-transparent">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-xs font-bold text-white shadow-md">
                    Scene {currentSceneIndex + 1} of {scenes.length}
                  </span>
                  {currentScene?.sceneTone && (
                    <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-fuchsia-300">
                      {currentScene.sceneTone.replace("_", " ")}
                    </span>
                  )}
                  <span className="hidden sm:inline-block text-xs font-medium text-zinc-200 drop-shadow">
                    {currentScene?.title}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAutoPlay(!isAutoPlay)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md border transition-all flex items-center gap-1.5 shadow-md ${
                      isAutoPlay
                        ? "bg-fuchsia-600 text-white border-fuchsia-400 shadow-fuchsia-600/30"
                        : "bg-black/70 text-zinc-300 border-white/15 hover:text-white hover:bg-black/90"
                    }`}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>{isAutoPlay ? "Autoplay ON" : "Autoplay"}</span>
                  </button>

                  {currentScene && (
                    <button
                      type="button"
                      onClick={() => generateSceneImageRun(currentScene, activeCharacters)}
                      disabled={currentScene.isGenerating || !!currentGeneratingSceneId}
                      className="p-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-zinc-300 hover:text-white hover:bg-black/90 transition-colors disabled:opacity-40"
                      title="Regenerate this scene image"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Bottom Subtle Artwork Shade */}
              <div className="h-6 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
            </div>

            {/* Dedicated Dialogue Card BELOW the Artwork */}
            <div
              onClick={handleNextDialogue}
              className="bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700/80 rounded-2xl p-4 sm:p-5 shadow-xl transition-all cursor-pointer group flex flex-col gap-3 select-none"
            >
              {/* Speaker Bar & Line Navigation */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {speakerChar?.avatarUrl ? (
                    <img
                      src={speakerChar.avatarUrl}
                      alt={speakerChar.name}
                      className="w-11 h-11 rounded-xl object-cover ring-2 ring-fuchsia-500/40 shadow-md shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-fuchsia-600/30 to-indigo-600/30 border border-fuchsia-500/30 flex items-center justify-center shrink-0">
                      <BookOpen className="w-5 h-5 text-fuchsia-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white tracking-wide">
                        {currentDialogue?.speaker || (currentScene?.narration ? "Narrator" : "Story")}
                      </span>
                      {currentDialogue?.voiceCue && (
                        <span className="text-[11px] font-medium text-fuchsia-300 bg-fuchsia-500/10 px-2 py-0.5 rounded-md border border-fuchsia-500/20 italic">
                          [{currentDialogue.voiceCue}]
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                      <span>Line {currentDialogueIndex + 1} of {currentScene?.dialogues?.length || 1}</span>
                      {currentScene?.characterStates?.find((cs) => cs.name.toLowerCase() === currentDialogue?.speaker?.toLowerCase())?.outfit && (
                        <>
                          <span>•</span>
                          <span className="text-zinc-500 font-normal">wearing</span>
                          <span className="text-zinc-300 truncate max-w-[180px] sm:max-w-xs">
                            {currentScene.characterStates.find((cs) => cs.name.toLowerCase() === currentDialogue?.speaker?.toLowerCase())?.outfit}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Reader Controls */}
                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={handlePrevDialogue}
                    disabled={currentSceneIndex === 0 && currentDialogueIndex === 0}
                    className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    title="Previous dialogue line (Left Arrow)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextDialogue}
                    className="px-3.5 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-md shadow-fuchsia-600/20 transition-all flex items-center gap-1.5 text-xs font-semibold"
                    title="Next dialogue line (Space or Right Arrow)"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Dialogue Text / Narration */}
              <div className="min-h-[56px] flex items-center bg-zinc-950/60 rounded-xl p-3.5 sm:p-4 border border-zinc-800/80">
                <p className="text-sm sm:text-base text-zinc-100 font-medium leading-relaxed tracking-wide font-sans">
                  {currentDialogue?.text || currentScene?.narration || "..."}
                </p>
              </div>

              {/* Advance Hint & Status */}
              <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-0.5">
                <span className="hidden sm:inline">Click card or press Space / Right Arrow to advance</span>
                <span className="sm:hidden">Tap card to advance</span>
                <span className="group-hover:text-fuchsia-400 transition-colors flex items-center gap-1 font-medium">
                  Next line <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </div>

            {/* Scene Thumbnails Navigation */}
            <div className="flex items-center gap-2 overflow-x-auto py-2">
              {scenes.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setCurrentSceneIndex(idx);
                    setCurrentDialogueIndex(0);
                  }}
                  className={`relative w-28 h-18 rounded-xl overflow-hidden border shrink-0 transition-all ${
                    currentSceneIndex === idx
                      ? "border-fuchsia-500 ring-2 ring-fuchsia-500/30 scale-105"
                      : "border-zinc-800 opacity-60 hover:opacity-100"
                  }`}
                >
                  {s.imageUrl ? (
                    <img src={s.imageUrl} alt={s.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-[10px] text-zinc-500">
                      Scene {idx + 1}
                    </div>
                  )}
                  <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/80 text-white">
                    {idx + 1}
                  </span>
                </button>
              ))}
            </div>

            {/* Continue Story Bar */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-3 shadow-lg">
              <input
                type="text"
                value={continuePrompt}
                onChange={(e) => setContinuePrompt(e.target.value)}
                placeholder="Write what happens next in the story..."
                className="w-full sm:flex-1 bg-zinc-950 border border-zinc-800 focus:border-fuchsia-500 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors shadow-inner"
              />
              <button
                type="button"
                onClick={handleContinueStory}
                disabled={isContinuing || !continuePrompt.trim()}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-xs sm:text-sm font-semibold text-white transition-all disabled:opacity-40 shrink-0 shadow-md shadow-fuchsia-600/20"
              >
                {isContinuing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                <span>Add Next Scene</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: STORY LEDGER (Comprehensive AI Output & Analysis) */}
        {/* ========================================================================= */}
        {activeTab === "ledger" && (
          <div className="max-w-5xl mx-auto w-full">
            <StoryLedger
              storyPremise={storyPremise}
              firstSceneOutline={firstSceneOutline}
              characters={characters}
              scenes={scenes}
            />
          </div>
        )}
      </div>

      {/* Wardrobe Quick Picker Modal */}
      {isWardrobeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-5 shadow-2xl flex flex-col gap-4 max-h-[85vh]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shirt className="w-4 h-4 text-fuchsia-400" />
                  Select Attire from Wardrobe Catalog
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Pick a baseline outfit rendered on a reference mannequin.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsWardrobeModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto pr-1">
              {attires.map((attire) => (
                <button
                  key={attire.id}
                  type="button"
                  onClick={() => {
                    setCharBaselineOutfit(attire.verbatimPrompt);
                    setCharBaselineAttireId(attire.id);
                    setIsWardrobeModalOpen(false);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all flex gap-3 items-center group ${
                    charBaselineOutfit === attire.verbatimPrompt
                      ? "bg-fuchsia-950/30 border-fuchsia-500/60"
                      : "bg-zinc-950 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/60"
                  }`}
                >
                  <div className="w-14 h-18 rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
                    {attire.previewImageUrl ? (
                      <img
                        src={attire.previewImageUrl}
                        alt={attire.name}
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <Shirt className="w-5 h-5 text-zinc-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h4 className="text-xs font-bold text-white group-hover:text-fuchsia-300 truncate">
                        {attire.name}
                      </h4>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 capitalize">
                        {attire.gender}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">
                      {attire.verbatimPrompt}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setIsWardrobeModalOpen(false);
                  setActiveTab("wardrobe");
                }}
                className="text-xs text-fuchsia-400 hover:text-fuchsia-300 underline underline-offset-4"
              >
                Go to Full Wardrobe Studio &rarr;
              </button>
              <button
                type="button"
                onClick={() => setIsWardrobeModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
