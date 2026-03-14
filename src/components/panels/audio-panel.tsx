"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGameForge, type AudioTrack } from "@/lib/game-forge-context";

function formatDuration(duration: number | null) {
  if (!duration || Number.isNaN(duration)) {
    return "--:--";
  }

  const totalSeconds = Math.max(0, Math.round(duration));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function AudioRow({
  track,
  isActive,
  isPlaying,
  onTogglePlayback,
}: {
  track: AudioTrack;
  isActive: boolean;
  isPlaying: boolean;
  onTogglePlayback: (track: AudioTrack) => void;
}) {
  const canPlay = track.status === "ready" && !!track.dataUrl;

  return (
    <div className="group border-b border-[var(--color-border)] px-3 py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onTogglePlayback(track)}
          disabled={!canPlay}
          aria-label={isActive && isPlaying ? `Pause ${track.name}` : `Play ${track.name}`}
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--color-border-light)] transition-all ${
            canPlay
              ? "bg-[var(--color-surface-light)] text-[var(--color-accent)] opacity-100 hover:bg-[var(--color-accent-glow)]"
              : "cursor-default bg-transparent text-[var(--color-text-muted)] opacity-40"
          } ${isActive ? "opacity-100" : ""}`}
        >
          {isActive && isPlaying ? (
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
              <rect x="0" y="0" width="3" height="12" />
              <rect x="7" y="0" width="3" height="12" />
            </svg>
          ) : (
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
              <polygon points="0,0 10,6 0,12" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">
              {track.name}
            </p>
            <span className="border border-[var(--color-border-light)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              {track.type}
            </span>
            <span className="text-[10px] font-mono tabular-nums text-[var(--color-text-muted)]">
              {formatDuration(track.duration)}
            </span>
          </div>

          {track.description ? (
            <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
              {track.description}
            </p>
          ) : null}

          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em]">
            {track.status === "pending" ? (
              <>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  className="animate-spin text-[var(--color-accent)]"
                >
                  <circle
                    cx="5"
                    cy="5"
                    r="4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeDasharray="18"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="text-[var(--color-accent)]">Generating</span>
              </>
            ) : null}

            {track.status === "ready" ? (
              <span className="text-[var(--color-success)]">
                {isActive && isPlaying ? "Playing" : "Ready"}
              </span>
            ) : null}

            {track.status === "error" ? (
              <span className="text-[var(--color-danger)]">
                {track.error ? `Error: ${track.error}` : "Generation failed"}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AudioPanel() {
  const { audioTracks } = useGameForge();
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const tracks = useMemo(
    () => [...audioTracks].sort((a, b) => b.createdAt - a.createdAt),
    [audioTracks]
  );

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      audio.pause();
      audio.onplay = null;
      audio.onpause = null;
      audio.onended = null;
      audioRef.current = null;
    };
  }, []);

  const handleTogglePlayback = (track: AudioTrack) => {
    if (track.status !== "ready" || !track.dataUrl) {
      return;
    }

    const currentAudio = audioRef.current;
    if (currentAudio && activeTrackId === track.id) {
      if (currentAudio.paused) {
        currentAudio.play().then(() => setIsPlaying(true)).catch(() => {});
      } else {
        currentAudio.pause();
        setIsPlaying(false);
      }
      return;
    }

    if (currentAudio) {
      currentAudio.pause();
      currentAudio.onplay = null;
      currentAudio.onpause = null;
      currentAudio.onended = null;
      audioRef.current = null;
    }

    const nextAudio = new Audio(track.dataUrl);
    nextAudio.onplay = () => setIsPlaying(true);
    nextAudio.onpause = () => setIsPlaying(false);
    nextAudio.onended = () => {
      setIsPlaying(false);
      setActiveTrackId(null);
      audioRef.current = null;
    };

    audioRef.current = nextAudio;
    setActiveTrackId(track.id);
    setIsPlaying(false);
    nextAudio.play().then(() => setIsPlaying(true)).catch(() => {});
  };

  if (tracks.length === 0) {
    return (
      <div className="flex h-full flex-col bg-[var(--color-bg)]">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center border border-dashed border-[var(--color-border-light)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2" opacity="0.6">
              <path d="M7 15V5l8-2v10" />
              <circle cx="5" cy="15" r="2" />
              <circle cx="13" cy="13" r="2" />
            </svg>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              No Audio Yet
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
              Generated sound effects and music will appear here
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      <div className="flex-1 overflow-y-auto">
        {tracks.map((track) => (
          <AudioRow
            key={track.id}
            track={track}
            isActive={activeTrackId === track.id}
            isPlaying={activeTrackId === track.id && isPlaying}
            onTogglePlayback={handleTogglePlayback}
          />
        ))}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-[var(--color-border)] px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Library
        </span>
        <span className="text-[10px] tracking-wider text-[var(--color-text-muted)]">
          {tracks.length} file{tracks.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
