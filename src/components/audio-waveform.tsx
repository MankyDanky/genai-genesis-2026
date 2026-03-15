"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export function useWaveformData(dataUrl: string | null, barCount: number) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const decodedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!dataUrl || decodedUrlRef.current === dataUrl) return;
    decodedUrlRef.current = dataUrl;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(dataUrl);
        const buf = await res.arrayBuffer();
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const decoded = await ctx.decodeAudioData(buf);
        const raw = decoded.getChannelData(0);
        const step = Math.max(1, Math.floor(raw.length / barCount));
        const result: number[] = [];
        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          const start = i * step;
          const end = Math.min(start + step, raw.length);
          for (let j = start; j < end; j++) sum += Math.abs(raw[j]!);
          result.push(sum / (end - start));
        }
        const max = Math.max(...result, 0.001);
        if (!cancelled) setPeaks(result.map((v) => v / max));
        await ctx.close();
      } catch {
        if (!cancelled) setPeaks(null);
      }
    })();

    return () => { cancelled = true; };
  }, [dataUrl, barCount]);

  return peaks;
}

export function AudioWaveform({ peaks, progress, onSeek, height = 20 }: {
  peaks: number[];
  progress: number;
  onSeek: (fraction: number) => void;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(fraction);
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="flex items-center gap-px cursor-pointer"
      style={{ height }}
      role="slider"
      aria-label="Audio position"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
    >
      {peaks.map((peak, i) => {
        const fraction = i / peaks.length;
        const played = fraction < progress;
        const minH = 2;
        const h = Math.max(minH, Math.round(peak * height));
        return (
          <div
            key={i}
            className="flex-1 rounded-sm transition-colors duration-75"
            style={{
              height: h,
              minWidth: 1,
              backgroundColor: played ? "var(--color-accent)" : "var(--color-border-light)",
            }}
          />
        );
      })}
    </div>
  );
}

export function useAudioPlayback(dataUrl: string | null) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);

  const stopProgressLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const startProgressLoop = useCallback(() => {
    stopProgressLoop();
    const tick = () => {
      const audio = audioRef.current;
      if (audio && audio.duration > 0) {
        setProgress(audio.currentTime / audio.duration);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopProgressLoop]);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.onplay = null;
    audio.onpause = null;
    audio.onended = null;
    audioRef.current = null;
    setIsPlaying(false);
    stopProgressLoop();
  }, [stopProgressLoop]);

  useEffect(() => {
    return () => stopPlayback();
  }, [stopPlayback]);

  const togglePlayback = useCallback(() => {
    if (!dataUrl) return;
    const current = audioRef.current;
    if (current) {
      if (current.paused) {
        current.play().then(() => { setIsPlaying(true); startProgressLoop(); }).catch(() => {});
      } else {
        current.pause();
        setIsPlaying(false);
        stopProgressLoop();
      }
      return;
    }

    const next = new Audio(dataUrl);
    next.onplay = () => { setIsPlaying(true); startProgressLoop(); };
    next.onpause = () => { setIsPlaying(false); stopProgressLoop(); };
    next.onended = () => {
      setIsPlaying(false);
      setProgress(0);
      stopProgressLoop();
      audioRef.current = null;
    };
    audioRef.current = next;
    next.play().then(() => { setIsPlaying(true); startProgressLoop(); }).catch(() => {});
  }, [dataUrl, startProgressLoop, stopProgressLoop]);

  const seek = useCallback((fraction: number) => {
    const audio = audioRef.current;
    if (audio && audio.duration > 0) {
      audio.currentTime = fraction * audio.duration;
      setProgress(fraction);
    }
  }, []);

  return { isPlaying, progress, togglePlayback, seek };
}
