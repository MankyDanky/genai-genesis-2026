import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getProjectSummary } from "@/lib/db/projects";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
  }

  try {
    const project = await getProjectSummary(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error("[Projects] Failed to fetch project", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch project" },
      { status: 500 },
    );
  }
}
