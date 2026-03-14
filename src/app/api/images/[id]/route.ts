import { getImage } from "@/lib/image-store";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const image = getImage(id);

  if (!image) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(image.data, {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "public, max-age=1800, immutable",
    },
  });
}
