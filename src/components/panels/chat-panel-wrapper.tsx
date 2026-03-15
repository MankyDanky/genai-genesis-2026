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
    generatedMeshes,
    addMesh,
    removeMesh,
    runtimeEnv,
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
    chatMessages,
    chatSessionId,
    chatTabs,
    activeChatTabId,
    setChatMessages,
    createChatTab,
    deleteChatTab,
    switchChatTab,
    renameChatTab,
    focusCodeFile,
    focusConsolePanel,
    focusImagesPanel,
    focusAudioPanel,
    setPendingFileWrites,
    clearPendingFileWrites,
    updateRuntimeEnv,
    setStreamingCode,
    setIsGenerating,
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
      generatedMeshes={generatedMeshes}
      addMesh={addMesh}
      removeMesh={removeMesh}
      runtimeEnv={runtimeEnv}
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
      chatMessages={chatMessages}
      chatSessionId={chatSessionId}
      chatTabs={chatTabs}
      activeChatTabId={activeChatTabId}
      setChatMessages={setChatMessages}
      createChatTab={createChatTab}
      deleteChatTab={deleteChatTab}
      switchChatTab={switchChatTab}
      renameChatTab={renameChatTab}
      focusCodeFile={focusCodeFile}
      focusConsolePanel={focusConsolePanel}
      focusImagesPanel={focusImagesPanel}
      focusAudioPanel={focusAudioPanel}
      setPendingFileWrites={setPendingFileWrites}
      clearPendingFileWrites={clearPendingFileWrites}
      updateRuntimeEnv={updateRuntimeEnv}
      setStreamingCode={setStreamingCode}
      setIsGenerating={setIsGenerating}
    />
  );
}
