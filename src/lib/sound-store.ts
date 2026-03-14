export interface StoredSound {
  dataUrl: string | null;
  name: string;
  duration: number;
  status: "pending" | "ready" | "error";
  error?: string;
  createdAt: number;
}

const globalWithSounds = globalThis as typeof globalThis & {
  __soundStore?: Map<string, StoredSound>;
};

if (!globalWithSounds.__soundStore) {
  globalWithSounds.__soundStore = new Map();
}

export const soundStore = globalWithSounds.__soundStore;
