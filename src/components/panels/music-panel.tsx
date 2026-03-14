"use client";

import { useState } from "react";
import { useGameForge } from "@/lib/game-forge-context";

const AUDIO_TYPES = ["music", "sfx"] as const;

export function MusicPanel() {
  const { audioTracks, removeAudioTrack } = useGameForge();
  const [description, setDescription] = useState("");
  const [audioType, setAudioType] = useState<(typeof AUDIO_TYPES)[number]>("music");

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      {/* Generate section */}
      <div className="p-3 space-y-2.5 border-b border-[var(--color-border)]">
        <div className="gf-section-header px-3 py-1.5">
          <p className="text-[11px] text-[var(--color-text-secondary)] uppercase tracking-[0.12em] font-bold">
            Generate Audio
          </p>
        </div>
        <div className="flex gap-1.5">
          {AUDIO_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setAudioType(type)}
              className={`gf-btn-chip text-[10px] px-2.5 py-1 uppercase tracking-wider font-semibold border ${
                audioType === type
                  ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-glow)]"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)]"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={audioType === "music" ? "Chiptune adventure loop..." : "Laser blast sound..."}
          className="gf-input w-full bg-[var(--color-surface)] text-[var(--color-text)] text-[12px] px-3 py-2 border border-[var(--color-border)] outline-none placeholder:text-[var(--color-text-muted)]"
        />
        <button
          type="button"
          disabled={!description.trim()}
          className="gf-btn-primary w-full bg-[var(--color-accent)] text-[var(--color-bg)] py-2 text-[11px] font-bold tracking-[0.12em] uppercase disabled:opacity-30"
        >
          Generate {audioType}
        </button>
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto">
        {audioTracks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border border-dashed border-[var(--color-border-light)] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2" opacity="0.6">
                <path d="M7 4v10M7 14a3 3 0 1 1 0-6" />
                <path d="M7 4l8-2v10" />
                <path d="M15 12a3 3 0 1 1 0-6" />
              </svg>
            </div>
            <div className="text-center space-y-1">
              <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.12em] font-semibold">
                No audio yet
              </p>
              <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
                Generate music tracks and sound effects
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {audioTracks.map((track) => (
              <div
                key={track.id}
                className="group gf-list-row flex items-center gap-3 px-3 py-2.5"
              >
                {/* Play button */}
                <button
                  type="button"
                  className="gf-btn-chip w-7 h-7 flex items-center justify-center border border-[var(--color-border)] text-[var(--color-text-muted)] shrink-0"
                >
                  <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
                    <polygon points="0,0 10,6 0,12" />
                  </svg>
                </button>

                {/* Track info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-[var(--color-text)] uppercase tracking-wider truncate font-medium">
                    {track.name}
                  </p>
                  {/* Waveform */}
                  <div className="mt-1.5 h-4 bg-[var(--color-surface-light)] flex items-end gap-px overflow-hidden px-1 py-0.5">
                    {Array.from({ length: 40 }, (_, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-[var(--color-accent)] rounded-t-sm"
                        style={{
                          height: `${20 + Math.sin(i * 0.7) * 35 + Math.sin(i * 1.3) * 20}%`,
                          opacity: 0.4 + Math.sin(i * 0.5) * 0.2,
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Type badge */}
                <span
                  className={`text-[9px] px-2 py-0.5 uppercase tracking-wider font-bold border shrink-0 ${
                    track.type === "music"
                      ? "text-[var(--color-accent)] border-[var(--color-accent)] bg-[var(--color-accent-glow)]"
                      : "text-[var(--color-success)] border-[var(--color-success)] bg-[rgba(63,185,80,0.1)]"
                  }`}
                >
                  {track.type}
                </span>

                {/* Duration */}
                <span className="text-[10px] text-[var(--color-text-muted)] tracking-wider shrink-0 w-10 text-right font-medium">
                  {track.duration ? `${track.duration}s` : "--"}
                </span>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => removeAudioTrack(track.id)}
                  className="text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] opacity-0 group-hover:opacity-100 transition-all duration-150 shrink-0"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex items-center justify-between shrink-0">
        <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">
          Audio
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)] tracking-wider">
          {audioTracks.length} tracks
        </span>
      </div>
    </div>
  );
}
