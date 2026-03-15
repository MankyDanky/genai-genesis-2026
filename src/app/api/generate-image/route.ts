import { NextResponse } from "next/server";
import { z } from "zod";
import { generateImage } from "@/lib/fal";
import { storeImage } from "@/lib/image-store";

export const maxDuration = 60;

const RequestSchema = z.object({
  prompt: z.string().min(1).max(1000),
  assetType: z.enum(["sprite", "background", "ui"]).optional(),
});

const ASSET_TYPE_PREFIXES: Record<string, string> = {
  sprite: "pixel art game sprite:",
  background: "game background:",
  ui: "game UI element:",
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { prompt, assetType } = parsed.data;

    const enhancedPrompt = assetType
      ? `${ASSET_TYPE_PREFIXES[assetType]} ${prompt}`
      : prompt;

    const sourceUrl = await generateImage(enhancedPrompt);
    const sourceResponse = await fetch(sourceUrl);

    if (!sourceResponse.ok) {
      throw new Error(`Failed to fetch generated image (${sourceResponse.status})`);
    }

    const buffer = Buffer.from(await sourceResponse.arrayBuffer());
    const mimeType = sourceResponse.headers.get("content-type") || "image/png";
    const artifactId = await storeImage(mimeType, buffer.toString("base64"));
    const origin = new URL(request.url).origin;
    const url = `${origin}/api/images/${artifactId}`;

    return NextResponse.json({ url });
  } catch (error) {
    console.error("[Generate Image] Failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate image" },
      { status: 500 },
    );
  }
}
