"use client";

import { useGameForge } from "@/lib/game-forge-context";
import { Sandbox } from "@/components/sandbox";

export function SandboxPanel() {
  const { currentCode, addConsoleLog, clearConsoleLogs, audioTracks } = useGameForge();
  return <Sandbox code={currentCode} onConsoleMessage={addConsoleLog} onReload={clearConsoleLogs} audioTracks={audioTracks} />;
}
