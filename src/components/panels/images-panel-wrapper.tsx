"use client";

import { useGameForge } from "@/lib/game-forge-context";
import { ImagesPanel } from "@/components/images-panel";

export function ImagesPanelWrapper() {
  const { generatedImages, addImage } = useGameForge();
  return <ImagesPanel images={generatedImages} onAddImage={addImage} />;
}
