"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameForge } from "@/lib/game-forge-context";

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

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(0, idx) : "";
}

function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function insertFileNode(nodes: TreeNode[], parts: string[], fullPath: string, prefix = ""): TreeNode[] {
  if (parts.length === 0) return nodes;
  const [head, ...tail] = parts;
  const currentPath = prefix ? `${prefix}/${head}` : head;

  if (tail.length === 0) {
    if (nodes.some((node) => node.kind === "file" && node.path === fullPath)) return nodes;
    return [...nodes, { kind: "file", name: head, path: fullPath }];
  }

  const existingIndex = nodes.findIndex((node) => node.kind === "folder" && node.name === head);
  if (existingIndex >= 0) {
    const folder = nodes[existingIndex] as FolderNode;
    const updated: FolderNode = {
      ...folder,
      children: insertFileNode(folder.children, tail, fullPath, currentPath),
    };
    const copy = [...nodes];
    copy[existingIndex] = updated;
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

  const existingIndex = nodes.findIndex((node) => node.kind === "folder" && node.name === head);
  if (existingIndex >= 0) {
    if (tail.length === 0) return nodes;
    const folder = nodes[existingIndex] as FolderNode;
    const updated: FolderNode = {
      ...folder,
      children: insertFolderNode(folder.children, tail, currentPath),
    };
    const copy = [...nodes];
    copy[existingIndex] = updated;
    return copy;
  }

  const created: FolderNode = {
    kind: "folder",
    name: head,
    path: currentPath,
    children: tail.length > 0 ? insertFolderNode([], tail, currentPath) : [],
  };

  return [...nodes, created];
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
        <span className="inline-flex w-3 justify-center">
          {createState.kind === "folder" ? "▸" : "+"}
        </span>
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
            onClick={() => onSelectFile(node.path)}
            className={`w-full text-left py-1.5 text-[10px] tracking-wider hover:bg-[var(--color-surface-light)] ${
              isSelected ? "text-[var(--color-accent)] bg-[var(--color-accent-glow)]" : "text-[var(--color-text-secondary)]"
            }`}
            style={{ paddingLeft }}
          >
            {node.name}
          </button>
        );
      })}
    </>
  );
}

export function CodePanel() {
  const { projectFiles, updateProjectFile, deleteProjectFile } = useGameForge();
  const codeFiles = useMemo(
    () => projectFiles.filter((file) => file.kind !== "asset"),
    [projectFiles]
  );

  const explorerRef = useRef<HTMLDivElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const lastCreateSignatureRef = useRef<string>("");

  const [virtualFolders, setVirtualFolders] = useState<string[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["src", "styles", "assets"]));
  const [createState, setCreateState] = useState<CreateState | null>(null);
  const [draggedFilePath, setDraggedFilePath] = useState<string | null>(null);

  const tree = useMemo(
    () => buildTree(codeFiles.map((file) => file.path), virtualFolders),
    [codeFiles, virtualFolders]
  );

  const effectiveSelectedFilePath =
    selectedFilePath && codeFiles.some((file) => file.path === selectedFilePath)
      ? selectedFilePath
      : (codeFiles[0]?.path ?? null);

  const selectedFile = codeFiles.find((file) => file.path === effectiveSelectedFilePath) ?? null;

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

  const startCreate = (kind: "file" | "folder") => {
    const parent = getCreateParent();
    if (parent) setExpanded((prev) => new Set(prev).add(parent));
    setCreateState({ kind, parent, value: "" });
  };

  const cancelCreate = useCallback(() => setCreateState(null), []);

  const submitCreate = useCallback(() => {
    if (!createState) return;

    const name = createState.value
      .trim()
      .replace(/\.\//g, "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");

    if (!name) {
      cancelCreate();
      return;
    }

    const fullPath = createState.parent ? `${createState.parent}/${name}` : name;

    if (createState.kind === "folder") {
      setVirtualFolders((prev) => (prev.includes(fullPath) ? prev : [...prev, fullPath]));
      setSelectedFolderPath(fullPath);
      setSelectedFilePath(null);
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
    setSelectedFilePath(fullPath);
    setSelectedFolderPath(null);
    expandParents(fullPath);
    cancelCreate();
  }, [cancelCreate, createState, expandParents, updateProjectFile]);

  useEffect(() => {
    if (!createState) return;
    const signature = `${createState.kind}:${createState.parent}`;
    if (lastCreateSignatureRef.current === signature) return;
    lastCreateSignatureRef.current = signature;
    createInputRef.current?.focus();
  }, [createState]);

  useEffect(() => {
    if (!createState) return;
    const onClick = (e: MouseEvent) => {
      if (createInputRef.current?.contains(e.target as Node)) return;
      if (explorerRef.current?.contains(e.target as Node)) {
        // clicked inside explorer but not on input: cancel like VS Code
        cancelCreate();
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [cancelCreate, createState]);

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
      setSelectedFilePath(destinationPath);
      setSelectedFolderPath(normalizedTarget || null);
      expandParents(destinationPath);
    },
    [codeFiles, deleteProjectFile, expandParents, updateProjectFile]
  );

  const handleDeleteSelection = useCallback(() => {
    if (selectedFolderPath) {
      const folderPrefix = `${selectedFolderPath}/`;
      const filesToDelete = codeFiles
        .map((file) => file.path)
        .filter((path) => path.startsWith(folderPrefix));

      for (const path of filesToDelete) {
        deleteProjectFile(path);
      }

      setVirtualFolders((prev) =>
        prev.filter((folder) => folder !== selectedFolderPath && !folder.startsWith(folderPrefix))
      );
      setExpanded((prev) => {
        const next = new Set<string>();
        for (const folder of prev) {
          if (folder === selectedFolderPath || folder.startsWith(folderPrefix)) continue;
          next.add(folder);
        }
        return next;
      });

      if (selectedFilePath && selectedFilePath.startsWith(folderPrefix)) {
        setSelectedFilePath(null);
      }
      setSelectedFolderPath(null);
      return;
    }

    const filePath = selectedFilePath ?? effectiveSelectedFilePath;
    if (!filePath) return;
    deleteProjectFile(filePath);
    if (selectedFilePath === filePath) setSelectedFilePath(null);
  }, [
    codeFiles,
    deleteProjectFile,
    effectiveSelectedFilePath,
    selectedFilePath,
    selectedFolderPath,
  ]);

  return (
    <div className="flex h-full bg-[var(--color-bg)]">
      <div ref={explorerRef} className="w-56 border-r border-[var(--color-border)] overflow-y-auto py-1">
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
              <button
                type="button"
                onClick={handleDeleteSelection}
                disabled={!selectedFolderPath && !effectiveSelectedFilePath}
                className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] disabled:opacity-40"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        {tree.length === 0 && !createState ? (
          <p className="text-[10px] text-[var(--color-text-muted)] p-3 uppercase">No code files</p>
        ) : (
          <TreeView
            nodes={tree}
            depth={0}
            selectedFilePath={effectiveSelectedFilePath}
            selectedFolderPath={selectedFolderPath}
            expanded={expanded}
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
              setSelectedFilePath(path);
              setSelectedFolderPath(null);
            }}
          />
        )}
      </div>

      <div className="flex-1 flex flex-col">
        {selectedFile ? (
          <>
            <div className="px-3 py-1.5 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] flex items-center justify-between gap-2">
              <span>{selectedFile.path}</span>
              <button
                type="button"
                onClick={() => {
                  deleteProjectFile(selectedFile.path);
                  setSelectedFilePath(null);
                }}
                className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
              >
                Delete
              </button>
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
