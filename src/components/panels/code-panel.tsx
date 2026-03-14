"use client";

import { useMemo, useState } from "react";
import { useGameForge } from "@/lib/game-forge-context";
import { isCodeFile } from "@/lib/project-files";

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

function insertNode(nodes: TreeNode[], parts: string[], fullPath: string, prefix = ""): TreeNode[] {
  if (parts.length === 0) return nodes;
  const [head, ...tail] = parts;
  const currentPath = prefix ? `${prefix}/${head}` : head;

  if (tail.length === 0) {
    return [...nodes, { kind: "file", name: head, path: fullPath }];
  }

  const existingIndex = nodes.findIndex((node) => node.kind === "folder" && node.name === head);
  if (existingIndex >= 0) {
    const folder = nodes[existingIndex] as FolderNode;
    const updated: FolderNode = {
      ...folder,
      children: insertNode(folder.children, tail, fullPath, currentPath),
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
      children: insertNode([], tail, fullPath, currentPath),
    },
  ];
}

function buildTree(paths: string[]): TreeNode[] {
  let tree: TreeNode[] = [];
  for (const path of paths) {
    tree = insertNode(tree, path.split("/"), path);
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

function TreeView({
  nodes,
  depth,
  selectedPath,
  expanded,
  onToggleFolder,
  onSelectFile,
}: {
  nodes: TreeNode[];
  depth: number;
  selectedPath: string | null;
  expanded: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const paddingLeft = 8 + depth * 12;
        if (node.kind === "folder") {
          const isOpen = expanded.has(node.path);
          return (
            <div key={node.path}>
              <button
                type="button"
                onClick={() => onToggleFolder(node.path)}
                className="w-full text-left py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] hover:bg-[var(--color-surface-light)]"
                style={{ paddingLeft }}
              >
                <span className="inline-block w-3">{isOpen ? "▾" : "▸"}</span>
                {node.name}
              </button>
              {isOpen ? (
                <TreeView
                  nodes={node.children}
                  depth={depth + 1}
                  selectedPath={selectedPath}
                  expanded={expanded}
                  onToggleFolder={onToggleFolder}
                  onSelectFile={onSelectFile}
                />
              ) : null}
            </div>
          );
        }

        const isSelected = node.path === selectedPath;
        return (
          <button
            key={node.path}
            type="button"
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
  const { projectFiles, updateProjectFile } = useGameForge();
  const codeFiles = useMemo(() => projectFiles.filter(isCodeFile), [projectFiles]);
  const tree = useMemo(() => buildTree(codeFiles.map((file) => file.path)), [codeFiles]);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["src", "styles", "assets"]));
  const [newFilePath, setNewFilePath] = useState("");

  const effectiveSelectedPath =
    selectedPath && codeFiles.some((file) => file.path === selectedPath)
      ? selectedPath
      : (codeFiles[0]?.path ?? null);

  const selectedFile = codeFiles.find((file) => file.path === effectiveSelectedPath) ?? null;

  const handleToggleFolder = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleCreateFile = () => {
    const path = newFilePath.trim().replace(/^\.\//, "");
    if (!path) return;
    updateProjectFile(path, "");
    setSelectedPath(path);
    setNewFilePath("");

    const parts = path.split("/");
    if (parts.length > 1) {
      setExpanded((prev) => {
        const next = new Set(prev);
        let current = "";
        for (let i = 0; i < parts.length - 1; i += 1) {
          current = current ? `${current}/${parts[i]}` : parts[i]!;
          next.add(current);
        }
        return next;
      });
    }
  };

  return (
    <div className="flex h-full bg-[var(--color-bg)]">
      <div className="w-56 border-r border-[var(--color-border)] overflow-y-auto py-1">
        <div className="px-2 pb-2 border-b border-[var(--color-border)]">
          <div className="flex gap-1">
            <input
              value={newFilePath}
              onChange={(e) => setNewFilePath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateFile();
                }
              }}
              placeholder="new file path"
              className="flex-1 min-w-0 bg-[var(--color-surface-light)] border border-[var(--color-border)] text-[10px] text-[var(--color-text-secondary)] px-1.5 py-1 outline-none"
            />
            <button
              type="button"
              onClick={handleCreateFile}
              className="px-2 text-[10px] uppercase tracking-wider border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              Add
            </button>
          </div>
        </div>
        {tree.length === 0 ? (
          <p className="text-[10px] text-[var(--color-text-muted)] p-3 uppercase">No code files</p>
        ) : (
          <TreeView
            nodes={tree}
            depth={0}
            selectedPath={effectiveSelectedPath}
            expanded={expanded}
            onToggleFolder={handleToggleFolder}
            onSelectFile={setSelectedPath}
          />
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
