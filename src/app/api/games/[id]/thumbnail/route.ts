import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { ensureDbSetup, getDb } from "@/lib/db/client";
import type { PublishedGameDocument } from "@/lib/db/schema";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = (await request.json()) as { thumbnail?: string };
    if (typeof body.thumbnail !== "string" || body.thumbnail.length < 100) {
      return NextResponse.json({ error: "Invalid thumbnail" }, { status: 400 });
    }

    await ensureDbSetup();
    const result = await getDb()
      .collection<PublishedGameDocument>("published_games")
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { thumbnail: body.thumbnail } },
      );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update thumbnail" },
      { status: 500 },
    );
  }
}
