"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { GameEngine } from "@/lib/game-engine";

export interface Asset {
  id: string;
  name: string;
  type: "sprite" | "background" | "ui" | "mesh";
  description: string;
  dataUrl: string | null;
  sourceUrl?: string | null;
  format?: string | null;
  createdAt: number;
}

export interface AudioTrack {
  id: string;
  name: string;
  type: "music" | "sfx";
  description: string;
  dataUrl: string | null;
  duration: number | null;
  createdAt: number;
}

interface GameForgeContextValue {
  currentCode: string | null;
  currentEngine: GameEngine;
  onCodeUpdate: (code: string, engine?: GameEngine) => void;
  onEngineUpdate: (engine: GameEngine) => void;
  assets: Asset[];
  addAsset: (asset: Asset) => void;
  removeAsset: (id: string) => void;
  audioTracks: AudioTrack[];
  addAudioTrack: (track: AudioTrack) => void;
  removeAudioTrack: (id: string) => void;
}

const GameForgeContext = createContext<GameForgeContextValue | null>(null);

export function GameForgeProvider({ children }: { children: ReactNode }) {
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [currentEngine, setCurrentEngine] = useState<GameEngine>("canvas2d");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);

  const onCodeUpdate = useCallback((code: string, engine?: GameEngine) => {
    setCurrentCode(code);
    if (engine) {
      setCurrentEngine(engine);
    }
  }, []);

  const onEngineUpdate = useCallback((engine: GameEngine) => {
    setCurrentEngine(engine);
  }, []);

  const addAsset = useCallback((asset: Asset) => {
    setAssets((prev) => [...prev, asset]);
  }, []);

  const removeAsset = useCallback((id: string) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const addAudioTrack = useCallback((track: AudioTrack) => {
    setAudioTracks((prev) => [...prev, track]);
  }, []);

  const removeAudioTrack = useCallback((id: string) => {
    setAudioTracks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <GameForgeContext
      value={{
        currentCode,
        currentEngine,
        onCodeUpdate,
        onEngineUpdate,
        assets,
        addAsset,
        removeAsset,
        audioTracks,
        addAudioTrack,
        removeAudioTrack,
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
