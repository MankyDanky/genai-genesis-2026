"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { RuntimeEnvMap } from "@/lib/runtime-env";

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
  const [copied, setCopied] = useState(false);
  const [forking, setForking] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);

  const runtimeCode = injectRuntimeMultiplayerConfig(
    code,
    multiplayer,
    multiplayerProvider,
    multiplayerRoomType,
    runtimeEnv,
    roomId,
  );

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

  const handleNewRoom = useCallback(() => {
    const nextRoom = `${gameId}-${Math.random().toString(36).slice(2, 8)}`;
    router.push(`/play/${gameId}?room=${encodeURIComponent(nextRoom)}`);
  }, [gameId, router]);

  return (
    <div
      className="flex flex-col h-screen w-screen bg-[var(--color-bg)]"
      style={{ animation: "gameReveal 0.6s ease-out both" }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between h-8 px-3 bg-[var(--color-surface)] border-b border-[var(--color-border)] shrink-0">
        <span className="text-[11px] text-[var(--color-text-secondary)] uppercase tracking-[0.1em] font-bold truncate">
          {title}
        </span>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {multiplayer ? (
            <>
              <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]">
                Room: {roomId || "none"}
              </span>
              <button
                type="button"
                onClick={handleNewRoom}
                className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.1em] font-semibold hover:text-[var(--color-accent)]"
              >
                New Room
              </button>
            </>
          ) : null}
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
        srcDoc={runtimeCode}
        sandbox="allow-scripts"
        title={title}
        className="flex-1 w-full border-none"
      />
    </div>
  );
}
