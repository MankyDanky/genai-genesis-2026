"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { GeneratedMesh } from "@/lib/game-forge-context";

const MeshPreviewModal = dynamic(() => import("@/components/mesh-preview-modal"), {
  ssr: false,
});

interface MeshesPanelProps {
  meshes: GeneratedMesh[];
  onRemoveMesh: (id: string) => void;
}

function StatusBadge({ status }: { status: GeneratedMesh["status"] }) {
  const config: Record<GeneratedMesh["status"], { color: string; label: string }> = {
    pending: { color: "text-[var(--color-accent)] border-[var(--color-accent)]", label: "Generating" },
    refining: { color: "text-[#f0ab3d] border-[#f0ab3d]", label: "Texturing" },
    ready: { color: "text-[var(--color-success,#4ade80)] border-[var(--color-success,#4ade80)]", label: "Ready" },
    error: { color: "text-[var(--color-danger)] border-[var(--color-danger)]", label: "Error" },
  };

  const { color, label } = config[status];

  return (
    <span
      className={`text-[8px] uppercase tracking-[0.1em] font-bold border px-1 py-0.5 ${color}`}
    >
      {label}
    </span>
  );
}

function SpinnerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className="animate-spin">
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeDasharray="40"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

export function MeshesPanel({ meshes, onRemoveMesh }: MeshesPanelProps) {
  const [selectedMesh, setSelectedMesh] = useState<GeneratedMesh | null>(null);

  const handleClose = useCallback(() => setSelectedMesh(null), []);

  if (meshes.length === 0) {
    return (
      <div className="relative flex h-full flex-col bg-[var(--color-bg)]">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border border-dashed border-[var(--color-border-light)] flex items-center justify-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="var(--color-text-muted)"
              strokeWidth="1.2"
              opacity="0.6"
            >
              <path d="M10 2l7 4v8l-7 4-7-4V6l7-4z" />
              <path d="M10 10l7-4" />
              <path d="M10 10v8" />
              <path d="M10 10L3 6" />
            </svg>
          </div>
          <div className="text-center space-y-1">
            <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.12em] font-semibold">
              No Meshes Yet
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
              Generated 3D meshes will appear here
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[var(--color-bg)] flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="grid grid-cols-2 gap-2">
          {meshes.map((mesh) => (
            <div
              key={mesh.id}
              className="border border-[var(--color-border-light)] overflow-hidden cursor-pointer hover:border-[var(--color-accent)] transition-colors group relative"
              onClick={() => {
                if (mesh.status === "ready") setSelectedMesh(mesh);
              }}
              style={{ animation: "fadeIn 0.2s ease-out" }}
            >
              <div className="aspect-square overflow-hidden bg-black/50 flex items-center justify-center">
                {(mesh.status === "pending" || mesh.status === "refining") && <SpinnerIcon />}
                {mesh.status === "error" && (
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-danger)"
                    strokeWidth="1.5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v5M12 16v.01" />
                  </svg>
                )}
                {mesh.status === "ready" && mesh.thumbnailUrl && (
                  <img
                    src={mesh.thumbnailUrl}
                    alt={mesh.prompt}
                    className="w-full h-full object-cover"
                  />
                )}
                {mesh.status === "ready" && !mesh.thumbnailUrl && (
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-text-muted)"
                    strokeWidth="1.2"
                  >
                    <path d="M12 2l8 4.5v11L12 22l-8-4.5v-11L12 2z" />
                  </svg>
                )}
              </div>
              <div className="px-2 py-1.5 flex items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-[var(--color-text)] font-semibold truncate">
                    {mesh.name}
                  </p>
                  <p className="text-[9px] text-[var(--color-text-secondary)] leading-tight line-clamp-2">
                    {mesh.error || mesh.prompt}
                  </p>
                </div>
                <StatusBadge status={mesh.status} />
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveMesh(mesh.id);
                }}
                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-black/60 text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove mesh"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      </div>

      {selectedMesh && (
        <MeshPreviewModal mesh={selectedMesh} onClose={handleClose} />
      )}
    </div>
  );
}
