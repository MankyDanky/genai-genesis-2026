"use client";

import { useState, useCallback } from "react";
import type { GeneratedImage } from "@/lib/game-forge-context";

interface ImagesPanelProps {
  images: GeneratedImage[];
}

export function ImagesPanel({ images }: ImagesPanelProps) {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const copyUrl = useCallback(
    (url: string) => {
      navigator.clipboard.writeText(url);
      showToast("URL copied");
    },
    [showToast]
  );

  if (images.length === 0) {
    return (
      <div className="flex h-full flex-col bg-[var(--color-bg)]">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border border-dashed border-[var(--color-border-light)] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2" opacity="0.6">
              <rect x="1" y="3" width="18" height="14" rx="1" />
              <circle cx="7" cy="8" r="2" />
              <path d="M1 15l5-5 3 3 5-6 5 5" />
            </svg>
          </div>
          <div className="text-center space-y-1">
            <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.12em] font-semibold">
              No Images Yet
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
              Generated images will appear here
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[var(--color-bg)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.15em] font-bold">
          Generated Images
        </span>
        <span className="text-[10px] text-[var(--color-accent)] font-mono">
          {images.length}
        </span>
      </div>

      {/* Toast */}
      {toast && (
        <div className="shrink-0 px-3 py-1">
          <span
            className="text-[10px] text-[var(--color-success)] uppercase tracking-wider font-bold"
            style={{ animation: "messageFade 2s ease forwards" }}
          >
            {toast}
          </span>
        </div>
      )}

      {/* Image grid */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {images.map((image, i) => (
            <div
              key={`${image.url}-${i}`}
              className="border border-[var(--color-border-light)] bg-[var(--color-surface)] overflow-hidden group"
              style={{ animation: "fadeIn 0.2s ease-out" }}
            >
              <div className="relative aspect-square overflow-hidden bg-black">
                <img
                  src={image.url}
                  alt={image.prompt}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => copyUrl(image.url)}
                  title="Copy image URL"
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity gf-btn-chip p-1 border border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-text-muted)]"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <rect x="5" y="5" width="9" height="9" rx="1" />
                    <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
                  </svg>
                </button>
              </div>
              <div className="px-2 py-1.5">
                <p className="text-[9px] text-[var(--color-text-secondary)] leading-tight line-clamp-2">
                  {image.prompt}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
