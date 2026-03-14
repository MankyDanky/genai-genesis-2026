import type { GeneratedAudioKind } from "@/lib/generated-audio";

export interface StoredSound {
  dataUrl: string | null;
  name: string;
  prompt: string;
  kind: GeneratedAudioKind;
  duration: number;
  status: "pending" | "ready" | "error";
  error?: string;
  createdAt: number;
}

const globalWithSounds = globalThis as typeof globalThis & {
  __soundStore?: Map<string, StoredSound>;
  __soundGenerationInflight?: Map<string, Promise<void>>;
};

if (!globalWithSounds.__soundStore) {
  globalWithSounds.__soundStore = new Map();
}

if (!globalWithSounds.__soundGenerationInflight) {
  globalWithSounds.__soundGenerationInflight = new Map();
}

export const soundStore = globalWithSounds.__soundStore;
export const soundGenerationInflight = globalWithSounds.__soundGenerationInflight;
