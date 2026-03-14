import { NextResponse } from "next/server";
import { SaveProjectSnapshotRequestSchema } from "@/lib/db/schema";
import { createProjectFromSnapshot } from "@/lib/db/projects";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = SaveProjectSnapshotRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await createProjectFromSnapshot(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[Projects] Failed to create project", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create project" },
      { status: 500 },
    );
  }
}
