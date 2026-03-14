"use client";

import {
  DockviewReact,
  type DockviewReadyEvent,
  type DockviewApi,
} from "dockview";
import { useCallback, useMemo, useRef, useState } from "react";
import { gameForgeTheme } from "@/lib/dock-theme";
import { useGameForge } from "@/lib/game-forge-context";
import { getEngineLabel } from "@/lib/game-engine";
import { SandboxPanel } from "@/components/panels/sandbox-panel";
import { ChatPanelWrapper } from "@/components/panels/chat-panel-wrapper";
import { CodePanel } from "@/components/panels/code-panel";
import { ConsolePanel } from "@/components/panels/console-panel";
import { InspectorPanel } from "@/components/panels/inspector-panel";
import { ImagesPanelWrapper } from "@/components/panels/images-panel-wrapper";
import { Toolbar } from "@/components/toolbar";

import "dockview/dist/styles/dockview.css";

const components = {
  sandbox: SandboxPanel,
  composer: ChatPanelWrapper,
  code: CodePanel,
  console: ConsolePanel,
  inspector: InspectorPanel,
  images: ImagesPanelWrapper,
};

interface PanelDef {
  id: string;
  component: string;
  title: string;
}

const ALL_PANELS: PanelDef[] = [
  { id: "sandbox", component: "sandbox", title: "Game View" },
  { id: "composer", component: "composer", title: "Composer" },
  { id: "inspector", component: "inspector", title: "Inspector" },
  { id: "code", component: "code", title: "Code" },
  { id: "console", component: "console", title: "Console" },
  { id: "images", component: "images", title: "Images" },
];

function buildDefaultLayout(api: DockviewApi) {
  const w = window.innerWidth;
  const h = window.innerHeight;

  api.addPanel({
    id: "sandbox",
    component: "sandbox",
    title: "Game View",
  });

  api.addPanel({
    id: "composer",
    component: "composer",
    title: "Composer",
    position: { referencePanel: "sandbox", direction: "left" },
    initialWidth: w * 0.22,
  });

  api.addPanel({
    id: "inspector",
    component: "inspector",
    title: "Inspector",
    position: { referencePanel: "sandbox", direction: "right" },
    initialWidth: w * 0.18,
  });

  api.addPanel({
    id: "code",
    component: "code",
    title: "Code",
    position: { referencePanel: "sandbox", direction: "below" },
    initialHeight: h * 0.28,
  });

  api.addPanel({
    id: "console",
    component: "console",
    title: "Console",
    position: { referencePanel: "code", direction: "within" },
  });

  api.addPanel({
    id: "images",
    component: "images",
    title: "Images",
    position: { referencePanel: "inspector", direction: "below" },
    initialHeight: h * 0.35,
  });
}

export function DockLayout() {
  const apiRef = useRef<DockviewApi | null>(null);
  const { currentEngine } = useGameForge();
  const [openPanels, setOpenPanels] = useState<Set<string>>(
    () => new Set(ALL_PANELS.map((p) => p.id))
  );

  const syncOpenPanels = useCallback((api: DockviewApi) => {
    setOpenPanels(new Set(api.panels.map((p) => p.id)));
  }, []);

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      if (event.api.panels.length > 0) return;

      apiRef.current = event.api;
      buildDefaultLayout(event.api);
      syncOpenPanels(event.api);

      event.api.onDidRemovePanel(() => syncOpenPanels(event.api));
      event.api.onDidAddPanel(() => syncOpenPanels(event.api));
    },
    [syncOpenPanels]
  );

  const handleTogglePanel = useCallback((id: string) => {
    const api = apiRef.current;
    if (!api) return;

    const existing = api.panels.find((p) => p.id === id);
    if (existing) {
      api.removePanel(existing);
    } else {
      const def = ALL_PANELS.find((p) => p.id === id);
      if (!def) return;

      const scenePanel = api.panels.find((p) => p.id === "sandbox");
      const firstPanel = api.panels[0];
      const ref = scenePanel ?? firstPanel;

      if (ref) {
        api.addPanel({
          id: def.id,
          component: def.component,
          title: def.title,
          position: { referencePanel: ref.id, direction: "within" },
        });
      } else {
        api.addPanel({
          id: def.id,
          component: def.component,
          title: def.title,
        });
      }
    }
  }, []);

  const handleResetLayout = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;

    const toRemove = [...api.panels];
    for (const panel of toRemove) {
      api.removePanel(panel);
    }

    buildDefaultLayout(api);
  }, []);

  const theme = useMemo(() => gameForgeTheme, []);

  const panelInfos = ALL_PANELS.map((p) => ({
    id: p.id,
    title: p.title,
    isOpen: openPanels.has(p.id),
  }));

  return (
    <div className="h-screen w-screen flex flex-col">
      <Toolbar
        panels={panelInfos}
        onTogglePanel={handleTogglePanel}
        onResetLayout={handleResetLayout}
        engineLabel={getEngineLabel(currentEngine)}
      />
      <div className="flex-1 min-h-0">
        <DockviewReact
          components={components}
          onReady={onReady}
          theme={theme}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
