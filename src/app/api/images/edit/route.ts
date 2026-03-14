import { storeImage, getImage } from "@/lib/image-store";

const GEMINI_MODEL = "gemini-2.5-flash-image";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function POST(req: Request) {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return Response.json({ error: "GEMINI_API_KEY is not set" }, { status: 500 });
    }

    const { imageId, prompt } = await req.json();
    if (!imageId || !prompt) {
      return Response.json({ error: "imageId and prompt are required" }, { status: 400 });
    }

    const stored = await getImage(imageId);
    if (!stored) {
      return Response.json({ error: "Image not found or expired" }, { status: 404 });
    }

    const base64Data = stored.data.toString("base64");

    console.log("[GEMINI] Editing image", imageId, "prompt:", prompt);

    const res = await fetch(`${GEMINI_API_URL}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: stored.mimeType, data: base64Data } },
          ],
        }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[GEMINI] Edit failed:", res.status, text);
      return Response.json({ error: `Gemini API failed (${res.status})` }, { status: 502 });
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) {
      return Response.json({ error: "Gemini returned no content" }, { status: 502 });
    }

    for (const part of parts) {
      if (part.inlineData) {
        const { mimeType, data: b64 } = part.inlineData;
        const newId = await storeImage(mimeType, b64);
        const origin = new URL(req.url).origin;
        const url = `${origin}/api/images/${newId}`;
        console.log("[GEMINI] Edited image stored, id:", newId);
        return Response.json({ success: true, url, prompt });
      }
    }

    return Response.json({ error: "Gemini returned no image in response" }, { status: 502 });
  } catch (err) {
    console.error("[GEMINI] Edit error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
