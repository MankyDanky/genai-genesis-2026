"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface GameForgeContextValue {
  currentCode: string | null;
  onCodeUpdate: (code: string) => void;
}

const GameForgeContext = createContext<GameForgeContextValue | null>(null);

export function GameForgeProvider({ children }: { children: ReactNode }) {
  const [currentCode, setCurrentCode] = useState<string | null>(null);

  const onCodeUpdate = useCallback((code: string) => {
    setCurrentCode(code);
  }, []);

  return (
    <GameForgeContext
      value={{
        currentCode,
        onCodeUpdate,
      }}
    >
      {children}
    </GameForgeContext>
  );
}

export function useGameForge(): GameForgeContextValue {
  const ctx = useContext(GameForgeContext);
  if (!ctx) {
    throw new Error("useGameForge must be used within a GameForgeProvider");
  }
  return ctx;
}
