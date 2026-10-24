import React, { useState } from "react";
import {
  Sparkles,
  MapPin,
  Sun,
  Sunset,
  Moon,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Eye,
  Image as ImageIcon,
  Compass,
} from "lucide-react";
import { VNWorld, VNLocation } from "../../types/visualNovel";
import { executeLocationGeneration } from "../../lib/visualNovelEngine";

interface WorldStudioProps {
  worlds: VNWorld[];
  onSaveWorld: (world: VNWorld) => void;
  onDeleteWorld: (id: string) => void;
  endpoint: string;
}

export const WorldStudio: React.FC<WorldStudioProps> = ({
  worlds,
  onSaveWorld,
  onDeleteWorld,
  endpoint,
}) => {
  const [selectedWorldId, setSelectedWorldId] = useState<string>(
    worlds[0]?.id || ""
  );

  const activeWorld = worlds.find((w) => w.id === selectedWorldId) || worlds[0];

  // New Location Form State
  const [isAddingLocation, setIsAddingLocation] = useState<boolean>(false);
  const [newLocName, setNewLocName] = useState<string>("");
  const [newLocDesc, setNewLocDesc] = useState<string>("");
  const [newLocPrompt, setNewLocPrompt] = useState<string>("");

  // Generation state
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [generateStatus, setGenerateStatus] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  // Add new location
  const handleAddLocation = () => {
    if (!newLocName.trim() || !newLocPrompt.trim()) {
      setFormError("Location name and prompt are required.");
      return;
    }
    setFormError(null);

    const newLoc: VNLocation = {
      id: `loc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: newLocName.trim(),
      description: newLocDesc.trim() || newLocName.trim(),
      prompt: newLocPrompt.trim(),
      timeVariants: {},
    };

    const updatedWorld: VNWorld = {
      ...activeWorld,
      locations: [...activeWorld.locations, newLoc],
    };

    onSaveWorld(updatedWorld);
    setNewLocName("");
    setNewLocDesc("");
    setNewLocPrompt("");
    setIsAddingLocation(false);
  };

  // Delete a location
  const handleDeleteLocation = (locId: string) => {
    const updatedWorld: VNWorld = {
      ...activeWorld,
      locations: activeWorld.locations.filter((l) => l.id !== locId),
    };
    onSaveWorld(updatedWorld);
  };

  // Generate a Time-of-Day variation for a location
  const handleGenerateTimeVariant = async (
    location: VNLocation,
    timeOfDay: "day" | "evening" | "night"
  ) => {
    const key = `${location.id}_${timeOfDay}`;
    setGeneratingKey(key);
    setGenerateStatus(`Generating ${timeOfDay} scenery...`);
    setFormError(null);

    try {
      const media = await executeLocationGeneration(endpoint, {
        locationPrompt: location.prompt,
        timeOfDay,
        onProgress: (_, status) => setGenerateStatus(status),
      });

      const updatedLoc: VNLocation = {
        ...location,
        timeVariants: {
          ...location.timeVariants,
          [timeOfDay]: media.url,
        },
      };

      const updatedWorld: VNWorld = {
        ...activeWorld,
        locations: activeWorld.locations.map((l) =>
          l.id === location.id ? updatedLoc : l
        ),
      };

      onSaveWorld(updatedWorld);
    } catch (err: any) {
      setFormError(err.message || "Failed to render location art.");
    } finally {
      setGeneratingKey(null);
      setGenerateStatus("");
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto w-full">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col gap-2 max-w-2xl relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-950/60 border border-indigo-800/40 rounded-full w-fit">
            <Compass className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-semibold text-indigo-300">
              World & Environment Studio
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Background Scenery & Lighting
          </h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Generate 16:9 pure scenery backgrounds completely free of human figures (
            <span className="text-zinc-200 font-semibold">no humans</span>). Each location
            supports <span className="text-zinc-200 font-semibold">Day</span>,{" "}
            <span className="text-zinc-200 font-semibold">Golden Hour Sunset</span>, and{" "}
            <span className="text-zinc-200 font-semibold">Night</span> lighting variants.
          </p>
        </div>

        {/* Add Location Trigger */}
        <button
          onClick={() => setIsAddingLocation(!isAddingLocation)}
          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Location</span>
        </button>
      </div>

      {formError && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-2xl p-4 flex items-center gap-3 text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
          <span>{formError}</span>
        </div>
      )}

      {/* Add Location Modal / Inline Form */}
      {isAddingLocation && (
        <div className="bg-zinc-900 border border-indigo-500/40 rounded-3xl p-6 flex flex-col gap-4 shadow-xl">
          <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
            <MapPin className="w-4 h-4 text-indigo-400" />
            Create Location
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-400">Location Name</label>
              <input
                type="text"
                placeholder="e.g. Seaside Cafe, Tropical Beach, Ancient Library..."
                value={newLocName}
                onChange={(e) => setNewLocName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-400">Short Summary</label>
              <input
                type="text"
                placeholder="e.g. Cozy interior with large windows and warm wood tables"
                value={newLocDesc}
                onChange={(e) => setNewLocDesc(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400">
              Anima Scenery Prompt (No humans)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. cozy modern cafe interior with warm hanging amber lanterns, rustic wooden tables, panoramic glass windows overlooking ocean"
              value={newLocPrompt}
              onChange={(e) => setNewLocPrompt(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setIsAddingLocation(false)}
              className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              onClick={handleAddLocation}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow transition"
            >
              Save Location
            </button>
          </div>
        </div>
      )}

      {/* Locations Grid */}
      <div className="flex flex-col gap-6">
        {activeWorld.locations.map((loc) => (
          <div
            key={loc.id}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-5 shadow-xl"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-950/60 border border-indigo-800/40 flex items-center justify-center text-indigo-400">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <h3 className="text-lg font-bold text-white tracking-wide">
                    {loc.name}
                  </h3>
                  <span className="text-xs text-zinc-400">{loc.description}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleDeleteLocation(loc.id)}
                className="p-2 text-zinc-500 hover:text-red-400 transition rounded-lg hover:bg-zinc-800"
                title="Delete Location"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Time Variants Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Day Variant */}
              <TimeVariantCard
                title="Daytime"
                icon={<Sun className="w-4 h-4 text-amber-400" />}
                imageUrl={loc.timeVariants.day}
                isGenerating={generatingKey === `${loc.id}_day`}
                generateStatus={generateStatus}
                onGenerate={() => handleGenerateTimeVariant(loc, "day")}
              />

              {/* Evening / Golden Hour Variant */}
              <TimeVariantCard
                title="Evening / Sunset"
                icon={<Sunset className="w-4 h-4 text-orange-400" />}
                imageUrl={loc.timeVariants.evening}
                isGenerating={generatingKey === `${loc.id}_evening`}
                generateStatus={generateStatus}
                onGenerate={() => handleGenerateTimeVariant(loc, "evening")}
              />

              {/* Night Variant */}
              <TimeVariantCard
                title="Night Sky"
                icon={<Moon className="w-4 h-4 text-indigo-400" />}
                imageUrl={loc.timeVariants.night}
                isGenerating={generatingKey === `${loc.id}_night`}
                generateStatus={generateStatus}
                onGenerate={() => handleGenerateTimeVariant(loc, "night")}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface TimeVariantCardProps {
  title: string;
  icon: React.ReactNode;
  imageUrl?: string;
  isGenerating: boolean;
  generateStatus?: string;
  onGenerate: () => void;
}

const TimeVariantCard: React.FC<TimeVariantCardProps> = ({
  title,
  icon,
  imageUrl,
  isGenerating,
  generateStatus,
  onGenerate,
}) => {
  return (
    <div className="flex flex-col bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden group shadow-md">
      <div className="relative aspect-[16/9] w-full bg-zinc-900 flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-500 select-none"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            {isGenerating ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <span className="text-xs text-indigo-300 font-medium">
                  {generateStatus || "Rendering Anima..."}
                </span>
              </>
            ) : (
              <>
                <ImageIcon className="w-6 h-6 text-zinc-700" />
                <span className="text-xs text-zinc-500 font-medium">
                  Not generated yet
                </span>
              </>
            )}
          </div>
        )}

        <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur rounded-lg border border-white/10 flex items-center gap-1.5 text-[11px] font-semibold text-white">
          {icon}
          <span>{title}</span>
        </div>
      </div>

      <div className="p-3 flex items-center justify-between bg-zinc-900/60 border-t border-zinc-800/80">
        <span className="text-[11px] text-zinc-400 font-medium">
          {imageUrl ? "Ready on Stage" : "Empty Scenery"}
        </span>
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
        >
          {isGenerating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          )}
          <span>{imageUrl ? "Regenerate" : "Generate"}</span>
        </button>
      </div>
    </div>
  );
};
