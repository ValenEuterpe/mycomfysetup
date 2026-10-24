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
  Dices,
  Layers,
  Edit3,
  ShieldCheck,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { VNWorld, VNLocation, VNTab } from "../../types/visualNovel";
import { executeLocationGeneration } from "../../lib/visualNovelEngine";

interface WorldStudioProps {
  worlds: VNWorld[];
  onSaveWorld: (world: VNWorld) => void;
  onDeleteWorld: (id: string) => void;
  endpoint: string;
  onNavigateTab?: (tab: VNTab) => void;
}

const STRUCTURAL_PRESETS = [
  {
    label: "Rustic Thatched Shelter",
    value:
      "a single small weathered open-air bamboo shelter with rough wooden stilt posts and a shaggy dried palm-thatch roof situated on the far right sand dunes",
  },
  {
    label: "Untouched Nature (0 Buildings)",
    value:
      "completely untouched wild nature with zero buildings, no huts, no houses, no man-made structures",
  },
  {
    label: "Survivor Bamboo Lean-To",
    value:
      "a single small A-frame survival lean-to shelter made of tied bamboo poles and woven green palm fronds on the left side of the clearing",
  },
  {
    label: "Cozy Wooden Cabin",
    value:
      "a single rustic log cabin with rough-hewn pine timber walls, a dark slate pitched roof, and small multi-pane glass windows on the left clearing",
  },
  {
    label: "Open-Air Seaside Cafe",
    value:
      "a small open-air coastal cafe pavilion with weathered whitewashed timber beams, a blue canvas awning, and simple wooden bistro tables",
  },
];

const LANDMARK_PRESETS = [
  {
    label: "Coastal Beach Dunes",
    value:
      "three tall leaning coconut palm trees clustered on the far right sand dunes behind the shelter, dark jagged volcanic rocks jutting into the surf on the left coastline, weathered gray driftwood logs and smooth sea pebbles resting on the damp packed sand in the immediate foreground",
  },
  {
    label: "Jungle Camp Clearing",
    value:
      "a circular stone-lined campfire pit with weathered gray river stones and smoldering blackened charcoal in the center foreground, tall bamboo thickets framing the background, hanging jungle vines draping down from canopy trees",
  },
  {
    label: "Ocean Cliff Vista",
    value:
      "craggy dark basalt rock ledge extending toward the edge on the right, wild coastal grass and hardy blooming purple sea lavender clinging to rock crevices, distant ocean horizon meeting the sky",
  },
];

const VANTAGE_PRESETS = [
  {
    label: "Wide Shoreline Vista",
    value:
      "fixed wide-angle eye-level landscape shot from the dry sandy shoreline looking across the beach toward the turquoise ocean waves",
  },
  {
    label: "Medium Eye-Level Clearing",
    value:
      "fixed medium-wide eye-level perspective centered on the clearing and foreground campfire",
  },
  {
    label: "High Plateau Cliff Edge",
    value:
      "fixed wide-angle landscape vista shot standing on the rocky plateau looking out toward the ocean horizon",
  },
];

export const WorldStudio: React.FC<WorldStudioProps> = ({
  worlds,
  onSaveWorld,
  onDeleteWorld,
  endpoint,
  onNavigateTab,
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
  const [newStructuralAnchor, setNewStructuralAnchor] = useState<string>(
    STRUCTURAL_PRESETS[0].value
  );
  const [newLandmarkAnchor, setNewLandmarkAnchor] = useState<string>(
    LANDMARK_PRESETS[0].value
  );
  const [newVantagePoint, setNewVantagePoint] = useState<string>(
    VANTAGE_PRESETS[0].value
  );
  const [newIsInterior, setNewIsInterior] = useState<boolean>(false);
  const [newSeed, setNewSeed] = useState<number>(() =>
    Math.floor(Math.random() * 1000000000)
  );

  // Edit Location state
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<VNLocation>>({});

  // Generation state
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [generateStatus, setGenerateStatus] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  // Add new location
  const handleAddLocation = () => {
    if (!newLocName.trim() || !newLocPrompt.trim()) {
      setFormError("Location name and scenery prompt are required.");
      return;
    }
    setFormError(null);

    const newLoc: VNLocation = {
      id: `loc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: newLocName.trim(),
      description: newLocDesc.trim() || newLocName.trim(),
      prompt: newLocPrompt.trim(),
      structuralAnchor: newStructuralAnchor.trim(),
      landmarkAnchor: newLandmarkAnchor.trim(),
      vantagePoint: newVantagePoint.trim(),
      isInterior: newIsInterior,
      seed: newSeed,
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
    setNewStructuralAnchor(STRUCTURAL_PRESETS[0].value);
    setNewLandmarkAnchor(LANDMARK_PRESETS[0].value);
    setNewVantagePoint(VANTAGE_PRESETS[0].value);
    setNewIsInterior(false);
    setNewSeed(Math.floor(Math.random() * 1000000000));
    setIsAddingLocation(false);
  };

  // Start editing a location
  const handleStartEdit = (loc: VNLocation) => {
    setEditingLocId(loc.id);
    setEditForm({
      name: loc.name,
      description: loc.description,
      prompt: loc.prompt,
      structuralAnchor: loc.structuralAnchor || "",
      landmarkAnchor: loc.landmarkAnchor || "",
      vantagePoint: loc.vantagePoint || "",
      isInterior: loc.isInterior || false,
      seed: loc.seed !== undefined ? loc.seed : Math.floor(Math.random() * 1000000000),
    });
  };

  // Save edited location
  const handleSaveEdit = (locId: string) => {
    const updatedWorld: VNWorld = {
      ...activeWorld,
      locations: activeWorld.locations.map((loc) => {
        if (loc.id !== locId) return loc;
        return {
          ...loc,
          name: editForm.name?.trim() || loc.name,
          description: editForm.description?.trim() || loc.description,
          prompt: editForm.prompt?.trim() || loc.prompt,
          structuralAnchor: editForm.structuralAnchor?.trim(),
          landmarkAnchor: editForm.landmarkAnchor?.trim(),
          vantagePoint: editForm.vantagePoint?.trim(),
          isInterior: editForm.isInterior ?? loc.isInterior,
          seed: editForm.seed !== undefined ? editForm.seed : loc.seed,
        };
      }),
    };
    onSaveWorld(updatedWorld);
    setEditingLocId(null);
    setEditForm({});
  };

  // Delete a location
  const handleDeleteLocation = (locId: string) => {
    const updatedWorld: VNWorld = {
      ...activeWorld,
      locations: activeWorld.locations.filter((l) => l.id !== locId),
    };
    onSaveWorld(updatedWorld);
  };

  // Re-roll seed for a location
  const handleRollNewSeed = (loc: VNLocation) => {
    const newRandomSeed = Math.floor(Math.random() * 1000000000);
    const updatedLoc: VNLocation = { ...loc, seed: newRandomSeed };
    const updatedWorld: VNWorld = {
      ...activeWorld,
      locations: activeWorld.locations.map((l) =>
        l.id === loc.id ? updatedLoc : l
      ),
    };
    onSaveWorld(updatedWorld);
  };

  // Generate a single Time-of-Day variation for a location
  const handleGenerateTimeVariant = async (
    location: VNLocation,
    timeOfDay: "day" | "evening" | "night"
  ) => {
    const key = `${location.id}_${timeOfDay}`;
    setGeneratingKey(key);
    setGenerateStatus(`Generating ${timeOfDay} scenery...`);
    setFormError(null);

    try {
      const activeSeed =
        location.seed !== undefined
          ? location.seed
          : Math.floor(Math.random() * 1000000000);

      const media = await executeLocationGeneration(endpoint, {
        location,
        timeOfDay,
        seed: activeSeed,
        onProgress: (_, status) => setGenerateStatus(status),
      });

      const updatedLoc: VNLocation = {
        ...location,
        seed: activeSeed,
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

  // Generate all 3 Time-of-Day variations in sequence with locked seed
  const handleGenerateAllVariants = async (loc: VNLocation) => {
    const times: Array<"day" | "evening" | "night"> = ["day", "evening", "night"];
    const activeSeed =
      loc.seed !== undefined
        ? loc.seed
        : Math.floor(Math.random() * 1000000000);

    let currentLoc: VNLocation = { ...loc, seed: activeSeed };

    for (let i = 0; i < times.length; i++) {
      const timeOfDay = times[i];
      const key = `${loc.id}_${timeOfDay}`;
      setGeneratingKey(key);
      setGenerateStatus(
        `[${i + 1}/3] Generating ${timeOfDay} scenery (Seed: #${activeSeed})...`
      );

      try {
        const media = await executeLocationGeneration(endpoint, {
          location: currentLoc,
          timeOfDay,
          seed: activeSeed,
          onProgress: (_, status) =>
            setGenerateStatus(`[${i + 1}/3] ${timeOfDay}: ${status}`),
        });

        currentLoc = {
          ...currentLoc,
          timeVariants: {
            ...currentLoc.timeVariants,
            [timeOfDay]: media.url,
          },
        };

        const updatedWorld: VNWorld = {
          ...activeWorld,
          locations: activeWorld.locations.map((l) =>
            l.id === loc.id ? currentLoc : l
          ),
        };
        onSaveWorld(updatedWorld);
      } catch (err: any) {
        setFormError(err.message || `Failed to generate ${timeOfDay} variant.`);
        break;
      }
    }

    setGeneratingKey(null);
    setGenerateStatus("");
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
            Location Anchors & Lighting Consistency
          </h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Lock camera vantage points, structural architecture (e.g. rustic hut vs. untouched nature),
            and landmark positions across{" "}
            <span className="text-zinc-200 font-semibold">Day</span>,{" "}
            <span className="text-zinc-200 font-semibold">Evening Sunset</span>, and{" "}
            <span className="text-zinc-200 font-semibold">Night</span> using unified latent seeds.
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
        <div className="bg-zinc-900 border border-indigo-500/40 rounded-3xl p-6 flex flex-col gap-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-400" />
              Create Consistent Location
            </h3>
            <span className="text-xs text-zinc-500">Modular Location Anchor Blueprint</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-400">Location Name</label>
              <input
                type="text"
                placeholder="e.g. Sandy Coastline, Survivor Jungle Camp..."
                value={newLocName}
                onChange={(e) => setNewLocName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-400">Short Summary</label>
              <input
                type="text"
                placeholder="e.g. White sandy shore with a small bamboo shelter and coastal rocks"
                value={newLocDesc}
                onChange={(e) => setNewLocDesc(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Base Scenery Prompt */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400">
              1. Base Scenery / Terrain (No humans)
            </label>
            <input
              type="text"
              placeholder="e.g. pristine sandy beach shoreline meeting rolling turquoise ocean surf waves"
              value={newLocPrompt}
              onChange={(e) => setNewLocPrompt(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          {/* Camera Vantage Point */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-400">
                2. Camera Vantage Point & Perspective
              </label>
              <div className="flex items-center gap-1.5">
                {VANTAGE_PRESETS.map((vp) => (
                  <button
                    key={vp.label}
                    type="button"
                    onClick={() => setNewVantagePoint(vp.value)}
                    className="text-[10px] px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition"
                  >
                    {vp.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="text"
              placeholder="e.g. fixed wide-angle eye-level landscape shot from the dry sandy shoreline looking across the beach"
              value={newVantagePoint}
              onChange={(e) => setNewVantagePoint(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          {/* Structural Anchor */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-indigo-400">
                3. Structural Anchor (Explicit Building OR Explicit Absence)
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {STRUCTURAL_PRESETS.map((sp) => (
                  <button
                    key={sp.label}
                    type="button"
                    onClick={() => setNewStructuralAnchor(sp.value)}
                    className="text-[10px] px-2 py-0.5 bg-indigo-950/70 border border-indigo-800/50 hover:bg-indigo-900/80 text-indigo-200 rounded-md transition"
                  >
                    {sp.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={2}
              placeholder="e.g. a single small weathered open-air bamboo shelter with rough wooden stilt posts and a shaggy dried palm-thatch roof situated on the far right sand dunes"
              value={newStructuralAnchor}
              onChange={(e) => setNewStructuralAnchor(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono resize-none"
            />
            <span className="text-[11px] text-zinc-500">
              Crucial: Explicitly specify the building materials & position, OR declare "completely untouched wild nature with zero buildings".
            </span>
          </div>

          {/* Landmark Anchor */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-400">
                4. Fixed Landmark & Spatial Composition
              </label>
              <div className="flex items-center gap-1.5">
                {LANDMARK_PRESETS.map((lp) => (
                  <button
                    key={lp.label}
                    type="button"
                    onClick={() => setNewLandmarkAnchor(lp.value)}
                    className="text-[10px] px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition"
                  >
                    {lp.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={2}
              placeholder="e.g. three tall leaning coconut palm trees clustered on the far right dunes behind the shelter, dark jagged volcanic rocks jutting into surf on left"
              value={newLandmarkAnchor}
              onChange={(e) => setNewLandmarkAnchor(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono resize-none"
            />
          </div>

          {/* Seed and Interior Option */}
          <div className="flex items-center justify-between flex-wrap gap-4 pt-1">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5">
                <span className="text-xs text-zinc-400 font-semibold">Locked Seed:</span>
                <input
                  type="number"
                  value={newSeed}
                  onChange={(e) => setNewSeed(parseInt(e.target.value) || 0)}
                  className="w-28 bg-transparent text-sm font-mono text-zinc-200 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setNewSeed(Math.floor(Math.random() * 1000000000))}
                  className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
                  title="Roll New Random Seed"
                >
                  <Dices className="w-3.5 h-3.5" />
                </button>
              </div>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newIsInterior}
                  onChange={(e) => setNewIsInterior(e.target.checked)}
                  className="rounded border-zinc-700 text-indigo-600 focus:ring-0"
                />
                <span>Interior / Indoor Room</span>
              </label>
            </div>

            <div className="flex items-center gap-3">
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
        </div>
      )}

      {/* Locations Grid */}
      <div className="flex flex-col gap-6">
        {activeWorld.locations.map((loc) => {
          const isEditing = editingLocId === loc.id;
          const isGeneratingAny =
            generatingKey === `${loc.id}_day` ||
            generatingKey === `${loc.id}_evening` ||
            generatingKey === `${loc.id}_night`;

          return (
            <div
              key={loc.id}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-5 shadow-xl transition-all"
            >
              {/* Header */}
              <div className="flex items-start justify-between flex-wrap gap-4 border-b border-zinc-800/80 pb-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-950/60 border border-indigo-800/40 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold text-white tracking-wide">
                        {loc.name}
                      </h3>
                      {loc.seed !== undefined && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-950 border border-zinc-800 rounded-md text-[11px] font-mono text-zinc-400">
                          <span>Seed: #{loc.seed}</span>
                          <button
                            type="button"
                            onClick={() => handleRollNewSeed(loc)}
                            className="text-zinc-500 hover:text-white transition ml-1"
                            title="Roll New Random Seed for this location"
                          >
                            <Dices className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      {loc.isInterior && (
                        <span className="px-2 py-0.5 bg-amber-950/60 border border-amber-800/40 text-amber-300 rounded text-[10px] font-semibold">
                          Interior
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-zinc-400">{loc.description}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* One-Click Batch Generate All 3 Times */}
                  <button
                    type="button"
                    onClick={() => handleGenerateAllVariants(loc)}
                    disabled={isGeneratingAny}
                    className="px-3.5 py-1.5 bg-indigo-600/90 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition"
                    title="Generate Day, Sunset, and Night in sequence with locked seed"
                  >
                    {isGeneratingAny ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                    )}
                    <span>Generate All 3 Times</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => (isEditing ? setEditingLocId(null) : handleStartEdit(loc))}
                    className="p-2 text-zinc-400 hover:text-white transition rounded-xl hover:bg-zinc-800"
                    title="Edit Location Anchors"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteLocation(loc.id)}
                    className="p-2 text-zinc-500 hover:text-red-400 transition rounded-xl hover:bg-zinc-800"
                    title="Delete Location"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Anchor Inspector / Edit Form */}
              {isEditing ? (
                <div className="bg-zinc-950 border border-indigo-500/30 rounded-2xl p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <span className="text-xs font-bold text-indigo-300">
                      Edit Modular Anchors for {loc.name}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-zinc-400">Name</label>
                      <input
                        type="text"
                        value={editForm.name || ""}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-zinc-400">Summary</label>
                      <input
                        type="text"
                        value={editForm.description || ""}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-zinc-400">Base Scenery</label>
                    <input
                      type="text"
                      value={editForm.prompt || ""}
                      onChange={(e) => setEditForm({ ...editForm, prompt: e.target.value })}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-zinc-400">Vantage Point</label>
                    <input
                      type="text"
                      value={editForm.vantagePoint || ""}
                      onChange={(e) => setEditForm({ ...editForm, vantagePoint: e.target.value })}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-indigo-400">
                      Structural Anchor (Hut vs Modern Building vs Untouched Nature)
                    </label>
                    <textarea
                      rows={2}
                      value={editForm.structuralAnchor || ""}
                      onChange={(e) => setEditForm({ ...editForm, structuralAnchor: e.target.value })}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-zinc-400">Landmark Composition</label>
                    <textarea
                      rows={2}
                      value={editForm.landmarkAnchor || ""}
                      onChange={(e) => setEditForm({ ...editForm, landmarkAnchor: e.target.value })}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1">
                        <span className="text-[11px] text-zinc-400">Seed:</span>
                        <input
                          type="number"
                          value={editForm.seed || 0}
                          onChange={(e) => setEditForm({ ...editForm, seed: parseInt(e.target.value) || 0 })}
                          className="w-24 bg-transparent text-xs font-mono text-zinc-200 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setEditForm({ ...editForm, seed: Math.floor(Math.random() * 1000000000) })}
                          className="p-0.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"
                          title="Roll Seed"
                        >
                          <Dices className="w-3 h-3" />
                        </button>
                      </div>

                      <label className="flex items-center gap-1.5 text-xs text-zinc-300">
                        <input
                          type="checkbox"
                          checked={editForm.isInterior || false}
                          onChange={(e) => setEditForm({ ...editForm, isInterior: e.target.checked })}
                          className="rounded border-zinc-700 text-indigo-600 focus:ring-0"
                        />
                        <span>Interior</span>
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingLocId(null)}
                        className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(loc.id)}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition"
                      >
                        Save Anchors
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Compact Anchor Summary Display */
                (loc.structuralAnchor || loc.landmarkAnchor) && (
                  <div className="bg-zinc-950/80 border border-zinc-800/70 rounded-2xl p-3.5 flex flex-col gap-1.5 text-xs">
                    {loc.structuralAnchor && (
                      <div className="flex items-start gap-2">
                        <span className="font-semibold text-indigo-300 shrink-0">Structure:</span>
                        <span className="text-zinc-300 font-mono text-[11px] leading-relaxed">
                          {loc.structuralAnchor}
                        </span>
                      </div>
                    )}
                    {loc.landmarkAnchor && (
                      <div className="flex items-start gap-2">
                        <span className="font-semibold text-zinc-400 shrink-0">Landmarks:</span>
                        <span className="text-zinc-400 font-mono text-[11px] leading-relaxed">
                          {loc.landmarkAnchor}
                        </span>
                      </div>
                    )}
                  </div>
                )
              )}

              {/* Time Variants Cards (Day, Evening, Night) */}
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
          );
        })}
      </div>

      {/* Pipeline Navigation Footer */}
      {onNavigateTab && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl mt-4">
          <button
            type="button"
            onClick={() => onNavigateTab("sprites")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white transition"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Step 3: Sprites & Emotions</span>
          </button>

          <span className="text-xs text-zinc-500 font-mono hidden sm:inline">
            Pipeline: Step 4 of 5
          </span>

          <button
            type="button"
            onClick={() => onNavigateTab("story")}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-xs font-bold text-white transition shadow-md shadow-fuchsia-600/20"
          >
            <span>Proceed to Step 5: Story Director</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
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
                  {generateStatus || "Rendering Anima scenery..."}
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
