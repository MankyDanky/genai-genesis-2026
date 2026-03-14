"use client";

import { useGameForge } from "@/lib/game-forge-context";
import { ChatPanel } from "@/components/chat-panel";

export function ChatPanelWrapper() {
  const { currentCode, currentEngine, onCodeUpdate, onEngineUpdate } = useGameForge();
  return (
    <ChatPanel
      currentCode={currentCode}
      currentEngine={currentEngine}
      onCodeUpdate={onCodeUpdate}
      onEngineUpdate={onEngineUpdate}
    />
  );
}
