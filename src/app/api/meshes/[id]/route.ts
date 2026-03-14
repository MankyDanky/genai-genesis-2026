import { NextResponse } from "next/server";
import { logOptionalDbFailure } from "@/lib/db/client";
import { storeBinaryArtifact } from "@/lib/db/artifacts";
import { getMesh, putMesh, type StoredMesh } from "@/lib/mesh-store";

const MESHY_API_BASE = "https://api.meshy.ai";

async function fetchMeshyTask(meshyTaskId: string) {
  const key = process.env.MESHY_API_KEY;
  if (!key) throw new Error("MESHY_API_KEY is not set");

  const res = await fetch(`${MESHY_API_BASE}/openapi/v2/text-to-3d/${meshyTaskId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meshy API error (${res.status}): ${text}`);
  }

  return res.json() as Promise<{
    id: string;
    status: string;
    progress: number;
    model_urls?: { glb?: string; fbx?: string; obj?: string };
    thumbnail_url?: string;
    task_error?: { message?: string };
  }>;
}

async function downloadBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  const arrayBuffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

async function finalizeMesh(id: string, mesh: StoredMesh, origin: string) {
  const task = await fetchMeshyTask(mesh.meshyTaskId);

  if (task.status === "FAILED" || task.status === "CANCELED") {
    const errorMsg = task.task_error?.message || `Mesh generation ${task.status.toLowerCase()}`;
    await putMesh(id, { ...mesh, status: "error", error: errorMsg });
    return getMesh(id);
  }

  if (task.status !== "SUCCEEDED") {
    return mesh;
  }

  const glbUrl = task.model_urls?.glb;
  if (!glbUrl) {
    await putMesh(id, { ...mesh, status: "error", error: "No GLB URL in completed task" });
    return getMesh(id);
  }

  let localGlbUrl = glbUrl;
  let localThumbnailUrl = task.thumbnail_url ?? null;
  let artifactId: string | null = null;
  let thumbnailArtifactId: string | null = null;

  try {
    const glbData = await downloadBuffer(glbUrl);
    artifactId = await storeBinaryArtifact({
      kind: "mesh-binary",
      contentType: "model/gltf-binary",
      data: glbData.buffer,
      filename: `${id}.glb`,
    });
    localGlbUrl = `${origin}/api/meshes/${id}/file`;
  } catch (error) {
    logOptionalDbFailure("Mesh GLB artifact persistence", error);
  }

  if (task.thumbnail_url) {
    try {
      const thumbData = await downloadBuffer(task.thumbnail_url);
      thumbnailArtifactId = await storeBinaryArtifact({
        kind: "mesh-binary",
        contentType: thumbData.contentType,
        data: thumbData.buffer,
        filename: `${id}-thumb.png`,
      });
      localThumbnailUrl = `${origin}/api/meshes/${id}/thumbnail`;
    } catch (error) {
      logOptionalDbFailure("Mesh thumbnail artifact persistence", error);
    }
  }

  await putMesh(id, {
    ...mesh,
    status: "ready",
    glbUrl: localGlbUrl,
    thumbnailUrl: localThumbnailUrl,
    artifactId,
    thumbnailArtifactId,
    error: undefined,
  });

  return getMesh(id);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const mesh = await getMesh(id);

  if (!mesh) {
    return NextResponse.json({ error: "Mesh not found" }, { status: 404 });
  }

  if (mesh.status !== "pending") {
    return NextResponse.json({
      id,
      status: mesh.status,
      name: mesh.name,
      prompt: mesh.prompt,
      glbUrl: mesh.glbUrl,
      thumbnailUrl: mesh.thumbnailUrl,
      error: mesh.error ?? null,
    });
  }

  try {
    const origin = new URL(request.url).origin;
    const latest = await finalizeMesh(id, mesh, origin);

    if (!latest || latest.status === "pending") {
      return NextResponse.json({
        id,
        status: "pending",
        name: mesh.name,
        prompt: mesh.prompt,
        glbUrl: null,
        thumbnailUrl: null,
        error: null,
      });
    }

    return NextResponse.json({
      id,
      status: latest.status,
      name: latest.name,
      prompt: latest.prompt,
      glbUrl: latest.glbUrl,
      thumbnailUrl: latest.thumbnailUrl,
      error: latest.error ?? null,
    });
  } catch (error) {
    console.error("[Mesh API] Unexpected mesh status error:", id, error);
    await putMesh(id, {
      ...mesh,
      status: "error",
      error: error instanceof Error ? error.message : "Mesh generation failed",
    });
    return NextResponse.json({
      id,
      status: "error",
      name: mesh.name,
      prompt: mesh.prompt,
      glbUrl: null,
      thumbnailUrl: null,
      error: error instanceof Error ? error.message : "Mesh generation failed",
    });
  }
}
