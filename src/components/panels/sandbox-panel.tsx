"use client";

import { useCallback } from "react";
import { useGameForge } from "@/lib/game-forge-context";
import { Sandbox } from "@/components/sandbox";

export function SandboxPanel() {
  const {
    currentCode,
    addConsoleLog,
    clearConsoleLogs,
    audioTracks,
    runtimeEnv,
    gamePaused,
    restartCounter,
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

  return (
    <Sandbox
      code={currentCode}
      onConsoleMessage={addConsoleLog}
      onReload={clearConsoleLogs}
      audioTracks={audioTracks}
      runtimeEnv={runtimeEnv}
      gamePaused={gamePaused}
      restartCounter={restartCounter}
      onInspectorMessage={handleInspectorMessage}
    />
  );
}
