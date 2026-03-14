"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import type { AudioTrack } from "@/lib/game-forge-context";

interface SandboxProps {
  code: string | null;
  audioTracks?: AudioTrack[];
  onConsoleMessage?: (event: {
    level: "log" | "info" | "warn" | "error";
    args: string[];
    source: "console" | "error" | "unhandledrejection";
  }) => void;
  onReload?: () => void;
}

function ShareBar({
  code,
  containerRef,
  onReload,
}: {
  code: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onReload?: () => void;
}) {
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

  const handleReload = useCallback(() => {
    onReload?.();
  }, [onReload]);

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
        onClick={handleReload}
        title="Reload game"
        className="gf-btn-chip p-1.5 border border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-text-muted)]"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M13.5 8a5.5 5.5 0 1 1-1.12-3.34" />
          <path d="M10.5 2.5h3v3" />
        </svg>
      </button>

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

function buildInstrumentedSrcDoc(code: string): string {
  const bridge = `<script>(function(){\n  var SESSION = "${Date.now()}-${Math.random().toString(36).slice(2)}";\n  function safe(v){\n    if (typeof v === "string") return v;\n    try { return JSON.stringify(v); } catch (_e) { return String(v); }\n  }\n  function send(level,args,source){\n    try{\n      parent.postMessage({\n        __gameForgeConsole: true,\n        session: SESSION,\n        level: level,\n        source: source || "console",\n        args: Array.isArray(args) ? args.map(safe) : [safe(args)]\n      }, "*");\n    }catch(_err){}\n  }\n  ["log","info","warn","error"].forEach(function(level){\n    var orig = console[level];\n    console[level] = function(){\n      var args = Array.prototype.slice.call(arguments);\n      send(level,args,"console");\n      return orig.apply(console,args);\n    };\n  });\n  window.addEventListener("error", function(e){\n    send("error", [e.message || "Unknown error", e.filename || "", String(e.lineno || 0) + ":" + String(e.colno || 0)], "error");\n  });\n  window.addEventListener("unhandledrejection", function(e){\n    var reason = e.reason && e.reason.message ? e.reason.message : e.reason;\n    send("error", ["Unhandled promise rejection", safe(reason)], "unhandledrejection");\n  });\n})();<\/script>`;

  if (/<head[^>]*>/i.test(code)) {
    return code.replace(/<head([^>]*)>/i, `<head$1>${bridge}`);
  }
  if (/<body[^>]*>/i.test(code)) {
    return code.replace(/<body([^>]*)>/i, `<body$1>${bridge}`);
  }
  return `${bridge}${code}`;
}

const SOUND_BRIDGE_SCRIPT = `<script>
window.__GAMEFORGE_SOUNDS__ = window.__GAMEFORGE_SOUNDS__ || {};
window.__GAMEFORGE_MUSIC__ = window.__GAMEFORGE_MUSIC__ || {};
window.addEventListener('message', function(e) {
  if (!e.data || e.data.type !== 'gameforge-sounds-update') return;
  var sounds = e.data.sounds || {};
  var music = e.data.music || {};
  for (var soundName in sounds) {
    window.__GAMEFORGE_SOUNDS__[soundName] = sounds[soundName];
  }
  for (var musicName in music) {
    window.__GAMEFORGE_MUSIC__[musicName] = music[musicName];
  }
  if (typeof window.__onSoundsUpdated === 'function') window.__onSoundsUpdated();
  if (typeof window.__onMusicUpdated === 'function') window.__onMusicUpdated();
});
</script>`;

function injectSoundBridge(html: string, tracks: AudioTrack[]): string {
  const readyTracks = tracks.filter((track) => track.status === "ready" && !!track.dataUrl);
  const soundMap: Record<string, string> = {};
  const musicMap: Record<string, string> = {};

  for (const track of readyTracks) {
    if (track.type === "music") {
      musicMap[track.name] = track.dataUrl!;
    } else {
      soundMap[track.name] = track.dataUrl!;
    }
  }

  const initialScript = `<script>
window.__GAMEFORGE_SOUNDS__ = ${JSON.stringify(soundMap)};
window.__GAMEFORGE_MUSIC__ = ${JSON.stringify(musicMap)};
</script>`;

  const combined = `${SOUND_BRIDGE_SCRIPT}${initialScript}`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${combined}`);
  }
  return `${combined}${html}`;
}

export function Sandbox({ code, audioTracks = [], onConsoleMessage, onReload }: SandboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const srcDoc = useMemo(() => {
    if (!code) return null;
    const withConsole = buildInstrumentedSrcDoc(code);
    return injectSoundBridge(withConsole, audioTracks);
  }, [audioTracks, code]);

  const handleReload = useCallback(() => {
    setReloadKey((prev) => prev + 1);
    onReload?.();
  }, [onReload]);

  useEffect(() => {
    if (!onConsoleMessage) return;

    const handler = (event: MessageEvent) => {
      const data = event.data as {
        __gameForgeConsole?: boolean;
        level?: "log" | "info" | "warn" | "error";
        args?: string[];
        source?: "console" | "error" | "unhandledrejection";
      };
      if (!data || data.__gameForgeConsole !== true) return;
      onConsoleMessage({
        level: data.level ?? "log",
        args: Array.isArray(data.args) ? data.args : [],
        source: data.source ?? "console",
      });
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onConsoleMessage]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    const readyTracks = audioTracks.filter((track) => track.status === "ready" && !!track.dataUrl);
    if (readyTracks.length === 0) return;

    const sounds: Record<string, string> = {};
    const music: Record<string, string> = {};
    for (const track of readyTracks) {
      if (track.type === "music") {
        music[track.name] = track.dataUrl!;
      } else {
        sounds[track.name] = track.dataUrl!;
      }
    }

    iframe.contentWindow.postMessage({ type: "gameforge-sounds-update", sounds, music }, "*");
  }, [audioTracks]);

  if (!code || !srcDoc) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-[var(--color-bg)] overflow-hidden">
        <div className="relative text-center animate-[fadeIn_0.4s_ease-out] space-y-3">
          <div className="mx-auto w-10 h-10 border border-[var(--color-border-light)] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2">
              <rect x="1" y="1" width="14" height="14" rx="1" />
              <polygon points="6,4 12,8 6,12" fill="var(--color-text-muted)" opacity="0.5" stroke="none" />
            </svg>
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.15em] font-semibold">
            No Game Loaded
          </p>
          <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
            Use the Composer to generate a game
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full bg-black">
      <ShareBar code={code} containerRef={containerRef} onReload={handleReload} />
      <iframe
        ref={iframeRef}
        key={`${code}:${reloadKey}`}
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-pointer-lock"
        title="Game Preview"
        className="h-full w-full border-none"
      />
    </div>
  );
}
