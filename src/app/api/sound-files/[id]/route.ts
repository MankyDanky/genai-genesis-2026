import { readArtifactBuffer } from "@/lib/db/artifacts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const artifact = await readArtifactBuffer(id);

  if (!artifact) {
    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  }

  return new Response(artifact.buffer, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": artifact.doc.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
