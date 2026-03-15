"use client";

import { useGameForge } from "@/lib/game-forge-context";
import { MeshesPanel } from "@/components/meshes-panel";

export function MeshesPanelWrapper() {
  const forge = useGameForge() as unknown as {
    generatedMeshes?: unknown;
    removeMesh?: (id: string) => void;
  };
  const meshes = Array.isArray(forge.generatedMeshes) ? forge.generatedMeshes : [];
  const onRemoveMesh = typeof forge.removeMesh === "function" ? forge.removeMesh : () => {};
  return <MeshesPanel meshes={meshes} onRemoveMesh={onRemoveMesh} />;
}
