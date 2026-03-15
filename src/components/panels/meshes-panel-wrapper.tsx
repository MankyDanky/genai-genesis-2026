"use client";

import { useGameForge } from "@/lib/game-forge-context";
import { MeshesPanel } from "@/components/meshes-panel";

export function MeshesPanelWrapper() {
  const { generatedMeshes, removeMesh } = useGameForge();
  return <MeshesPanel meshes={generatedMeshes} onRemoveMesh={removeMesh} />;
}
