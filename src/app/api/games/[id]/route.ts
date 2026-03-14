import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db/client";
import type { GameDocument } from "@/lib/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid game ID" }, { status: 400 });
    }

    const game = await db
      .collection<GameDocument>("games")
      .findOne({ _id: new ObjectId(id) });

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: game._id.toHexString(),
      code: game.code,
      title: game.title,
      codeLength: game.codeLength,
      createdAt: game.createdAt,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to retrieve game" },
      { status: 500 },
    );
  }
}
