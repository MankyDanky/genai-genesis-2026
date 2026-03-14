"use client";

import { useGameForge } from "@/lib/game-forge-context";
import { Sandbox } from "@/components/sandbox";

export function SandboxPanel() {
  const { currentCode, audioTracks } = useGameForge();
  return <Sandbox code={currentCode} audioTracks={audioTracks} />;
}
