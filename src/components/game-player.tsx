"use client";

import Link from "next/link";

interface GamePlayerProps {
  code: string;
  title: string;
  gameId: string;
}

export function GamePlayer({ code, title }: GamePlayerProps) {
  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--color-bg)]">
      {/* Top bar */}
      <div className="flex items-center justify-between h-8 px-3 bg-[var(--color-surface)] border-b border-[var(--color-border)] shrink-0">
        <span className="text-[11px] text-[var(--color-text-secondary)] uppercase tracking-[0.1em] font-bold truncate">
          {title}
        </span>
        <Link
          href="/"
          className="text-[10px] text-[var(--color-accent)] uppercase tracking-[0.1em] font-semibold hover:underline shrink-0 ml-4"
        >
          Make your own
        </Link>
      </div>

      {/* Game iframe */}
      <iframe
        srcDoc={code}
        sandbox="allow-scripts"
        title={title}
        className="flex-1 w-full border-none"
      />
    </div>
  );
}
