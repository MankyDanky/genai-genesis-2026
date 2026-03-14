import { NextResponse } from "next/server";
import { z } from "zod";
import { createStandalonePublishedGame } from "@/lib/db/projects";

const SaveGameRequestSchema = z.object({
  code: z.string().min(1).max(2 * 1024 * 1024),
  title: z.string().max(200).optional(),
  engine: z.enum(["canvas2d", "threejs", "phaser"]).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = SaveGameRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await createStandalonePublishedGame({
      title: parsed.data.title,
      engine: parsed.data.engine,
      code: parsed.data.code,
    });

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    console.error("[Games] Failed to save game", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save game" },
      { status: 500 },
    );
  }
}
