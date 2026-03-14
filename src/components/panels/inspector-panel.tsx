"use client";

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
  const { currentCode, currentEngine, projectFiles, assets, controls } = useGameForge();

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
      <div className="flex-1 overflow-y-auto">
        <Section title="Game">
          <InfoRow label="Status" value="Running" accent />
          <InfoRow label="Size" value={`${currentCode.length} chars`} />
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
      </div>
    </div>
  );
}
