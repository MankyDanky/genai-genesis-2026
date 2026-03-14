"use client";

import { createContext, useContext, useState, useCallback, type ReactNode, useMemo } from "react";
import type { GameEngine } from "@/lib/game-engine";
import type { ProjectFile } from "@/lib/project-files";
import { compileProjectToHtml, normalizeProjectFiles } from "@/lib/project-files";

export interface Asset {
  id: string;
  name: string;
  type: "sprite" | "background" | "ui" | "mesh";
  description: string;
  dataUrl: string | null;
  sourceUrl?: string | null;
  format?: string | null;
  createdAt: number;
}

export interface AudioTrack {
  id: string;
  name: string;
  type: "music" | "sfx";
  description: string;
  dataUrl: string | null;
  duration: number | null;
  createdAt: number;
}

interface GameForgeContextValue {
  currentCode: string | null;
  currentEngine: GameEngine;
  projectFiles: ProjectFile[];
  onCodeUpdate: (code: string, engine?: GameEngine) => void;
  onProjectFilesUpdate: (files: ProjectFile[], engine?: GameEngine, deletePaths?: string[]) => void;
  patchProjectFiles: (files: ProjectFile[], engine?: GameEngine) => void;
  patchProjectFileContent: (
    path: string,
    edits: Array<{ find: string; replace: string; replaceAll?: boolean }>
  ) => void;
  updateProjectFile: (path: string, content: string) => void;
  onEngineUpdate: (engine: GameEngine) => void;
  assets: Asset[];
  addAsset: (asset: Asset) => void;
  removeAsset: (id: string) => void;
  audioTracks: AudioTrack[];
  addAudioTrack: (track: AudioTrack) => void;
  removeAudioTrack: (id: string) => void;
}

const GameForgeContext = createContext<GameForgeContextValue | null>(null);

function areProjectFilesEqual(a: ProjectFile[], b: ProjectFile[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const af = a[i];
    const bf = b[i];
    if (!bf) return false;
    if (af.path !== bf.path || af.kind !== bf.kind || af.content !== bf.content) return false;
  }
  return true;
}

export function GameForgeProvider({ children }: { children: ReactNode }) {
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [currentEngine, setCurrentEngine] = useState<GameEngine>("canvas2d");
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);

  const onCodeUpdate = useCallback((code: string, engine?: GameEngine) => {
    setCurrentCode(code);
    setProjectFiles([{ path: "index.html", content: code, kind: "html" }]);
    if (engine) setCurrentEngine(engine);
  }, []);

  const onProjectFilesUpdate = useCallback((files: ProjectFile[], engine?: GameEngine, deletePaths: string[] = []) => {
    const normalized = normalizeProjectFiles(files);
    setProjectFiles((prev) => {
      const byPath = new Map(prev.map((file) => [file.path, file]));
      for (const path of deletePaths) {
        byPath.delete(path);
      }
      for (const file of normalized) {
        byPath.set(file.path, file);
      }
      const next = Array.from(byPath.values());
      if (areProjectFilesEqual(prev, next)) return prev;
      const compiled = compileProjectToHtml(next);
      setCurrentCode((current) => (current === compiled ? current : compiled));
      return next;
    });
    if (engine) setCurrentEngine(engine);
  }, []);

  const patchProjectFiles = useCallback((files: ProjectFile[], engine?: GameEngine) => {
    const normalized = normalizeProjectFiles(files);
    if (normalized.length === 0) return;

    setProjectFiles((prev) => {
      const byPath = new Map(prev.map((file) => [file.path, file]));
      for (const file of normalized) {
        byPath.set(file.path, file);
      }
      const next = Array.from(byPath.values());
      if (areProjectFilesEqual(prev, next)) return prev;
      const compiled = compileProjectToHtml(next);
      setCurrentCode((current) => (current === compiled ? current : compiled));
      return next;
    });
    if (engine) setCurrentEngine(engine);
  }, []);

  const updateProjectFile = useCallback((path: string, content: string) => {
    setProjectFiles((prev) => {
      const next = prev.map((file) => (file.path === path ? { ...file, content } : file));
      setCurrentCode(compileProjectToHtml(next));
      return next;
    });
  }, []);

  const patchProjectFileContent = useCallback(
    (path: string, edits: Array<{ find: string; replace: string; replaceAll?: boolean }>) => {
      if (edits.length === 0) return;

      setProjectFiles((prev) => {
        const index = prev.findIndex((file) => file.path === path);
        if (index < 0) return prev;

        const current = prev[index];
        let nextContent = current.content;

        for (const edit of edits) {
          if (!edit.find) continue;
          if (edit.replaceAll) {
            nextContent = nextContent.split(edit.find).join(edit.replace);
          } else if (nextContent.includes(edit.find)) {
            nextContent = nextContent.replace(edit.find, edit.replace);
          }
        }

        if (nextContent === current.content) return prev;

        const next = [...prev];
        next[index] = { ...current, content: nextContent };
        const compiled = compileProjectToHtml(next);
        setCurrentCode((currentCode) => (currentCode === compiled ? currentCode : compiled));
        return next;
      });
    },
    []
  );

  const onEngineUpdate = useCallback((engine: GameEngine) => {
    setCurrentEngine(engine);
  }, []);

  const addAsset = useCallback((asset: Asset) => {
    setAssets((prev) => [...prev, asset]);
  }, []);

  const removeAsset = useCallback((id: string) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const addAudioTrack = useCallback((track: AudioTrack) => {
    setAudioTracks((prev) => [...prev, track]);
  }, []);

  const removeAudioTrack = useCallback((id: string) => {
    setAudioTracks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      currentCode,
      currentEngine,
      projectFiles,
      onCodeUpdate,
      onProjectFilesUpdate,
      patchProjectFiles,
      patchProjectFileContent,
      updateProjectFile,
      onEngineUpdate,
      assets,
      addAsset,
      removeAsset,
      audioTracks,
      addAudioTrack,
      removeAudioTrack,
    }),
    [
      currentCode,
      currentEngine,
      projectFiles,
      onCodeUpdate,
      onProjectFilesUpdate,
      patchProjectFiles,
      patchProjectFileContent,
      updateProjectFile,
      onEngineUpdate,
      assets,
      addAsset,
      removeAsset,
      audioTracks,
      addAudioTrack,
      removeAudioTrack,
    ]
  );

  return <GameForgeContext value={value}>{children}</GameForgeContext>;
}

export function useGameForge(): GameForgeContextValue {
  const ctx = useContext(GameForgeContext);
  if (!ctx) {
    throw new Error("useGameForge must be used within a GameForgeProvider");
  }
  return ctx;
}
