"use client";

import { useMemo, useState } from "react";
import { useGameForge } from "@/lib/game-forge-context";
import { isCodeFile } from "@/lib/project-files";

export function CodePanel() {
  const { projectFiles, updateProjectFile } = useGameForge();
  const codeFiles = useMemo(() => projectFiles.filter(isCodeFile), [projectFiles]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const effectiveSelectedPath =
    selectedPath && codeFiles.some((file) => file.path === selectedPath)
      ? selectedPath
      : (codeFiles[0]?.path ?? null);
  const selectedFile = codeFiles.find((file) => file.path === effectiveSelectedPath) ?? null;

  return (
    <div className="flex h-full bg-[var(--color-bg)]">
      <div className="w-44 border-r border-[var(--color-border)] overflow-y-auto">
        {codeFiles.length === 0 ? (
          <p className="text-[10px] text-[var(--color-text-muted)] p-3 uppercase">No code files</p>
        ) : (
          codeFiles.map((file) => (
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
            <textarea
              value={selectedFile.content}
              onChange={(e) => updateProjectFile(selectedFile.path, e.target.value)}
              className="flex-1 w-full bg-[var(--color-bg)] text-[11px] text-[var(--color-text-secondary)] p-3 font-[var(--font-mono)] outline-none resize-none"
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--color-text-muted)] uppercase">
            No code selected
          </div>
        )}
      </div>
    </div>
  );
}
