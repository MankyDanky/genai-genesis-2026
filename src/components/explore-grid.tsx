"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

export interface ExploreGameItem {
  id: string;
  title: string;
  engine: "canvas2d" | "threejs";
  createdAt: string;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ExploreCard({ game }: { game: ExploreGameItem }) {
  const [code, setCode] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fetchStartedRef = useRef(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const nextVisible = entries.some((entry) => entry.isIntersecting);
        setIsVisible(nextVisible);
      },
      { rootMargin: "220px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || code || failed || fetchStartedRef.current) return;
    let cancelled = false;
    fetchStartedRef.current = true;
    fetch(`/api/games/${game.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Preview failed (${res.status})`);
        return res.json() as Promise<{ code?: string }>;
      })
      .then((payload) => {
        if (cancelled) return;
        if (typeof payload.code !== "string" || payload.code.length === 0) {
          setFailed(true);
          return;
        }
        setCode(payload.code);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, failed, game.id, isVisible]);

  const preview = useMemo(() => {
    if (!isVisible || !code) return null;
    return (
      <iframe
        title={`${game.title} preview`}
        srcDoc={code}
        sandbox="allow-scripts"
        className="h-full w-full border-none pointer-events-none"
      />
    );
  }, [code, game.title, isVisible]);

  return (
    <article
      key={game.id}
      className="border border-[var(--color-border-light)] bg-[var(--color-surface)] p-3"
    >
      <div
        ref={hostRef}
        className="mb-2 h-[140px] w-full overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg)]"
      >
        {preview ? (
          preview
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
              {isVisible && !failed ? "Loading preview..." : failed ? "Preview unavailable" : "Preview"}
            </p>
          </div>
        )}
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
          {game.title || "Untitled Game"}
        </h2>
        <span className="border border-[var(--color-border)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
          {game.engine === "threejs" ? "Three.js" : "Canvas"}
        </span>
      </div>

      <p className="mb-3 text-[10px] text-[var(--color-text-muted)]">
        Published {formatDate(game.createdAt)}
      </p>

      <div className="flex items-center gap-2">
        <Link
          href={`/play/${game.id}`}
          className="gf-btn-chip border border-[var(--color-border-light)] bg-[var(--color-surface-light)] px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]"
        >
          Play
        </Link>
        <span className="text-[9px] text-[var(--color-text-muted)]">ID: {game.id.slice(0, 8)}…</span>
      </div>
    </article>
  );
}

export function ExploreGrid({ games }: { games: ExploreGameItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {games.map((game) => (
        <ExploreCard key={game.id} game={game} />
      ))}
    </div>
  );
}
