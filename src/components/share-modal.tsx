"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface ShareModalProps {
  url: string;
  onClose: () => void;
}

export function ShareModal({ url, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      inputRef.current?.select();
      document.execCommand("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [url]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose]
  );

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      style={{ animation: "fadeIn 0.1s ease-out" }}
    >
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border-light)] shadow-[0_20px_60px_rgba(0,0,0,0.6)] w-[420px] max-w-[90vw]"
        style={{ animation: "slideDown 0.15s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-[11px] uppercase tracking-[0.1em] font-bold text-[var(--color-text)]">
            Share Game
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-sm leading-none px-1"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 flex flex-col gap-3">
          <p className="text-[11px] text-[var(--color-text-secondary)] uppercase tracking-[0.06em]">
            Anyone with this link can play your game
          </p>

          {/* URL input + copy */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={url}
              readOnly
              onClick={() => inputRef.current?.select()}
              className="flex-1 h-8 px-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] text-[11px] text-[var(--color-text)] font-mono tracking-wide outline-none focus:border-[var(--color-accent)]"
            />
            <button
              type="button"
              onClick={handleCopy}
              className={`h-8 px-3 text-[10px] uppercase tracking-[0.1em] font-semibold border transition-all duration-150 ${
                copied
                  ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-[var(--color-bg)]"
                  : "border-[var(--color-border-light)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-accent)]"
              }`}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {/* Actions row */}
          <div className="flex gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-8 flex items-center justify-center border border-[var(--color-border-light)] text-[10px] uppercase tracking-[0.1em] font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-accent)]"
            >
              Open in New Tab
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
