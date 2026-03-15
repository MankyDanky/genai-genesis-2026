"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import type { AudioTrack, GeneratedMesh } from "@/lib/game-forge-context";
import type { RuntimeEnvMap } from "@/lib/runtime-env";

const CODE_SYMBOLS = [
  { char: "{", x: 8, size: 18, duration: 4.2, delay: 0 },
  { char: "}", x: 92, size: 16, duration: 3.8, delay: 0.5 },
  { char: "<", x: 15, size: 14, duration: 5.0, delay: 1.2 },
  { char: ">", x: 78, size: 20, duration: 3.5, delay: 0.3 },
  { char: "/", x: 45, size: 16, duration: 4.5, delay: 1.8 },
  { char: ";", x: 62, size: 12, duration: 3.2, delay: 0.8 },
  { char: "(", x: 25, size: 15, duration: 4.8, delay: 2.1 },
  { char: ")", x: 55, size: 17, duration: 3.6, delay: 1.5 },
  { char: "=", x: 35, size: 13, duration: 5.2, delay: 0.7 },
  { char: ".", x: 70, size: 11, duration: 4.0, delay: 2.5 },
  { char: "0", x: 18, size: 14, duration: 3.9, delay: 1.0 },
  { char: "1", x: 82, size: 16, duration: 4.3, delay: 1.7 },
  { char: "[]", x: 50, size: 12, duration: 5.5, delay: 0.2 },
  { char: "=>", x: 30, size: 13, duration: 3.4, delay: 2.3 },
  { char: "fn", x: 68, size: 15, duration: 4.7, delay: 0.9 },
  { char: "if", x: 40, size: 14, duration: 3.7, delay: 1.4 },
  { char: "&&", x: 85, size: 11, duration: 5.1, delay: 2.0 },
  { char: "++", x: 12, size: 13, duration: 4.1, delay: 0.6 },
  { char: "::", x: 58, size: 12, duration: 3.3, delay: 1.9 },
  { char: "~", x: 75, size: 16, duration: 4.6, delay: 1.1 },
];

interface SandboxProps {
  code: string | null;
  isGenerating?: boolean;
  audioTracks?: AudioTrack[];
  generatedMeshes?: GeneratedMesh[];
  runtimeEnv?: RuntimeEnvMap;
  gamePaused?: boolean;
  restartCounter?: number;
  onConsoleMessage?: (event: {
    level: "log" | "info" | "warn" | "error";
    args: string[];
    source: "console" | "error" | "unhandledrejection";
  }) => void;
  onInspectorMessage?: (data: Record<string, unknown>) => void;
  onReload?: () => void;
}

function ShareBar({
  code,
  openHtml,
  containerRef,
  onReload,
}: {
  code: string;
  openHtml: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onReload?: () => void;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

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
    const blob = new Blob([openHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }, [openHtml]);

  const handleReload = useCallback(() => {
    setSpinning(true);
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
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={spinning ? "gf-spin360" : ""}
          onAnimationEnd={() => setSpinning(false)}
        >
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
        className={`gf-btn-chip p-1.5 border border-[var(--color-border-light)] bg-[var(--color-surface)] ${copied ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]"}`}
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 8.5l3.5 3.5L13 4" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="5" y="5" width="9" height="9" rx="1" />
            <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
          </svg>
        )}
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

/**
 * Injects cross-browser/cross-device compatibility CSS and meta tags
 * to ensure the iframe game works on all browsers and devices.
 */
function injectCompatibilityLayer(html: string): string {
  const compatCSS = `<style data-gameforge-compat>
*, *::before, *::after { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; overflow: hidden; width: 100%; height: 100%;
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
canvas { display: block; touch-action: none; }
</style>`;

  const compatMeta = `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">`;

  const hasViewport = /name\s*=\s*["']viewport["']/i.test(html);

  if (/<head[^>]*>/i.test(html)) {
    let result = html;
    if (!hasViewport) {
      result = result.replace(/<head([^>]*)>/i, `<head$1>${compatMeta}`);
    }
    // Insert compat CSS right after <head> (after potential meta injection)
    result = result.replace(/<head([^>]*)>/i, `<head$1>${compatCSS}`);
    return result;
  }

  return `${!hasViewport ? compatMeta : ""}${compatCSS}${html}`;
}

function buildInstrumentedSrcDoc(code: string, session: string): string {
  const bridge = `<script>(function(){\n  var SESSION = "${session}";\n  var hasError = false;\n  function safe(v){\n    if (typeof v === "string") return v;\n    try { return JSON.stringify(v); } catch (_e) { return String(v); }\n  }\n  function send(level,args,source){\n    try{\n      parent.postMessage({\n        __gameForgeConsole: true,\n        session: SESSION,\n        level: level,\n        source: source || "console",\n        args: Array.isArray(args) ? args.map(safe) : [safe(args)]\n      }, "*");\n    }catch(_err){}\n  }\n  function sendLifecycle(type){\n    try{\n      parent.postMessage({ __gameForgeLifecycle: true, session: SESSION, type: type }, "*");\n    }catch(_err){}\n  }\n  ["log","info","warn","error"].forEach(function(level){\n    var orig = console[level];\n    console[level] = function(){\n      var args = Array.prototype.slice.call(arguments);\n      send(level,args,"console");\n      return orig.apply(console,args);\n    };\n  });\n  window.addEventListener("error", function(e){\n    hasError = true;\n    send("error", [e.message || "Unknown error", e.filename || "", String(e.lineno || 0) + ":" + String(e.colno || 0)], "error");\n    sendLifecycle("frame-error");\n  });\n  window.addEventListener("unhandledrejection", function(e){\n    hasError = true;\n    var reason = e.reason && e.reason.message ? e.reason.message : e.reason;\n    send("error", ["Unhandled promise rejection", safe(reason)], "unhandledrejection");\n    sendLifecycle("frame-error");\n  });\n  document.addEventListener("DOMContentLoaded", function(){\n    setTimeout(function(){ if (!hasError) sendLifecycle("frame-ready"); }, 150);\n  });\n})();<\/script>`;

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

const MESH_BRIDGE_SCRIPT = `<script>
window.__GAMEFORGE_MESHES__ = window.__GAMEFORGE_MESHES__ || {};
window.addEventListener('message', function(e) {
  if (!e.data || e.data.type !== 'gameforge-meshes-update') return;
  var meshes = e.data.meshes || {};
  for (var meshName in meshes) {
    window.__GAMEFORGE_MESHES__[meshName] = meshes[meshName];
  }
  if (typeof window.__onMeshesUpdated === 'function') window.__onMeshesUpdated();
});
</script>`;

function injectMeshBridge(html: string, meshes: GeneratedMesh[]): string {
  const readyMeshes = meshes.filter((m) => m.status === "ready" && !!m.glbUrl);
  const meshMap: Record<string, { glbUrl: string; name: string }> = {};

  for (const mesh of readyMeshes) {
    meshMap[mesh.name] = {
      glbUrl: `/api/meshes/${encodeURIComponent(mesh.id)}/file`,
      name: mesh.name,
    };
  }

  const initialScript = `<script>
window.__GAMEFORGE_MESHES__ = ${JSON.stringify(meshMap)};
</script>`;

  const combined = `${MESH_BRIDGE_SCRIPT}${initialScript}`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${combined}`);
  }
  return `${combined}${html}`;
}

function injectMultiplayerRuntime(html: string, runtimeEnv: RuntimeEnvMap): string {
  const resolvedHost = runtimeEnv.__PARTYKIT_HOST__ ?? process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";
  const resolvedProtocol = runtimeEnv.__PARTYKIT_PROTOCOL__ ?? process.env.NEXT_PUBLIC_PARTYKIT_PROTOCOL ?? "";
  const script = `<script>
window.__GAMEFORGE_ENV__ = Object.assign({}, window.__GAMEFORGE_ENV__ || {}, ${JSON.stringify(runtimeEnv)});
Object.keys(window.__GAMEFORGE_ENV__).forEach(function (k) {
  if (typeof window[k] === "undefined") window[k] = window.__GAMEFORGE_ENV__[k];
});
window.__PARTYKIT_HOST__ = window.__PARTYKIT_HOST__ || ${JSON.stringify(resolvedHost)};
window.__PARTYKIT_PROTOCOL__ = window.__PARTYKIT_PROTOCOL__ || ${JSON.stringify(resolvedProtocol)};
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

function generateSession(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildInspectorBridge(): string {
  return `<script>(function(){
  var frames=0,lastTime=performance.now(),fpsMin=Infinity,fpsMax=0;
  var _raf=window.requestAnimationFrame;
  var paused=false,rafQueue=[];
  window.requestAnimationFrame=function(cb){
    if(paused){rafQueue.push(cb);return -1;}
    frames++;return _raf.call(window,cb);
  };
  setInterval(function(){
    var now=performance.now(),dt=now-lastTime;
    if(dt<100)return;
    var fps=Math.round(frames*1000/dt);
    var ft=frames>0?Math.round(dt/frames*10)/10:0;
    if(frames>0){if(fps<fpsMin)fpsMin=fps;if(fps>fpsMax)fpsMax=fps;}
    parent.postMessage({__gameForgeInspector:true,type:"metrics",fps:fps,frameTime:ft,fpsMin:fpsMin===Infinity?0:fpsMin,fpsMax:fpsMax},"*");
    frames=0;lastTime=now;
  },500);
  var ctxType="none",_getCtx=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type){
    var ctx=_getCtx.apply(this,arguments);
    if(ctx&&ctxType==="none"){
      ctxType=type==="webgl2"?"WebGL2":type==="webgl"||type==="experimental-webgl"?"WebGL":type==="2d"?"2D":type;
      reportCanvas();
    }
    return ctx;
  };
  function reportCanvas(){
    var c=document.querySelector("canvas");
    parent.postMessage({__gameForgeInspector:true,type:"canvasInfo",width:c?c.width:0,height:c?c.height:0,contextType:ctxType,pixelRatio:window.devicePixelRatio||1},"*");
  }
  window.addEventListener("load",function(){setTimeout(reportCanvas,200);});
  window.addEventListener("resize",function(){setTimeout(reportCanvas,200);});
  var keys={};
  function reportInputs(){parent.postMessage({__gameForgeInspector:true,type:"inputs",keys:Object.keys(keys)},"*");}
  window.addEventListener("keydown",function(e){if(!keys[e.key]){keys[e.key]=1;reportInputs();}});
  window.addEventListener("keyup",function(e){delete keys[e.key];reportInputs();});
  window.addEventListener("mousedown",function(e){keys["Mouse"+e.button]=1;reportInputs();});
  window.addEventListener("mouseup",function(e){delete keys["Mouse"+e.button];reportInputs();});
  window.addEventListener("blur",function(){keys={};reportInputs();});
  window.addEventListener("message",function(e){
    if(!e.data)return;
    if(e.data.type==="gameforge-pause"&&!paused){paused=true;}
    else if(e.data.type==="gameforge-resume"&&paused){
      paused=false;var q=rafQueue.slice();rafQueue=[];
      for(var i=0;i<q.length;i++){frames++;_raf.call(window,q[i]);}
    }
  });
})();<\/script>`;
}

function injectInspectorBridge(html: string): string {
  const bridge = buildInspectorBridge();
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${bridge}`);
  }
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${bridge}`);
  }
  return `${bridge}${html}`;
}

const EMPTY_AUDIO_TRACKS: AudioTrack[] = [];
const EMPTY_MESHES: GeneratedMesh[] = [];
const EMPTY_RUNTIME_ENV: RuntimeEnvMap = {};

export function Sandbox({ code, isGenerating = false, audioTracks = EMPTY_AUDIO_TRACKS, generatedMeshes = EMPTY_MESHES, runtimeEnv = EMPTY_RUNTIME_ENV, gamePaused = false, restartCounter = 0, onConsoleMessage, onInspectorMessage, onReload }: SandboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframe0Ref = useRef<HTMLIFrameElement>(null);
  const iframe1Ref = useRef<HTMLIFrameElement>(null);

  // Which iframe is currently visible (0 or 1)
  const [activeIndex, setActiveIndex] = useState<0 | 1>(0);
  const activeIndexRef = useRef<0 | 1>(0);

  // Each iframe independently tracks its own srcDoc
  const [iframe0SrcDoc, setIframe0SrcDoc] = useState<string | null>(null);
  const [iframe1SrcDoc, setIframe1SrcDoc] = useState<string | null>(null);

  // Last srcDoc that loaded without errors (for rollback)
  const lastGoodSrcDocRef = useRef<string | null>(null);
  const currentSessionRef = useRef<string | null>(null);
  const isFirstLoadRef = useRef(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Generate a new session only when code or reloadKey changes (not on every useMemo recomputation)
  const sessionRef = useRef<string>(generateSession());
  const prevCodeRef = useRef<string | null>(code);
  const prevReloadKeyRef = useRef(reloadKey);
  if (code !== prevCodeRef.current || reloadKey !== prevReloadKeyRef.current) {
    sessionRef.current = generateSession();
    prevCodeRef.current = code;
    prevReloadKeyRef.current = reloadKey;
  }

  // Build instrumented srcDoc
  const srcDoc = useMemo(() => {
    if (!code) return null;
    const withCompat = injectCompatibilityLayer(code);
    const withConsole = buildInstrumentedSrcDoc(withCompat, sessionRef.current);
    const withAudio = injectSoundBridge(withConsole, audioTracks);
    const withMeshes = injectMeshBridge(withAudio, generatedMeshes);
    const withInspector = injectInspectorBridge(withMeshes);
    return injectMultiplayerRuntime(withInspector, runtimeEnv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioTracks, code, generatedMeshes, runtimeEnv, reloadKey]);

  // When srcDoc changes, load it immediately into the active iframe
  useEffect(() => {
    if (!srcDoc) return;
    currentSessionRef.current = sessionRef.current;

    // Update React state for reconciliation
    if (activeIndexRef.current === 0) {
      setIframe0SrcDoc(srcDoc);
    } else {
      setIframe1SrcDoc(srcDoc);
    }

    // Directly set srcdoc on the DOM element to force an immediate reload.
    // React's prop reconciliation alone doesn't reliably trigger iframe
    // re-navigation when srcDoc changes on an existing element.
    const activeRef = activeIndexRef.current === 0 ? iframe0Ref : iframe1Ref;
    if (activeRef.current) {
      activeRef.current.srcdoc = srcDoc;
    }
  }, [srcDoc]);

  // Listen for lifecycle signals
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data as {
        __gameForgeLifecycle?: boolean;
        session?: string;
        type?: string;
      };
      if (!data || data.__gameForgeLifecycle !== true) return;
      if (!data.session || data.session !== currentSessionRef.current) return;

      if (data.type === "frame-ready") {
        // This code loaded successfully — save as fallback and sync the inactive iframe
        lastGoodSrcDocRef.current = srcDoc;
        isFirstLoadRef.current = false;

        // Update the inactive iframe so it's ready as a fallback
        if (activeIndexRef.current === 0) {
          setIframe1SrcDoc(srcDoc);
        } else {
          setIframe0SrcDoc(srcDoc);
        }
      } else if (data.type === "frame-error") {
        // Swap to fallback iframe (which already has last good code loaded)
        if (lastGoodSrcDocRef.current) {
          const next: 0 | 1 = activeIndexRef.current === 0 ? 1 : 0;
          activeIndexRef.current = next;
          setActiveIndex(next);
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [srcDoc]);

  // Console message forwarding
  useEffect(() => {
    if (!onConsoleMessage) return;

    const handler = (event: MessageEvent) => {
      const data = event.data as {
        __gameForgeConsole?: boolean;
        session?: string;
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

  // Send audio tracks to the active iframe
  useEffect(() => {
    const activeRef = activeIndex === 0 ? iframe0Ref : iframe1Ref;
    const iframe = activeRef.current;
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
  }, [audioTracks, activeIndex]);

  // Send mesh data to the active iframe
  useEffect(() => {
    const activeRef = activeIndex === 0 ? iframe0Ref : iframe1Ref;
    const iframe = activeRef.current;
    if (!iframe?.contentWindow) return;

    const readyMeshes = generatedMeshes.filter((m) => m.status === "ready" && !!m.glbUrl);
    if (readyMeshes.length === 0) return;

    const meshes: Record<string, { glbUrl: string; name: string }> = {};
    for (const mesh of readyMeshes) {
      meshes[mesh.name] = {
        glbUrl: `/api/meshes/${encodeURIComponent(mesh.id)}/file`,
        name: mesh.name,
      };
    }

    iframe.contentWindow.postMessage({ type: "gameforge-meshes-update", meshes }, "*");
  }, [generatedMeshes, activeIndex]);

  // Inspector message forwarding
  useEffect(() => {
    if (!onInspectorMessage) return;

    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.__gameForgeInspector !== true || !data.type) return;
      onInspectorMessage(data as Record<string, unknown>);
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onInspectorMessage]);

  // Send pause/resume to active iframe
  useEffect(() => {
    const activeRef = activeIndex === 0 ? iframe0Ref : iframe1Ref;
    const iframe = activeRef.current;
    if (!iframe?.contentWindow) return;

    iframe.contentWindow.postMessage(
      { type: gamePaused ? "gameforge-pause" : "gameforge-resume" },
      "*"
    );
  }, [gamePaused, activeIndex]);

  // Restart when restartCounter changes
  const prevRestartRef = useRef(restartCounter);
  useEffect(() => {
    if (restartCounter !== prevRestartRef.current) {
      prevRestartRef.current = restartCounter;
      setReloadKey((prev) => prev + 1);
      onReload?.();
    }
  }, [restartCounter, onReload]);

  const handleReload = useCallback(() => {
    setReloadKey((prev) => prev + 1);
    onReload?.();
  }, [onReload]);

  const pendingMeshes = generatedMeshes.filter(
    (m) => m.status === "pending" || m.status === "refining"
  );
  const hasPendingMeshes = pendingMeshes.length > 0;

  if (!code) {
    if (isGenerating) {
      return (
        <div className="relative flex h-full w-full items-center justify-center bg-[var(--color-bg)] overflow-hidden">
          {CODE_SYMBOLS.map((sym, i) => (
            <span
              key={i}
              className="absolute text-[var(--color-accent)] font-mono pointer-events-none select-none"
              style={{
                left: `${sym.x}%`,
                bottom: 0,
                fontSize: `${sym.size}px`,
                opacity: 0,
                animation: `codeFloat ${sym.duration}s linear ${sym.delay}s infinite`,
              }}
            >
              {sym.char}
            </span>
          ))}
          <div className="relative text-center space-y-3 z-10">
            <p
              className="text-[13px] text-[var(--color-accent)] uppercase tracking-[0.2em] font-bold"
              style={{ animation: "pulseGlow 2s ease-in-out infinite" }}
            >
              Generating Game
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
              Building your experience...
            </p>
          </div>
        </div>
      );
    }

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

  const isFirstLoad = isFirstLoadRef.current;

  const visibleStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    opacity: 1,
    zIndex: 1,
    pointerEvents: "auto",
    transition: isFirstLoad ? undefined : "opacity 0.15s ease-out",
    animation: isFirstLoad ? "gameReveal 0.5s ease-out" : undefined,
  };

  const hiddenStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    opacity: 0,
    zIndex: 0,
    pointerEvents: "none",
  };

  return (
    <div ref={containerRef} className="relative h-full w-full bg-black overflow-hidden">
      <ShareBar code={code} openHtml={srcDoc ?? code} containerRef={containerRef} onReload={handleReload} />
      <iframe
        ref={iframe0Ref}
        srcDoc={iframe0SrcDoc ?? undefined}
        sandbox="allow-scripts allow-same-origin allow-pointer-lock"
        title="Game Preview"
        className="border-none"
        style={activeIndex === 0 ? visibleStyle : hiddenStyle}
        tabIndex={activeIndex === 0 ? undefined : -1}
      />
      <iframe
        ref={iframe1Ref}
        srcDoc={iframe1SrcDoc ?? undefined}
        sandbox="allow-scripts allow-same-origin allow-pointer-lock"
        title="Game Preview (staging)"
        className="border-none"
        style={activeIndex === 1 ? visibleStyle : hiddenStyle}
        tabIndex={activeIndex === 1 ? undefined : -1}
      />
      {hasPendingMeshes && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-[fadeIn_0.3s_ease-out]">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-surface)]/90 border border-[var(--color-border-light)] rounded-sm" style={{ backdropFilter: "blur(6px)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" className="animate-spin" style={{ animationDuration: "1.5s" }}>
              <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-7.07l-2.83 2.83M9.76 14.24l-2.83 2.83m11.14 0l-2.83-2.83M9.76 9.76L6.93 6.93" />
            </svg>
            <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.1em] font-semibold">
              Generating {pendingMeshes.length} mesh{pendingMeshes.length !== 1 ? "es" : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
