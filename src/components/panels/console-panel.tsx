"use client";

import { useMemo } from "react";
import { useGameForge } from "@/lib/game-forge-context";

function levelColor(level: "log" | "info" | "warn" | "error") {
  if (level === "error") return "text-[var(--color-danger)]";
  if (level === "warn") return "text-[#d4a017]";
  if (level === "info") return "text-[var(--color-accent)]";
  return "text-[var(--color-text-secondary)]";
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export function ConsolePanel() {
  const { consoleLogs, clearConsoleLogs } = useGameForge();
  const rows = useMemo(() => [...consoleLogs].reverse(), [consoleLogs]);

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      <div className="px-3 py-1.5 border-b border-[var(--color-border)] flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Runtime Console</span>
        <button
          type="button"
          onClick={clearConsoleLogs}
          className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          Clear
        </button>
      </div>

      <div className="flex-1 overflow-auto font-[var(--font-mono)] text-[11px]">
        {rows.length === 0 ? (
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
            <div className="relative text-center animate-[fadeIn_0.4s_ease-out] space-y-3">
              <div className="mx-auto w-10 h-10 border border-[var(--color-border-light)] flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2">
                  <rect x="1" y="1" width="14" height="14" rx="1" />
                  <path d="M4 5l3 3-3 3" />
                  <line x1="8.5" y1="11" x2="12" y2="11" />
                </svg>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.15em] font-semibold">
                No Console Logs
              </p>
              <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
                Run a game to capture runtime output
              </p>
            </div>
          </div>
        ) : (
          rows.map((entry) => (
            <div key={entry.id} className="px-3 py-1.5 border-b border-[var(--color-border)]/50">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                <span>{formatTime(entry.timestamp)}</span>
                <span className={levelColor(entry.level)}>{entry.level}</span>
                <span>{entry.source}</span>
              </div>
              <pre className={`whitespace-pre-wrap break-words ${levelColor(entry.level)}`}>{entry.text}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
