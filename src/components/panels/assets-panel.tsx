"use client";

import { useMemo, useState } from "react";
import { useGameForge } from "@/lib/game-forge-context";
import { isAssetFile } from "@/lib/project-files";

const TEXT_EXTENSIONS = [".svg", ".json", ".txt", ".md", ".obj", ".gltf"];

function isTextAsset(path: string): boolean {
  const lower = path.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function AssetsPanel() {
  const { projectFiles, updateProjectFile } = useGameForge();
  const assetFiles = useMemo(() => projectFiles.filter(isAssetFile), [projectFiles]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const effectiveSelectedPath =
    selectedPath && assetFiles.some((file) => file.path === selectedPath)
      ? selectedPath
      : (assetFiles[0]?.path ?? null);
  const selectedFile = assetFiles.find((file) => file.path === effectiveSelectedPath) ?? null;

  return (
    <div className="flex h-full bg-[var(--color-bg)]">
      <div className="w-44 border-r border-[var(--color-border)] overflow-y-auto">
        {assetFiles.length === 0 ? (
          <p className="text-[10px] text-[var(--color-text-muted)] p-3 uppercase">No asset files</p>
        ) : (
          assetFiles.map((file) => (
            <button
              key={file.path}
                type="button"
                onClick={() => setSelectedPath(file.path)}
                className={`w-full text-left px-3 py-2 text-[10px] uppercase tracking-wider border-b border-[var(--color-border)] ${
                file.path === effectiveSelectedPath
                  ? "bg-[var(--color-accent-glow)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-muted)]"
              }`}
            >
              {file.path}
            </button>
          ))
        )}
      </div>

      <div className="flex-1 flex flex-col">
        {selectedFile ? (
          <>
            <div className="px-3 py-1.5 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
              {selectedFile.path}
            </div>
            {isTextAsset(selectedFile.path) ? (
              <textarea
                value={selectedFile.content}
                onChange={(e) => updateProjectFile(selectedFile.path, e.target.value)}
                className="flex-1 w-full bg-[var(--color-bg)] text-[11px] text-[var(--color-text-secondary)] p-3 font-[var(--font-mono)] outline-none resize-none"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--color-text-muted)] uppercase p-4 text-center">
                Binary asset selected. Replace by asking Composer to update this file.
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--color-text-muted)] uppercase">
            No asset selected
          </div>
        )}
      </div>
    </div>
  );
}
