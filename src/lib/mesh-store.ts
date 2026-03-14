import { ensureDbSetup, getDb, logOptionalDbFailure } from "@/lib/db/client";

export interface StoredMesh {
  name: string;
  prompt: string;
  status: "pending" | "ready" | "error";
  meshyTaskId: string;
  glbUrl: string | null;
  thumbnailUrl: string | null;
  artifactId: string | null;
  thumbnailArtifactId: string | null;
  error?: string;
  createdAt: number;
}

interface StoredMeshDocument {
  _id: string;
  name: string;
  prompt: string;
  status: "pending" | "ready" | "error";
  meshyTaskId: string;
  glbUrl: string | null;
  thumbnailUrl: string | null;
  artifactId: string | null;
  thumbnailArtifactId: string | null;
  error?: string | null;
  createdAt: number;
}

const globalWithMeshes = globalThis as typeof globalThis & {
  __meshStore?: Map<string, StoredMesh>;
};

if (!globalWithMeshes.__meshStore) {
  globalWithMeshes.__meshStore = new Map();
}

const memoryStore = globalWithMeshes.__meshStore;

function collection() {
  return getDb().collection<StoredMeshDocument>("generated_mesh_jobs");
}

export async function putMesh(id: string, mesh: StoredMesh) {
  memoryStore.set(id, mesh);

  try {
    await ensureDbSetup();
    await collection().updateOne(
      { _id: id },
      {
        $set: {
          ...mesh,
          artifactId: mesh.artifactId ?? null,
          thumbnailArtifactId: mesh.thumbnailArtifactId ?? null,
          error: mesh.error ?? null,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    logOptionalDbFailure("Mesh store persistence", error);
  }
}

export async function getMesh(id: string): Promise<StoredMesh | null> {
  const memoryHit = memoryStore.get(id);
  if (memoryHit) {
    return memoryHit;
  }

  try {
    await ensureDbSetup();
    const doc = await collection().findOne({ _id: id });
    if (!doc) return null;

    const mesh: StoredMesh = {
      name: doc.name,
      prompt: doc.prompt,
      status: doc.status,
      meshyTaskId: doc.meshyTaskId,
      glbUrl: doc.glbUrl,
      thumbnailUrl: doc.thumbnailUrl,
      artifactId: doc.artifactId ?? null,
      thumbnailArtifactId: doc.thumbnailArtifactId ?? null,
      error: doc.error ?? undefined,
      createdAt: doc.createdAt,
    };
    memoryStore.set(id, mesh);
    return mesh;
  } catch (error) {
    logOptionalDbFailure("Mesh store reads", error);
    return null;
  }
}
