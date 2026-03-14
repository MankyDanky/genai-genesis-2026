"use client";

import { useState } from "react";
import { useGameForge } from "@/lib/game-forge-context";

const ASSET_TYPES = ["sprite", "background", "ui", "mesh"] as const;

export function AssetsPanel() {
  const { assets, removeAsset } = useGameForge();
  const [description, setDescription] = useState("");
  const [assetType, setAssetType] = useState<(typeof ASSET_TYPES)[number]>("sprite");

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      {/* Generate section */}
      <div className="p-3 space-y-2.5 border-b border-[var(--color-border)]">
        <div className="gf-section-header px-3 py-1.5">
          <p className="text-[11px] text-[var(--color-text-secondary)] uppercase tracking-[0.12em] font-bold">
            Generate Asset
          </p>
        </div>
        <div className="flex gap-1.5">
          {ASSET_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setAssetType(type)}
              className={`gf-btn-chip text-[10px] px-2.5 py-1 uppercase tracking-wider font-semibold border ${
                assetType === type
                  ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-glow)]"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)]"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the asset..."
          className="gf-input w-full bg-[var(--color-surface)] text-[var(--color-text)] text-[12px] px-3 py-2 border border-[var(--color-border)] outline-none placeholder:text-[var(--color-text-muted)]"
        />
        <button
          type="button"
          disabled={!description.trim()}
          className="gf-btn-primary w-full bg-[var(--color-accent)] text-[var(--color-bg)] py-2 text-[11px] font-bold tracking-[0.12em] uppercase disabled:opacity-30"
        >
          Generate {assetType}
        </button>
      </div>

      {/* Asset grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {assets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            {/* Icon */}
            <div className="w-12 h-12 border border-dashed border-[var(--color-border-light)] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2" opacity="0.6">
                <rect x="2" y="2" width="16" height="16" rx="1" />
                <circle cx="7" cy="7" r="2" />
                <polyline points="2,14 6,10 10,14 14,8 18,12" />
              </svg>
            </div>
            <div className="text-center space-y-1">
              <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.12em] font-semibold">
                No assets yet
              </p>
              <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
                Generate sprites, backgrounds, and UI elements
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="group border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)] transition-all duration-150 hover:shadow-[0_0_12px_var(--color-accent-glow)]"
              >
                <div className="aspect-square bg-[var(--color-surface-light)] flex items-center justify-center relative">
                  {asset.dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.dataUrl} alt={asset.name} className="w-full h-full object-contain" />
                  ) : asset.type === "mesh" ? (
                    <div className="text-center px-2">
                      <p className="text-[10px] text-[var(--color-accent)] uppercase font-semibold">3D Mesh</p>
                      {asset.format ? (
                        <p className="text-[9px] text-[var(--color-text-muted)] uppercase">{asset.format}</p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-[10px] text-[var(--color-text-muted)] uppercase">Pending</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAsset(asset.id)}
                    className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-surface-elevated)] opacity-0 group-hover:opacity-100 transition-all duration-150"
                  >
                    &times;
                  </button>
                </div>
                <div className="px-2 py-1.5 border-t border-[var(--color-border)]">
                  <p className="text-[10px] text-[var(--color-text)] uppercase tracking-wider truncate font-medium">
                    {asset.name}
                  </p>
                  <p className="text-[9px] text-[var(--color-text-muted)] uppercase">
                    {asset.type}
                  </p>
                  {asset.sourceUrl ? (
                    <a
                      href={asset.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[9px] text-[var(--color-accent)] uppercase tracking-wider"
                    >
                      Open
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex items-center justify-between shrink-0">
        <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">
          Assets
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)] tracking-wider">
          {assets.length} items
        </span>
      </div>
    </div>
  );
}
