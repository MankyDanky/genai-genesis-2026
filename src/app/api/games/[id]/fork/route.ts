import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { forkPublishedGame } from "@/lib/db/projects";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid game ID" }, { status: 400 });
    }

    const result = await forkPublishedGame(id);

    if (!result) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    return NextResponse.json({
      projectId: result.projectId,
      revisionNumber: result.revisionNumber,
      title: result.title,
    });
  } catch (error) {
    console.error("[Fork] Failed to fork game", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fork game" },
      { status: 500 },
    );
  }
}
