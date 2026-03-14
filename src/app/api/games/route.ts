import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { SaveGameRequestSchema } from "@/lib/db/schema";
import type { GameDocument } from "@/lib/db/schema";

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

    const { code, title: providedTitle } = parsed.data;

    const title =
      providedTitle ??
      code.match(/<title>(.*?)<\/title>/i)?.[1] ??
      "Untitled Game";

    const now = new Date();
    const doc: Omit<GameDocument, "_id"> = {
      code,
      title,
      codeLength: code.length,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    };

    const result = await db.collection("games").insertOne(doc);

    return NextResponse.json(
      { id: result.insertedId.toHexString() },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to save game" },
      { status: 500 },
    );
  }
}
