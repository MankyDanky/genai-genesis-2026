"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

interface SplashScreenProps {
  onDismiss: () => void;
}

export function SplashScreen({ onDismiss }: SplashScreenProps) {
  const [phase, setPhase] = useState<"visible" | "exiting">("visible");

  const handleStart = () => {
    setPhase("exiting");
    setTimeout(() => {
      onDismiss();
    }, 500);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--color-bg)]"
      style={{
        opacity: phase === "exiting" ? 0 : 1,
        transform: phase === "exiting" ? "scale(1.05)" : "scale(1)",
        filter: phase === "exiting" ? "blur(6px)" : "blur(0px)",
        transition: "opacity 0.5s ease, transform 0.5s ease, filter 0.5s ease",
      }}
    >
      {/* Grid background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            repeating-linear-gradient(0deg, var(--color-border) 0px, transparent 1px, transparent 40px),
            repeating-linear-gradient(90deg, var(--color-border) 0px, transparent 1px, transparent 40px)
          `,
          opacity: 0.4,
        }}
      />

      {/* Radial glow */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(circle at center, var(--color-accent-glow-strong) 0%, transparent 60%)",
          animation: "splashGridPulse 4s ease-in-out infinite",
        }}
      />

      {/* Content */}
      <div className="relative flex flex-col items-center gap-6 animate-[fadeIn_0.6s_ease-out]">
        <Image
          src="/axiom.png"
          alt="AXIOM"
          width={64}
          height={64}
          priority
        />

        <div className="flex flex-col items-center gap-2">
          <h1
            className="text-[24px] font-bold text-[var(--color-text)] tracking-[0.3em] uppercase"
          >
            AXIOM
          </h1>
          <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.15em]">
            AI-Powered Game Engine
          </p>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleStart}
            className="gf-btn-primary px-6 py-2.5 bg-[var(--color-accent)] text-[var(--color-bg)] text-[11px] font-bold uppercase tracking-[0.15em] border-none cursor-pointer"
          >
            Start Building
          </button>
          <Link
            href="/explore"
            className="gf-btn-chip px-6 py-2.5 border border-[var(--color-border-light)] bg-transparent text-[var(--color-text-secondary)] text-[11px] font-bold uppercase tracking-[0.15em] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
          >
            Explore
          </Link>
        </div>
      </div>
    </div>
  );
}
