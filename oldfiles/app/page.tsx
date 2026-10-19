import Image from "next/image";
import Link from "next/link";
import UserStats from "@/components/UserStats";
import HomeModes from "@/components/HomeModes";

export default function Home() {
  return (
    <main className="shell">
      <Link href="/" className="brand">
        <Image
          src="/icon.png"
          alt="QuackStudios logo"
          width={28}
          height={28}
          priority
          style={{ borderRadius: "6px", objectFit: "cover" }}
        />
        Welcome to QuackStudios
      </Link>
      <h1 className="title">Turn a prompt into motion.</h1>
      <p className="subtitle">
        Two ways in: write a scene from scratch, or bring a still image to life.
        Rendered on your own GPU, delivered as a clean video file.
      </p>
      <HomeModes />

      <UserStats />
    </main>
  );
}
