import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Play,
  RotateCcw,
  Trash2,
  Check,
  Plus,
  Loader2,
  AlertCircle,
  Shirt,
  User,
  Sliders,
  Eye,
  Download,
  Info,
  CheckCircle2,
  Layers,
  Smile,
  Shield,
} from "lucide-react";
import { VNCharacter, VNAttire, VNSpriteVariant } from "../../types/visualNovel";
import {
  MODULAR_EXPRESSION_LIBRARY,
  buildModularSpritePrompt,
  executeAnimaSpriteGeneration,
} from "../../lib/visualNovelEngine";
import { saveVNSpriteVariant } from "../../lib/storage";

interface SpriteStudioProps {
  characters: VNCharacter[];
  attires: VNAttire[];
  endpoint: string;
  onSaveCharacter: (char: VNCharacter) => void;
}

export const SpriteStudio: React.FC<SpriteStudioProps> = ({
  characters,
  attires,
  endpoint,
  onSaveCharacter,
}) => {
  const [selectedCharId, setSelectedCharId] = useState<string>(
    characters[0]?.id || ""
  );

  const activeChar = characters.find((c) => c.id === selectedCharId);

  // Modular Anchor State
  const [characterAnchor, setCharacterAnchor] = useState<string>("");
  const [clothingLock, setClothingLock] = useState<string>("");
  const [selectedAttireId, setSelectedAttireId] = useState<string>("");
  const [characterCm, setCharacterCm] = useState<number>(165);
  const [outlineWidth, setOutlineWidth] = useState<number>(0); // 0 = clean alpha, 2 = sticker border

  // Batch Generation State
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>([
    "neutral",
    "shy",
    "happy",
    "angry",
  ]);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState<boolean>(false);
  const [activeGeneratingEmotion, setActiveGeneratingEmotion] = useState<string | null>(null);
  const [progressStatus, setProgressStatus] = useState<string>("");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Gallery view state
  const [previewBg, setPreviewBg] = useState<"checkerboard" | "dark" | "light">("checkerboard");

  // Sync state when selected character changes
  useEffect(() => {
    if (activeChar) {
      const initialAnchor =
        activeChar.characterAnchor ||
        activeChar.verbatimIdentityPrompt ||
        "A 24-year-old woman, 5'6\" tall with a slim athletic build, sharp jawline, high cheekbones, dark almond-shaped eyes, straight shoulder-length black hair with blunt bangs";
      setCharacterAnchor(initialAnchor);

      const initialOutfit =
        activeChar.baselineOutfit ||
        "Over-sized beige knit sweater and dark blue high-waisted denim jeans, clean sneakers";
      setClothingLock(initialOutfit);

      if (activeChar.baselineAttireId) {
        setSelectedAttireId(activeChar.baselineAttireId);
      } else {
        setSelectedAttireId("");
      }

      setCharacterCm(activeChar.cm || (activeChar.gender === "male" ? 178 : 165));
    }
  }, [selectedCharId, activeChar]);

  // Handle Attire Picker selection
  const handleSelectAttire = (attireId: string) => {
    setSelectedAttireId(attireId);
    if (!attireId) return;
    const found = attires.find((a) => a.id === attireId);
    if (found) {
      setClothingLock(found.verbatimPrompt);
    }
  };

  // Toggle emotion checkbox
  const toggleEmotion = (emotionId: string) => {
    setSelectedEmotions((prev) =>
      prev.includes(emotionId)
        ? prev.filter((id) => id !== emotionId)
        : [...prev, emotionId]
    );
  };

  const handleSelectAll = () => {
    setSelectedEmotions(Object.keys(MODULAR_EXPRESSION_LIBRARY));
  };

  const handleSelectCore4 = () => {
    setSelectedEmotions(["neutral", "shy", "happy", "angry"]);
  };

  const handleDeselectAll = () => {
    setSelectedEmotions([]);
  };

  // Save Anchor & Height to Character
  const handleSaveAnchor = () => {
    if (!activeChar) return;
    const updated: VNCharacter = {
      ...activeChar,
      characterAnchor,
      baselineOutfit: clothingLock,
      baselineAttireId: selectedAttireId || activeChar.baselineAttireId,
      cm: characterCm,
    };
    onSaveCharacter(updated);
  };

  // Execute Batch Sprite Generation
  const handleBatchGenerate = async () => {
    if (!activeChar) {
      setErrorMessage("Please select a character first.");
      return;
    }
    if (!characterAnchor.trim()) {
      setErrorMessage("Character Anchor cannot be empty.");
      return;
    }
    if (!clothingLock.trim()) {
      setErrorMessage("Clothing Lock cannot be empty.");
      return;
    }
    if (selectedEmotions.length === 0) {
      setErrorMessage("Please select at least one emotion to generate.");
      return;
    }

    setErrorMessage(null);
    setIsGeneratingBatch(true);
    handleSaveAnchor();

    const outfitId = selectedAttireId || "custom_outfit";

    try {
      for (let i = 0; i < selectedEmotions.length; i++) {
        const emotionId = selectedEmotions[i];
        const emotionDef = MODULAR_EXPRESSION_LIBRARY[emotionId];
        if (!emotionDef) continue;

        setActiveGeneratingEmotion(emotionId);
        setProgressStatus(`Rendering '${emotionDef.name}' (${i + 1}/${selectedEmotions.length})...`);
        setProgressPercent(Math.round(((i) / selectedEmotions.length) * 100));

        // Compile Modular Anchor Prompt
        const modularPrompt = buildModularSpritePrompt(
          characterAnchor,
          clothingLock,
          emotionDef.prompt
        );

        // Submit to Anima + RMBG-2.0 + Outline workflow
        const targetSeed = Math.floor(Math.random() * 1000000000000);
        const result = await executeAnimaSpriteGeneration(endpoint, {
          positivePrompt: modularPrompt,
          outlineWidth: outlineWidth,
          seed: targetSeed,
          width: 1024,
          height: 1024,
          onProgress: (pct, status) => {
            setProgressStatus(`'${emotionDef.name}': ${status}`);
          },
        });

        // Store Sprite Variant
        const spriteVariant: VNSpriteVariant = {
          id: `sprite_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          characterId: activeChar.id,
          outfitId,
          poseId: "standing",
          emotionId,
          imageUrl: result.url,
          mediaId: result.id,
          outlineWidth,
          seed: targetSeed,
          createdAt: Date.now(),
        };

        saveVNSpriteVariant(activeChar.id, spriteVariant);

        // Update local character state so UI refreshes
        const updatedSprites = { ...(activeChar.sprites || {}) };
        updatedSprites[`${outfitId}_${emotionId}`] = spriteVariant;
        onSaveCharacter({
          ...activeChar,
          characterAnchor,
          baselineOutfit: clothingLock,
          cm: characterCm,
          sprites: updatedSprites,
        });
      }

      setProgressStatus("All selected variations generated successfully!");
      setProgressPercent(100);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed during sprite batch generation.");
    } finally {
      setIsGeneratingBatch(false);
      setActiveGeneratingEmotion(null);
    }
  };

  // Delete Sprite Variant
  const handleDeleteSprite = (key: string) => {
    if (!activeChar || !activeChar.sprites) return;
    const updatedSprites = { ...activeChar.sprites };
    delete updatedSprites[key];
    onSaveCharacter({
      ...activeChar,
      sprites: updatedSprites,
    });
  };

  // Get active character sprites
  const currentSprites = Object.entries(activeChar?.sprites || {});

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto w-full">
      {/* Top Banner / Concept Explainer */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col gap-2 max-w-2xl relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-fuchsia-950/60 border border-fuchsia-800/40 rounded-full w-fit">
            <Shield className="w-3.5 h-3.5 text-fuchsia-400" />
            <span className="text-xs font-semibold text-fuchsia-300">
              Modular Anchor Consistency Engine
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Sprite Studio & Expression Matrix
          </h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Generates transparent character sprites facing the player using the{" "}
            <span className="text-zinc-200 font-semibold">Anima + RMBG-2.0 Cutout</span> pipeline.
            The <span className="text-zinc-200 font-semibold">Character Anchor</span> and{" "}
            <span className="text-zinc-200 font-semibold">Clothing Lock</span> remain 100%
            identical across all emotions, while hands, posture, and facial cues shift dynamically.
          </p>
        </div>

        {/* Character Quick Switcher */}
        <div className="flex flex-col gap-2 w-full md:w-72 bg-zinc-950/80 p-4 rounded-2xl border border-zinc-800 shrink-0">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-fuchsia-400" />
            Active Character
          </label>
          <select
            value={selectedCharId}
            onChange={(e) => setSelectedCharId(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-500 font-medium"
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.gender || "unspecified"})
              </option>
            ))}
          </select>
          {activeChar && (
            <div className="flex items-center gap-2 pt-1 text-xs text-zinc-500">
              <span>Height: {characterCm} cm</span>
              <span>•</span>
              <span>{currentSprites.length} Sprites Cut</span>
            </div>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-2xl p-4 flex items-center gap-3 text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Dual Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Anchor Locks & Variation Configuration (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Card 1: Modular Anchors (Fixed Layer) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white tracking-wide">
                  Modular Anchors (Fixed Layer)
                </h3>
              </div>
              <button
                onClick={handleSaveAnchor}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold px-2.5 py-1 bg-indigo-950/40 border border-indigo-800/40 rounded-lg transition"
              >
                Save Anchors
              </button>
            </div>

            {/* Character Anchor */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Character Anchor (Anatomy & Face)
                </label>
                <span className="text-[11px] text-zinc-500">100% Locked</span>
              </div>
              <textarea
                rows={3}
                value={characterAnchor}
                onChange={(e) => setCharacterAnchor(e.target.value)}
                placeholder="Measurable anatomical traits: jawline, cheekbones, eyes, height, build, hair style/color..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs sm:text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 resize-none font-mono"
              />
            </div>

            {/* Wardrobe / Clothing Lock */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Shirt className="w-3.5 h-3.5 text-fuchsia-400" />
                  Clothing Lock
                </label>
                {attires.length > 0 && (
                  <select
                    value={selectedAttireId}
                    onChange={(e) => handleSelectAttire(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-400 rounded-lg px-2 py-0.5 focus:outline-none"
                  >
                    <option value="">Load from Wardrobe...</option>
                    {attires.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <textarea
                rows={2}
                value={clothingLock}
                onChange={(e) => setClothingLock(e.target.value)}
                placeholder="Exact fabric, garment fit, colors, materials, and footwear..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs sm:text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 resize-none font-mono"
              />
            </div>

            {/* Height & Outline Controls */}
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400">
                  Height (cm)
                </label>
                <input
                  type="number"
                  min={120}
                  max={230}
                  value={characterCm}
                  onChange={(e) => setCharacterCm(parseInt(e.target.value) || 165)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400">
                  Cutout Style
                </label>
                <div className="grid grid-cols-2 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setOutlineWidth(0)}
                    className={`text-xs py-1.5 rounded-lg font-medium transition ${
                      outlineWidth === 0
                        ? "bg-fuchsia-600 text-white shadow"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Clean Alpha
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutlineWidth(2)}
                    className={`text-xs py-1.5 rounded-lg font-medium transition ${
                      outlineWidth > 0
                        ? "bg-fuchsia-600 text-white shadow"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Sticker (2px)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Batch Execution Action Card */}
          <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Batch Queue Dispatch
              </span>
              <span className="text-xs font-bold text-fuchsia-400">
                {selectedEmotions.length} Selected
              </span>
            </div>

            <button
              onClick={handleBatchGenerate}
              disabled={isGeneratingBatch || selectedEmotions.length === 0}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-fuchsia-600 via-indigo-600 to-purple-600 hover:from-fuchsia-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-fuchsia-600/20 transition duration-200"
            >
              {isGeneratingBatch ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Generating Sprites ({selectedEmotions.length})...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>Generate Selected Sprites ({selectedEmotions.length})</span>
                </>
              )}
            </button>

            {isGeneratingBatch && (
              <div className="flex flex-col gap-2 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-medium">{progressStatus}</span>
                  <span className="text-fuchsia-400 font-mono font-bold">
                    {progressPercent}%
                  </span>
                </div>
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Emotion Matrix & Sprite Gallery (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Section A: Modular Expression & Pose Picker */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Smile className="w-5 h-5 text-fuchsia-400" />
                <h3 className="text-base font-bold text-white tracking-wide">
                  Modular Expression & Posture Matrix
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectCore4}
                  className="text-xs text-zinc-400 hover:text-white px-2.5 py-1 bg-zinc-800 rounded-lg transition"
                >
                  Core 4
                </button>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs text-zinc-400 hover:text-white px-2.5 py-1 bg-zinc-800 rounded-lg transition"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-xs text-zinc-400 hover:text-white px-2.5 py-1 bg-zinc-800 rounded-lg transition"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
              {Object.entries(MODULAR_EXPRESSION_LIBRARY).map(([key, item]) => {
                const isSelected = selectedEmotions.includes(key);
                const isCurrentlyActive = activeGeneratingEmotion === key;

                return (
                  <div
                    key={key}
                    onClick={() => !isGeneratingBatch && toggleEmotion(key)}
                    className={`p-3.5 rounded-2xl border transition cursor-pointer select-none flex flex-col gap-2 relative overflow-hidden ${
                      isCurrentlyActive
                        ? "bg-fuchsia-950/50 border-fuchsia-500 shadow-lg shadow-fuchsia-500/20"
                        : isSelected
                        ? "bg-zinc-800/70 border-fuchsia-700/60 text-zinc-100"
                        : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                        {item.name}
                        {isCurrentlyActive && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-fuchsia-400" />
                        )}
                      </span>
                      <div
                        className={`w-4 h-4 rounded-md border flex items-center justify-center transition ${
                          isSelected
                            ? "bg-fuchsia-600 border-fuchsia-500 text-white"
                            : "border-zinc-700 bg-zinc-900"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>

                    <div className="text-[11px] text-zinc-400 flex flex-col gap-0.5">
                      <span className="line-clamp-1">
                        <strong className="text-zinc-300 font-semibold">Hands:</strong>{" "}
                        {item.handGestures}
                      </span>
                      <span className="line-clamp-1 text-fuchsia-300/80">
                        <strong className="text-zinc-300 font-semibold">Face:</strong>{" "}
                        {item.facialCue}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section B: Generated Transparent Sprite Cutouts Gallery */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white tracking-wide">
                  Generated Sprite Cutouts ({currentSprites.length})
                </h3>
              </div>

              {/* Background preview switcher */}
              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setPreviewBg("checkerboard")}
                  className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition ${
                    previewBg === "checkerboard"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Checkerboard
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewBg("dark")}
                  className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition ${
                    previewBg === "dark"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Dark
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewBg("light")}
                  className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition ${
                    previewBg === "light"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Light
                </button>
              </div>
            </div>

            {currentSprites.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-zinc-800 rounded-2xl">
                <Layers className="w-10 h-10 text-zinc-600 mb-3" />
                <span className="text-sm font-semibold text-zinc-400">
                  No sprite cutouts generated yet
                </span>
                <span className="text-xs text-zinc-500 max-w-sm mt-1">
                  Select your desired emotions above and click "Generate Selected Sprites"
                  to create transparent character sprites.
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {currentSprites.map(([key, sprite]) => {
                  const exprDef = MODULAR_EXPRESSION_LIBRARY[sprite.emotionId];

                  return (
                    <div
                      key={key}
                      className="group flex flex-col bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-2xl overflow-hidden transition relative shadow-lg"
                    >
                      {/* Image Preview Canvas */}
                      <div
                        className={`relative aspect-[3/4] w-full overflow-hidden flex items-end justify-center p-2 ${
                          previewBg === "checkerboard"
                            ? "bg-[linear-gradient(45deg,#18181b_25%,transparent_25%),linear-gradient(-45deg,#18181b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#18181b_75%),linear-gradient(-45deg,transparent_75%,#18181b_75%)] bg-[size:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] bg-zinc-900"
                            : previewBg === "dark"
                            ? "bg-zinc-950"
                            : "bg-zinc-200"
                        }`}
                      >
                        <img
                          src={sprite.imageUrl}
                          alt={sprite.emotionId}
                          className="h-full w-full object-contain drop-shadow-md select-none"
                        />

                        {/* Top Badge */}
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur border border-white/10 rounded-full text-[10px] font-bold text-white capitalize">
                          {exprDef?.name || sprite.emotionId}
                        </div>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => handleDeleteSprite(key)}
                          className="absolute top-2 right-2 p-1.5 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-200 rounded-lg opacity-0 group-hover:opacity-100 transition shadow"
                          title="Delete sprite"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Card Footer */}
                      <div className="p-2.5 flex items-center justify-between bg-zinc-900 border-t border-zinc-800 text-[11px]">
                        <span className="text-zinc-400 font-mono">
                          {sprite.outlineWidth === 0 ? "Clean Alpha" : "Sticker 2px"}
                        </span>
                        <a
                          href={sprite.imageUrl}
                          download={`${activeChar?.name || "character"}_${sprite.emotionId}.png`}
                          className="text-zinc-400 hover:text-white transition flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
