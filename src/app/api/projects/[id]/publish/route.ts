import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { publishProjectRevision } from "@/lib/db/projects";
import { PublishProjectRequestSchema } from "@/lib/db/schema";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = PublishProjectRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await publishProjectRevision(id, parsed.data.revisionNumber);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[Projects] Failed to publish revision", error);
    const message = error instanceof Error ? error.message : "Failed to publish revision";
    const status =
      message === "Project not found" || message === "Revision not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
