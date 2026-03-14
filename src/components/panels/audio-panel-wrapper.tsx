"use client";

import { useGameForge } from "@/lib/game-forge-context";
import { AudioPanel } from "@/components/audio-panel";

export function AudioPanelWrapper() {
  const { audioTracks } = useGameForge();
  return <AudioPanel tracks={audioTracks} />;
}
