"use client";

import type { AudioTrack } from "@/lib/game-forge-context";
import { useWaveformData, AudioWaveform, useAudioPlayback } from "@/components/audio-waveform";

interface AudioPanelProps {
  tracks: AudioTrack[];
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || Number.isNaN(seconds)) return "--:--";
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function AudioTrackCard({ track }: { track: AudioTrack }) {
  const isReady = track.status === "ready";
  const isPending = track.status === "pending";
  const isError = track.status === "error";
  const peaks = useWaveformData(isReady ? track.dataUrl : null, 64);
  const { isPlaying, progress, togglePlayback, seek } = useAudioPlayback(
    isReady ? track.dataUrl : null
  );

  return (
    <div className="group/track border border-[var(--color-border-light)] bg-[var(--color-surface)] overflow-hidden">
      {/* Header row */}
      <div className="px-2.5 py-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider shrink-0">
            {track.type}
          </span>
          <p className="text-[10px] text-[var(--color-text)] uppercase tracking-[0.08em] font-semibold truncate">
            {track.name}
          </p>
        </div>
        {isReady && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9px] text-[var(--color-text-muted)] tabular-nums">
              {formatDuration(track.duration)}
            </span>
            <button
              type="button"
              title="Download audio"
              onClick={() => {
                if (!track.dataUrl) return;
                const a = document.createElement("a");
                a.href = track.dataUrl;
                a.download = `${track.name.replace(/[^a-zA-Z0-9]+/g, "-")}.wav`;
                a.click();
              }}
              className="w-5 h-5 flex items-center justify-center border border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-text-muted)] opacity-0 group-hover/track:opacity-100 hover:!border-[var(--color-accent)] hover:!text-[var(--color-accent)] hover:!bg-[var(--color-accent-glow)] transition-all duration-150"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </div>
        )}
        {isPending && (
          <svg width="12" height="12" viewBox="0 0 12 12" className="animate-spin text-[var(--color-accent)] shrink-0">
            <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20" strokeLinecap="round" />
          </svg>
        )}
        {isError && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--color-danger)" strokeWidth="1.5" className="shrink-0">
            <circle cx="6" cy="6" r="4.5" />
            <path d="M4.5 4.5l3 3M7.5 4.5l-3 3" />
          </svg>
        )}
      </div>

      {/* Waveform player */}
      {isReady && peaks && (
        <div className="px-2.5 pb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlayback}
            className="gf-btn-chip w-7 h-7 shrink-0 flex items-center justify-center border border-[var(--color-border-light)] bg-[var(--color-surface-light)] text-[var(--color-accent)]"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect x="1.5" y="1" width="2.5" height="8" rx="0.5" />
                <rect x="6" y="1" width="2.5" height="8" rx="0.5" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M2.5 1l6 4-6 4z" />
              </svg>
            )}
          </button>
          <div className="flex-1 min-w-0">
            <AudioWaveform peaks={peaks} progress={progress} onSeek={seek} height={28} />
          </div>
        </div>
      )}

      {/* Pending placeholder waveform */}
      {isPending && (
        <div className="px-2.5 pb-2 flex items-center gap-2">
          <div className="w-7 h-7 shrink-0" />
          <div className="flex-1 flex items-center gap-px h-7">
            {Array.from({ length: 64 }, (_, i) => {
              const h = Math.max(2, Math.round((Math.sin(i * 0.7) * 0.5 + 0.5) * 16));
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: h,
                    minWidth: 1,
                    backgroundColor: "var(--color-border-light)",
                    opacity: 0.4,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Description */}
      {track.description && (
        <div className="px-2.5 pb-1.5">
          <p className="text-[9px] text-[var(--color-text-muted)] line-clamp-2">
            {track.description}
          </p>
        </div>
      )}

      {/* Error message */}
      {isError && track.error && (
        <div className="px-2.5 pb-1.5">
          <p className="text-[9px] text-[var(--color-danger)]">{track.error}</p>
        </div>
      )}
    </div>
  );
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
        <AudioTrackCard key={track.id} track={track} />
      ))}
    </div>
  );
}
