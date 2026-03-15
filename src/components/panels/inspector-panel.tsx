"use client";

import { useState } from "react";
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
  } = useGameForge();
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      <div className="flex-1 overflow-y-auto">
        <Section title="Game">
          <InfoRow label="Status" value={currentCode ? "Running" : "Idle"} accent={!!currentCode} />
          <InfoRow label="Size" value={currentCode ? `${currentCode.length} chars` : "0 chars"} />
          <InfoRow label="Type" value={getEngineLabel(currentEngine)} />
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
