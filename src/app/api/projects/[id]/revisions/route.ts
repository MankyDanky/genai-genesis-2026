import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { createRevisionFromSnapshot } from "@/lib/db/projects";
import { SaveProjectSnapshotRequestSchema } from "@/lib/db/schema";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const parsed = SaveProjectSnapshotRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await createRevisionFromSnapshot(id, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[Projects] Failed to create revision", error);
    const status = error instanceof Error && error.message === "Project not found" ? 404 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create revision" },
      { status },
    );
  }
}
