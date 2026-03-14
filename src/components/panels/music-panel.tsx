"use client";

import { useState, useRef, useCallback } from "react";
import { useGameForge, type AudioTrack } from "@/lib/game-forge-context";

const AUDIO_TYPES = ["music", "sfx", "ambient"] as const;
type AudioType = (typeof AUDIO_TYPES)[number];

const TYPE_PLACEHOLDERS: Record<AudioType, string> = {
  music: "Chiptune adventure loop...",
  sfx: "Laser blast sound...",
  ambient: "Eerie space hum...",
};

const TYPE_COLORS: Record<AudioType, string> = {
  music: "text-[var(--color-accent)] border-[var(--color-accent)] bg-[var(--color-accent-glow)]",
  sfx: "text-[var(--color-success)] border-[var(--color-success)] bg-[rgba(63,185,80,0.1)]",
  ambient: "text-[var(--color-warning)] border-[var(--color-warning)] bg-[rgba(210,153,34,0.1)]",
};

interface ActiveAudio {
  ctx: AudioContext;
  stop?: (() => void) | void;
}

export function MusicPanel() {
  const { audioTracks, addAudioTrack, removeAudioTrack } = useGameForge();
  const [description, setDescription] = useState("");
  const [audioType, setAudioType] = useState<AudioType>("music");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const activeAudioRef = useRef<Map<string, ActiveAudio>>(new Map());

  const stopTrack = useCallback((id: string) => {
    const active = activeAudioRef.current.get(id);
    if (active) {
      try {
        if (typeof active.stop === "function") active.stop();
        active.ctx.close();
      } catch {
        // ignore close errors
      }
      activeAudioRef.current.delete(id);
    }
    setPlayingId((cur) => (cur === id ? null : cur));
  }, []);

  const handleGenerate = useCallback(async () => {
    const desc = description.trim();
    if (!desc || isGenerating) return;

    setIsGenerating(true);
    setGenError(null);

    try {
      const res = await fetch("/api/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc, type: audioType }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Audio generation failed");

      addAudioTrack({
        id: crypto.randomUUID(),
        name: data.name,
        type: audioType,
        description: desc,
        code: data.code,
        functionName: data.functionName,
        createdAt: Date.now(),
      });

      setDescription("");
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Failed to generate audio");
    } finally {
      setIsGenerating(false);
    }
  }, [description, audioType, isGenerating, addAudioTrack]);

  const handlePlay = useCallback(
    (track: AudioTrack) => {
      // Stop if already playing this track
      if (playingId === track.id) {
        stopTrack(track.id);
        return;
      }

      // Stop any currently playing track
      if (playingId) stopTrack(playingId);

      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AudioContextClass();
        ctx.resume();

        // Execute the function definition then call it
        // track.code is: "function playFoo(audioCtx) { ... }"
        const stopFn = new Function(
          "audioCtx",
          `${track.code}\nreturn ${track.functionName}(audioCtx);`
        )(ctx);

        activeAudioRef.current.set(track.id, { ctx, stop: stopFn });
        setPlayingId(track.id);

        // SFX auto-clears after a short time (no stop function returned)
        if (!stopFn) {
          setTimeout(() => {
            activeAudioRef.current.delete(track.id);
            setPlayingId((cur) => (cur === track.id ? null : cur));
          }, 2000);
        }
      } catch (err) {
        console.error("[MusicPanel] Playback error:", err);
      }
    },
    [playingId, stopTrack]
  );

  const handleRemove = useCallback(
    (id: string) => {
      if (playingId === id) stopTrack(id);
      removeAudioTrack(id);
    },
    [playingId, stopTrack, removeAudioTrack]
  );

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      {/* Generate section */}
      <div className="p-3 space-y-2.5 border-b border-[var(--color-border)]">
        <div className="gf-section-header px-3 py-1.5">
          <p className="text-[11px] text-[var(--color-text-secondary)] uppercase tracking-[0.12em] font-bold">
            Generate Audio
          </p>
        </div>

        {/* Type selector */}
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
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          placeholder={TYPE_PLACEHOLDERS[audioType]}
          disabled={isGenerating}
          className="gf-input w-full bg-[var(--color-surface)] text-[var(--color-text)] text-[12px] px-3 py-2 border border-[var(--color-border)] outline-none placeholder:text-[var(--color-text-muted)] disabled:opacity-50"
        />

        <button
          type="button"
          onClick={handleGenerate}
          disabled={!description.trim() || isGenerating}
          className="gf-btn-primary w-full bg-[var(--color-accent)] text-[var(--color-bg)] py-2 text-[11px] font-bold tracking-[0.12em] uppercase disabled:opacity-30"
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full bg-[var(--color-bg)]"
                style={{ animation: "pulseGlow 1s ease-in-out infinite" }}
              />
              Generating...
            </span>
          ) : (
            `Generate ${audioType}`
          )}
        </button>

        {genError && (
          <p className="text-[10px] text-[var(--color-danger)] uppercase tracking-wider truncate">
            {genError}
          </p>
        )}
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto">
        {audioTracks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border border-dashed border-[var(--color-border-light)] flex items-center justify-center">
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="var(--color-text-muted)"
                strokeWidth="1.2"
                opacity="0.6"
              >
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
                Generate music, SFX, and ambient tracks
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {audioTracks.map((track) => {
              const isPlaying = playingId === track.id;
              return (
                <div
                  key={track.id}
                  className="group gf-list-row flex items-center gap-3 px-3 py-2.5"
                >
                  {/* Play/Stop button */}
                  <button
                    type="button"
                    onClick={() => handlePlay(track)}
                    title={isPlaying ? "Stop" : "Preview"}
                    className={`gf-btn-chip w-7 h-7 flex items-center justify-center border shrink-0 transition-colors ${
                      isPlaying
                        ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-glow)]"
                        : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                    }`}
                  >
                    {isPlaying ? (
                      /* Stop icon */
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                        <rect width="8" height="8" />
                      </svg>
                    ) : (
                      /* Play icon */
                      <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
                        <polygon points="0,0 10,6 0,12" />
                      </svg>
                    )}
                  </button>

                  {/* Track info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-[var(--color-text)] uppercase tracking-wider truncate font-medium">
                      {track.name}
                    </p>
                    {/* Waveform visualisation */}
                    <div className="mt-1.5 h-4 bg-[var(--color-surface-light)] flex items-end gap-px overflow-hidden px-1 py-0.5">
                      {Array.from({ length: 40 }, (_, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-t-sm transition-all duration-300"
                          style={{
                            height: `${20 + Math.sin(i * 0.7) * 35 + Math.sin(i * 1.3) * 20}%`,
                            backgroundColor: isPlaying
                              ? "var(--color-accent)"
                              : "var(--color-text-muted)",
                            opacity: isPlaying
                              ? 0.5 + Math.abs(Math.sin(i * 0.5)) * 0.45
                              : 0.25,
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Type badge */}
                  <span
                    className={`text-[9px] px-2 py-0.5 uppercase tracking-wider font-bold border shrink-0 ${TYPE_COLORS[track.type]}`}
                  >
                    {track.type}
                  </span>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => handleRemove(track.id)}
                    className="text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] opacity-0 group-hover:opacity-100 transition-all duration-150 shrink-0"
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex items-center justify-between shrink-0">
        <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">
          Audio
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)] tracking-wider">
          {audioTracks.length} {audioTracks.length === 1 ? "track" : "tracks"}
          {playingId ? " · playing" : ""}
        </span>
      </div>
    </div>
  );
}
