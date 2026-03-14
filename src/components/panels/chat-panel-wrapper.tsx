"use client";

import { useGameForge } from "@/lib/game-forge-context";
import { ChatPanel } from "@/components/chat-panel";

export function ChatPanelWrapper() {
  const {
    currentCode,
    currentEngine,
    projectFiles,
    planningTodos,
    onCodeUpdate,
    onProjectFilesUpdate,
    patchProjectFiles,
    patchProjectFileContent,
    editProjectFile,
    deleteProjectFile,
    writePlanningTodos,
    onEngineUpdate,
  } = useGameForge();
  return (
    <ChatPanel
      currentCode={currentCode}
      currentEngine={currentEngine}
      projectFiles={projectFiles}
      planningTodos={planningTodos}
      onCodeUpdate={onCodeUpdate}
      onProjectFilesUpdate={onProjectFilesUpdate}
      patchProjectFiles={patchProjectFiles}
      patchProjectFileContent={patchProjectFileContent}
      editProjectFile={editProjectFile}
      deleteProjectFile={deleteProjectFile}
      writePlanningTodos={writePlanningTodos}
      onEngineUpdate={onEngineUpdate}
    />
  );
}
