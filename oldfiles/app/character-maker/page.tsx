import { Suspense } from "react";
import Link from "next/link";
import CharacterMakerStudio from "@/components/character/CharacterMakerStudio";

export default function CharacterMakerPage() {
  return (
    <main className="shell shell-wide">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <Link href="/" className="brand" style={{ margin: 0 }}>
          <span className="dot" />
          STUDIO &middot; CHARACTER MAKER
        </Link>
        <Link
          href="/characters"
          className="history-btn"
          style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.84rem" }}
        >
          <span>👥</span> Character Library & Scenes &rarr;
        </Link>
      </div>

      <h1 className="title" style={{ marginBottom: "8px" }}>Character Creator</h1>
      <p className="subtitle" style={{ marginBottom: "28px" }}>
        Iteratively sculpt and refine persistent characters using natural language chat on the left and live GPU rendering on the right.
      </p>

      <Suspense fallback={<div className="beam" />}>
        <CharacterMakerStudio />
      </Suspense>
    </main>
  );
}
