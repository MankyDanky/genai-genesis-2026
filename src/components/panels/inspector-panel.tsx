"use client";

import { useMemo } from "react";
import { useGameForge } from "@/lib/game-forge-context";
import { getEngineLabel } from "@/lib/game-engine";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--color-border)]">
      <div className="gf-section-header px-3 py-2">
        <p className="text-[11px] text-[var(--color-text-secondary)] uppercase tracking-[0.12em] font-bold">
          {title}
        </p>
      </div>
      <div className="px-3 py-2.5 space-y-1">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">
        {label}
      </span>
      <span className={`text-[10px] tracking-wider font-medium ${
        accent ? "text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]"
      }`}>
        {value}
      </span>
    </div>
  );
}

function FpsSparkline({ history }: { history: number[] }) {
  if (history.length < 2) return null;

  const max = Math.max(...history, 1);
  const width = 100;
  const height = 20;
  const step = width / (history.length - 1);

  const points = history
    .map((fps, i) => `${i * step},${height - (fps / max) * height}`)
    .join(" ");

  return (
    <svg width={width} height={height} className="inline-block ml-2 align-middle opacity-70">
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ConsoleBadge({
  count,
  color,
  label,
  onClick,
}: {
  count: number;
  color: string;
  label: string;
  onClick: () => void;
}) {
  if (count === 0) return null;
  return (
    <button
      onClick={onClick}
      title={`${count} ${label}`}
      className="gf-btn-chip inline-flex items-center gap-1 px-1.5 py-0.5 border border-[var(--color-border-light)] bg-[var(--color-surface)]"
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-[10px] font-medium" style={{ color }}>
        {count}
      </span>
    </button>
  );
}

export function InspectorPanel() {
  const {
    currentCode,
    currentEngine,
    projectFiles,
    assets,
    controls,
    consoleLogs,
    focusConsolePanel,
    currentFps,
    fpsHistory,
    isPaused,
    triggerSandboxReload,
    triggerScreenshot,
    togglePause,
  } = useGameForge();

  const consoleCounts = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    let logs = 0;
    for (const entry of consoleLogs) {
      if (entry.level === "error") errors++;
      else if (entry.level === "warn") warnings++;
      else logs++;
    }
    return { errors, warnings, logs };
  }, [consoleLogs]);

  const fpsColor =
    currentFps === null
      ? "var(--color-text-muted)"
      : currentFps >= 30
        ? "var(--color-success)"
        : currentFps >= 15
          ? "var(--color-warning)"
          : "var(--color-danger)";

  if (!currentCode) {
    return (
      <div className="flex h-full flex-col bg-[var(--color-bg)]">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border border-dashed border-[var(--color-border-light)] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2" opacity="0.6">
              <circle cx="10" cy="10" r="8" />
              <line x1="10" y1="6" x2="10" y2="10" />
              <line x1="10" y1="10" x2="13" y2="12" />
            </svg>
          </div>
          <div className="text-center space-y-1">
            <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.12em] font-semibold">
              No Selection
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
              Generate a game to inspect
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      {/* Quick Actions Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--color-border)]">
        <button
          onClick={triggerSandboxReload}
          disabled={!currentCode}
          title="Restart game"
          className="gf-btn-chip p-1.5 border border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-text-muted)] disabled:opacity-30 disabled:pointer-events-none"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M13.5 8a5.5 5.5 0 1 1-1.12-3.34" />
            <path d="M10.5 2.5h3v3" />
          </svg>
        </button>

        <button
          onClick={triggerScreenshot}
          disabled={!currentCode}
          title="Screenshot"
          className="gf-btn-chip p-1.5 border border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-text-muted)] disabled:opacity-30 disabled:pointer-events-none"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1.5" y="3.5" width="13" height="10" rx="1" />
            <circle cx="8" cy="8.5" r="2.5" />
            <path d="M5 3.5L6 1.5h4l1 2" />
          </svg>
        </button>

        <button
          onClick={togglePause}
          disabled={!currentCode}
          title={isPaused ? "Resume" : "Pause"}
          className={`gf-btn-chip p-1.5 border bg-[var(--color-surface)] text-[var(--color-text-muted)] disabled:opacity-30 disabled:pointer-events-none ${
            isPaused
              ? "border-[var(--color-accent)] bg-[var(--color-accent-glow)] text-[var(--color-accent)]"
              : "border-[var(--color-border-light)]"
          }`}
        >
          {isPaused ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" stroke="none">
              <polygon points="4,2 14,8 4,14" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" stroke="none">
              <rect x="3" y="2" width="3.5" height="12" rx="0.5" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="0.5" />
            </svg>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section title="Game">
          <InfoRow label="Status" value={isPaused ? "Paused" : "Running"} accent={!isPaused} />
          <InfoRow label="Size" value={`${currentCode.length} chars`} />
          <InfoRow label="Type" value={getEngineLabel(currentEngine)} />
          <div className="flex items-center justify-between py-1">
            <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">
              FPS
            </span>
            <span className="flex items-center">
              <span
                className="text-[10px] tracking-wider font-bold"
                style={{ color: fpsColor }}
              >
                {currentFps !== null ? currentFps : "—"}
              </span>
              <FpsSparkline history={fpsHistory} />
            </span>
          </div>
        </Section>

        <Section title="Console">
          {consoleCounts.errors === 0 && consoleCounts.warnings === 0 && consoleCounts.logs === 0 ? (
            <p className="text-[10px] text-[var(--color-text-muted)] opacity-60 py-1">No logs</p>
          ) : (
            <div className="flex items-center gap-1.5 py-1">
              <ConsoleBadge
                count={consoleCounts.errors}
                color="var(--color-danger)"
                label="errors"
                onClick={focusConsolePanel}
              />
              <ConsoleBadge
                count={consoleCounts.warnings}
                color="var(--color-warning)"
                label="warnings"
                onClick={focusConsolePanel}
              />
              <ConsoleBadge
                count={consoleCounts.logs}
                color="var(--color-text-muted)"
                label="logs"
                onClick={focusConsolePanel}
              />
            </div>
          )}
        </Section>

        <Section title="Assets">
          <InfoRow
            label="Files"
            value={String(projectFiles.filter((f) => f.path.startsWith("assets/") || f.kind === "asset").length)}
          />
          <InfoRow label="Generated" value={String(assets.length)} />
        </Section>

        <Section title="Controls">
          {controls.length > 0 ? (
            controls.map((control) => (
              <InfoRow key={`${control.action}:${control.keys}`} label={control.action} value={control.keys} />
            ))
          ) : (
            <InfoRow label="Controls" value="Not provided" />
          )}
        </Section>
      </div>
    </div>
  );
}
