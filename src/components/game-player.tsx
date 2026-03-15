"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { RuntimeEnvMap } from "@/lib/runtime-env";
import {
  injectCompatibilityLayer,
  injectPointerLockShim,
  injectFocusBridge,
} from "@/lib/iframe-injections";

interface GamePlayerProps {
  code: string;
  title: string;
  gameId: string;
  multiplayer: boolean;
  multiplayerProvider: "partykit" | null;
  multiplayerRoomType: string | null;
  runtimeEnv: RuntimeEnvMap;
  roomId: string | null;
}

function injectRuntimeMultiplayerConfig(
  html: string,
  multiplayer: boolean,
  multiplayerProvider: "partykit" | null,
  multiplayerRoomType: string | null,
  runtimeEnv: RuntimeEnvMap,
  roomId: string | null,
) {
  if (!multiplayer || multiplayerProvider !== "partykit" || !roomId) return html;

  const roomType = multiplayerRoomType || "game";
  const resolvedHost =
    runtimeEnv.__PARTYKIT_HOST__ ?? process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";
  const resolvedProtocol =
    runtimeEnv.__PARTYKIT_PROTOCOL__ ?? process.env.NEXT_PUBLIC_PARTYKIT_PROTOCOL ?? "";
  const script = `<script>
window.__GAMEFORGE_ENV__ = Object.assign({}, window.__GAMEFORGE_ENV__ || {}, ${JSON.stringify(runtimeEnv)});
Object.keys(window.__GAMEFORGE_ENV__).forEach(function (k) {
  if (typeof window[k] === "undefined") window[k] = window.__GAMEFORGE_ENV__[k];
});
window.__GAMEFORGE_MULTIPLAYER__ = { enabled: true, provider: "partykit", roomType: ${JSON.stringify(roomType)}, roomId: ${JSON.stringify(roomId)} };
window.__PARTYKIT_ROOM_ID__ = ${JSON.stringify(roomId)};
window.__GAMEFORGE_PARTYKIT_ROOM_TYPE__ = ${JSON.stringify(roomType)};
window.__PARTYKIT_HOST__ = window.__PARTYKIT_HOST__ || ${JSON.stringify(resolvedHost)};
window.__PARTYKIT_PROTOCOL__ = window.__PARTYKIT_PROTOCOL__ || ${JSON.stringify(resolvedProtocol)};
// Compatibility shim: older generated games may use custom PartyKit roomType paths
// that are not mapped in partykit.json. Rewrite to /parties/game/:roomId when needed.
(function () {
  if (!window.WebSocket || window.__GAMEFORGE_WS_PATCHED__) return;
  window.__GAMEFORGE_WS_PATCHED__ = true;
  const NativeWebSocket = window.WebSocket;
  const host = window.__PARTYKIT_HOST__;
  const defaultRoomType = "game";

  function rewriteUrl(url) {
    try {
      const u = new URL(url);
      if (!host || u.host !== host) return url;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 3 && parts[0] === "parties" && parts[1] !== defaultRoomType) {
        parts[1] = defaultRoomType;
        u.pathname = "/" + parts.join("/");
        return u.toString();
      }
      return url;
    } catch {
      return url;
    }
  }

  function PatchedWebSocket(url, protocols) {
    const rewritten = typeof url === "string" ? rewriteUrl(url) : url;
    return protocols === undefined
      ? new NativeWebSocket(rewritten)
      : new NativeWebSocket(rewritten, protocols);
  }

  PatchedWebSocket.prototype = NativeWebSocket.prototype;
  Object.setPrototypeOf(PatchedWebSocket, NativeWebSocket);
  window.WebSocket = PatchedWebSocket;
})();
</script>`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${script}`);
  }
  return `${script}${html}`;
}

export function GamePlayer({
  code,
  title,
  gameId,
  multiplayer,
  multiplayerProvider,
  multiplayerRoomType,
  runtimeEnv,
  roomId,
}: GamePlayerProps) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [forking, setForking] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const runtimeCode = injectFocusBridge(
    injectPointerLockShim(
      injectCompatibilityLayer(
        injectRuntimeMultiplayerConfig(
          code,
          multiplayer,
          multiplayerProvider,
          multiplayerRoomType,
          runtimeEnv,
          roomId,
        ),
      ),
    ),
  );

  // Focus iframe contentWindow on load
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const handleLoad = () => {
      try { iframe.contentWindow?.focus(); } catch (_e) { /* cross-origin */ }
    };
    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, []);

  const handleContainerFocus = useCallback(() => {
    try { iframeRef.current?.contentWindow?.focus(); } catch (_e) { /* cross-origin */ }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    showToast("Link copied");
  }, [showToast]);

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

  const handleNewRoom = useCallback(() => {
    const nextRoom = `${gameId}-${Math.random().toString(36).slice(2, 8)}`;
    router.push(`/play/${gameId}?room=${encodeURIComponent(nextRoom)}`);
  }, [gameId, router]);

  return (
    <div
      className="flex flex-col h-screen w-screen bg-[var(--color-bg)]"
      style={{ animation: "gameReveal 0.6s ease-out both" }}
      onClick={handleContainerFocus}
      onPointerDown={handleContainerFocus}
    >
      {/* Top bar */}
      <div className="flex items-center h-10 px-2 bg-[var(--color-surface)] border-b border-[var(--color-border)] shrink-0 gap-2">
        {/* Back button */}
        <Link
          href="/explore"
          className="gf-btn-chip flex items-center gap-1.5 px-2 py-1 border border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-text-muted)] text-[10px] uppercase tracking-[0.1em] font-semibold shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3L5 8l5 5" />
          </svg>
          Back
        </Link>

        {/* Divider */}
        <div className="w-px h-4 bg-[var(--color-border-light)] shrink-0" />

        {/* Title */}
        <span className="text-[11px] text-[var(--color-text-secondary)] uppercase tracking-[0.1em] font-bold truncate min-w-0">
          {title}
        </span>

        {/* Multiplayer badge */}
        {multiplayer ? (
          <div className="flex items-center gap-2 shrink-0 ml-auto mr-0">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-[var(--color-accent-dim)] bg-[var(--color-accent-glow)] text-[10px] text-[var(--color-accent)] uppercase tracking-[0.1em] font-semibold">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="5" cy="6" r="2.5" />
                <circle cx="11" cy="6" r="2.5" />
                <path d="M0 14c0-2.5 2.2-4.5 5-4.5.7 0 1.4.1 2 .4a5.3 5.3 0 0 0-2 3.6V14H0zm8 0v-.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5V14H8z" />
              </svg>
              {roomId || "none"}
            </span>
            <button
              type="button"
              onClick={handleNewRoom}
              className="gf-btn-chip px-2 py-0.5 border border-[var(--color-border-light)] text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.1em] font-semibold"
            >
              New Room
            </button>
          </div>
        ) : null}

        {/* Right actions */}
        <div className={`flex items-center gap-1.5 shrink-0 ${multiplayer ? "" : "ml-auto"}`}>
          {/* Share */}
          <button
            type="button"
            onClick={handleShare}
            className="gf-btn-chip flex items-center gap-1.5 px-2.5 py-1 border border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-text-muted)] text-[10px] uppercase tracking-[0.1em] font-semibold"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 2h5v5" />
              <path d="M14 2L7 9" />
              <path d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" />
            </svg>
            Share
          </button>

          {/* Remix */}
          <button
            type="button"
            onClick={handleFork}
            disabled={forking}
            className="gf-remix-btn flex items-center gap-1.5 px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] disabled:opacity-50"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 3v4a2 2 0 0 0 2 2h2" />
              <path d="M11 3v4a2 2 0 0 1-2 2H7" />
              <path d="M5 1v4" />
              <path d="M11 1v4" />
              <circle cx="8" cy="13" r="2" />
            </svg>
            {forking ? "Remixing..." : "Remix"}
          </button>

          {forkError ? (
            <span className="text-[10px] text-red-400 px-1">{forkError}</span>
          ) : null}

          {/* Divider */}
          <div className="w-px h-4 bg-[var(--color-border-light)] shrink-0" />

          {/* Create your own */}
          <Link
            href="/?new=1"
            className="gf-btn-chip flex items-center gap-1.5 px-2.5 py-1 border border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-accent)] text-[10px] uppercase tracking-[0.1em] font-semibold"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 3v10M3 8h10" />
            </svg>
            Create
          </Link>
        </div>
      </div>

      {/* Game iframe */}
      <iframe
        ref={iframeRef}
        srcDoc={runtimeCode}
        sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals"
        allow="pointer-lock; fullscreen; autoplay"
        title={title}
        className="flex-1 w-full border-none"
        tabIndex={0}
      />

      {/* Toast */}
      {toast ? (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border-light)] text-[10px] text-[var(--color-success)] uppercase tracking-[0.15em] font-bold pointer-events-none"
          style={{ animation: "messageFade 2s ease forwards" }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
