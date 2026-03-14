"use client";

import { createContext, useContext, useState, useCallback, type ReactNode, useMemo, useEffect } from "react";
import type { GameEngine } from "@/lib/game-engine";
import type { ProjectFile, ProjectFileKind } from "@/lib/project-files";
import { compileProjectToHtml, normalizeProjectFiles } from "@/lib/project-files";

const TODOS_STORAGE_KEY = "game-forge-planning-todos";

export interface PlanningTodo {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

export interface ConsoleLogEntry {
  id: string;
  timestamp: number;
  level: "log" | "info" | "warn" | "error";
  source: "console" | "error" | "unhandledrejection";
  text: string;
}

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
  planningTodos: PlanningTodo[];
  consoleLogs: ConsoleLogEntry[];
  onCodeUpdate: (code: string, engine?: GameEngine) => void;
  onProjectFilesUpdate: (files: ProjectFile[], engine?: GameEngine, deletePaths?: string[]) => void;
  patchProjectFiles: (files: ProjectFile[], engine?: GameEngine) => void;
  patchProjectFileContent: (
    path: string,
    edits: Array<{ find: string; replace: string; replaceAll?: boolean }>
  ) => void;
  editProjectFile: (args: {
    targetFile: string;
    oldString: string;
    newString: string;
    replaceAll?: boolean;
    createIfMissing?: boolean;
  }) => boolean;
  deleteProjectFile: (path: string) => void;
  writePlanningTodos: (merge: boolean, todos: PlanningTodo[]) => void;
  addConsoleLog: (entry: {
    level: "log" | "info" | "warn" | "error";
    source: "console" | "error" | "unhandledrejection";
    args: string[];
  }) => void;
  clearConsoleLogs: () => void;
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

function inferKindFromPath(path: string): ProjectFileKind {
  const p = path.toLowerCase();
  if (p.endsWith(".html") || p.endsWith(".htm")) return "html";
  if (p.endsWith(".css")) return "style";
  if (p.endsWith(".js") || p.endsWith(".mjs") || p.endsWith(".ts") || p.endsWith(".tsx")) return "script";
  if (p.endsWith(".json") || p.endsWith(".toml") || p.endsWith(".yaml") || p.endsWith(".yml")) return "config";
  if (p.startsWith("assets/")) return "asset";
  return "other";
}

function mergeTodos(prev: PlanningTodo[], nextTodos: PlanningTodo[]): PlanningTodo[] {
  const byId = new Map(prev.map((todo) => [todo.id, todo]));
  for (const todo of nextTodos) {
    byId.set(todo.id, todo);
  }

  const seen = new Set<string>();
  const merged: PlanningTodo[] = [];
  for (const todo of prev) {
    const updated = byId.get(todo.id);
    if (updated) {
      merged.push(updated);
      seen.add(todo.id);
    }
  }
  for (const todo of nextTodos) {
    if (!seen.has(todo.id)) merged.push(todo);
  }
  return merged;
}

export function GameForgeProvider({ children }: { children: ReactNode }) {
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [currentEngine, setCurrentEngine] = useState<GameEngine>("canvas2d");
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>([]);
  const [planningTodos, setPlanningTodos] = useState<PlanningTodo[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(TODOS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((todo): todo is PlanningTodo => {
          return (
            !!todo &&
            typeof todo === "object" &&
            typeof (todo as PlanningTodo).id === "string" &&
            typeof (todo as PlanningTodo).content === "string" &&
            ["pending", "in_progress", "completed", "cancelled"].includes((todo as PlanningTodo).status)
          );
        });
    } catch {
      return [];
    }
  });
  const [assets, setAssets] = useState<Asset[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);

  useEffect(() => {
    window.localStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(planningTodos));
  }, [planningTodos]);

  const onCodeUpdate = useCallback((code: string, engine?: GameEngine) => {
    setCurrentCode(code);
    setProjectFiles([{ path: "index.html", content: code, kind: "html" }]);
    setConsoleLogs([]);
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
    setConsoleLogs([]);
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
    setConsoleLogs([]);
    if (engine) setCurrentEngine(engine);
  }, []);

  const updateProjectFile = useCallback((path: string, content: string) => {
    setProjectFiles((prev) => {
      const next = prev.map((file) => (file.path === path ? { ...file, content } : file));
      const compiled = compileProjectToHtml(next);
      setCurrentCode((current) => (current === compiled ? current : compiled));
      return next;
    });
  }, []);

  const deleteProjectFile = useCallback((path: string) => {
    setProjectFiles((prev) => {
      const next = prev.filter((file) => file.path !== path);
      if (next.length === prev.length) return prev;
      const compiled = compileProjectToHtml(next);
      setCurrentCode((current) => (current === compiled ? current : compiled));
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

  const editProjectFile = useCallback((args: {
    targetFile: string;
    oldString: string;
    newString: string;
    replaceAll?: boolean;
    createIfMissing?: boolean;
  }) => {
    const { targetFile, oldString, newString, replaceAll = false, createIfMissing = false } = args;
    if (!targetFile) return false;

    let applied = false;

    setProjectFiles((prev) => {
      const index = prev.findIndex((file) => file.path === targetFile);

      if (index < 0) {
        if (!createIfMissing) return prev;
        applied = true;
        const next = [...prev, { path: targetFile, content: newString, kind: inferKindFromPath(targetFile) }];
        const compiled = compileProjectToHtml(next);
        setCurrentCode((current) => (current === compiled ? current : compiled));
        return next;
      }

      const current = prev[index];
      let updatedContent = current.content;

      if (oldString.length === 0) {
        updatedContent = newString;
      } else if (replaceAll) {
        if (!updatedContent.includes(oldString)) return prev;
        updatedContent = updatedContent.split(oldString).join(newString);
      } else {
        const first = updatedContent.indexOf(oldString);
        if (first < 0) return prev;
        const second = updatedContent.indexOf(oldString, first + oldString.length);
        if (second >= 0) return prev;
        updatedContent = `${updatedContent.slice(0, first)}${newString}${updatedContent.slice(first + oldString.length)}`;
      }

      if (updatedContent === current.content) return prev;

      applied = true;
      const next = [...prev];
      next[index] = { ...current, content: updatedContent };
      const compiled = compileProjectToHtml(next);
      setCurrentCode((currentCode) => (currentCode === compiled ? currentCode : compiled));
      return next;
    });

    return applied;
  }, []);

  const writePlanningTodos = useCallback((merge: boolean, todos: PlanningTodo[]) => {
    const normalized = todos
      .filter((todo) => todo.id && todo.content)
      .map((todo) => ({
        id: todo.id,
        content: todo.content,
        status: todo.status,
      }));

    setPlanningTodos((prev) => (merge ? mergeTodos(prev, normalized) : normalized));
  }, []);

  const addConsoleLog = useCallback((entry: {
    level: "log" | "info" | "warn" | "error";
    source: "console" | "error" | "unhandledrejection";
    args: string[];
  }) => {
    const text = entry.args.join(" ").trim();
    if (!text) return;

    const nextEntry: ConsoleLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      level: entry.level,
      source: entry.source,
      text,
    };

    setConsoleLogs((prev) => {
      const next = [...prev, nextEntry];
      return next.length > 400 ? next.slice(next.length - 400) : next;
    });
  }, []);

  const clearConsoleLogs = useCallback(() => {
    setConsoleLogs([]);
  }, []);

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
      planningTodos,
      consoleLogs,
      onCodeUpdate,
      onProjectFilesUpdate,
      patchProjectFiles,
      patchProjectFileContent,
      editProjectFile,
      deleteProjectFile,
      writePlanningTodos,
      addConsoleLog,
      clearConsoleLogs,
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
      planningTodos,
      consoleLogs,
      onCodeUpdate,
      onProjectFilesUpdate,
      patchProjectFiles,
      patchProjectFileContent,
      editProjectFile,
      deleteProjectFile,
      writePlanningTodos,
      addConsoleLog,
      clearConsoleLogs,
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
