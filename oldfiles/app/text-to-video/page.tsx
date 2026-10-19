import { Suspense } from "react";
import Link from "next/link";
import GeneratorForm from "@/components/GeneratorForm";

export default function TextToVideo() {
  return (
    <main className="shell shell-wide">
      <Link href="/" className="brand">
        <span className="dot" />
        STUDIO
      </Link>
      <h1 className="title">Text to video</h1>
      <p className="subtitle">Describe the scene, the shots, and the sound. The model does the rest.</p>
      {/* GeneratorForm reads ?prompt= for history's Reuse link, and
          useSearchParams needs a Suspense boundary to prerender. */}
      <Suspense fallback={<div className="beam" />}>
        <GeneratorForm mode="t2v" />
      </Suspense>
    </main>
  );
}
