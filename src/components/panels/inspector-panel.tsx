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
  const { currentCode, currentEngine, assets, audioTracks } = useGameForge();

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
          <InfoRow
            label="Type"
            value={getEngineLabel(currentEngine)}
          />
        </Section>

        <Section title="Assets">
          {assets.length === 0 ? (
            <p className="text-[10px] text-[var(--color-text-muted)] opacity-60 py-1">
              No assets attached
            </p>
          ) : (
            <div className="space-y-1.5">
              {assets.map((asset) => (
                <div key={asset.id} className="gf-list-row flex items-center gap-2 px-1 py-1 -mx-1">
                  <div className="w-5 h-5 bg-[var(--color-surface-light)] border border-[var(--color-border)] shrink-0 flex items-center justify-center">
                    <div className="w-2 h-2 bg-[var(--color-accent)] opacity-30" />
                  </div>
                  <span className="text-[10px] text-[var(--color-text)] uppercase tracking-wider truncate font-medium">
                    {asset.name}
                  </span>
                  <span className="text-[9px] text-[var(--color-text-muted)] uppercase ml-auto shrink-0">
                    {asset.type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Audio">
          {audioTracks.length === 0 ? (
            <p className="text-[10px] text-[var(--color-text-muted)] opacity-60 py-1">
              No audio attached
            </p>
          ) : (
            <div className="space-y-1.5">
              {audioTracks.map((track) => (
                <div key={track.id} className="gf-list-row flex items-center gap-2 px-1 py-1 -mx-1">
                  <span className="text-[10px] text-[var(--color-text)] uppercase tracking-wider truncate font-medium">
                    {track.name}
                  </span>
                  <span
                    className={`text-[9px] uppercase ml-auto shrink-0 font-semibold ${
                      track.type === "music"
                        ? "text-[var(--color-accent)]"
                        : "text-[var(--color-success)]"
                    }`}
                  >
                    {track.type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Controls">
          <InfoRow label="Move" value="Arrow Keys / WASD" />
          <InfoRow label="Action" value="Space" />
          <InfoRow label="Pause" value="P / Esc" />
        </Section>
      </div>
    </div>
  );
}
