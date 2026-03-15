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

const BINARY_IMPORT_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".avif",
  ".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac",
  ".mp4", ".webm", ".mov",
  ".zip", ".gz", ".rar", ".7z",
  ".woff", ".woff2", ".ttf", ".otf",
  ".glb", ".gltf", ".bin", ".fbx", ".obj", ".stl",
  ".pdf", ".exe", ".dmg", ".wasm",
]);

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

function inferImportedKind(path: string): ProjectFile["kind"] {
  const lower = path.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".css")) return "style";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs") || lower.endsWith(".ts") || lower.endsWith(".tsx") || lower.endsWith(".jsx")) {
    return "script";
  }
  if (lower.endsWith(".json") || lower.endsWith(".toml") || lower.endsWith(".yaml") || lower.endsWith(".yml")) {
    return "config";
  }
  if (lower.startsWith("assets/") || /(png|jpg|jpeg|gif|svg|webp|mp3|wav|ogg|glb|gltf|obj|fbx)$/i.test(lower)) return "asset";
  return "other";
}

function isLikelyBinaryPath(path: string): boolean {
  const lower = path.toLowerCase();
  for (const ext of BINARY_IMPORT_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

function arrayBufferToBinaryString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let output = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return output;
}

function writeAscii(target: Uint8Array, offset: number, length: number, value: string) {
  const encoded = new TextEncoder().encode(value);
  target.set(encoded.slice(0, length), offset);
}

function writeOctal(target: Uint8Array, offset: number, length: number, value: number) {
  const oct = Math.max(0, value).toString(8);
  const padded = oct.padStart(Math.max(0, length - 2), "0");
  const field = `${padded}\0 `;
  writeAscii(target, offset, length, field.slice(-length));
}

function splitTarPath(path: string): { name: string; prefix: string } {
  const normalized = normalizeUserPath(path);
  if (normalized.length <= 100) return { name: normalized, prefix: "" };

  const parts = normalized.split("/");
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const prefix = parts.slice(0, i).join("/");
    const name = parts.slice(i).join("/");
    if (prefix.length <= 155 && name.length <= 100) {
      return { name, prefix };
    }
  }

  return {
    name: normalized.slice(-100),
    prefix: normalized.slice(0, Math.max(0, normalized.length - 100)).slice(0, 155),
  };
}

function buildTarBlob(files: Array<{ path: string; content: string }>): Blob {
  const encoder = new TextEncoder();
  const blocks: Uint8Array[] = [];

  for (const file of files) {
    const { name, prefix } = splitTarPath(file.path);
    const data = encoder.encode(file.content ?? "");
    const header = new Uint8Array(512);

    writeAscii(header, 0, 100, name);
    writeOctal(header, 100, 8, 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, data.length);
    writeOctal(header, 136, 12, Math.floor(Date.now() / 1000));
    writeAscii(header, 148, 8, "        ");
    writeAscii(header, 156, 1, "0");
    writeAscii(header, 257, 6, "ustar\0");
    writeAscii(header, 263, 2, "00");
    writeAscii(header, 265, 32, "root");
    writeAscii(header, 297, 32, "root");
    writeAscii(header, 345, 155, prefix);

    let checksum = 0;
    for (const byte of header) checksum += byte;
    const checkField = `${checksum.toString(8).padStart(6, "0")}\0 `;
    writeAscii(header, 148, 8, checkField);

    blocks.push(header);
    blocks.push(data);

    const pad = (512 - (data.length % 512)) % 512;
    if (pad > 0) blocks.push(new Uint8Array(pad));
  }

  blocks.push(new Uint8Array(1024));
  return new Blob(blocks, { type: "application/x-tar" });
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
  const paddingLeft = 4 + depth * 12;

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
        const paddingLeft = 4 + depth * 12;

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
            <span className="w-10 shrink-0 text-right pr-2 text-[var(--color-text-muted)] opacity-40 select-none">
              {line.lineNum}
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
    patchProjectFiles,
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
  const uploadMenuButtonRef = useRef<HTMLButtonElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const fileUploadInputRef = useRef<HTMLInputElement>(null);
  const folderUploadInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
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
  const [isFolderDropActive, setIsFolderDropActive] = useState(false);
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const [uploadMenuPos, setUploadMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
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

  const importFolderEntries = useCallback(async (entries: Array<{ path: string; file: File }>) => {
    if (entries.length === 0) return;

    const importedFiles: ProjectFile[] = [];
    for (const entry of entries) {
      const normalizedPath = normalizeUserPath(entry.path);
      if (!normalizedPath || normalizedPath.endsWith("/")) continue;

      try {
        const kind = inferImportedKind(normalizedPath);
        const content =
          kind === "asset" || isLikelyBinaryPath(normalizedPath)
            ? arrayBufferToBinaryString(await entry.file.arrayBuffer())
            : await entry.file.text();
        importedFiles.push({
          path: normalizedPath,
          content,
          kind,
        });
      } catch {
        // Skip unreadable entries.
      }
    }

    if (importedFiles.length === 0) return;
    patchProjectFiles(importedFiles);

    const folderPaths = new Set<string>();
    for (const file of importedFiles) {
      const parts = file.path.split("/").filter(Boolean);
      let current = "";
      for (let i = 0; i < parts.length - 1; i += 1) {
        current = current ? `${current}/${parts[i]}` : (parts[i] ?? "");
        if (current) folderPaths.add(current);
      }
    }

    if (folderPaths.size > 0) {
      setVirtualFolders((prev) => Array.from(new Set([...prev, ...folderPaths])));
    }

    const firstPath = importedFiles[0]?.path ?? null;
    if (firstPath) {
      setActiveCodePath(firstPath);
      setSelectedFolderPath(dirname(firstPath) || null);
      expandParents(firstPath);
    }
  }, [expandParents, patchProjectFiles, setActiveCodePath]);

  const handleImportInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const entries = files.map((file) => {
      const withRelative = file as File & { webkitRelativePath?: string };
      return {
        path: withRelative.webkitRelativePath && withRelative.webkitRelativePath.length > 0
          ? withRelative.webkitRelativePath
          : file.name,
        file,
      };
    });
    await importFolderEntries(entries);
    e.target.value = "";
  }, [importFolderEntries]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!draggedFilePath && !e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsFolderDropActive(true);
  }, [draggedFilePath]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!draggedFilePath && !e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isFolderDropActive) setIsFolderDropActive(true);
  }, [draggedFilePath, isFolderDropActive]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!draggedFilePath && !e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsFolderDropActive(false);
    }
  }, [draggedFilePath]);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsFolderDropActive(false);

    if (draggedFilePath) {
      moveFileToDirectory(draggedFilePath, "");
      setDraggedFilePath(null);
      return;
    }

    if (!e.dataTransfer?.files?.length) return;
    const files = Array.from(e.dataTransfer.files);
    const entries = files.map((file) => {
      const withRelative = file as File & { webkitRelativePath?: string };
      return {
        path: withRelative.webkitRelativePath && withRelative.webkitRelativePath.length > 0
          ? withRelative.webkitRelativePath
          : file.name,
        file,
      };
    });
    await importFolderEntries(entries);
  }, [draggedFilePath, importFolderEntries, moveFileToDirectory]);

  useEffect(() => {
    const input = folderUploadInputRef.current as (HTMLInputElement & { webkitdirectory?: boolean; directory?: boolean }) | null;
    if (!input) return;
    input.webkitdirectory = true;
    input.directory = true;
  }, []);

  useEffect(() => {
    if (!isUploadMenuOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (uploadMenuButtonRef.current?.contains(target)) return;
      if (uploadMenuRef.current?.contains(target)) return;
      setIsUploadMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isUploadMenuOpen]);

  const handleDownloadAll = useCallback(() => {
    if (projectFiles.length === 0) return;
    const archive = buildTarBlob(
      projectFiles.map((file) => ({
        path: file.path,
        content: file.content,
      }))
    );
    const url = URL.createObjectURL(archive);
    const a = document.createElement("a");
    a.href = url;
    a.download = `game-forge-project-${Date.now()}.tar`;
    a.click();
    URL.revokeObjectURL(url);
  }, [projectFiles]);

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
        className="relative border-r border-[var(--color-border)] overflow-y-auto py-1"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
              <input
                ref={fileUploadInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleImportInputChange}
              />
              <input
                ref={folderUploadInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleImportInputChange}
              />
              <button
                type="button"
                onClick={handleDownloadAll}
                className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                Download
              </button>
              <button
                ref={uploadMenuButtonRef}
                type="button"
                onClick={() => {
                  if (isUploadMenuOpen) {
                    setIsUploadMenuOpen(false);
                    return;
                  }
                  const rect = uploadMenuButtonRef.current?.getBoundingClientRect();
                  if (rect) {
                    setUploadMenuPos({ x: rect.left, y: rect.bottom + 4 });
                  }
                  setIsUploadMenuOpen(true);
                }}
                className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                Upload
              </button>
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

        <button
          type="button"
          onClick={() => {
            setSelectedFolderPath(null);
            setActiveCodePath(null);
          }}
          onDragOver={(e) => {
            if (!draggedFilePath) return;
            e.preventDefault();
          }}
          onDrop={(e) => {
            if (!draggedFilePath) return;
            e.preventDefault();
            moveFileToDirectory(draggedFilePath, "");
            setDraggedFilePath(null);
          }}
          className={`w-full text-left px-2 py-1 text-[9px] uppercase tracking-[0.12em] border-b border-[var(--color-border)] ${
            selectedFolderPath === null
              ? "text-[var(--color-accent)] bg-[var(--color-accent-glow)]"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-light)]"
          }`}
        >
          Root
        </button>

        {isFolderDropActive ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-accent-glow)]/20">
            <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-accent)]">
              Drop files/folder to import or move to root
            </div>
          </div>
        ) : null}

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

      {canPortal && isUploadMenuOpen
        ? createPortal(
          <div
            ref={uploadMenuRef}
            className="fixed z-50 min-w-[120px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_10px_24px_rgba(0,0,0,0.5)]"
            style={{
              left: uploadMenuPos.x,
              top: uploadMenuPos.y,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setIsUploadMenuOpen(false);
                fileUploadInputRef.current?.click();
              }}
              className="w-full text-left px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-light)]"
            >
              Files
            </button>
            <button
              type="button"
              onClick={() => {
                setIsUploadMenuOpen(false);
                folderUploadInputRef.current?.click();
              }}
              className="w-full text-left px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-light)]"
            >
              Folder
            </button>
          </div>,
          document.body
        )
        : null}
    </div>
  );
}
