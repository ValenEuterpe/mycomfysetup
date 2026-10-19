"use client";

import Link from "next/link";
import { useApiKey } from "./ApiKeyProvider";

export default function HomeModes() {
  const { capabilities } = useApiKey();

  return (
    <div className="mode-grid">
      <Link href="/character-maker" className="mode-card">
        <div className="eyebrow">Creative Assistant</div>
        <h2>Character Maker</h2>
        <p>Chat with the AI character designer to sculpt persistent characters with exact seed control.</p>
      </Link>
      <Link href="/characters" className="mode-card">
        <div className="eyebrow">Library & Re-use</div>
        <h2>Characters & Scenes</h2>
        <p>Manage your character roster and compose multi-character scenes using #hashtag tags.</p>
      </Link>
      <Link href="/text-to-image" className="mode-card">
        <div className="eyebrow">Text → Image</div>
        <h2>Generate Stills</h2>
        <p>High-resolution art and character stills generated with the Anima base model.</p>
      </Link>
      <Link href="/text-to-video" className="mode-card">
        <div className="eyebrow">Text → Video</div>
        <h2>Write the scene</h2>
        <p>Describe shots, camera moves, and audio. The model builds the clip from words alone.</p>
      </Link>
      <Link href="/image-to-video" className="mode-card">
        <div className="eyebrow">Image → Video</div>
        <h2>Animate a still</h2>
        <p>Upload a photo or render and describe how it should move, light, and cut.</p>
      </Link>
      {capabilities.canAccessFilmmaking && (
        <Link href="/filmmaking" className="mode-card">
          <div className="eyebrow">Experimental</div>
          <h2>Filmmaking</h2>
          <p>Chain clips from a chosen frame so character, lighting, and space hold across shots.</p>
        </Link>
      )}
    </div>
  );
}
