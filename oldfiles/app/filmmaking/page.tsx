"use client";

import Link from "next/link";
import { useApiKey } from "@/components/ApiKeyProvider";
import FilmStudio from "@/components/film/FilmStudio";

export default function Filmmaking() {
  const { capabilities } = useApiKey();

  if (!capabilities.canAccessFilmmaking) {
    return (
      <main className="shell">
        <Link href="/" className="brand">
          <span className="dot" />
          STUDIO
        </Link>
        <h1 className="title">Filmmaking</h1>
        <p className="subtitle">This experimental studio isn&apos;t enabled on your account.</p>
      </main>
    );
  }

  return (
    <main className="shell shell-wide">
      <Link href="/" className="brand">
        <span className="dot" />
        STUDIO
      </Link>
      <h1 className="title">Filmmaking</h1>
      <p className="subtitle">
        Chain clips from a chosen frame. Character, lighting, and space hold; you write the next action.
      </p>
      <FilmStudio />
    </main>
  );
}
