import { NextResponse } from "next/server";
import { getPublishedGame } from "@/lib/db/projects";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const game = await getPublishedGame(id);

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: game.id,
      code: game.code,
      title: game.title,
      createdAt: game.createdAt,
      revisionNumber: game.revisionNumber,
      projectId: game.projectId,
    });
  } catch (error) {
    console.error("[Games] Failed to retrieve game", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retrieve game" },
      { status: 500 },
    );
  }
}
