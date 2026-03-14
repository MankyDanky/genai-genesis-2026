"use client";

import { useState, useCallback, useRef } from "react";

interface SandboxProps {
  code: string | null;
}

function ShareBar({ code, containerRef }: { code: string; containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [toast, setToast] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    showToast("Copied to clipboard");
  }, [code, showToast]);

  const handleDownload = useCallback(() => {
    const titleMatch = code.match(/<title>(.*?)<\/title>/i);
    const name = titleMatch?.[1]?.replace(/\s+/g, "-").toLowerCase() ?? "game";
    const blob = new Blob([code], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Downloaded");
  }, [code, showToast]);

  const handleOpen = useCallback(() => {
    const blob = new Blob([code], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }, [code]);

  const handleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      await el.requestFullscreen();
      setIsFullscreen(true);
    }
  }, [containerRef]);

  return (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
      {toast && (
        <span
          className="text-[10px] text-[var(--color-success)] uppercase tracking-wider font-bold px-2 py-1 bg-[var(--color-surface)] border border-[var(--color-border-light)]"
          style={{ animation: "messageFade 2s ease forwards" }}
        >
          {toast}
        </span>
      )}

      <button
        onClick={handleFullscreen}
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        className="gf-btn-chip p-1.5 border border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-text-muted)]"
      >
        {isFullscreen ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 2v3H2" />
            <path d="M11 2v3h3" />
            <path d="M5 14v-3H2" />
            <path d="M11 14v-3h3" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 5V2h3" />
            <path d="M14 5V2h-3" />
            <path d="M2 11v3h3" />
            <path d="M14 11v3h-3" />
          </svg>
        )}
      </button>

      <button
        onClick={handleCopy}
        title="Copy HTML"
        className="gf-btn-chip p-1.5 border border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-text-muted)]"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="5" y="5" width="9" height="9" rx="1" />
          <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
        </svg>
      </button>

      <button
        onClick={handleDownload}
        title="Download HTML"
        className="gf-btn-chip p-1.5 border border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-text-muted)]"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 2v9m0 0l-3-3m3 3l3-3" />
          <path d="M2 12v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" />
        </svg>
      </button>

      <button
        onClick={handleOpen}
        title="Open in new tab"
        className="gf-btn-chip p-1.5 border border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-text-muted)]"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 2h5v5" />
          <path d="M14 2L7 9" />
          <path d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" />
        </svg>
      </button>
    </div>
  );
}

export function Sandbox({ code }: SandboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (!code) {
    return (
      <div className="flex h-full flex-col bg-[var(--color-bg)]">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border border-dashed border-[var(--color-border-light)] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2" opacity="0.6">
              <rect x="2" y="2" width="16" height="16" rx="1" />
              <polygon points="8,5 15,10 8,15" fill="var(--color-text-muted)" opacity="0.5" stroke="none" />
            </svg>
          </div>
          <div className="text-center space-y-1">
            <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.12em] font-semibold">
              No Game Loaded
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
              Use the Composer to generate a game
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full bg-black">
      <ShareBar code={code} containerRef={containerRef} />
      <iframe
        key={code}
        srcDoc={code}
        sandbox="allow-scripts allow-same-origin"
        title="Game Preview"
        className="h-full w-full border-none"
      />
    </div>
  );
}
