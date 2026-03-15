"use client";

import { useState, useRef, useEffect } from "react";
import { useGameForge } from "@/lib/game-forge-context";
import { getEngineLabel } from "@/lib/game-engine";

const FPS_HISTORY_MAX = 60; // 30 seconds at 500ms intervals

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

function fpsColor(fps: number): string {
  return fps > 50 ? "var(--color-success)" : fps > 25 ? "var(--color-warning)" : "var(--color-danger)";
}

function FpsValue({ fps }: { fps: number }) {
  return (
    <span className="text-[10px] tracking-wider font-medium" style={{ color: fpsColor(fps) }}>
      {fps}
    </span>
  );
}

function FpsChart({ history }: { history: number[] }) {
  if (history.length < 2) return null;

  const w = 200;
  const h = 40;
  const max = Math.max(70, ...history);
  const step = w / (FPS_HISTORY_MAX - 1);

  // Build polyline points
  const points = history.map((fps, i) => {
    const x = (history.length - 1 - i) * step;
    const y = h - (fps / max) * h;
    return `${w - x},${y}`;
  }).join(" ");

  // Build gradient stops from the data
  const gradientStops = history.map((fps, i) => {
    const offset = (i / (history.length - 1)) * 100;
    return `${fpsColor(fps)} ${offset}%`;
  });

  const gradientId = "fps-grad";

  return (
    <div className="py-1">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        style={{ height: 40 }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" x2="100%">
            {history.map((fps, i) => (
              <stop
                key={i}
                offset={`${(i / (history.length - 1)) * 100}%`}
                stopColor={fpsColor(fps)}
              />
            ))}
          </linearGradient>
          <linearGradient id={`${gradientId}-fill`} x1="0%" x2="100%">
            {history.map((fps, i) => (
              <stop
                key={i}
                offset={`${(i / (history.length - 1)) * 100}%`}
                stopColor={fpsColor(fps)}
                stopOpacity="0.15"
              />
            ))}
          </linearGradient>
        </defs>
        {/* 60 FPS reference line */}
        <line
          x1="0" y1={h - (60 / max) * h}
          x2={w} y2={h - (60 / max) * h}
          stroke="var(--color-border)"
          strokeWidth="0.5"
          strokeDasharray="3,3"
        />
        {/* Filled area */}
        <polygon
          points={`${points} ${w},${h} ${w - (history.length - 1) * step},${h}`}
          fill={`url(#${gradientId}-fill)`}
        />
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex items-center justify-between">
        <span className="text-[8px] text-[var(--color-text-muted)] opacity-60">30s ago</span>
        <span className="text-[8px] text-[var(--color-text-muted)] opacity-60">now</span>
      </div>
    </div>
  );
}

export function InspectorPanel() {
  const {
    currentCode,
    currentEngine,
    projectFiles,
    assets,
    controls,
    runtimeEnv,
    setRuntimeEnvVar,
    removeRuntimeEnvVar,
    consoleLogs,
    inspectorMetrics,
    canvasInfo,
    activeInputs,
    gamePaused,
    setGamePaused,
    requestGameRestart,
  } = useGameForge();
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [fpsHistory, setFpsHistory] = useState<number[]>([]);
  const prevFpsRef = useRef(inspectorMetrics.fps);

  // Accumulate FPS readings into history (metrics arrive every ~500ms)
  useEffect(() => {
    const fps = inspectorMetrics.fps;
    if (fps === prevFpsRef.current && fpsHistory.length > 0) return;
    prevFpsRef.current = fps;
    setFpsHistory((prev) => {
      const next = [...prev, fps];
      return next.length > FPS_HISTORY_MAX ? next.slice(next.length - FPS_HISTORY_MAX) : next;
    });
  }, [inspectorMetrics.fps, fpsHistory.length]);

  // Reset history when game code changes
  const codeRef = useRef(currentCode);
  useEffect(() => {
    if (currentCode !== codeRef.current) {
      codeRef.current = currentCode;
      setFpsHistory([]);
    }
  }, [currentCode]);

  const errorCount = consoleLogs.filter((l) => l.level === "error").length;

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      <div className="flex-1 overflow-y-auto">
        <Section title="Game">
          <div className="flex items-center justify-between py-1">
            <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">
              Status
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`text-[10px] tracking-wider font-medium ${
                currentCode ? "text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]"
              }`}>
                {currentCode ? (gamePaused ? "Paused" : "Running") : "Idle"}
              </span>
              {errorCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold bg-[var(--color-danger)] text-white rounded-sm">
                  {errorCount}
                </span>
              )}
            </span>
          </div>
          <InfoRow label="Size" value={currentCode ? `${currentCode.length} chars` : "0 chars"} />
          <InfoRow label="Type" value={getEngineLabel(currentEngine)} />
          {currentCode && (
            <div className="flex items-center gap-1.5 pt-2">
              <button
                type="button"
                onClick={() => setGamePaused(!gamePaused)}
                className="flex-1 h-7 border border-[var(--color-border-light)] text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]"
              >
                {gamePaused ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                onClick={requestGameRestart}
                className="flex-1 h-7 border border-[var(--color-border-light)] text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]"
              >
                Restart
              </button>
            </div>
          )}
        </Section>

        <Section title="Performance">
          <div className="flex items-center justify-between py-1">
            <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">
              FPS
            </span>
            <FpsValue fps={inspectorMetrics.fps} />
          </div>
          <FpsChart history={fpsHistory} />
          <InfoRow label="Frame Time" value={`${inspectorMetrics.frameTime} ms`} />
          <InfoRow label="Min / Max" value={`${inspectorMetrics.fpsMin} / ${inspectorMetrics.fpsMax}`} />
        </Section>

        <Section title="Canvas">
          <InfoRow
            label="Dimensions"
            value={canvasInfo.width > 0 ? `${canvasInfo.width} x ${canvasInfo.height}` : "N/A"}
          />
          <InfoRow label="Context" value={canvasInfo.contextType} />
          <InfoRow label="Pixel Ratio" value={String(canvasInfo.pixelRatio)} />
        </Section>

        <Section title="Input Monitor">
          {activeInputs.length > 0 ? (
            <div className="flex flex-wrap gap-1 py-1">
              {activeInputs.map((key) => (
                <span
                  key={key}
                  className="inline-block px-1.5 py-0.5 text-[9px] font-mono tracking-wider border bg-[var(--color-accent)] text-[var(--color-bg)] border-[var(--color-accent)]"
                >
                  {key}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-[var(--color-text-muted)] py-1">No input</p>
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

        <Section title="Environment">
          <div className="space-y-2">
            {Object.entries(runtimeEnv).length === 0 ? (
              <InfoRow label="Runtime" value="No variables" />
            ) : (
              Object.entries(runtimeEnv).map(([key, value]) => (
                <div key={key} className="border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                  <div className="mb-1 text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.1em]">
                    {key}
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5">
                    <input
                      value={value}
                      onChange={(event) => setRuntimeEnvVar(key, event.target.value)}
                      className="h-7 min-w-0 w-full bg-[var(--color-bg)] border border-[var(--color-border)] px-2 text-[11px] text-[var(--color-text-secondary)]"
                    />
                    <button
                      type="button"
                      onClick={() => removeRuntimeEnvVar(key)}
                      className="h-7 px-2 border border-[var(--color-border)] text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                    >
                      Del
                    </button>
                  </div>
                </div>
              ))
            )}
            <div className="border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
              <div className="mb-1 text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.1em]">Add Variable</div>
              <div className="grid grid-cols-1 gap-1.5">
                <input
                  placeholder="__ENV_KEY__"
                  value={newKey}
                  onChange={(event) => setNewKey(event.target.value)}
                  className="h-7 min-w-0 bg-[var(--color-bg)] border border-[var(--color-border)] px-2 text-[11px] text-[var(--color-text-secondary)]"
                />
                <input
                  placeholder="value"
                  value={newValue}
                  onChange={(event) => setNewValue(event.target.value)}
                  className="h-7 min-w-0 bg-[var(--color-bg)] border border-[var(--color-border)] px-2 text-[11px] text-[var(--color-text-secondary)]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const key = newKey.trim();
                    if (!key) return;
                    setRuntimeEnvVar(key, newValue);
                    setNewKey("");
                    setNewValue("");
                  }}
                  className="h-7 px-2 border border-[var(--color-border-light)] text-[10px] uppercase tracking-[0.08em] text-[var(--color-accent)]"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
