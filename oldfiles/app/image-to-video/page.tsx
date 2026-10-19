import { Suspense } from "react";
import Link from "next/link";
import GeneratorForm from "@/components/GeneratorForm";

export default function ImageToVideo() {
  return (
    <main className="shell shell-wide">
      <Link href="/" className="brand">
        <span className="dot" />
        STUDIO
      </Link>
      <h1 className="title">Image to video</h1>
      <p className="subtitle">Upload a still and describe how it should come alive.</p>
      {/* GeneratorForm reads ?prompt= for history's Reuse link, and
          useSearchParams needs a Suspense boundary to prerender. */}
      <Suspense fallback={<div className="beam" />}>
        <GeneratorForm mode="i2v" />
      </Suspense>
    </main>
  );
}
