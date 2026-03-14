"use client";

import { useState, useRef, useEffect } from "react";

interface PanelInfo {
  id: string;
  title: string;
  isOpen: boolean;
}

interface ToolbarProps {
  panels: PanelInfo[];
  onTogglePanel: (id: string) => void;
  onResetLayout: () => void;
  engineLabel?: string;
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
      {isOpen && (
        <div
          className="absolute top-full left-0 mt-0 min-w-[200px] bg-[var(--color-surface)] border border-[var(--color-border-light)] z-50 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
          style={{ animation: "slideDown 0.12s ease-out" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  checked,
  onClick,
  shortcut,
}: {
  label: string;
  checked?: boolean;
  onClick: () => void;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="gf-list-row flex items-center w-full px-3 py-2 text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)]"
    >
      <span className="w-5 text-[var(--color-accent)] text-xs">
        {checked !== undefined ? (checked ? "\u2713" : "") : ""}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <span className="text-[var(--color-text-muted)] ml-6 text-[10px]">{shortcut}</span>
      )}
    </button>
  );
}

function MenuDivider() {
  return <div className="border-t border-[var(--color-border)] my-1 mx-2" />;
}

export function Toolbar({ panels, onTogglePanel, onResetLayout, engineLabel }: ToolbarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

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
      {/* App title */}
      <div className="px-4 flex items-center h-full border-r border-[var(--color-border)] gap-2">
        {/* Logo mark */}
        <div className="w-4 h-4 border border-[var(--color-accent)] flex items-center justify-center">
          <div className="w-1.5 h-1.5 bg-[var(--color-accent)]" />
        </div>
        <span className="text-[11px] text-[var(--color-accent)] font-bold tracking-[0.12em] uppercase">
          Game Forge
        </span>
        {engineLabel ? (
          <span className="text-[9px] text-[var(--color-text-muted)] tracking-[0.08em] uppercase border border-[var(--color-border)] px-1.5 py-0.5">
            {engineLabel}
          </span>
        ) : null}
      </div>

      {/* Window menu */}
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

      <div className="flex-1" />
    </div>
  );
}
