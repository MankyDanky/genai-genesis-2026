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
          className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          Clear
        </button>
      </div>

      <div className="flex-1 overflow-auto font-[var(--font-mono)] text-[11px]">
        {rows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
            No console logs
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
