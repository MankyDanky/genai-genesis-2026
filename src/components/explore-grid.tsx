"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { GameEngine } from "@/lib/game-engine";

export interface ExploreGameItem {
  id: string;
  title: string;
  engine: GameEngine;
  multiplayer: boolean;
  multiplayerRoomType: string | null;
  thumbnail: string | null;
  createdAt: string;
}

/* ---------- live preview fetcher (fallback when no thumbnail) ---------- */

const PREVIEW_TIMEOUT_MS = 12_000;
const PREVIEW_CONCURRENCY = 6;

const previewCodeCache = new Map<string, string>();
const previewInflight = new Map<string, Promise<string | null>>();
const previewQueue: Array<() => void> = [];
let activePreviewFetches = 0;

function runNextPreviewTask() {
  if (activePreviewFetches >= PREVIEW_CONCURRENCY) return;
  const task = previewQueue.shift();
  if (!task) return;
  activePreviewFetches += 1;
  task();
}

function queuePreviewTask<T>(task: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    previewQueue.push(() => {
      task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activePreviewFetches = Math.max(0, activePreviewFetches - 1);
          runNextPreviewTask();
        });
    });
    runNextPreviewTask();
  });
}

function fetchPreviewCode(gameId: string): Promise<string | null> {
  const cached = previewCodeCache.get(gameId);
  if (cached) return Promise.resolve(cached);

  const existing = previewInflight.get(gameId);
  if (existing) return existing;

  const request = queuePreviewTask(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/games/${gameId}/preview`, {
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const payload = (await res.json()) as { code?: string };
      const code =
        typeof payload.code === "string" && payload.code.length > 0
          ? payload.code
          : null;
      if (code) previewCodeCache.set(gameId, code);
      return code;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      previewInflight.delete(gameId);
    }
  });

  previewInflight.set(gameId, request);
  return request;
}

/* ---------- preview srcDoc builder ---------- */

function buildFittedPreviewSrcDoc(code: string): string {
  const fitScript = `<script>(function(){
    function getContentSize() {
      var de = document.documentElement;
      var b = document.body;
      if (!de || !b) return { w: 1, h: 1 };
      var w = Math.max(
        de.scrollWidth || 0,
        de.offsetWidth || 0,
        b.scrollWidth || 0,
        b.offsetWidth || 0
      );
      var h = Math.max(
        de.scrollHeight || 0,
        de.offsetHeight || 0,
        b.scrollHeight || 0,
        b.offsetHeight || 0
      );
      return { w: Math.max(1, w), h: Math.max(1, h) };
    }

    function fitPreview() {
      var de = document.documentElement;
      var b = document.body;
      if (!de || !b) return;

      de.style.overflow = "hidden";
      b.style.margin = "0";
      b.style.transformOrigin = "top left";
      b.style.position = "absolute";

      var size = getContentSize();
      var vw = Math.max(1, window.innerWidth || 1);
      var vh = Math.max(1, window.innerHeight || 1);
      var scale = Math.min(vw / size.w, vh / size.h);
      if (!isFinite(scale) || scale <= 0) scale = 1;
      var tx = (vw - size.w * scale) / 2;
      var ty = (vh - size.h * scale) / 2;

      b.style.width = size.w + "px";
      b.style.height = size.h + "px";
      b.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
    }

    window.addEventListener("load", function(){ setTimeout(fitPreview, 0); });
    window.addEventListener("resize", fitPreview);
    setTimeout(fitPreview, 120);
    setTimeout(fitPreview, 500);
  })();<\/script>`;

  if (/<head[^>]*>/i.test(code)) {
    return code.replace(/<head([^>]*)>/i, `<head$1>${fitScript}`);
  }
  if (/<body[^>]*>/i.test(code)) {
    return code.replace(/<body([^>]*)>/i, `<body$1>${fitScript}`);
  }
  return `${fitScript}${code}`;
}

/* ---------- helpers ---------- */

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/* ---------- ExploreCard ---------- */

function ExploreCard({ game }: { game: ExploreGameItem }) {
  const router = useRouter();
  const hasThumbnail = typeof game.thumbnail === "string" && game.thumbnail.length > 0;

  // Live preview state (only used when no thumbnail)
  const [code, setCode] = useState<string | null>(
    hasThumbnail ? null : (previewCodeCache.get(game.id) ?? null),
  );
  const [isVisible, setIsVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fetchStartedRef = useRef(false);

  useEffect(() => {
    if (hasThumbnail) return; // No need to observe for lazy loading
    const el = hostRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const nextVisible = entries.some((entry) => entry.isIntersecting);
        setIsVisible(nextVisible);
      },
      { rootMargin: "400px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasThumbnail]);

  const loadPreview = useCallback(() => {
    if (hasThumbnail || code || fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    setFailed(false);
    fetchPreviewCode(game.id)
      .then((nextCode) => {
        if (nextCode) {
          setCode(nextCode);
        } else {
          setFailed(true);
          fetchStartedRef.current = false;
        }
      })
      .catch(() => {
        setFailed(true);
        fetchStartedRef.current = false;
      });
  }, [code, game.id, hasThumbnail]);

  useEffect(() => {
    if (hasThumbnail || !isVisible || code || failed) return;
    loadPreview();
  }, [hasThumbnail, isVisible, code, failed, loadPreview]);

  const livePreview = useMemo(() => {
    if (hasThumbnail || !isVisible || !code) return null;
    return (
      <iframe
        title={`${game.title} preview`}
        srcDoc={buildFittedPreviewSrcDoc(code)}
        sandbox="allow-scripts"
        loading="lazy"
        className="h-full w-full border-none pointer-events-none"
      />
    );
  }, [code, game.title, isVisible, hasThumbnail]);

  const joinRoomId = `game-${game.id}`;
  const playHref = game.multiplayer
    ? `/play/${game.id}?room=${encodeURIComponent(joinRoomId)}`
    : `/play/${game.id}`;
  const createRoom = () => {
    const nextRoom = `${game.id}-${Math.random().toString(36).slice(2, 8)}`;
    router.push(`/play/${game.id}?room=${encodeURIComponent(nextRoom)}`);
  };

  return (
    <article
      key={game.id}
      className="border border-[var(--color-border-light)] bg-[var(--color-surface)] p-3"
    >
      <div
        ref={hostRef}
        className="mb-2 h-[140px] w-full overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg)]"
      >
        {hasThumbnail ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={game.thumbnail!}
            alt={`${game.title} preview`}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        ) : livePreview ? (
          livePreview
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {isVisible && !failed ? (
              <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                Loading preview...
              </p>
            ) : failed ? (
              <button
                type="button"
                onClick={loadPreview}
                className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
              >
                Preview failed - click to retry
              </button>
            ) : (
              <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                Preview
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
          {game.title || "Untitled Game"}
        </h2>
        <span className="border border-[var(--color-border)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
          {game.engine === "threejs" ? "Three.js" : game.engine === "phaser" ? "Phaser" : "Canvas"}
        </span>
      </div>

      {game.multiplayer ? (
        <p className="mb-2 text-[9px] uppercase tracking-[0.08em] text-[var(--color-accent)]">
          Multiplayer - Room type {game.multiplayerRoomType || "game"}
        </p>
      ) : null}

      <p className="mb-3 text-[10px] text-[var(--color-text-muted)]">
        Published {formatDate(game.createdAt)}
      </p>

      <div className="flex items-center gap-2">
        <Link
          href={playHref}
          prefetch={true}
          className="gf-btn-chip border border-[var(--color-border-light)] bg-[var(--color-surface-light)] px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]"
        >
          {game.multiplayer ? "Join Public" : "Play"}
        </Link>
        {game.multiplayer ? (
          <button
            type="button"
            onClick={createRoom}
            className="gf-btn-chip border border-[var(--color-border-light)] bg-[var(--color-surface)] px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"
          >
            Create Room
          </button>
        ) : null}
        <span className="text-[9px] text-[var(--color-text-muted)]">
          ID: {game.id.slice(0, 8)}...
        </span>
      </div>
    </article>
  );
}

/* ---------- ExploreGrid ---------- */

export function ExploreGrid({ games }: { games: ExploreGameItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {games.map((game) => (
        <ExploreCard key={game.id} game={game} />
      ))}
    </div>
  );
}
