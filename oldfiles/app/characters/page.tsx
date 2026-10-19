"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useApiKey } from "@/components/ApiKeyProvider";
import CharacterLibrary from "@/components/character/CharacterLibrary";
import SceneStudio from "@/components/character/SceneStudio";
import UserSettingsModal from "@/components/UserSettingsModal";
import { CharacterRecord } from "@/lib/characters";

export default function CharactersPage() {
  const { authFetch } = useApiKey();

  const [activeTab, setActiveTab] = useState<"library" | "scene">("library");
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sceneInitialTag, setSceneInitialTag] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Load characters
  const loadCharacters = async () => {
    try {
      const res = await authFetch("/api/characters");
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && Array.isArray(data.characters)) {
        setCharacters(data.characters);
      }
    } catch (err) {
      console.error("Failed to load characters:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCharacters();
  }, [authFetch]);

  const handleDeleteCharacter = async (id: string) => {
    try {
      const res = await authFetch(`/api/characters/${id}`, { method: "DELETE" });
      if (res.ok) {
        setCharacters((prev) => prev.filter((c) => c.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete character:", err);
    }
  };

  const handleUseInScene = (tag: string) => {
    setSceneInitialTag(tag);
    setActiveTab("scene");
  };

  return (
    <main className="shell shell-wide">
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <Link href="/" className="brand" style={{ margin: 0 }}>
          <span className="dot" />
          STUDIO &middot; CHARACTERS & SCENES
        </Link>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            className="history-btn"
            onClick={() => setShowSettings(true)}
            style={{ fontSize: "0.82rem" }}
          >
            ⚙️ AI Settings
          </button>
          <Link
            href="/character-maker"
            className="generate"
            style={{ textDecoration: "none", fontSize: "0.82rem", padding: "8px 16px" }}
          >
            ✨ New Character
          </Link>
        </div>
      </div>

      <h1 className="title" style={{ marginBottom: "8px" }}>Character Roster & Scene Studio</h1>
      <p className="subtitle" style={{ marginBottom: "28px" }}>
        Inspect your persistent characters, view exact seeds and parameters, and compose scenes with <code style={{ color: "var(--blue)" }}>#character</code> tags.
      </p>

      {/* Tabs Navigation */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          borderBottom: "1px solid var(--panel-border)",
          marginBottom: "28px",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("library")}
          style={{
            padding: "10px 18px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "library" ? "2px solid var(--blue)" : "2px solid transparent",
            color: activeTab === "library" ? "var(--text)" : "var(--muted)",
            fontWeight: activeTab === "library" ? 600 : 400,
            cursor: "pointer",
            fontSize: "0.92rem",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>👥</span> Saved Characters ({characters.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("scene")}
          style={{
            padding: "10px 18px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "scene" ? "2px solid var(--blue)" : "2px solid transparent",
            color: activeTab === "scene" ? "var(--text)" : "var(--muted)",
            fontWeight: activeTab === "scene" ? 600 : 400,
            cursor: "pointer",
            fontSize: "0.92rem",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>🎬</span> Scene Studio
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "library" ? (
        <CharacterLibrary
          characters={characters}
          loading={loading}
          onDeleteCharacter={handleDeleteCharacter}
          onUseInScene={handleUseInScene}
        />
      ) : (
        <SceneStudio
          characters={characters}
          initialTag={sceneInitialTag}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} />}
    </main>
  );
}
