import { ensureDbSetup, getDb, logOptionalDbFailure } from "@/lib/db/client";
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
  artifactId?: string | null;
}

interface StoredSoundDocument {
  _id: string;
  dataUrl: string | null;
  name: string;
  prompt: string;
  kind: GeneratedAudioKind;
  duration: number;
  status: "pending" | "ready" | "error";
  error?: string | null;
  createdAt: number;
  artifactId?: string | null;
}

const globalWithSounds = globalThis as typeof globalThis & {
  __soundStore?: Map<string, StoredSound>;
  __soundGenerationInflight?: Map<string, Promise<void>>;
  __soundPromptCache?: Map<string, string>; // promptKey -> audioId
};

if (!globalWithSounds.__soundStore) {
  globalWithSounds.__soundStore = new Map();
}

if (!globalWithSounds.__soundGenerationInflight) {
  globalWithSounds.__soundGenerationInflight = new Map();
}

if (!globalWithSounds.__soundPromptCache) {
  globalWithSounds.__soundPromptCache = new Map();
}

// Sync in-memory store — used for dedup checks and eager reads
export const soundStore = globalWithSounds.__soundStore;
export const soundGenerationInflight = globalWithSounds.__soundGenerationInflight;
export const soundPromptCache = globalWithSounds.__soundPromptCache;

/** Returns a cache key for a given prompt+kind+duration combo */
export function promptCacheKey(kind: GeneratedAudioKind, prompt: string, duration: number): string {
  return `${kind}:${duration}:${prompt.trim().toLowerCase()}`;
}

function collection() {
  return getDb().collection<StoredSoundDocument>("generated_audio_jobs");
}

export async function putSound(id: string, sound: StoredSound) {
  soundStore.set(id, sound);

  try {
    await ensureDbSetup();
    await collection().updateOne(
      { _id: id },
      {
        $set: {
          ...sound,
          artifactId: sound.artifactId ?? null,
          error: sound.error ?? null,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    logOptionalDbFailure("Sound store persistence", error);
  }
}

export async function getSound(id: string): Promise<StoredSound | null> {
  const memoryHit = soundStore.get(id);
  if (memoryHit) {
    return memoryHit;
  }

  try {
    await ensureDbSetup();
    const doc = await collection().findOne({ _id: id });
    if (!doc) return null;

    const sound: StoredSound = {
      dataUrl: doc.dataUrl,
      name: doc.name,
      prompt: doc.prompt,
      kind: doc.kind,
      duration: doc.duration,
      status: doc.status,
      error: doc.error ?? undefined,
      createdAt: doc.createdAt,
      artifactId: doc.artifactId ?? null,
    };
    soundStore.set(id, sound);
    return sound;
  } catch (error) {
    logOptionalDbFailure("Sound store reads", error);
    return null;
  }
}
