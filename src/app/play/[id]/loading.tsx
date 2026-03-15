"use client";

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
        {/* Spinner */}
        <div className="h-6 w-6 animate-spin border-2 border-[var(--color-border-light)] border-t-[var(--color-accent)]" />

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
