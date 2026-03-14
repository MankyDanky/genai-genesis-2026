"use client";

import { useGameForge } from "@/lib/game-forge-context";

export function CodePanel() {
  const { currentCode } = useGameForge();

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      {currentCode ? (
        <pre className="flex-1 overflow-auto px-4 py-3 text-[11px] text-[var(--color-text-secondary)] leading-[1.7] whitespace-pre font-[var(--font-mono)] selection:bg-[var(--color-accent-glow-strong)]">
          {currentCode}
        </pre>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border border-dashed border-[var(--color-border-light)] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2" opacity="0.6">
              <polyline points="6,4 2,10 6,16" />
              <polyline points="14,4 18,10 14,16" />
              <line x1="11" y1="3" x2="9" y2="17" />
            </svg>
          </div>
          <div className="text-center space-y-1">
            <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.12em] font-semibold">
              No Code Yet
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
              Generated source will appear here
            </p>
          </div>
        </div>
      )}
      <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex items-center justify-between shrink-0">
        <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">
          Source
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)] tracking-wider">
          {currentCode ? `${currentCode.length} chars` : "empty"}
        </span>
      </div>
    </div>
  );
}
