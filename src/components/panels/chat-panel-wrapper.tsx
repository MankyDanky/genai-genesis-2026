"use client";

import { useGameForge } from "@/lib/game-forge-context";
import { ChatPanel } from "@/components/chat-panel";

export function ChatPanelWrapper() {
  const {
    currentCode,
    currentEngine,
    projectFiles,
    pendingFileWrites,
    planningTodos,
    consoleLogs,
    generatedImages,
    onCodeUpdate,
    onProjectFilesUpdate,
    patchProjectFiles,
    patchProjectFileContent,
    editProjectFile,
    deleteProjectFile,
    writePlanningTodos,
    onEngineUpdate,
    addImage,
    addAudioTrack,
    setControls,
    focusCodeFile,
    focusConsolePanel,
    setPendingFileWrites,
    clearPendingFileWrites,
  } = useGameForge();
  return (
    <ChatPanel
      currentCode={currentCode}
      currentEngine={currentEngine}
      projectFiles={projectFiles}
      pendingFileWrites={pendingFileWrites}
      planningTodos={planningTodos}
      consoleLogs={consoleLogs}
      generatedImages={generatedImages}
      onCodeUpdate={onCodeUpdate}
      onProjectFilesUpdate={onProjectFilesUpdate}
      patchProjectFiles={patchProjectFiles}
      patchProjectFileContent={patchProjectFileContent}
      editProjectFile={editProjectFile}
      deleteProjectFile={deleteProjectFile}
      writePlanningTodos={writePlanningTodos}
      onEngineUpdate={onEngineUpdate}
      addImage={addImage}
      addAudioTrack={addAudioTrack}
      setControls={setControls}
      focusCodeFile={focusCodeFile}
      focusConsolePanel={focusConsolePanel}
      setPendingFileWrites={setPendingFileWrites}
      clearPendingFileWrites={clearPendingFileWrites}
    />
  );
}
