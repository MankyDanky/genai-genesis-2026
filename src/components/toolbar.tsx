"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useRef, useEffect, useCallback } from "react";

interface PanelInfo {
  id: string;
  title: string;
  isOpen: boolean;
}

interface ToolbarProps {
  panels: PanelInfo[];
  onTogglePanel: (id: string) => void;
  onResetLayout: () => void;
  onSaveProject: () => void;
  onPublishProject: () => void;
  onOpenProject: () => void;
  onResetProject: () => void;
  onShareClick?: () => void;
  onPlayPathClick?: () => void;
  engineLabel?: string;
  projectId?: string | null;
  revisionNumber?: number | null;
  busyAction?: "save" | "load" | "publish" | null;
  playPath?: string | null;
}

function DropdownMenu({
  label,
  children,
  isOpen,
  onToggle,
  onClose,
}: {
  label: string;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, onClose]);

  return (
    <div ref={ref} className="relative h-full flex items-center">
      <button
        type="button"
        onClick={onToggle}
        className={`px-3 h-full text-[11px] uppercase tracking-[0.08em] font-semibold transition-all duration-150 ${
          isOpen
            ? "text-[var(--color-accent)] bg-[var(--color-surface-light)]"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-light)]"
        }`}
      >
        {label}
      </button>
      {isOpen ? (
        <div
          className="absolute top-full left-0 mt-0 min-w-[220px] bg-[var(--color-surface)] border border-[var(--color-border-light)] z-50 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
          style={{ animation: "slideDown 0.12s ease-out" }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  label,
  checked,
  onClick,
  shortcut,
  disabled,
}: {
  label: string;
  checked?: boolean;
  onClick: () => void;
  shortcut?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="gf-list-row flex items-center w-full px-3 py-2 text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)] disabled:opacity-40 disabled:cursor-default"
    >
      <span className="w-5 text-[var(--color-accent)] text-xs">
        {checked !== undefined ? (checked ? "\u2713" : "") : ""}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut ? (
        <span className="text-[var(--color-text-muted)] ml-6 text-[10px]">{shortcut}</span>
      ) : null}
    </button>
  );
}

function MenuDivider() {
  return <div className="border-t border-[var(--color-border)] my-1 mx-2" />;
}

function ActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="gf-btn-chip h-6 px-2.5 border border-[var(--color-border-light)] text-[10px] uppercase tracking-[0.1em] font-semibold text-[var(--color-text-secondary)] disabled:opacity-40 disabled:cursor-default"
    >
      {label}
    </button>
  );
}

export function Toolbar({
  panels,
  onTogglePanel,
  onResetLayout,
  onSaveProject,
  onPublishProject,
  onOpenProject,
  onResetProject,
  onShareClick,
  onPlayPathClick,
  engineLabel,
  projectId,
  revisionNumber,
  busyAction,
  playPath,
}: ToolbarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const isBusy = busyAction !== null;
  const projectLabel = projectId ? `${projectId.slice(0, 8)}...` : "Unsaved";

  const handleCopyProjectId = useCallback(async () => {
    if (!projectId) return;
    try {
      await navigator.clipboard.writeText(projectId);
    } catch {
      // silent fallback
    }
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  }, [projectId]);
  const busyText =
    busyAction === "save"
      ? "Saving revision..."
      : busyAction === "load"
        ? "Loading project..."
        : busyAction === "publish"
          ? "Publishing build..."
          : null;

  const toggle = (menu: string) => {
    setOpenMenu((prev) => (prev === menu ? null : menu));
  };

  const close = () => setOpenMenu(null);

  return (
    <div
      className="h-[32px] flex items-center border-b border-[var(--color-border)] select-none shrink-0"
      style={{
        background: "var(--color-surface)",
      }}
    >
      <div className="px-4 flex items-center h-full border-r border-[var(--color-border)] gap-2">
        <Image src="/axiom.png" alt="Axiom" width={20} height={20} className="object-contain" />
        <span className="text-[11px] text-[var(--color-accent)] font-bold tracking-[0.12em] uppercase">
          AXIOM
        </span>
        {engineLabel ? (
          <span className="text-[9px] text-[var(--color-text-muted)] tracking-[0.08em] uppercase border border-[var(--color-border)] px-1.5 py-0.5">
            {engineLabel}
          </span>
        ) : null}
      </div>

      <DropdownMenu
        label="Project"
        isOpen={openMenu === "project"}
        onToggle={() => toggle("project")}
        onClose={close}
      >
        <MenuItem
          label="Save Revision"
          onClick={() => {
            onSaveProject();
            close();
          }}
          disabled={isBusy}
        />
        <MenuItem
          label="Publish"
          onClick={() => {
            onPublishProject();
            close();
          }}
          disabled={isBusy}
        />
        <MenuItem
          label="Open Project"
          onClick={() => {
            onOpenProject();
            close();
          }}
          disabled={isBusy}
        />
        <MenuDivider />
        <MenuItem
          label="New Project"
          onClick={() => {
            onResetProject();
            close();
          }}
          disabled={isBusy}
        />
      </DropdownMenu>

      <DropdownMenu
        label="Window"
        isOpen={openMenu === "window"}
        onToggle={() => toggle("window")}
        onClose={close}
      >
        {panels.map((panel) => (
          <MenuItem
            key={panel.id}
            label={panel.title}
            checked={panel.isOpen}
            onClick={() => {
              onTogglePanel(panel.id);
              close();
            }}
          />
        ))}
        <MenuDivider />
        <MenuItem
          label="Reset Layout"
          onClick={() => {
            onResetLayout();
            close();
          }}
        />
      </DropdownMenu>

      <div className="ml-3 flex items-center gap-2">
        {projectId ? (
          <button
            type="button"
            onClick={handleCopyProjectId}
            title={`Click to copy full ID: ${projectId}`}
            className={`text-[9px] uppercase tracking-[0.1em] border px-1.5 py-0.5 transition-all duration-150 ${
              copiedId
                ? "text-[var(--color-accent)] border-[var(--color-accent)] shadow-[0_0_6px_var(--color-accent-glow)]"
                : "text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text)] hover:border-[var(--color-accent)] cursor-pointer"
            }`}
          >
            {copiedId ? "Copied!" : projectLabel}
          </button>
        ) : (
          <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--color-text-muted)] border border-[var(--color-border)] px-1.5 py-0.5">
            {projectLabel}
          </span>
        )}
        {revisionNumber ? (
          <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--color-text-muted)] border border-[var(--color-border)] px-1.5 py-0.5">
            Rev {revisionNumber}
          </span>
        ) : null}
      </div>

      <div className="flex-1 px-3 min-w-0">
        {busyText ? (
          <p className="truncate text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
            {busyText}
          </p>
        ) : playPath ? (
          <button
            type="button"
            onClick={onPlayPathClick}
            className="truncate text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors cursor-pointer bg-transparent border-none p-0"
          >
            Latest publish: {playPath}
          </button>
        ) : null}
      </div>

      <div className="px-3 flex items-center gap-2">
        <Link
          href="/explore"
          className="gf-btn-chip h-6 px-2.5 border border-[var(--color-border-light)] text-[10px] uppercase tracking-[0.1em] font-semibold text-[var(--color-text-secondary)] flex items-center"
        >
          Explore
        </Link>
        <ActionButton label="Save" onClick={onSaveProject} disabled={isBusy} />
        <ActionButton label="Publish" onClick={onPublishProject} disabled={isBusy} />
        {playPath && onShareClick ? (
          <ActionButton label="Share" onClick={onShareClick} disabled={isBusy} />
        ) : null}
      </div>
    </div>
  );
}
