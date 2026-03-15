"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useGameForge } from "@/lib/game-forge-context";
import { Sandbox } from "@/components/sandbox";

const LOADING_MESSAGES = [
  "Booting up the game engine...",
  "Loading assets into VRAM...",
  "Calibrating physics engine...",
  "Rendering first frame...",
  "Warming up the GPU...",
  "Initializing the pixel forge...",
  "Dusting off the sprite sheets...",
  "Pressing START...",
];

const CYCLE_MS = 2500;

function SandboxLoadingOverlay() {
  const [index, setIndex] = useState(
    () => Math.floor(Math.random() * LOADING_MESSAGES.length),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, CYCLE_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--color-bg)]">
      <div className="flex flex-col items-center gap-5 animate-[fadeIn_0.3s_ease-out]">
        <Image
          src="/axiom.png"
          alt="Loading"
          width={48}
          height={48}
          className="animate-spin"
          style={{ animationDuration: "1.8s" }}
          priority
        />
        <p
          key={index}
          className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]"
          style={{ animation: `loadingTextSwap ${CYCLE_MS}ms ease-in-out both` }}
        >
          {LOADING_MESSAGES[index]}
        </p>
      </div>
    </div>
  );
}

export function SandboxPanel() {
  const {
    currentCode,
    addConsoleLog,
    clearConsoleLogs,
    audioTracks,
    generatedMeshes,
    runtimeEnv,
    gamePaused,
    restartCounter,
    projectBusyAction,
    setInspectorMetrics,
    setCanvasInfo,
    setActiveInputs,
  } = useGameForge();

  const handleInspectorMessage = useCallback(
    (data: Record<string, unknown>) => {
      switch (data.type) {
        case "metrics":
          setInspectorMetrics({
            fps: data.fps as number,
            frameTime: data.frameTime as number,
            fpsMin: data.fpsMin as number,
            fpsMax: data.fpsMax as number,
          });
          break;
        case "canvasInfo":
          setCanvasInfo({
            width: data.width as number,
            height: data.height as number,
            contextType: data.contextType as string,
            pixelRatio: data.pixelRatio as number,
          });
          break;
        case "inputs":
          setActiveInputs(data.keys as string[]);
          break;
      }
    },
    [setInspectorMetrics, setCanvasInfo, setActiveInputs]
  );

  if (projectBusyAction === "load") {
    return <SandboxLoadingOverlay />;
  }

  return (
    <Sandbox
      code={currentCode}
      onConsoleMessage={addConsoleLog}
      onReload={clearConsoleLogs}
      audioTracks={audioTracks}
      generatedMeshes={generatedMeshes}
      runtimeEnv={runtimeEnv}
      gamePaused={gamePaused}
      restartCounter={restartCounter}
      onInspectorMessage={handleInspectorMessage}
    />
  );
}
