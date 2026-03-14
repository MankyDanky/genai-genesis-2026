import { randomUUID } from "crypto";

interface StoredImage {
  mimeType: string;
  data: Buffer;
  createdAt: number;
}

const store = new Map<string, StoredImage>();

const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

function pruneExpired() {
  const now = Date.now();
  for (const [id, img] of store) {
    if (now - img.createdAt > MAX_AGE_MS) {
      store.delete(id);
    }
  }
}

export function storeImage(mimeType: string, base64Data: string): string {
  pruneExpired();
  const id = randomUUID();
  store.set(id, {
    mimeType,
    data: Buffer.from(base64Data, "base64"),
    createdAt: Date.now(),
  });
  return id;
}

export function getImage(id: string): StoredImage | undefined {
  return store.get(id);
}
