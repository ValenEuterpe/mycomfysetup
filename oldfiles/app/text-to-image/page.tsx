import { Suspense } from "react";
import Link from "next/link";
import ImageGeneratorForm from "@/components/ImageGeneratorForm";

export default function TextToImage() {
  return (
    <main className="shell shell-wide">
      <Link href="/" className="brand">
        <span className="dot" />
        STUDIO
      </Link>
      <h1 className="title">Text to image</h1>
      <p className="subtitle">
        Describe the scene, subject, lighting, and style. Powered by the Anima base model.
      </p>
      {/* ImageGeneratorForm reads ?prompt= for history's Reuse link, and
          useSearchParams needs a Suspense boundary to prerender. */}
      <Suspense fallback={<div className="beam" />}>
        <ImageGeneratorForm />
      </Suspense>
    </main>
  );
}
