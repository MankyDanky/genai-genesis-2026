"use client";

import { useGameForge } from "@/lib/game-forge-context";
import { Sandbox } from "@/components/sandbox";

export function SandboxPanel() {
  const {
    currentCode,
    addConsoleLog,
    clearConsoleLogs,
    audioTracks,
    updateFps,
    sandboxReloadTrigger,
    screenshotRequest,
    onScreenshotReady,
    pauseRequest,
    setIsPaused,
  } = useGameForge();

  return (
    <Sandbox
      code={currentCode}
      onConsoleMessage={addConsoleLog}
      onReload={clearConsoleLogs}
      audioTracks={audioTracks}
      onFpsUpdate={updateFps}
      reloadTrigger={sandboxReloadTrigger}
      screenshotRequest={screenshotRequest}
      onScreenshotReady={onScreenshotReady}
      pauseRequest={pauseRequest}
      onPauseStateChange={setIsPaused}
    />
  );
}
