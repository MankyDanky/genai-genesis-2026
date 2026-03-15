"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { captureThumbnail, resizeDataUrl } from "@/lib/capture-thumbnail";

interface BackfillGame {
  id: string;
  title: string;
  hasThumbnail: boolean;
}

type GameStatus = "pending" | "loading" | "capturing" | "saving" | "done" | "skipped" | "failed";

interface GameState {
  id: string;
  title: string;
  status: GameStatus;
  hasThumbnail: boolean;
  error?: string;
}

const DEFAULT_DELAY_MS = 3_000;
const THUMB_WIDTH = 320;
const THUMB_HEIGHT = 180;

async function saveThumbnail(gameId: string, thumbnail: string) {
  const res = await fetch(`/api/games/${gameId}/thumbnail`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thumbnail }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function BackfillRunner({ games }: { games: BackfillGame[] }) {
  const [states, setStates] = useState<GameState[]>(
    games.map((g) => ({
      id: g.id,
      title: g.title,
      status: g.hasThumbnail ? "skipped" : "pending",
      hasThumbnail: g.hasThumbnail,
    })),
  );
  const [running, setRunning] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [delayMs, setDelayMs] = useState(DEFAULT_DELAY_MS);
  const [filter, setFilter] = useState("");
  const [pasteTargetId, setPasteTargetId] = useState<string | null>(null);
  const abortRef = useRef(false);
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const missing = states.filter((s) => s.status !== "skipped" && s.status !== "done");

  const updateState = useCallback(
    (id: string, update: Partial<GameState>) => {
      setStates((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...update } : s)),
      );
    },
    [],
  );

  const processGame = useCallback(
    async (game: GameState, captureDelay: number) => {
      if (abortRef.current) return false;

      updateState(game.id, { status: "loading", error: undefined });
      let code: string;
      try {
        const res = await fetch(`/api/games/${game.id}/preview`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { code?: string };
        if (!data.code) throw new Error("No code");
        code = data.code;
      } catch (err) {
        updateState(game.id, {
          status: "failed",
          error: `Load: ${err instanceof Error ? err.message : "unknown"}`,
        });
        return false;
      }

      if (abortRef.current) return false;

      updateState(game.id, { status: "capturing" });
      let thumbnail: string | null;
      try {
        thumbnail = await captureThumbnail(code, { delayMs: captureDelay });
        if (!thumbnail) throw new Error("Capture returned null");
      } catch (err) {
        updateState(game.id, {
          status: "failed",
          error: `Capture: ${err instanceof Error ? err.message : "unknown"}`,
        });
        return false;
      }

      if (abortRef.current) return false;

      updateState(game.id, { status: "saving" });
      try {
        await saveThumbnail(game.id, thumbnail);
      } catch (err) {
        updateState(game.id, {
          status: "failed",
          error: `Save: ${err instanceof Error ? err.message : "unknown"}`,
        });
        return false;
      }

      updateState(game.id, { status: "done", hasThumbnail: true });
      return true;
    },
    [updateState],
  );

  const runAll = useCallback(
    async (targets: GameState[]) => {
      setRunning(true);
      abortRef.current = false;
      setDoneCount(0);

      for (const game of targets) {
        if (abortRef.current) break;
        await processGame(game, delayMs);
        setDoneCount((c) => c + 1);
      }

      setRunning(false);
    },
    [processGame, delayMs],
  );

  const runFiltered = useCallback(() => {
    const lowerFilter = filter.toLowerCase();
    const targets = filter
      ? states.filter((s) => s.title.toLowerCase().includes(lowerFilter))
      : states.filter((s) => s.status === "pending" || s.status === "failed");
    runAll(targets);
  }, [states, filter, runAll]);

  const retrySingle = useCallback(
    async (id: string) => {
      const game = states.find((s) => s.id === id);
      if (!game) return;
      setRunning(true);
      abortRef.current = false;
      await processGame(game, delayMs);
      setRunning(false);
    },
    [states, processGame, delayMs],
  );

  const handleUpload = useCallback(
    async (gameId: string, file: File) => {
      updateState(gameId, { status: "saving", error: undefined });
      try {
        const rawDataUrl = await fileToDataUrl(file);
        const resized = await resizeDataUrl(rawDataUrl, THUMB_WIDTH, THUMB_HEIGHT);
        if (!resized) throw new Error("Resize failed");
        await saveThumbnail(gameId, resized);
        updateState(gameId, { status: "done", hasThumbnail: true });
      } catch (err) {
        updateState(gameId, {
          status: "failed",
          error: `Upload: ${err instanceof Error ? err.message : "unknown"}`,
        });
      }
    },
    [updateState],
  );

  const handlePasteImage = useCallback(
    async (gameId: string, blob: Blob) => {
      updateState(gameId, { status: "saving", error: undefined });
      setPasteTargetId(null);
      try {
        const file = new File([blob], "paste.png", { type: blob.type });
        const rawDataUrl = await fileToDataUrl(file);
        const resized = await resizeDataUrl(rawDataUrl, THUMB_WIDTH, THUMB_HEIGHT);
        if (!resized) throw new Error("Resize failed");
        await saveThumbnail(gameId, resized);
        updateState(gameId, { status: "done", hasThumbnail: true });
      } catch (err) {
        updateState(gameId, {
          status: "failed",
          error: `Paste: ${err instanceof Error ? err.message : "unknown"}`,
        });
      }
    },
    [updateState],
  );

  // Global paste listener
  useEffect(() => {
    if (!pasteTargetId) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) handlePasteImage(pasteTargetId, blob);
          return;
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [pasteTargetId, handlePasteImage]);

  const stopBackfill = useCallback(() => {
    abortRef.current = true;
  }, []);

  const statusLabel: Record<GameStatus, string> = {
    pending: "PENDING",
    loading: "LOADING CODE...",
    capturing: `CAPTURING (${(delayMs / 1000).toFixed(1)}s)...`,
    saving: "SAVING...",
    done: "DONE",
    skipped: "HAS THUMBNAIL",
    failed: "FAILED",
  };

  const statusColor: Record<GameStatus, string> = {
    pending: "text-[var(--color-text-muted)]",
    loading: "text-yellow-400",
    capturing: "text-yellow-400",
    saving: "text-yellow-400",
    done: "text-green-400",
    skipped: "text-[var(--color-text-muted)] opacity-50",
    failed: "text-red-400",
  };

  const visibleStates = filter
    ? states.filter((s) => s.title.toLowerCase().includes(filter.toLowerCase()))
    : states;

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
          Render delay:
          <select
            value={delayMs}
            onChange={(e) => setDelayMs(Number(e.target.value))}
            disabled={running}
            className="border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-text)]"
          >
            <option value={1500}>1.5s (fast)</option>
            <option value={3000}>3s (default)</option>
            <option value={5000}>5s (slow games)</option>
            <option value={8000}>8s (heavy 3D)</option>
          </select>
        </label>

        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by title..."
          disabled={running}
          className="border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-text)] w-[200px]"
        />

        {!running ? (
          <button
            type="button"
            onClick={runFiltered}
            disabled={missing.length === 0 && !filter}
            className="border border-[var(--color-accent)] bg-[var(--color-surface)] px-4 py-1.5 text-[11px] uppercase tracking-[0.1em] text-[var(--color-accent)] hover:bg-[var(--color-surface-light)] disabled:opacity-40"
          >
            {filter
              ? "Generate filtered"
              : missing.length === 0
                ? "All done"
                : `Generate ${missing.length} thumbnails`}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopBackfill}
            className="border border-red-500 bg-[var(--color-surface)] px-4 py-1.5 text-[11px] uppercase tracking-[0.1em] text-red-400 hover:bg-[var(--color-surface-light)]"
          >
            Stop
          </button>
        )}

        {running && (
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {doneCount} processed...
          </span>
        )}
      </div>

      {/* Game list */}
      <div className="space-y-1">
        {visibleStates.map((game) => (
          <div
            key={game.id}
            className="flex items-center gap-3 border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5"
          >
            <span className="flex-1 truncate text-[11px] text-[var(--color-text-secondary)]">
              {game.title}
            </span>
            <span
              className={`text-[10px] uppercase tracking-[0.08em] shrink-0 ${statusColor[game.status]}`}
            >
              {statusLabel[game.status]}
            </span>
            {game.error && (
              <span
                className="text-[9px] text-red-400 truncate max-w-[200px]"
                title={game.error}
              >
                {game.error}
              </span>
            )}
            {!running && (
              <>
                <button
                  type="button"
                  onClick={() => retrySingle(game.id)}
                  className="shrink-0 text-[9px] uppercase tracking-[0.08em] text-[var(--color-accent)] hover:underline"
                >
                  {game.status === "done" || game.status === "skipped"
                    ? "Redo"
                    : game.status === "failed"
                      ? "Retry"
                      : "Run"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPasteTargetId(pasteTargetId === game.id ? null : game.id)
                  }
                  className={`shrink-0 text-[9px] uppercase tracking-[0.08em] hover:underline ${
                    pasteTargetId === game.id
                      ? "text-green-400"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                  }`}
                >
                  {pasteTargetId === game.id ? "Waiting for Ctrl+V..." : "Paste"}
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRefs.current.get(game.id)?.click()}
                  className="shrink-0 text-[9px] uppercase tracking-[0.08em] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:underline"
                >
                  Upload
                </button>
                <input
                  ref={(el) => {
                    if (el) fileInputRefs.current.set(game.id, el);
                  }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(game.id, file);
                    e.target.value = "";
                  }}
                />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
