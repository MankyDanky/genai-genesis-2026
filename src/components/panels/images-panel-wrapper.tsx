"use client";

import { useGameForge } from "@/lib/game-forge-context";
import { ImagesPanel } from "@/components/images-panel";

export function ImagesPanelWrapper() {
  const { generatedImages } = useGameForge();
  return <ImagesPanel images={generatedImages} />;
}
