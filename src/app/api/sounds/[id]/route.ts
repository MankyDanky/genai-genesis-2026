import { NextResponse } from "next/server";
import { soundStore } from "@/lib/sound-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sound = soundStore.get(id);

  if (!sound) {
    return NextResponse.json({ error: "Sound not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: sound.status,
    dataUrl: sound.dataUrl,
    name: sound.name,
    duration: sound.duration,
    error: sound.error ?? null,
  });
}
