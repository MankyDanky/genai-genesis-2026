"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-json";
import { useGameForge } from "@/lib/game-forge-context";
import { computeHighlightedDiff, type DiffLine } from "@/lib/diff-utils";
import styles from "./code-panel.module.css";

interface FileNode {
  kind: "file";
  name: string;
  path: string;
}

interface FolderNode {
  kind: "folder";
  name: string;
  path: string;
  children: TreeNode[];
}

type TreeNode = FileNode | FolderNode;

type CreateState = {
  kind: "file" | "folder";
  parent: string;
  value: string;
};

type ContextTarget =
  | { kind: "file"; path: string }
  | { kind: "folder"; path: string }
  | { kind: "root" };

type ContextMenuState = {
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  target: ContextTarget;
};

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(0, idx) : "";
}

function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function normalizeUserPath(name: string): string {
  return name.trim().replace(/^\.\//, "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function getPrismLanguage(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "markup";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".tsx")) return "tsx";
  if (lower.endsWith(".jsx")) return "jsx";
  if (lower.endsWith(".ts")) return "typescript";
  if (
    lower.endsWith(".js") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".cjs")
  ) {
    return "javascript";
  }
  return "plain";
}

function insertFileNode(nodes: TreeNode[], parts: string[], fullPath: string, prefix = ""): TreeNode[] {
  if (parts.length === 0) return nodes;
  const [head, ...tail] = parts;
  const currentPath = prefix ? `${prefix}/${head}` : head;

  if (tail.length === 0) {
    if (nodes.some((node) => node.kind === "file" && node.path === fullPath)) return nodes;
    return [...nodes, { kind: "file", name: head, path: fullPath }];
  }

  const idx = nodes.findIndex((node) => node.kind === "folder" && node.name === head);
  if (idx >= 0) {
    const folder = nodes[idx] as FolderNode;
    const updated: FolderNode = {
      ...folder,
      children: insertFileNode(folder.children, tail, fullPath, currentPath),
    };
    const copy = [...nodes];
    copy[idx] = updated;
    return copy;
  }

  return [
    ...nodes,
    {
      kind: "folder",
      name: head,
      path: currentPath,
      children: insertFileNode([], tail, fullPath, currentPath),
    },
  ];
}

function insertFolderNode(nodes: TreeNode[], parts: string[], prefix = ""): TreeNode[] {
  if (parts.length === 0) return nodes;
  const [head, ...tail] = parts;
  const currentPath = prefix ? `${prefix}/${head}` : head;

  const idx = nodes.findIndex((node) => node.kind === "folder" && node.name === head);
  if (idx >= 0) {
    if (tail.length === 0) return nodes;
    const folder = nodes[idx] as FolderNode;
    const updated: FolderNode = {
      ...folder,
      children: insertFolderNode(folder.children, tail, currentPath),
    };
    const copy = [...nodes];
    copy[idx] = updated;
    return copy;
  }

  return [
    ...nodes,
    {
      kind: "folder",
      name: head,
      path: currentPath,
      children: tail.length > 0 ? insertFolderNode([], tail, currentPath) : [],
    },
  ];
}

function buildTree(filePaths: string[], folderPaths: string[]): TreeNode[] {
  let tree: TreeNode[] = [];

  for (const folder of folderPaths) {
    if (!folder) continue;
    tree = insertFolderNode(tree, folder.split("/").filter(Boolean));
  }

  for (const path of filePaths) {
    tree = insertFileNode(tree, path.split("/").filter(Boolean), path);
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    const next = nodes.map((node) => {
      if (node.kind === "folder") {
        return { ...node, children: sortNodes(node.children) };
      }
      return node;
    });

    next.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return next;
  };

  return sortNodes(tree);
}

function CreateInlineRow({
  depth,
  createState,
  setCreateValue,
  submitCreate,
  cancelCreate,
  inputRef,
}: {
  depth: number;
  createState: CreateState;
  setCreateValue: (value: string) => void;
  submitCreate: () => void;
  cancelCreate: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const paddingLeft = 8 + depth * 12;

  return (
    <div style={{ paddingLeft }} className="py-1">
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
        <span className="inline-flex w-3 justify-center">{createState.kind === "folder" ? "▸" : "+"}</span>
        <input
          ref={inputRef}
          value={createState.value}
          onChange={(e) => setCreateValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitCreate();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelCreate();
            }
          }}
          placeholder={createState.kind === "folder" ? "folder" : "file.ext"}
          className="flex-1 min-w-0 bg-[var(--color-surface-light)] border border-[var(--color-border)] text-[10px] text-[var(--color-text-secondary)] px-1 py-0.5 outline-none"
        />
      </div>
    </div>
  );
}

function TreeView({
  nodes,
  depth,
  selectedFilePath,
  selectedFolderPath,
  expanded,
  createState,
  setCreateValue,
  submitCreate,
  cancelCreate,
  createInputRef,
  draggedFilePath,
  setDraggedFilePath,
  moveFileToDirectory,
  onToggleFolder,
  onSelectFolder,
  onSelectFile,
  onContextMenu,
  pendingByPath,
}: {
  nodes: TreeNode[];
  depth: number;
  selectedFilePath: string | null;
  selectedFolderPath: string | null;
  expanded: Set<string>;
  createState: CreateState | null;
  setCreateValue: (value: string) => void;
  submitCreate: () => void;
  cancelCreate: () => void;
  createInputRef: React.RefObject<HTMLInputElement | null>;
  draggedFilePath: string | null;
  setDraggedFilePath: (path: string | null) => void;
  moveFileToDirectory: (sourceFilePath: string, targetDirPath: string) => void;
  onToggleFolder: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, target: ContextTarget) => void;
  pendingByPath: Map<string, "streaming" | "finalizing">;
}) {
  const rootCreate = depth === 0 && createState?.parent === "" ? createState : null;

  return (
    <>
      {rootCreate ? (
        <CreateInlineRow
          depth={depth}
          createState={rootCreate}
          setCreateValue={setCreateValue}
          submitCreate={submitCreate}
          cancelCreate={cancelCreate}
          inputRef={createInputRef}
        />
      ) : null}

      {nodes.map((node) => {
        const paddingLeft = 8 + depth * 12;

        if (node.kind === "folder") {
          const isOpen = expanded.has(node.path);
          const isSelected = selectedFolderPath === node.path;
          const folderCreate = createState?.parent === node.path ? createState : null;

          return (
            <div key={node.path}>
              <button
                type="button"
                onClick={() => {
                  onToggleFolder(node.path);
                  onSelectFolder(node.path);
                }}
                onContextMenu={(e) => onContextMenu(e, { kind: "folder", path: node.path })}
                onDragOver={(e) => {
                  if (!draggedFilePath) return;
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  if (!draggedFilePath) return;
                  e.preventDefault();
                  moveFileToDirectory(draggedFilePath, node.path);
                  setDraggedFilePath(null);
                }}
                className={`w-full text-left py-1.5 text-[10px] uppercase tracking-wider hover:bg-[var(--color-surface-light)] ${
                  isSelected
                    ? "text-[var(--color-accent)] bg-[var(--color-accent-glow)]"
                    : "text-[var(--color-text-muted)]"
                }`}
                style={{ paddingLeft }}
              >
                <span className="inline-block w-3">{isOpen ? "▾" : "▸"}</span>
                {node.name}
              </button>

              {isOpen ? (
                <>
                  {folderCreate ? (
                    <CreateInlineRow
                      depth={depth + 1}
                      createState={folderCreate}
                      setCreateValue={setCreateValue}
                      submitCreate={submitCreate}
                      cancelCreate={cancelCreate}
                      inputRef={createInputRef}
                    />
                  ) : null}
                  <TreeView
                    nodes={node.children}
                    depth={depth + 1}
                    selectedFilePath={selectedFilePath}
                    selectedFolderPath={selectedFolderPath}
                    expanded={expanded}
                    createState={createState}
                    setCreateValue={setCreateValue}
                    submitCreate={submitCreate}
                    cancelCreate={cancelCreate}
                    createInputRef={createInputRef}
                    draggedFilePath={draggedFilePath}
                    setDraggedFilePath={setDraggedFilePath}
                    moveFileToDirectory={moveFileToDirectory}
                    onToggleFolder={onToggleFolder}
                    onSelectFolder={onSelectFolder}
                    onSelectFile={onSelectFile}
                    onContextMenu={onContextMenu}
                    pendingByPath={pendingByPath}
                  />
                </>
              ) : null}
            </div>
          );
        }

        const isSelected = node.path === selectedFilePath;
        return (
          <button
            key={node.path}
            type="button"
            draggable
            onDragStart={() => setDraggedFilePath(node.path)}
            onDragEnd={() => setDraggedFilePath(null)}
            onDragOver={(e) => {
              if (!draggedFilePath) return;
              e.preventDefault();
            }}
            onDrop={(e) => {
              if (!draggedFilePath) return;
              e.preventDefault();
              moveFileToDirectory(draggedFilePath, dirname(node.path));
              setDraggedFilePath(null);
            }}
            onContextMenu={(e) => onContextMenu(e, { kind: "file", path: node.path })}
            onClick={() => onSelectFile(node.path)}
            className={`w-full text-left py-1.5 text-[10px] tracking-wider hover:bg-[var(--color-surface-light)] ${
              isSelected
                ? "text-[var(--color-accent)] bg-[var(--color-accent-glow)]"
                : "text-[var(--color-text-secondary)]"
            }`}
            style={{ paddingLeft }}
          >
            <span className="inline-flex items-center gap-1.5">
              <span>{node.name}</span>
              {pendingByPath.has(node.path) ? (
                <span
                  className="inline-block h-2 w-2 rounded-full bg-[var(--color-accent)] animate-pulse"
                  title={pendingByPath.get(node.path) === "finalizing" ? "Finalizing write" : "Streaming write"}
                />
              ) : null}
            </span>
          </button>
        );
      })}
    </>
  );
}

function DiffView({
  lines,
}: {
  lines: DiffLine[];
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const firstChangeRef = useRef<HTMLDivElement>(null);
  const prevDiffLenRef = useRef<number>(0);

  useEffect(() => {
    if (!firstChangeRef.current) return;
    if (prevDiffLenRef.current === 0 && lines.length > 0) {
      firstChangeRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    prevDiffLenRef.current = lines.length;
  }, [lines]);

  const firstChangeIdx = useMemo(() => {
    return lines.findIndex((line) => line.type !== "context");
  }, [lines]);

  return (
    <div ref={scrollContainerRef} className={`flex-1 min-h-0 overflow-auto font-[var(--font-mono)] text-[11px] leading-[1.25rem] ${styles.editorRoot}`}>
      {lines.map((line, i) => {
        const refProp = i === firstChangeIdx ? firstChangeRef : undefined;

        const bgClass =
          line.type === "added"
            ? "bg-[rgba(63,185,80,0.08)] border-l-2 border-l-[var(--color-success)]"
            : line.type === "removed"
              ? "bg-[rgba(248,81,73,0.08)] border-l-2 border-l-[var(--color-danger)]"
              : "border-l-2 border-l-transparent";

        const prefix =
          line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";

        const prefixClass =
          line.type === "added"
            ? "text-[var(--color-success)]"
            : line.type === "removed"
              ? "text-[var(--color-danger)]"
              : "text-[var(--color-text-muted)]";

        return (
          <div key={i} ref={refProp} className={`flex ${bgClass}`}>
            <span className="w-10 shrink-0 text-right pr-1 text-[var(--color-text-muted)] opacity-40 select-none">
              {line.oldLineNum ?? ""}
            </span>
            <span className="w-10 shrink-0 text-right pr-2 text-[var(--color-text-muted)] opacity-40 select-none">
              {line.newLineNum ?? ""}
            </span>
            <span className={`shrink-0 w-4 text-center select-none ${prefixClass}`}>
              {prefix}
            </span>
            <span
              className="flex-1 whitespace-pre-wrap break-all"
              dangerouslySetInnerHTML={{ __html: line.html || "&nbsp;" }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function CodePanel() {
  const {
    projectFiles,
    pendingFileWrites,
    activeCodePath,
    setActiveCodePath,
    updateProjectFile,
    deleteProjectFile,
    streamingCode,
    currentCode,
  } = useGameForge();
  const codeFiles = useMemo(() => projectFiles.filter((file) => file.kind !== "asset"), [projectFiles]);
  const previousCodeFilesRef = useRef(codeFiles);
  const [previousCodeFiles, setPreviousCodeFiles] = useState(codeFiles);
  useEffect(() => {
    setPreviousCodeFiles(previousCodeFilesRef.current);
    previousCodeFilesRef.current = codeFiles;
  }, [codeFiles]);
  const pendingByPath = useMemo(
    () => new Map(pendingFileWrites.map((entry) => [entry.path, entry.status])),
    [pendingFileWrites]
  );
  const previewCodeFiles = useMemo(() => {
    const byPath = new Map(codeFiles.map((file) => [file.path, file]));
    for (const entry of pendingFileWrites) {
      if (!entry.path) continue;
      const existing = byPath.get(entry.path);
      if (existing) {
        if (typeof entry.content === "string") {
          byPath.set(entry.path, { ...existing, content: entry.content });
        }
        continue;
      }
      if (typeof entry.content !== "string" || entry.content.length === 0) {
        continue;
      }
      byPath.set(entry.path, {
        path: entry.path,
        content: entry.content,
        kind: "other",
      });
    }
    return Array.from(byPath.values());
  }, [codeFiles, pendingFileWrites]);

  const [viewMode, setViewMode] = useState<"edit" | "diff">("edit");

  const explorerRef = useRef<HTMLDivElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const lastCreateSignatureRef = useRef<string>("");

  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);

  const [virtualFolders, setVirtualFolders] = useState<string[]>([]);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["src", "styles", "assets"]));
  const [createState, setCreateState] = useState<CreateState | null>(null);
  const [draggedFilePath, setDraggedFilePath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const canPortal = typeof document !== "undefined";

  const tree = useMemo(
    () => buildTree(previewCodeFiles.map((file) => file.path), virtualFolders),
    [previewCodeFiles, virtualFolders]
  );

  const effectiveSelectedFilePath =
    (activeCodePath && previewCodeFiles.some((file) => file.path === activeCodePath)
      ? activeCodePath
      : (previewCodeFiles[0]?.path ?? null));

  const selectedFile = previewCodeFiles.find((file) => file.path === effectiveSelectedFilePath) ?? null;
  const expandedWithSelection = useMemo(() => {
    const next = new Set(expanded);
    if (!effectiveSelectedFilePath) return next;
    const parts = effectiveSelectedFilePath.split("/").filter(Boolean);
    let current = "";
    for (let i = 0; i < parts.length - 1; i += 1) {
      current = current ? `${current}/${parts[i]}` : (parts[i] ?? "");
      if (current) next.add(current);
    }
    return next;
  }, [effectiveSelectedFilePath, expanded]);
  const highlightCode = useCallback((code: string) => {
    const language: string = selectedFile ? getPrismLanguage(selectedFile.path) : "plain";
    const grammar = Prism.languages[language] ?? Prism.languages.plain ?? Prism.languages.plaintext;
    return Prism.highlight(code, grammar, language);
  }, [selectedFile]);

  // Per-file diff computation
  const activeFile = effectiveSelectedFilePath;
  const { fileDiff, isDiffStreaming, diffStats } = useMemo(() => {
    if (!activeFile) return { fileDiff: null, isDiffStreaming: false, diffStats: null };

    let oldContent = "";
    let newContent = "";
    let streaming = false;

    // Case 1: streaming via update_sandbox for index.html
    if (streamingCode && activeFile === "index.html") {
      oldContent = currentCode ?? "";
      newContent = streamingCode;
      streaming = true;
    }
    // Case 2: pending file write with content
    else {
      const pendingEntry = pendingFileWrites.find((e) => e.path === activeFile);
      if (pendingEntry && typeof pendingEntry.content === "string") {
        const existing = projectFiles.find((f) => f.path === activeFile);
        oldContent = existing?.content ?? "";
        newContent = pendingEntry.content;
        streaming = true;
      }
      // Case 3: finalized diff (previous vs current)
      else {
        const prevFile = previousCodeFiles.find((f) => f.path === activeFile);
        const curFile = previewCodeFiles.find((f) => f.path === activeFile);
        oldContent = prevFile?.content ?? "";
        newContent = curFile?.content ?? "";
      }
    }

    if (!newContent && !oldContent) return { fileDiff: null, isDiffStreaming: false, diffStats: null };

    const language = getPrismLanguage(activeFile);
    const grammar = Prism.languages[language] ?? Prism.languages.plain ?? Prism.languages.plaintext;
    const highlight = (code: string) => Prism.highlight(code, grammar, language);

    const lines = computeHighlightedDiff(oldContent, newContent, highlight);

    let added = 0;
    let removed = 0;
    for (const line of lines) {
      if (line.type === "added") added++;
      else if (line.type === "removed") removed++;
    }

    return {
      fileDiff: lines,
      isDiffStreaming: streaming,
      diffStats: added > 0 || removed > 0 ? { added, removed } : null,
    };
  }, [activeFile, streamingCode, currentCode, pendingFileWrites, projectFiles, previousCodeFiles, previewCodeFiles]);

  // Auto-switch to diff mode when streaming starts (derived state, no effect needed)
  const isCurrentlyStreaming = !!streamingCode || pendingFileWrites.some((e) => typeof e.content === "string");
  const [prevStreaming, setPrevStreaming] = useState(false);
  if (isCurrentlyStreaming && !prevStreaming) {
    setViewMode("diff");
  }
  if (isCurrentlyStreaming !== prevStreaming) {
    setPrevStreaming(isCurrentlyStreaming);
  }

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleToggleFolder = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const expandParents = useCallback((path: string) => {
    const parts = path.split("/").filter(Boolean);
    if (parts.length <= 1) return;

    setExpanded((prev) => {
      const next = new Set(prev);
      let current = "";
      for (let i = 0; i < parts.length - 1; i += 1) {
        current = current ? `${current}/${parts[i]}` : (parts[i] ?? "");
        if (current) next.add(current);
      }
      return next;
    });
  }, []);

  const getCreateParent = () => {
    if (selectedFolderPath) return selectedFolderPath;
    if (!effectiveSelectedFilePath) return "";
    return dirname(effectiveSelectedFilePath);
  };

  const startCreate = (kind: "file" | "folder", forcedParent?: string) => {
    const parent = forcedParent ?? getCreateParent();
    if (parent) setExpanded((prev) => new Set(prev).add(parent));
    setCreateState({ kind, parent, value: "" });
    closeContextMenu();
  };

  const cancelCreate = useCallback(() => setCreateState(null), []);

  const submitCreate = useCallback(() => {
    if (!createState) return;
    const name = normalizeUserPath(createState.value);

    if (!name) {
      cancelCreate();
      return;
    }

    const fullPath = createState.parent ? `${createState.parent}/${name}` : name;

    if (createState.kind === "folder") {
      setVirtualFolders((prev) => (prev.includes(fullPath) ? prev : [...prev, fullPath]));
      setSelectedFolderPath(fullPath);
      setActiveCodePath(null);
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(fullPath);
        return next;
      });
      expandParents(`${fullPath}/placeholder`);
      cancelCreate();
      return;
    }

    updateProjectFile(fullPath, "");
    setActiveCodePath(fullPath);
    setSelectedFolderPath(null);
    expandParents(fullPath);
    cancelCreate();
  }, [cancelCreate, createState, expandParents, setActiveCodePath, updateProjectFile]);

  const deleteFolder = useCallback(
    (folderPath: string) => {
      const folderPrefix = `${folderPath}/`;
      const filesToDelete = codeFiles
        .map((file) => file.path)
        .filter((path) => path.startsWith(folderPrefix));

      for (const path of filesToDelete) {
        deleteProjectFile(path);
      }

      setVirtualFolders((prev) =>
        prev.filter((folder) => folder !== folderPath && !folder.startsWith(folderPrefix))
      );
      setExpanded((prev) => {
        const next = new Set<string>();
        for (const folder of prev) {
          if (folder === folderPath || folder.startsWith(folderPrefix)) continue;
          next.add(folder);
        }
        return next;
      });

      if (activeCodePath && activeCodePath.startsWith(folderPrefix)) {
        setActiveCodePath(null);
      }
      if (selectedFolderPath === folderPath || selectedFolderPath?.startsWith(folderPrefix)) {
        setSelectedFolderPath(null);
      }
    },
    [activeCodePath, codeFiles, deleteProjectFile, selectedFolderPath, setActiveCodePath]
  );

  const deleteFile = useCallback(
    (filePath: string) => {
      deleteProjectFile(filePath);
      if (activeCodePath === filePath) setActiveCodePath(null);
    },
    [activeCodePath, deleteProjectFile, setActiveCodePath]
  );

  useEffect(() => {
    if (!createState) return;
    const signature = `${createState.kind}:${createState.parent}`;
    if (lastCreateSignatureRef.current === signature) return;
    lastCreateSignatureRef.current = signature;
    createInputRef.current?.focus();
  }, [createState]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const raw = e.clientX - rect.left;
      const next = Math.max(180, Math.min(520, raw));
      setSidebarWidth(next);
    };

    const onMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    if (!createState) return;
    const onClick = (e: MouseEvent) => {
      if (createInputRef.current?.contains(e.target as Node)) return;
      if (explorerRef.current?.contains(e.target as Node)) {
        cancelCreate();
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [cancelCreate, createState]);

  useEffect(() => {
    if (!contextMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-context-menu='code-explorer']")) return;
      closeContextMenu();
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [closeContextMenu, contextMenu]);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const rect = contextMenuRef.current.getBoundingClientRect();
    const pad = 8;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let nextX = contextMenu.anchorX;
    let nextY = contextMenu.anchorY;

    if (nextX + rect.width > viewportW - pad) {
      nextX = Math.max(pad, contextMenu.anchorX - rect.width);
    }
    if (nextY + rect.height > viewportH - pad) {
      nextY = Math.max(pad, contextMenu.anchorY - rect.height);
    }

    nextX = Math.min(Math.max(nextX, pad), Math.max(pad, viewportW - rect.width - pad));
    nextY = Math.min(Math.max(nextY, pad), Math.max(pad, viewportH - rect.height - pad));

    if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
      setContextMenu((prev) => (prev ? { ...prev, x: nextX, y: nextY } : prev));
    }
  }, [contextMenu]);

  const moveFileToDirectory = useCallback(
    (sourceFilePath: string, targetDirPath: string) => {
      if (!sourceFilePath) return;
      const source = codeFiles.find((file) => file.path === sourceFilePath);
      if (!source) return;

      const name = basename(sourceFilePath);
      const normalizedTarget = targetDirPath.replace(/^\/+|\/+$/g, "");
      const destinationPath = normalizedTarget ? `${normalizedTarget}/${name}` : name;
      if (destinationPath === sourceFilePath) return;
      if (codeFiles.some((file) => file.path === destinationPath)) return;

      updateProjectFile(destinationPath, source.content);
      deleteProjectFile(sourceFilePath);
      setSelectedFolderPath(normalizedTarget || null);
      setActiveCodePath(destinationPath);
      expandParents(destinationPath);
    },
    [codeFiles, deleteProjectFile, expandParents, setActiveCodePath, updateProjectFile]
  );

  const openContextMenu = (e: React.MouseEvent, target: ContextTarget) => {
    e.preventDefault();
    if (target.kind === "file") {
      setActiveCodePath(target.path);
      setSelectedFolderPath(null);
    }
    if (target.kind === "folder") {
      setSelectedFolderPath(target.path);
    }
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      anchorX: e.clientX,
      anchorY: e.clientY,
      target,
    });
  };

  return (
    <div ref={containerRef} className="flex h-full bg-[var(--color-bg)]">
      <div
        ref={explorerRef}
        style={{ width: sidebarWidth }}
        className="border-r border-[var(--color-border)] overflow-y-auto py-1"
        onContextMenu={(e) => {
          if (e.target === explorerRef.current) {
            openContextMenu(e, { kind: "root" });
          }
        }}
      >
        <div className="px-2 pb-2 border-b border-[var(--color-border)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Explorer</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => startCreate("file")}
                className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                +File
              </button>
              <button
                type="button"
                onClick={() => startCreate("folder")}
                className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                +Folder
              </button>
            </div>
          </div>
        </div>

        {tree.length === 0 && !createState ? (
          <div className="relative flex h-[80%] w-full items-center justify-center overflow-hidden px-3">
            <div className="relative text-center animate-[fadeIn_0.4s_ease-out] space-y-3">
              <div className="mx-auto w-10 h-10 border border-[var(--color-border-light)] flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2">
                  <rect x="2" y="3" width="12" height="10" rx="1" />
                  <path d="M5 6h6M5 9h6" />
                </svg>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.15em] font-semibold">
                No Code Files
              </p>
              <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
                Generate a game to create files
              </p>
            </div>
          </div>
        ) : (
          <TreeView
            nodes={tree}
            depth={0}
            selectedFilePath={effectiveSelectedFilePath}
            selectedFolderPath={selectedFolderPath}
            expanded={expandedWithSelection}
            createState={createState}
            setCreateValue={(value) => setCreateState((prev) => (prev ? { ...prev, value } : prev))}
            submitCreate={submitCreate}
            cancelCreate={cancelCreate}
            createInputRef={createInputRef}
            draggedFilePath={draggedFilePath}
            setDraggedFilePath={setDraggedFilePath}
            moveFileToDirectory={moveFileToDirectory}
            onToggleFolder={handleToggleFolder}
            onSelectFolder={setSelectedFolderPath}
            onSelectFile={(path) => {
              setActiveCodePath(path);
              setSelectedFolderPath(null);
            }}
            onContextMenu={openContextMenu}
            pendingByPath={pendingByPath}
          />
        )}
      </div>

      <div
        className={`w-1 border-r border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-accent-glow)] cursor-col-resize ${isResizing ? "bg-[var(--color-accent-glow)]" : ""}`}
        onMouseDown={() => setIsResizing(true)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {selectedFile ? (
          <>
            <div className="px-3 py-1.5 border-b border-[var(--color-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  {selectedFile.path}
                </span>
                {isDiffStreaming && viewMode === "diff" ? (
                  <span className="text-[10px] text-[var(--color-accent)] animate-pulse">Streaming</span>
                ) : null}
                {viewMode === "diff" && diffStats ? (
                  <span className="text-[10px]">
                    <span className="text-[var(--color-success)]">+{diffStats.added}</span>
                    {" / "}
                    <span className="text-[var(--color-danger)]">-{diffStats.removed}</span>
                  </span>
                ) : null}
              </div>
              <div className="flex border border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={() => setViewMode("edit")}
                  className={`px-2 py-0.5 text-[9px] uppercase tracking-wider ${
                    viewMode === "edit"
                      ? "bg-[var(--color-surface-light)] text-[var(--color-text)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("diff")}
                  className={`px-2 py-0.5 text-[9px] uppercase tracking-wider border-l border-[var(--color-border)] ${
                    viewMode === "diff"
                      ? "bg-[var(--color-surface-light)] text-[var(--color-text)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  Diff
                </button>
              </div>
            </div>
            {viewMode === "edit" ? (
              <div className={`flex-1 min-h-0 overflow-auto ${styles.editorRoot}`}>
                <Editor
                  value={selectedFile.content}
                  onValueChange={(value) => updateProjectFile(selectedFile.path, value)}
                  highlight={highlightCode}
                  textareaClassName={styles.editorTextarea}
                  className={styles.editor}
                  padding={12}
                  style={{
                    minHeight: "100%",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    lineHeight: "1.25rem",
                    background: "var(--color-bg)",
                    color: "var(--color-text-secondary)",
                    outline: "none",
                  }}
                  spellCheck={false}
                />
              </div>
            ) : fileDiff && fileDiff.length > 0 ? (
              <DiffView lines={fileDiff} />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center animate-[fadeIn_0.4s_ease-out] space-y-3">
                  <div className="mx-auto w-10 h-10 border border-[var(--color-border-light)] flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2">
                      <path d="M5 8l2 2 4-4" />
                      <circle cx="8" cy="8" r="6" />
                    </svg>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.15em] font-semibold">
                    No Changes
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
                    No differences detected
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="relative flex-1 flex items-center justify-center overflow-hidden">
            <div className="relative text-center animate-[fadeIn_0.4s_ease-out] space-y-3">
              <div className="mx-auto w-10 h-10 border border-[var(--color-border-light)] flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2">
                  <path d="M3 3h10v10H3z" />
                  <path d="M6 6h4v4H6z" />
                </svg>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.15em] font-semibold">
                No Code Selected
              </p>
              <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
                Pick a file from Explorer
              </p>
            </div>
          </div>
        )}
      </div>

      {canPortal && contextMenu
        ? createPortal(
        <div
          ref={contextMenuRef}
          data-context-menu="code-explorer"
          className="fixed z-50 min-w-[140px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_10px_24px_rgba(0,0,0,0.5)]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {contextMenu.target.kind === "folder" ? (
            <>
              <button
                type="button"
                onClick={() => { const t = contextMenu.target; if (t.kind !== "root") startCreate("file", t.path); }}
                className="w-full text-left px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-light)]"
              >
                Add File
              </button>
              <button
                type="button"
                onClick={() => { const t = contextMenu.target; if (t.kind !== "root") startCreate("folder", t.path); }}
                className="w-full text-left px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-light)]"
              >
                Add Folder
              </button>
              <button
                type="button"
                onClick={() => {
                  const t = contextMenu.target;
                  if (t.kind !== "root") deleteFolder(t.path);
                  closeContextMenu();
                }}
                className="w-full text-left px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-danger)] hover:bg-[var(--color-surface-light)]"
              >
                Delete Folder
              </button>
            </>
          ) : null}

          {contextMenu.target.kind === "file" ? (
            <>
              <button
                type="button"
                onClick={() => { const t = contextMenu.target; if (t.kind !== "root") startCreate("file", dirname(t.path)); }}
                className="w-full text-left px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-light)]"
              >
                Add File
              </button>
              <button
                type="button"
                onClick={() => { const t = contextMenu.target; if (t.kind !== "root") startCreate("folder", dirname(t.path)); }}
                className="w-full text-left px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-light)]"
              >
                Add Folder
              </button>
              <button
                type="button"
                onClick={() => {
                  const t = contextMenu.target;
                  if (t.kind !== "root") deleteFile(t.path);
                  closeContextMenu();
                }}
                className="w-full text-left px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-danger)] hover:bg-[var(--color-surface-light)]"
              >
                Delete File
              </button>
            </>
          ) : null}

          {contextMenu.target.kind === "root" ? (
            <>
              <button
                type="button"
                onClick={() => startCreate("file", "")}
                className="w-full text-left px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-light)]"
              >
                Add File
              </button>
              <button
                type="button"
                onClick={() => startCreate("folder", "")}
                className="w-full text-left px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-light)]"
              >
                Add Folder
              </button>
            </>
          ) : null}
        </div>
          ,
          document.body
        )
        : null}
    </div>
  );
}
