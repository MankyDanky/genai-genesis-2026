"use client";

import { useEffect } from "react";

interface SandboxProps {
  code: string | null;
}

export function Sandbox({ code }: SandboxProps) {
  useEffect(() => {
    console.log("[Sandbox] Code updated:", code ? `${code.length} chars` : "null");
  }, [code]);

  if (!code) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-[var(--color-bg)] overflow-hidden">
        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(var(--color-text-muted) 1px, transparent 1px), linear-gradient(90deg, var(--color-text-muted) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        {/* Crosshair */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[var(--color-border)] opacity-50" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-[var(--color-border)] opacity-50" />
        {/* Accent dot at center */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 border border-[var(--color-accent)] opacity-30 rounded-full" />

        {/* Center label */}
        <div className="relative text-center animate-[fadeIn_0.4s_ease-out] space-y-3">
          {/* Icon */}
          <div className="mx-auto w-10 h-10 border border-[var(--color-border-light)] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2">
              <rect x="1" y="1" width="14" height="14" rx="1" />
              <polygon points="6,4 12,8 6,12" fill="var(--color-text-muted)" opacity="0.5" stroke="none" />
            </svg>
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.15em] font-semibold">
            No Game Loaded
          </p>
          <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
            Use the Composer to generate a game
          </p>
        </div>

        {/* Status bar */}
        <div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex items-center justify-between">
          <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">
            Canvas
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)] tracking-wider">
            idle
          </span>
        </div>
      </div>
    );
  }

  return (
    <iframe
      key={code}
      srcDoc={code}
      sandbox="allow-scripts"
      title="Game Preview"
      className="h-full w-full border-none"
    />
  );
}
