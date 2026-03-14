"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface OpenProjectModalProps {
  onLoad: (id: string) => Promise<void>;
  onClose: () => void;
}

export function OpenProjectModal({ onLoad, onClose }: OpenProjectModalProps) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose]
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    try {
      await onLoad(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [value, onLoad, onClose]);

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
            Open Project
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
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) void handleSubmit();
            }}
            placeholder="Paste project ID"
            className="gf-input h-8 px-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] text-[11px] text-[var(--color-text)] font-mono tracking-wide outline-none"
          />

          {error ? (
            <p className="text-[10px] text-[var(--color-danger)] tracking-wide">
              {error}
            </p>
          ) : null}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 text-[10px] uppercase tracking-[0.1em] font-semibold border border-[var(--color-border-light)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-accent)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={loading || !value.trim()}
              className="gf-btn-primary h-8 px-4 text-[10px] uppercase tracking-[0.1em] font-semibold bg-[var(--color-accent)] text-[var(--color-bg)] disabled:opacity-40 disabled:cursor-default"
            >
              {loading ? "Loading..." : "Load"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
