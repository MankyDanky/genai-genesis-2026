"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const MESSAGES = [
  "Booting up the game engine...",
  "Loading assets into VRAM...",
  "Calibrating physics engine...",
  "Rendering first frame...",
  "Warming up the GPU...",
  "Initializing the pixel forge...",
  "Dusting off the sprite sheets...",
  "Pressing START...",
];

const CYCLE_MS = 2500;

export default function PlayLoading() {
  const [index, setIndex] = useState(
    () => Math.floor(Math.random() * MESSAGES.length),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % MESSAGES.length);
    }, CYCLE_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)]">
      <div className="flex flex-col items-center gap-5">
        {/* Spinning Axiom logo */}
        <Image
          src="/axiom.png"
          alt="Loading"
          width={48}
          height={48}
          className="animate-spin"
          style={{ animationDuration: "1.8s" }}
          priority
        />

        {/* Rotating message with animated text swap */}
        <p
          key={index}
          className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]"
          style={{ animation: `loadingTextSwap ${CYCLE_MS}ms ease-in-out both` }}
        >
          {MESSAGES[index]}
        </p>
      </div>
    </div>
  );
}
