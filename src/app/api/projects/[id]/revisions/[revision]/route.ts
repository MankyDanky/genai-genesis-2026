import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getProjectRevision } from "@/lib/db/projects";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; revision: string }> },
) {
  const { id, revision } = await params;
  const revisionNumber = Number.parseInt(revision, 10);

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
  }

  if (!Number.isInteger(revisionNumber) || revisionNumber <= 0) {
    return NextResponse.json({ error: "Invalid revision number" }, { status: 400 });
  }

  try {
    const projectRevision = await getProjectRevision(id, revisionNumber);
    if (!projectRevision) {
      return NextResponse.json({ error: "Revision not found" }, { status: 404 });
    }

    return NextResponse.json(projectRevision);
  } catch (error) {
    console.error("[Projects] Failed to fetch revision", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch revision" },
      { status: 500 },
    );
  }
}
