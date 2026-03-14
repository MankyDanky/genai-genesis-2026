"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import type { AudioTrack, GeneratedMesh } from "@/lib/game-forge-context";

interface SandboxProps {
  code: string | null;
  audioTracks?: AudioTrack[];
  generatedMeshes?: GeneratedMesh[];
  onConsoleMessage?: (event: {
    level: "log" | "info" | "warn" | "error";
    args: string[];
    source: "console" | "error" | "unhandledrejection";
  }) => void;
  onReload?: () => void;
  onFpsUpdate?: (fps: number) => void;
  reloadTrigger?: number;
  screenshotRequest?: number;
  onScreenshotReady?: (dataUrl: string) => void;
  pauseRequest?: number;
  onPauseStateChange?: (paused: boolean) => void;
}

function ShareBar({
  code,
  audioTracks,
  generatedMeshes,
  containerRef,
  onReload,
}: {
  code: string;
  audioTracks: AudioTrack[];
  generatedMeshes: GeneratedMesh[];
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
    const full = injectSoundBridge(code, audioTracks, generatedMeshes);
    const titleMatch = full.match(/<title>(.*?)<\/title>/i);
    const name = titleMatch?.[1]?.replace(/\s+/g, "-").toLowerCase() ?? "game";
    const blob = new Blob([full], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Downloaded");
  }, [code, audioTracks, generatedMeshes, showToast]);

  const handleOpen = useCallback(() => {
    const full = injectSoundBridge(code, audioTracks, generatedMeshes);
    const blob = new Blob([full], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }, [code, audioTracks, generatedMeshes]);

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

  const fpsBridge = `<script>(function(){
  var frames=0,last=performance.now();
  function tick(){
    frames++;
    var now=performance.now();
    if(now-last>=500){
      var fps=Math.round(frames*1000/(now-last));
      frames=0;last=now;
      try{parent.postMessage({__gameForgeFps:true,fps:fps},"*");}catch(_){}
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();<\/script>`;

  const screenshotBridge = `<script>(function(){
  window.addEventListener("message",function(e){
    if(!e.data||e.data.type!=="gameforge-screenshot-request")return;
    var canvas=document.querySelector("canvas");
    if(!canvas){
      try{parent.postMessage({__gameForgeScreenshot:true,dataUrl:null},"*");}catch(_){}
      return;
    }
    try{
      var dataUrl=canvas.toDataURL("image/png");
      parent.postMessage({__gameForgeScreenshot:true,dataUrl:dataUrl},"*");
    }catch(_){
      parent.postMessage({__gameForgeScreenshot:true,dataUrl:null},"*");
    }
  });
})();<\/script>`;

  const pauseBridge = `<script>(function(){
  var origRAF=window.requestAnimationFrame;
  var paused=false,queued=[];
  var trackedAudio=[];
  var OrigAudio=window.Audio;
  window.__gameForgePaused=false;
  window.Audio=function(){
    var a=new OrigAudio();
    trackedAudio.push(a);
    return a;
  };
  window.Audio.prototype=OrigAudio.prototype;
  window.requestAnimationFrame=function(cb){
    if(paused){queued.push(cb);return queued.length;}
    return origRAF.call(window,cb);
  };
  function pauseAllAudio(){
    trackedAudio=trackedAudio.filter(function(a){return a.src;});
    for(var i=0;i<trackedAudio.length;i++){
      try{if(!trackedAudio[i].paused)trackedAudio[i].pause();}catch(_){}
    }
    var elems=document.querySelectorAll("audio,video");
    for(var j=0;j<elems.length;j++){
      try{if(!elems[j].paused)elems[j].pause();}catch(_){}
    }
  }
  function resumeAllAudio(){
    for(var i=0;i<trackedAudio.length;i++){
      try{if(trackedAudio[i].paused&&trackedAudio[i].currentTime>0)trackedAudio[i].play();}catch(_){}
    }
    var elems=document.querySelectorAll("audio,video");
    for(var j=0;j<elems.length;j++){
      try{if(elems[j].paused&&elems[j].currentTime>0)elems[j].play();}catch(_){}
    }
  }
  window.addEventListener("message",function(e){
    if(!e.data||e.data.type!=="gameforge-pause-toggle")return;
    paused=!paused;
    window.__gameForgePaused=paused;
    if(paused){
      pauseAllAudio();
    }else{
      var q=queued.slice();queued=[];
      for(var i=0;i<q.length;i++){origRAF.call(window,q[i]);}
      resumeAllAudio();
    }
    try{parent.postMessage({__gameForgePauseState:true,paused:paused},"*");}catch(_){}
  });
})();<\/script>`;

  const allBridges = `${bridge}${fpsBridge}${screenshotBridge}${pauseBridge}`;

  if (/<head[^>]*>/i.test(code)) {
    return code.replace(/<head([^>]*)>/i, `<head$1>${allBridges}`);
  }
  if (/<body[^>]*>/i.test(code)) {
    return code.replace(/<body([^>]*)>/i, `<body$1>${allBridges}`);
  }
  return `${allBridges}${code}`;
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

function injectSoundBridge(html: string, tracks: AudioTrack[], meshes: GeneratedMesh[] = []): string {
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

  const readyMeshes = meshes.filter((m) => m.status === "ready" && !!m.glbUrl);
  const meshMap: Record<string, { glbUrl: string; name: string }> = {};
  for (const mesh of readyMeshes) {
    meshMap[mesh.name] = { glbUrl: mesh.glbUrl!, name: mesh.name };
  }

  const initialScript = `<script>
window.__GAMEFORGE_SOUNDS__ = ${JSON.stringify(soundMap)};
window.__GAMEFORGE_MUSIC__ = ${JSON.stringify(musicMap)};
window.__GAMEFORGE_MESHES__ = ${JSON.stringify(meshMap)};
</script>`;

  const combined = `${SOUND_BRIDGE_SCRIPT}${MESH_BRIDGE_SCRIPT}${initialScript}`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${combined}`);
  }
  return `${combined}${html}`;
}

export function Sandbox({
  code,
  audioTracks = [],
  generatedMeshes = [],
  onConsoleMessage,
  onReload,
  onFpsUpdate,
  reloadTrigger,
  screenshotRequest,
  onScreenshotReady,
  pauseRequest,
  onPauseStateChange,
}: SandboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const srcDoc = useMemo(() => {
    if (!code) return null;
    const withConsole = buildInstrumentedSrcDoc(code);
    return injectSoundBridge(withConsole, audioTracks, generatedMeshes);
  }, [audioTracks, code, generatedMeshes]);

  const handleReload = useCallback(() => {
    setReloadKey((prev) => prev + 1);
    onReload?.();
  }, [onReload]);

  // Combine local reload key with external trigger for iframe key
  const combinedReloadKey = `${reloadKey}:${reloadTrigger ?? 0}`;

  // Screenshot request
  const prevScreenshotRequest = useRef(screenshotRequest);
  useEffect(() => {
    if (screenshotRequest !== undefined && screenshotRequest !== prevScreenshotRequest.current) {
      prevScreenshotRequest.current = screenshotRequest;
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({ type: "gameforge-screenshot-request" }, "*");
      }
    }
  }, [screenshotRequest]);

  // Pause request
  const prevPauseRequest = useRef(pauseRequest);
  useEffect(() => {
    if (pauseRequest !== undefined && pauseRequest !== prevPauseRequest.current) {
      prevPauseRequest.current = pauseRequest;
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({ type: "gameforge-pause-toggle" }, "*");
      }
    }
  }, [pauseRequest]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.__gameForgeConsole === true && onConsoleMessage) {
        onConsoleMessage({
          level: data.level ?? "log",
          args: Array.isArray(data.args) ? data.args : [],
          source: data.source ?? "console",
        });
      }

      if (data.__gameForgeFps === true && onFpsUpdate) {
        onFpsUpdate(data.fps);
      }

      if (data.__gameForgeScreenshot === true && onScreenshotReady) {
        if (data.dataUrl) {
          onScreenshotReady(data.dataUrl);
        }
      }

      if (data.__gameForgePauseState === true && onPauseStateChange) {
        onPauseStateChange(data.paused);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onConsoleMessage, onFpsUpdate, onScreenshotReady, onPauseStateChange]);

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

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    const readyMeshes = generatedMeshes.filter((m) => m.status === "ready" && !!m.glbUrl);
    if (readyMeshes.length === 0) return;

    const meshes: Record<string, { glbUrl: string; name: string }> = {};
    for (const mesh of readyMeshes) {
      meshes[mesh.name] = { glbUrl: mesh.glbUrl!, name: mesh.name };
    }

    iframe.contentWindow.postMessage({ type: "gameforge-meshes-update", meshes }, "*");
  }, [generatedMeshes]);

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
      <ShareBar code={code} audioTracks={audioTracks ?? []} generatedMeshes={generatedMeshes ?? []} containerRef={containerRef} onReload={handleReload} />
      <iframe
        ref={iframeRef}
        key={`${code}:${combinedReloadKey}`}
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        title="Game Preview"
        className="h-full w-full border-none"
      />
    </div>
  );
}
