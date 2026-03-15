"use client";

import { createContext, useContext, useState, useCallback, type ReactNode, useMemo } from "react";
import type { GameEngine } from "@/lib/game-engine";
import type { ProjectFile, ProjectFileKind } from "@/lib/project-files";
import { compileProjectToHtml, normalizeProjectFiles } from "@/lib/project-files";
import type { PersistedChatMessage } from "@/lib/db/schema";
import { getDefaultRuntimeEnv, normalizeRuntimeEnv, type RuntimeEnvMap } from "@/lib/runtime-env";
import { captureThumbnail } from "@/lib/capture-thumbnail";

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
  status: "pending" | "ready" | "error";
  error?: string | null;
  duration: number | null;
  createdAt: number;
}

export interface GeneratedMesh {
  id: string;
  name: string;
  prompt: string;
  status: "pending" | "refining" | "ready" | "error";
  glbUrl: string | null;
  thumbnailUrl: string | null;
  error?: string | null;
  createdAt: number;
}

export interface GeneratedImage {
  url: string;
  prompt: string;
}

export interface GameControl {
  action: string;
  keys: string;
}

type FocusPanel = "code" | "console" | "images" | "audio";

export interface PanelFocusRequest {
  id: number;
  panel: FocusPanel;
}

export interface PendingFileWrite {
  path: string;
  status: "streaming" | "finalizing";
  content?: string;
}

const DEFAULT_CONTROLS: GameControl[] = [
  { action: "Move", keys: "Arrow Keys / WASD" },
  { action: "Action", keys: "Space" },
  { action: "Pause", keys: "P / Esc" },
];

interface GameForgeContextValue {
  currentCode: string | null;
  currentEngine: GameEngine;
  projectFiles: ProjectFile[];
  pendingFileWrites: PendingFileWrite[];
  planningTodos: PlanningTodo[];
  consoleLogs: ConsoleLogEntry[];
  generatedImages: GeneratedImage[];
  controls: GameControl[];
  activeCodePath: string | null;
  focusedCodePath: string | null;
  panelFocusRequest: PanelFocusRequest | null;
  projectId: string | null;
  currentRevisionNumber: number | null;
  lastPublishedGameId: string | null;
  lastPublishedPlayPath: string | null;
  projectStatusMessage: string | null;
  projectError: string | null;
  projectBusyAction: "save" | "load" | "publish" | null;
  runtimeEnv: RuntimeEnvMap;
  chatMessages: PersistedChatMessage[];
  chatSessionId: string;
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
  generatedMeshes: GeneratedMesh[];
  addMesh: (mesh: GeneratedMesh) => void;
  removeMesh: (id: string) => void;
  addImage: (image: GeneratedImage) => void;
  setControls: (controls: GameControl[]) => void;
  setActiveCodePath: (path: string | null) => void;
  focusCodeFile: (path: string) => void;
  focusConsolePanel: () => void;
  focusImagesPanel: () => void;
  focusAudioPanel: () => void;
  setPendingFileWrites: (
    entries: Array<{ path: string; status: "streaming" | "finalizing"; content?: string }>
  ) => void;
  clearPendingFileWrites: (paths?: string[]) => void;
  updateRuntimeEnv: (set: RuntimeEnvMap, unset?: string[]) => void;
  setRuntimeEnvVar: (key: string, value: string) => void;
  removeRuntimeEnvVar: (key: string) => void;
  setChatMessages: (messages: PersistedChatMessage[]) => void;
  saveProjectRevision: () => Promise<{
    projectId: string;
    revisionNumber: number;
    title: string;
    engine: GameEngine;
  }>;
  publishProject: () => Promise<{
    publishId: string;
    projectId: string;
    revisionNumber: number;
    playPath: string;
  }>;
  loadProject: (projectId: string) => Promise<{
    projectId: string;
    revisionNumber: number;
    title: string;
  }>;
  resetWorkspace: () => void;
  clearProjectFeedback: () => void;
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

function createChatSessionId() {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function extractProjectTitle(currentCode: string | null, projectFiles: ProjectFile[]) {
  const html =
    currentCode ??
    projectFiles.find((file) => file.path === "index.html")?.content ??
    projectFiles.find((file) => file.kind === "html")?.content ??
    "";
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  return titleMatch?.[1]?.trim() || "Untitled Game";
}

function normalizeChatMessages(messages: PersistedChatMessage[]) {
  return messages
    .filter(
      (message): message is PersistedChatMessage =>
        !!message && typeof message.id === "string" && typeof message.role === "string"
    )
    .slice(-2000);
}

function areUnknownValuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;

  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!areUnknownValuesEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a !== "object" || typeof b !== "object") return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!(key in bObj)) return false;
    if (!areUnknownValuesEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

function areChatMessagesEqual(a: PersistedChatMessage[], b: PersistedChatMessage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!areUnknownValuesEqual(a[i], b[i])) return false;
  }
  return true;
}

function areRuntimeEnvMapsEqual(a: RuntimeEnvMap, b: RuntimeEnvMap): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Request failed (${response.status})`;
    throw new Error(error);
  }
  return payload as T;
}

export function GameForgeProvider({ children }: { children: ReactNode }) {
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [currentEngine, setCurrentEngine] = useState<GameEngine>("canvas2d");
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [pendingFileWrites, setPendingFileWritesState] = useState<PendingFileWrite[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>([]);
  const [planningTodos, setPlanningTodos] = useState<PlanningTodo[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [generatedMeshes, setGeneratedMeshes] = useState<GeneratedMesh[]>([]);
  const [controls, setControlsState] = useState<GameControl[]>(DEFAULT_CONTROLS);
  const [focusedCodePath, setFocusedCodePath] = useState<string | null>(null);
  const [activeCodePath, setActiveCodePath] = useState<string | null>(null);
  const [panelFocusRequest, setPanelFocusRequest] = useState<PanelFocusRequest | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [currentRevisionNumber, setCurrentRevisionNumber] = useState<number | null>(null);
  const [lastPublishedGameId, setLastPublishedGameId] = useState<string | null>(null);
  const [lastPublishedPlayPath, setLastPublishedPlayPath] = useState<string | null>(null);
  const [projectStatusMessage, setProjectStatusMessage] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectBusyAction, setProjectBusyAction] = useState<"save" | "load" | "publish" | null>(null);
  const [runtimeEnv, setRuntimeEnv] = useState<RuntimeEnvMap>(() => getDefaultRuntimeEnv());
  const [chatMessages, setChatMessagesState] = useState<PersistedChatMessage[]>([]);
  const [chatSessionId, setChatSessionId] = useState<string>(() => createChatSessionId());

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
      const existingIndex = prev.findIndex((file) => file.path === path);
      const next =
        existingIndex >= 0
          ? prev.map((file) => (file.path === path ? { ...file, content } : file))
          : [...prev, { path, content, kind: inferKindFromPath(path) }];
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
    setAudioTracks((prev) => {
      const existing = prev.find((item) => item.id === track.id);
      if (!existing) return [track, ...prev];

      const nextTrack: AudioTrack = {
        ...existing,
        ...track,
        createdAt: existing.createdAt,
      };
      return prev.map((item) => (item.id === track.id ? nextTrack : item));
    });
  }, []);

  const removeAudioTrack = useCallback((id: string) => {
    setAudioTracks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addImage = useCallback((image: GeneratedImage) => {
    setGeneratedImages((prev) => {
      if (prev.some((img) => img.url === image.url)) return prev;
      return [...prev, image];
    });
  }, []);

  const addMesh = useCallback((mesh: GeneratedMesh) => {
    setGeneratedMeshes((prev) => {
      const existing = prev.find((m) => m.id === mesh.id);
      if (!existing) return [...prev, mesh];
      return prev.map((m) => (m.id === mesh.id ? { ...existing, ...mesh, createdAt: existing.createdAt } : m));
    });
  }, []);

  const removeMesh = useCallback((id: string) => {
    setGeneratedMeshes((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const setControls = useCallback((next: GameControl[]) => {
    const normalized = next
      .filter((item) => item.action && item.keys)
      .map((item) => ({
        action: item.action.trim(),
        keys: item.keys.trim(),
      }))
      .filter((item) => item.action.length > 0 && item.keys.length > 0)
      .slice(0, 12);
    if (normalized.length === 0) return;
    setControlsState(normalized);
  }, []);

  const focusCodeFile = useCallback((path: string) => {
    if (!path) return;
    setActiveCodePath(path);
    setFocusedCodePath(path);
    setPanelFocusRequest({ id: Date.now(), panel: "code" });
  }, []);

  const focusConsolePanel = useCallback(() => {
    setPanelFocusRequest({ id: Date.now(), panel: "console" });
  }, []);

  const focusImagesPanel = useCallback(() => {
    setPanelFocusRequest({ id: Date.now(), panel: "images" });
  }, []);

  const focusAudioPanel = useCallback(() => {
    setPanelFocusRequest({ id: Date.now(), panel: "audio" });
  }, []);

  const setPendingFileWrites = useCallback((
    entries: Array<{ path: string; status: "streaming" | "finalizing"; content?: string }>
  ) => {
    const normalized = entries
      .filter((entry) => entry.path)
      .map((entry) => ({
        path: entry.path,
        status: entry.status,
        content: typeof entry.content === "string" ? entry.content : undefined,
      }));
    if (normalized.length === 0) return;
    setPendingFileWritesState((prev) => {
      const byPath = new Map(prev.map((entry) => [entry.path, entry]));
      for (const entry of normalized) {
        byPath.set(entry.path, entry);
      }
      return Array.from(byPath.values());
    });
  }, []);

  const clearPendingFileWrites = useCallback((paths?: string[]) => {
    if (!paths || paths.length === 0) {
      setPendingFileWritesState([]);
      return;
    }
    const remove = new Set(paths);
    setPendingFileWritesState((prev) => prev.filter((entry) => !remove.has(entry.path)));
  }, []);

  const updateRuntimeEnv = useCallback((set: RuntimeEnvMap, unset: string[] = []) => {
    const normalizedSet = normalizeRuntimeEnv(set);
    const normalizedUnset = unset
      .map((key) => key.trim())
      .filter((key) => key.length > 0);
    if (Object.keys(normalizedSet).length === 0 && normalizedUnset.length === 0) return;

    setRuntimeEnv((prev) => {
      const next = { ...prev, ...normalizedSet };
      for (const key of normalizedUnset) delete next[key];
      return areRuntimeEnvMapsEqual(prev, next) ? prev : next;
    });
  }, []);

  const setRuntimeEnvVar = useCallback((key: string, value: string) => {
    const normalizedKey = key.trim();
    if (!normalizedKey) return;
    setRuntimeEnv((prev) => {
      if (prev[normalizedKey] === value) return prev;
      return { ...prev, [normalizedKey]: value };
    });
  }, []);

  const removeRuntimeEnvVar = useCallback((key: string) => {
    const normalizedKey = key.trim();
    if (!normalizedKey) return;
    setRuntimeEnv((prev) => {
      if (!(normalizedKey in prev)) return prev;
      const next = { ...prev };
      delete next[normalizedKey];
      return areRuntimeEnvMapsEqual(prev, next) ? prev : next;
    });
  }, []);

  const setChatMessages = useCallback((messages: PersistedChatMessage[]) => {
    const normalized = normalizeChatMessages(messages);
    setChatMessagesState((prev) => (areChatMessagesEqual(prev, normalized) ? prev : normalized));
  }, []);

  const resetWorkspace = useCallback(() => {
    setCurrentCode(null);
    setCurrentEngine("canvas2d");
    setProjectFiles([]);
    setPendingFileWritesState([]);
    setConsoleLogs([]);
    setPlanningTodos([]);
    setAssets([]);
    setAudioTracks([]);
    setGeneratedImages([]);
    setGeneratedMeshes([]);
    setControlsState(DEFAULT_CONTROLS);
    setFocusedCodePath(null);
    setActiveCodePath(null);
    setPanelFocusRequest(null);
    setProjectId(null);
    setCurrentRevisionNumber(null);
    setLastPublishedGameId(null);
    setLastPublishedPlayPath(null);
    setProjectStatusMessage(null);
    setProjectError(null);
    setProjectBusyAction(null);
    setRuntimeEnv(getDefaultRuntimeEnv());
    setChatMessagesState([]);
    setChatSessionId(createChatSessionId());
  }, []);

  const clearProjectFeedback = useCallback(() => {
    setProjectStatusMessage(null);
    setProjectError(null);
  }, []);

  const applyLoadedProject = useCallback((snapshot: {
    projectId: string;
    revisionNumber: number;
    title: string;
    engine: GameEngine;
    projectFiles: ProjectFile[];
    controls: GameControl[];
    planningTodos: PlanningTodo[];
    generatedImages: GeneratedImage[];
    generatedMeshes?: GeneratedMesh[];
    audioTracks: AudioTrack[];
    runtimeEnv?: RuntimeEnvMap;
    currentCode: string;
    chatMessages: PersistedChatMessage[];
  }) => {
    const normalizedFiles = normalizeProjectFiles(snapshot.projectFiles);
    setCurrentCode(snapshot.currentCode || compileProjectToHtml(normalizedFiles));
    setCurrentEngine(snapshot.engine);
    setProjectFiles(normalizedFiles);
    setPendingFileWritesState([]);
    setConsoleLogs([]);
    setPlanningTodos(snapshot.planningTodos);
    setAssets([]);
    setAudioTracks(snapshot.audioTracks);
    setGeneratedImages(snapshot.generatedImages);
    setGeneratedMeshes(snapshot.generatedMeshes ?? []);
    setRuntimeEnv({
      ...getDefaultRuntimeEnv(),
      ...normalizeRuntimeEnv(snapshot.runtimeEnv),
    });
    setControlsState(snapshot.controls.length > 0 ? snapshot.controls : DEFAULT_CONTROLS);
    setFocusedCodePath(null);
    setActiveCodePath(normalizedFiles[0]?.path ?? null);
    setPanelFocusRequest(null);
    setProjectId(snapshot.projectId);
    setCurrentRevisionNumber(snapshot.revisionNumber);
    setLastPublishedGameId(null);
    setLastPublishedPlayPath(null);
    setChatMessagesState(normalizeChatMessages(snapshot.chatMessages));
    setChatSessionId(createChatSessionId());
  }, []);

  const buildSnapshotPayload = useCallback(() => ({
    title: extractProjectTitle(currentCode, projectFiles),
    engine: currentEngine,
    currentCode: currentCode ?? compileProjectToHtml(projectFiles),
    projectFiles,
    controls,
    planningTodos,
    generatedImages,
    generatedMeshes,
    audioTracks,
    runtimeEnv,
    chatMessages,
  }), [
    audioTracks,
    runtimeEnv,
    chatMessages,
    controls,
    currentCode,
    currentEngine,
    generatedImages,
    generatedMeshes,
    planningTodos,
    projectFiles,
  ]);

  const persistSnapshot = useCallback(async () => {
    const payload = buildSnapshotPayload();
    if (!payload.currentCode && payload.projectFiles.length === 0) {
      throw new Error("Nothing to save");
    }

    const request = projectId
      ? fetch(`/api/projects/${projectId}/revisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    return parseJsonResponse<{
      projectId: string;
      revisionNumber: number;
      revisionId?: string;
      title: string;
      engine: GameEngine;
    }>(await request);
  }, [buildSnapshotPayload, projectId]);

  const saveProjectRevision = useCallback(async () => {
    setProjectBusyAction("save");
    setProjectError(null);

    try {
      const result = await persistSnapshot();
      setProjectId(result.projectId);
      setCurrentRevisionNumber(result.revisionNumber);
      setProjectStatusMessage(
        `Saved ${result.title} as revision ${result.revisionNumber}`
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save project";
      setProjectError(message);
      throw error;
    } finally {
      setProjectBusyAction(null);
    }
  }, [persistSnapshot]);

  const publishProject = useCallback(async () => {
    setProjectBusyAction("publish");
    setProjectError(null);

    try {
      // Capture thumbnail from current game code (best-effort, non-blocking)
      const gameCode = currentCode ?? compileProjectToHtml(projectFiles);
      const thumbnailPromise = gameCode
        ? captureThumbnail(gameCode).catch(() => null)
        : Promise.resolve(null);

      const saved = await persistSnapshot();
      setProjectId(saved.projectId);
      setCurrentRevisionNumber(saved.revisionNumber);

      const thumbnail = await thumbnailPromise;

      const publishResponse = await fetch(`/api/projects/${saved.projectId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionNumber: saved.revisionNumber, thumbnail }),
      });
      const published = await parseJsonResponse<{
        publishId: string;
        projectId: string;
        revisionNumber: number;
        playPath: string;
      }>(publishResponse);

      setLastPublishedGameId(published.publishId);
      setLastPublishedPlayPath(published.playPath);
      setProjectStatusMessage(
        `Published revision ${published.revisionNumber} to ${published.playPath}`
      );
      return published;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to publish project";
      setProjectError(message);
      throw error;
    } finally {
      setProjectBusyAction(null);
    }
  }, [currentCode, persistSnapshot, projectFiles]);

  const loadProject = useCallback(async (nextProjectId: string) => {
    setProjectBusyAction("load");
    setProjectError(null);

    try {
      const project = await parseJsonResponse<{
        projectId: string;
        title: string;
        latestRevisionNumber: number;
      }>(await fetch(`/api/projects/${nextProjectId}`));

      if (!project.latestRevisionNumber) {
        throw new Error("Project has no revisions");
      }

      const revision = await parseJsonResponse<{
        projectId: string;
        revisionNumber: number;
        title: string;
        engine: GameEngine;
        projectFiles: ProjectFile[];
        controls: GameControl[];
        planningTodos: PlanningTodo[];
        generatedImages: GeneratedImage[];
        audioTracks: AudioTrack[];
        runtimeEnv?: RuntimeEnvMap;
        currentCode: string;
        chatMessages: PersistedChatMessage[];
      }>(
        await fetch(
          `/api/projects/${nextProjectId}/revisions/${project.latestRevisionNumber}`
        )
      );

      applyLoadedProject(revision);
      setProjectStatusMessage(
        `Loaded ${revision.title} revision ${revision.revisionNumber}`
      );
      return {
        projectId: revision.projectId,
        revisionNumber: revision.revisionNumber,
        title: revision.title,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load project";
      setProjectError(message);
      throw error;
    } finally {
      setProjectBusyAction(null);
    }
  }, [applyLoadedProject]);

  const value = useMemo(
    () => ({
      currentCode,
      currentEngine,
      projectFiles,
      pendingFileWrites,
      planningTodos,
      consoleLogs,
      generatedImages,
      controls,
      activeCodePath,
      focusedCodePath,
      panelFocusRequest,
      projectId,
      currentRevisionNumber,
      lastPublishedGameId,
      lastPublishedPlayPath,
      projectStatusMessage,
      projectError,
      projectBusyAction,
      runtimeEnv,
      chatMessages,
      chatSessionId,
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
      generatedMeshes,
      addMesh,
      removeMesh,
      addImage,
      setControls,
      setActiveCodePath,
      focusCodeFile,
      focusConsolePanel,
      focusImagesPanel,
      focusAudioPanel,
      setPendingFileWrites,
      clearPendingFileWrites,
      updateRuntimeEnv,
      setRuntimeEnvVar,
      removeRuntimeEnvVar,
      setChatMessages,
      saveProjectRevision,
      publishProject,
      loadProject,
      resetWorkspace,
      clearProjectFeedback,
    }),
    [
      currentCode,
      currentEngine,
      projectFiles,
      pendingFileWrites,
      planningTodos,
      consoleLogs,
      generatedImages,
      controls,
      activeCodePath,
      focusedCodePath,
      panelFocusRequest,
      projectId,
      currentRevisionNumber,
      lastPublishedGameId,
      lastPublishedPlayPath,
      projectStatusMessage,
      projectError,
      projectBusyAction,
      runtimeEnv,
      chatMessages,
      chatSessionId,
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
      generatedMeshes,
      addMesh,
      removeMesh,
      addImage,
      setControls,
      setActiveCodePath,
      focusCodeFile,
      focusConsolePanel,
      focusImagesPanel,
      focusAudioPanel,
      setPendingFileWrites,
      clearPendingFileWrites,
      updateRuntimeEnv,
      setRuntimeEnvVar,
      removeRuntimeEnvVar,
      setChatMessages,
      saveProjectRevision,
      publishProject,
      loadProject,
      resetWorkspace,
      clearProjectFeedback,
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
