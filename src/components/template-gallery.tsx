"use client";

import { useState } from "react";
import {
  GAME_TEMPLATES,
  TEMPLATE_CATEGORIES,
  type GameTemplate,
  type TemplateCategory,
} from "@/lib/game-templates";

interface TemplateGalleryProps {
  onSelect: (template: GameTemplate) => void;
}

export function TemplateGallery({ onSelect }: TemplateGalleryProps) {
  const [activeTab, setActiveTab] = useState<TemplateCategory>(TEMPLATE_CATEGORIES[0].id);

  const filtered = GAME_TEMPLATES.filter((t) => t.category === activeTab);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-4 pb-3 text-center shrink-0">
        <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.12em] font-semibold">
          What Do You Want To Build?
        </p>
      </div>

      {/* Tab bar */}
      <div className="gf-hide-scrollbar shrink-0 border-b border-[var(--color-border)] flex gap-1 px-2 overflow-x-auto">
        {TEMPLATE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveTab(cat.id)}
            className={`shrink-0 px-3 py-2 text-[9px] uppercase tracking-[0.1em] font-bold transition-colors duration-150 relative ${
              activeTab === cat.id
                ? "text-[var(--color-accent)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            {cat.label}
            {activeTab === cat.id && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--color-accent)]" />
            )}
          </button>
        ))}
      </div>

      {/* 2-col card grid */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
        <div className="grid grid-cols-2 gap-1.5">
          {filtered.map((template, i) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template)}
              className="gf-template-card group text-left border border-[var(--color-border-light)] bg-[var(--color-surface)] rounded-sm p-2.5 flex flex-col justify-between min-h-[72px]"
              style={{
                animation: `cardFadeIn 200ms ease-out ${i * 50}ms both`,
              }}
            >
              <div>
                <span className="text-[10px] text-[var(--color-text-secondary)] font-bold uppercase tracking-wider leading-tight group-hover:text-[var(--color-accent)] transition-colors duration-150 block">
                  {template.name}
                </span>
                <p className="text-[9px] text-[var(--color-text-muted)] mt-1 leading-snug line-clamp-2">
                  {template.description}
                </p>
              </div>
              {template.engine === "threejs" && (
                <span className="self-start mt-1.5 text-[7px] font-bold uppercase tracking-wider px-1 py-0.5 rounded-sm text-[var(--color-accent)] bg-[var(--color-accent-glow)] border border-[var(--color-accent)]">
                  Three.js
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-3 py-2 text-center border-t border-[var(--color-border)]">
        <p className="text-[9px] text-[var(--color-text-muted)] opacity-40 uppercase tracking-wider">
          Or describe your own game below
        </p>
      </div>
    </div>
  );
}
