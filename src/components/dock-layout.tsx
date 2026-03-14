"use client";

import {
  DockviewReact,
  type DockviewReadyEvent,
  type DockviewApi,
} from "dockview";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gameForgeTheme } from "@/lib/dock-theme";
import { useGameForge } from "@/lib/game-forge-context";
import { getEngineLabel } from "@/lib/game-engine";
import { SandboxPanel } from "@/components/panels/sandbox-panel";
import { ChatPanelWrapper } from "@/components/panels/chat-panel-wrapper";
import { CodePanel } from "@/components/panels/code-panel";
import { ConsolePanel } from "@/components/panels/console-panel";
import { InspectorPanel } from "@/components/panels/inspector-panel";
import { ImagesPanelWrapper } from "@/components/panels/images-panel-wrapper";
import { AudioPanelWrapper } from "@/components/panels/audio-panel-wrapper";
import { Toolbar } from "@/components/toolbar";
import { ShareModal } from "@/components/share-modal";
import { OpenProjectModal } from "@/components/open-project-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { useToast } from "@/components/toast";

import "dockview/dist/styles/dockview.css";

const components = {
  sandbox: SandboxPanel,
  composer: ChatPanelWrapper,
  code: CodePanel,
  console: ConsolePanel,
  inspector: InspectorPanel,
  images: ImagesPanelWrapper,
  audio: AudioPanelWrapper,
};

interface PanelDef {
  id: string;
  component: string;
  title: string;
}

const ALL_PANELS: PanelDef[] = [
  { id: "sandbox", component: "sandbox", title: "Game View" },
  { id: "audio", component: "audio", title: "Audio" },
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
    position: { referencePanel: "sandbox", direction: "within" },
  });

  api.addPanel({
    id: "images",
    component: "images",
    title: "Images",
    position: { referencePanel: "inspector", direction: "below" },
    initialHeight: h * 0.35,
  });

  api.addPanel({
    id: "audio",
    component: "audio",
    title: "Audio",
    inactive: true,
    position: { referencePanel: "images", direction: "within" },
  });

  const apiAny = api as unknown as {
    getPanel?: (id: string) => { api?: { setActive?: () => void } } | undefined;
    panels?: Array<{ id?: string; api?: { setActive?: () => void } }>;
  };
  const sandboxPanel =
    apiAny.getPanel?.("sandbox") ??
    apiAny.panels?.find((panel) => panel.id === "sandbox");
  sandboxPanel?.api?.setActive?.();
}

export function DockLayout() {
  const apiRef = useRef<DockviewApi | null>(null);
  const lastFocusRequestIdRef = useRef<number>(0);
  const {
    currentEngine,
    currentCode,
    panelFocusRequest,
    projectId,
    currentRevisionNumber,
    lastPublishedPlayPath,
    projectBusyAction,
    saveProjectRevision,
    publishProject,
    loadProject,
    resetWorkspace,
    clearProjectFeedback,
  } = useGameForge();
  const { showToast } = useToast();
  const [openPanels, setOpenPanels] = useState<Set<string>>(
    () => new Set(ALL_PANELS.map((p) => p.id))
  );
  const [showShareModal, setShowShareModal] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

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

  useEffect(() => {
    const api = apiRef.current;
    if (!api || !panelFocusRequest) return;
    if (panelFocusRequest.id === lastFocusRequestIdRef.current) return;
    lastFocusRequestIdRef.current = panelFocusRequest.id;

    const targetId = panelFocusRequest.panel;
    let panel = api.panels.find((p) => p.id === targetId);
    if (!panel) {
      const def = ALL_PANELS.find((p) => p.id === targetId);
      const refPanel = api.panels.find((p) => p.id === "sandbox") ?? api.panels[0];
      if (def) {
        panel = api.addPanel({
          id: def.id,
          component: def.component,
          title: def.title,
          position: refPanel ? { referencePanel: refPanel.id, direction: "within" } : undefined,
        });
      }
    }
    const panelApi = panel as unknown as { api?: { setActive?: () => void } };
    panelApi.api?.setActive?.();
  }, [panelFocusRequest]);

  // Load project from ?project= URL param (e.g. after forking)
  useEffect(() => {
    const url = new URL(window.location.href);
    const projectParam = url.searchParams.get("project");
    if (!projectParam) return;

    // Clean URL immediately
    window.history.replaceState({}, "", "/");

    void loadProject(projectParam)
      .then(() => showToast("Project loaded", "success"))
      .catch((err) => {
        showToast(err instanceof Error ? err.message : "Failed to load project", "error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panelInfos = ALL_PANELS.map((p) => ({
    id: p.id,
    title: p.title,
    isOpen: openPanels.has(p.id),
  }));

  const handleSaveProject = useCallback(() => {
    void saveProjectRevision()
      .then((result) => {
        showToast(
          `Saved ${result.projectId.slice(0, 8)}... as revision ${result.revisionNumber}`,
          "success"
        );
      })
      .catch((err) => {
        showToast(err instanceof Error ? err.message : "Save failed", "error");
      });
  }, [saveProjectRevision, showToast]);

  const handlePublishProject = useCallback(() => {
    void publishProject()
      .then(() => {
        showToast("Published successfully", "success");
        setShowShareModal(true);
      })
      .catch((err) => {
        showToast(err instanceof Error ? err.message : "Publish failed", "error");
      });
  }, [publishProject, showToast]);

  const handleOpenProject = useCallback(() => {
    setShowOpenModal(true);
  }, []);

  const handleLoadProject = useCallback(
    async (id: string) => {
      await loadProject(id);
      showToast("Project loaded", "success");
    },
    [loadProject, showToast]
  );

  const handleResetProject = useCallback(() => {
    if (!projectId && !currentCode) {
      clearProjectFeedback();
      resetWorkspace();
      return;
    }
    setShowConfirmReset(true);
  }, [projectId, currentCode, clearProjectFeedback, resetWorkspace]);

  const handleConfirmReset = useCallback(() => {
    setShowConfirmReset(false);
    clearProjectFeedback();
    resetWorkspace();
    showToast("Workspace reset", "success");
  }, [clearProjectFeedback, resetWorkspace, showToast]);

  return (
    <div className="h-screen w-screen flex flex-col">
      <Toolbar
        panels={panelInfos}
        onTogglePanel={handleTogglePanel}
        onResetLayout={handleResetLayout}
        onSaveProject={handleSaveProject}
        onPublishProject={handlePublishProject}
        onOpenProject={handleOpenProject}
        onResetProject={handleResetProject}
        onShareClick={() => setShowShareModal(true)}
        onPlayPathClick={() => setShowShareModal(true)}
        engineLabel={getEngineLabel(currentEngine)}
        projectId={projectId}
        revisionNumber={currentRevisionNumber}
        busyAction={projectBusyAction}
        playPath={lastPublishedPlayPath}
      />
      <div className="flex-1 min-h-0">
        <DockviewReact
          components={components}
          onReady={onReady}
          theme={theme}
          className="h-full w-full"
        />
      </div>
      {showShareModal && lastPublishedPlayPath ? (
        <ShareModal
          url={`${typeof window !== "undefined" ? window.location.origin : ""}${lastPublishedPlayPath}`}
          onClose={() => setShowShareModal(false)}
        />
      ) : null}
      {showOpenModal ? (
        <OpenProjectModal
          onLoad={handleLoadProject}
          onClose={() => setShowOpenModal(false)}
        />
      ) : null}
      {showConfirmReset ? (
        <ConfirmModal
          title="New Project"
          message="You have unsaved work. Starting a new project will discard all current changes."
          confirmLabel="Discard & Reset"
          variant="danger"
          onConfirm={handleConfirmReset}
          onCancel={() => setShowConfirmReset(false)}
        />
      ) : null}
    </div>
  );
}
