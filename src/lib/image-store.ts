import { randomUUID } from "crypto";
import { logOptionalDbFailure } from "@/lib/db/client";
import { readArtifactBuffer, storeBinaryArtifact } from "@/lib/db/artifacts";

interface StoredImage {
  mimeType: string;
  data: Buffer;
  createdAt: number;
}

const globalStore = globalThis as unknown as { __imageStore?: Map<string, StoredImage> };
if (!globalStore.__imageStore) {
  globalStore.__imageStore = new Map();
}
const memoryStore = globalStore.__imageStore;

export async function storeImage(mimeType: string, base64Data: string): Promise<string> {
  const buffer = Buffer.from(base64Data, "base64");

  try {
    return await storeBinaryArtifact({
      kind: "image-binary",
      contentType: mimeType,
      data: buffer,
      filename: `image-${Date.now()}.bin`,
    });
  } catch (error) {
    logOptionalDbFailure("Image store persistence", error);
    const id = randomUUID();
    memoryStore.set(id, {
      mimeType,
      data: buffer,
      createdAt: Date.now(),
    });
    return id;
  }
}

export async function getImage(id: string): Promise<StoredImage | undefined> {
  const memoryHit = memoryStore.get(id);
  if (memoryHit) {
    return memoryHit;
  }

  try {
    const artifact = await readArtifactBuffer(id);
    if (!artifact) return undefined;

    return {
      mimeType: artifact.doc.contentType,
      data: artifact.buffer,
      createdAt: artifact.doc.createdAt.getTime(),
    };
  } catch (error) {
    logOptionalDbFailure("Image store reads", error);
    return undefined;
  }
}
