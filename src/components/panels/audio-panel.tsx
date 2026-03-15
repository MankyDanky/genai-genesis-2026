"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useGameForge, type AudioTrack } from "@/lib/game-forge-context";
import { useToast } from "@/components/toast";

function formatDuration(duration: number | null) {
  if (!duration || Number.isNaN(duration)) {
    return "--:--";
  }

  const totalSeconds = Math.max(0, Math.round(duration));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildWaveHeights(seed: string, count = 64): number[] {
  const base = hashString(seed) || 1;
  const values: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const n = Math.abs(Math.sin((base + i * 37) * 0.017));
    values.push(10 + Math.round(n * 74));
  }
  return values;
}

function WaveformBackground({ seed, isPlaying }: { seed: string; isPlaying: boolean }) {
  const bars = useMemo(() => buildWaveHeights(seed), [seed]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.18))]" />
      <div
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-2 opacity-45"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`,
          gap: "2px",
          alignItems: "center",
          height: "72%",
        }}
      >
        {bars.map((h, i) => (
          <span key={`${seed}-${i}`} className="relative block h-full">
            <span
              className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-[1px] bg-[var(--color-accent)] opacity-30 ${isPlaying ? "animate-[wavePulse_1.1s_ease-in-out_infinite]" : ""}`}
              style={{
                height: `${h}%`,
              }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

function AudioRow({
  track,
  isActive,
  isPlaying,
  onTogglePlayback,
  onSelect,
}: {
  track: AudioTrack;
  isActive: boolean;
  isPlaying: boolean;
  onTogglePlayback: (track: AudioTrack) => void;
  onSelect: (track: AudioTrack) => void;
}) {
  const canPlay = track.status === "ready" && !!track.dataUrl;

  return (
    <div
      className="group relative border-b border-[var(--color-border)] px-3 py-3 last:border-b-0 overflow-hidden cursor-pointer hover:bg-[var(--color-surface-light)]/30"
      onClick={() => onSelect(track)}
    >
      <WaveformBackground seed={track.id} isPlaying={isActive && isPlaying} />
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePlayback(track);
          }}
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

        <div className="relative min-w-0 flex-1 space-y-1">
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

function AudioEditPopup({
  track,
  onClose,
  onReprompt,
}: {
  track: AudioTrack;
  onClose: () => void;
  onReprompt: (message: string) => void;
}) {
  const { showToast } = useToast();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [popupPlaying, setPopupPlaying] = useState(false);

  const canPlay = track.status === "ready" && !!track.dataUrl;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  }, [input]);

  useEffect(() => {
    const handleEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleTogglePreview = () => {
    if (!canPlay) return;

    const current = audioRef.current;
    if (current) {
      if (current.paused) {
        current.play().then(() => setPopupPlaying(true)).catch(() => {});
      } else {
        current.pause();
        setPopupPlaying(false);
      }
      return;
    }

    const audio = new Audio(track.dataUrl!);
    audio.onplay = () => setPopupPlaying(true);
    audio.onpause = () => setPopupPlaying(false);
    audio.onended = () => {
      setPopupPlaying(false);
      audioRef.current = null;
    };
    audioRef.current = audio;
    audio.play().then(() => setPopupPlaying(true)).catch(() => {});
  };

  const doSubmit = () => {
    const text = input.trim();
    if (!text) return;

    const message = `Regenerate the ${track.type} "${track.name}". Current sound: "${track.description}". Changes: ${text}. Use the same name to replace it.`;
    onReprompt(message);
    showToast(`Regenerating "${track.name}" — check the Composer`, "success");
    onClose();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    doSubmit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSubmit();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      style={{ animation: "fadeIn 0.15s ease-out" }}
    >
      <div className="flex flex-col items-center gap-4 max-w-[440px] w-full mx-4">
        <div className="relative w-full border border-[var(--color-border-light)] bg-[var(--color-surface)] p-4">
          <button
            onClick={onClose}
            className="absolute -top-3 -right-3 w-6 h-6 flex items-center justify-center bg-[var(--color-surface)] border border-[var(--color-border-light)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xs z-10 transition-colors"
          >
            &times;
          </button>

          <div className="flex items-center gap-3 mb-3">
            <button
              type="button"
              onClick={handleTogglePreview}
              disabled={!canPlay}
              className={`flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--color-border-light)] transition-all ${
                canPlay
                  ? "bg-[var(--color-surface-light)] text-[var(--color-accent)] hover:bg-[var(--color-accent-glow)]"
                  : "cursor-default bg-transparent text-[var(--color-text-muted)] opacity-40"
              }`}
            >
              {popupPlaying ? (
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

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text)]">
                  {track.name}
                </p>
                <span className="border border-[var(--color-border-light)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                  {track.type}
                </span>
                <span className="text-[10px] font-mono tabular-nums text-[var(--color-text-muted)]">
                  {formatDuration(track.duration)}
                </span>
              </div>
            </div>
          </div>

          {track.description ? (
            <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)] mb-3">
              {track.description}
            </p>
          ) : null}

          {track.status === "pending" && (
            <p className="text-[10px] text-[var(--color-accent)] uppercase tracking-[0.12em] mb-3">
              Currently generating...
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 w-full">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe how to change this sound..."
            rows={1}
            className="gf-input flex-1 min-w-0 bg-[var(--color-surface)] text-[var(--color-text)] text-[12px] leading-relaxed px-3 py-2 border border-[var(--color-border-light)] outline-none placeholder:text-[var(--color-text-muted)] resize-none overflow-hidden"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="gf-btn-chip shrink-0 w-[34px] self-stretch flex items-center justify-center border border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-text-muted)] disabled:opacity-20 disabled:cursor-default"
            aria-label="Send"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M1 1l10 5-10 5z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

export function AudioPanel() {
  const { audioTracks, onRepromptAudio } = useGameForge();
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<AudioTrack | null>(null);
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

  const handleSelectTrack = useCallback((track: AudioTrack) => {
    setSelectedTrack(track);
  }, []);

  const handleClosePopup = useCallback(() => {
    setSelectedTrack(null);
  }, []);

  const handleReprompt = useCallback(
    (message: string) => {
      onRepromptAudio(message);
    },
    [onRepromptAudio]
  );

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
            onSelect={handleSelectTrack}
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

      {selectedTrack && (
        <AudioEditPopup
          track={selectedTrack}
          onClose={handleClosePopup}
          onReprompt={handleReprompt}
        />
      )}
    </div>
  );
}
