"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface GeneratedImage {
  url: string;
  prompt: string;
}

interface GameForgeContextValue {
  currentCode: string | null;
  onCodeUpdate: (code: string) => void;
  generatedImages: GeneratedImage[];
  addImage: (image: GeneratedImage) => void;
}

const GameForgeContext = createContext<GameForgeContextValue | null>(null);

export function GameForgeProvider({ children }: { children: ReactNode }) {
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);

  const onCodeUpdate = useCallback((code: string) => {
    setCurrentCode(code);
  }, []);

  const addImage = useCallback((image: GeneratedImage) => {
    setGeneratedImages((prev) => {
      if (prev.some((img) => img.url === image.url)) return prev;
      return [...prev, image];
    });
  }, []);

  return (
    <GameForgeContext
      value={{
        currentCode,
        onCodeUpdate,
        generatedImages,
        addImage,
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
