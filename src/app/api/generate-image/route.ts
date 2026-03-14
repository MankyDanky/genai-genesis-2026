import { NextResponse } from "next/server";
import { z } from "zod";
import { generateImage } from "@/lib/fal";

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

    const url = await generateImage(enhancedPrompt);

    return NextResponse.json({ url });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 },
    );
  }
}
