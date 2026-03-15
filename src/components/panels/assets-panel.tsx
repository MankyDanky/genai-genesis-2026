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
            <div className="px-3 py-1.5 border-b border-[var(--color-border)] flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                {selectedFile.path}
              </span>
              <button
                type="button"
                title="Download asset"
                onClick={() => {
                  const blob = new Blob([selectedFile.content], { type: "application/octet-stream" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = selectedFile.path.split("/").pop() ?? "asset";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="p-1 rounded hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            </div>
            {isTextAsset(selectedFile.path) ? (
              <textarea
                value={selectedFile.content}
                onChange={(e) => updateProjectFile(selectedFile.path, e.target.value)}
                className="flex-1 w-full bg-[var(--color-bg)] text-[11px] text-[var(--color-text-secondary)] p-3 font-[var(--font-mono)] outline-none resize-none"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--color-text-muted)] uppercase p-4 text-center">
                Binary asset selected. Replace by asking the Agent to update this file.
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
