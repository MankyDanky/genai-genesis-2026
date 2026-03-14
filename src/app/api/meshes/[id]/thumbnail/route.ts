import { readArtifactBuffer } from "@/lib/db/artifacts";
import { getMesh } from "@/lib/mesh-store";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const mesh = await getMesh(id);

  if (!mesh || !mesh.thumbnailArtifactId) {
    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  }

  try {
    const artifact = await readArtifactBuffer(mesh.thumbnailArtifactId);
    if (!artifact) {
      return new Response("Artifact not found", { status: 404, headers: CORS_HEADERS });
    }

    return new Response(new Uint8Array(artifact.buffer), {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": artifact.doc.contentType || "image/png",
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  } catch {
    return new Response("Failed to read thumbnail artifact", { status: 500, headers: CORS_HEADERS });
  }
}
