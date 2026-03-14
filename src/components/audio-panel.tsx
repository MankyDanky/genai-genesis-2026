"use client";

import type { AudioTrack } from "@/lib/game-forge-context";

interface AudioPanelProps {
  tracks: AudioTrack[];
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || Number.isNaN(seconds)) return "Unknown";
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function AudioPanel({ tracks }: AudioPanelProps) {
  if (tracks.length === 0) {
    return (
      <div className="flex h-full flex-col bg-[var(--color-bg)]">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border border-dashed border-[var(--color-border-light)] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2" opacity="0.6">
              <path d="M5 8h3l5-3v10l-5-3H5z" />
              <line x1="15" y1="7" x2="17" y2="9" />
              <line x1="17" y1="11" x2="15" y2="13" />
            </svg>
          </div>
          <div className="text-center space-y-1">
            <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.12em] font-semibold">
              No Audio Yet
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
              Generated music and SFX will appear here
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[var(--color-bg)] overflow-y-auto p-2 space-y-2">
      {tracks.map((track) => (
        <div
          key={track.id}
          className="border border-[var(--color-border-light)] bg-[var(--color-surface)] px-2 py-1.5"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-[var(--color-text)] uppercase tracking-[0.08em] font-semibold truncate">
              {track.name}
            </p>
            <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider">
              {track.type}
            </span>
          </div>
          <p className="mt-1 text-[9px] text-[var(--color-text-muted)] line-clamp-2">
            {track.description}
          </p>
          <p className="mt-1 text-[9px] text-[var(--color-text-secondary)]">
            Duration: {formatDuration(track.duration)}
          </p>
        </div>
      ))}
    </div>
  );
}
