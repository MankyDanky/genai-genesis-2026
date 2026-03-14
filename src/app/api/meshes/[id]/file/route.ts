import { readArtifactBuffer } from "@/lib/db/artifacts";
import { getMesh } from "@/lib/mesh-store";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const mesh = await getMesh(id);

  if (!mesh || !mesh.artifactId) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const artifact = await readArtifactBuffer(mesh.artifactId);
    if (!artifact) {
      return new Response("Artifact not found", { status: 404 });
    }

    return new Response(new Uint8Array(artifact.buffer), {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Cache-Control": "public, max-age=3600, immutable",
        "Content-Disposition": `inline; filename="${mesh.name || id}.glb"`,
      },
    });
  } catch {
    return new Response("Failed to read mesh artifact", { status: 500 });
  }
}
