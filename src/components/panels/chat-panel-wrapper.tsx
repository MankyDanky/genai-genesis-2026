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
    audioTracks,
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
    focusImagesPanel,
    focusAudioPanel,
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
      audioTracks={audioTracks}
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
      focusImagesPanel={focusImagesPanel}
      focusAudioPanel={focusAudioPanel}
      setPendingFileWrites={setPendingFileWrites}
      clearPendingFileWrites={clearPendingFileWrites}
    />
  );
}
