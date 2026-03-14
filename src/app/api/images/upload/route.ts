import { storeImage } from "@/lib/image-store";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const id = storeImage(file.type, base64);

    const origin = new URL(req.url).origin;
    const url = `${origin}/api/images/${id}`;

    return Response.json({ success: true, url });
  } catch (err) {
    console.error("[UPLOAD] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
