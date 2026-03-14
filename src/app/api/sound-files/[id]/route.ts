import { readArtifactBuffer } from "@/lib/db/artifacts";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const artifact = await readArtifactBuffer(id);

  if (!artifact) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(artifact.buffer, {
    headers: {
      "Content-Type": artifact.doc.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
