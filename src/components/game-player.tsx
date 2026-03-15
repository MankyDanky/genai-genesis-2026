"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface GamePlayerProps {
  code: string;
  title: string;
  gameId: string;
}

export function GamePlayer({ code, title, gameId }: GamePlayerProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [forking, setForking] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const handleFork = useCallback(async () => {
    setForking(true);
    setForkError(null);
    try {
      const res = await fetch(`/api/games/${gameId}/fork`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Fork failed" }));
        throw new Error(body.error ?? "Fork failed");
      }
      const data = await res.json();
      router.push(`/?project=${data.projectId}`);
    } catch (err) {
      setForkError(err instanceof Error ? err.message : "Fork failed");
      setForking(false);
    }
  }, [gameId, router]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--color-bg)]">
      {/* Top bar */}
      <div className="flex items-center justify-between h-8 px-3 bg-[var(--color-surface)] border-b border-[var(--color-border)] shrink-0">
        <span className="text-[11px] text-[var(--color-text-secondary)] uppercase tracking-[0.1em] font-bold truncate">
          {title}
        </span>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <button
            type="button"
            onClick={handleShare}
            className={`text-[10px] uppercase tracking-[0.1em] font-semibold transition-colors ${
              copied
                ? "text-[var(--color-accent)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
            }`}
          >
            {copied ? "Link Copied!" : "Share"}
          </button>
          <button
            type="button"
            onClick={handleFork}
            disabled={forking}
            className="text-[10px] text-[var(--color-accent)] uppercase tracking-[0.1em] font-semibold hover:underline disabled:opacity-50"
          >
            {forking ? "Remixing..." : "Remix"}
          </button>
          {forkError ? (
            <span className="text-[10px] text-red-400">{forkError}</span>
          ) : null}
          <Link
            href="/"
            className="text-[10px] text-[var(--color-accent)] uppercase tracking-[0.1em] font-semibold hover:underline"
          >
            Make your own
          </Link>
        </div>
      </div>

      {/* Game iframe */}
      <iframe
        srcDoc={code}
        sandbox="allow-scripts allow-pointer-lock"
        title={title}
        className="flex-1 w-full border-none"
      />
    </div>
  );
}
