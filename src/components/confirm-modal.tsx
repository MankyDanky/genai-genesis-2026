"use client";

import { useEffect, useRef, useCallback } from "react";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onCancel();
    },
    [onCancel]
  );

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      style={{ animation: "fadeIn 0.1s ease-out" }}
    >
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border-light)] shadow-[0_20px_60px_rgba(0,0,0,0.6)] w-[380px] max-w-[90vw]"
        style={{ animation: "slideDown 0.15s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-[11px] uppercase tracking-[0.1em] font-bold text-[var(--color-text)]">
            {title}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-sm leading-none px-1"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 flex flex-col gap-4">
          <p className="text-[11px] text-[var(--color-text-secondary)] tracking-[0.04em] leading-relaxed">
            {message}
          </p>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-8 px-3 text-[10px] uppercase tracking-[0.1em] font-semibold border border-[var(--color-border-light)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-accent)]"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`h-8 px-4 text-[10px] uppercase tracking-[0.1em] font-semibold text-[var(--color-bg)] disabled:opacity-40 disabled:cursor-default ${
                variant === "danger"
                  ? "bg-[var(--color-danger)]"
                  : "gf-btn-primary bg-[var(--color-accent)]"
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
