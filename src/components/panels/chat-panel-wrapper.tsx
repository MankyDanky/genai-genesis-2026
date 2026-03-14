"use client";

import { useGameForge } from "@/lib/game-forge-context";
import { ChatPanel } from "@/components/chat-panel";

export function ChatPanelWrapper() {
  const { currentCode, onCodeUpdate } = useGameForge();
  return <ChatPanel currentCode={currentCode} onCodeUpdate={onCodeUpdate} />;
}
