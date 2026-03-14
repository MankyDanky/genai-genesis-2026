import { NextResponse } from "next/server";
import { soundStore } from "@/lib/sound-store";
import { startAudioGeneration } from "@/lib/audio-generation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sound = soundStore.get(id);

  if (!sound) {
    return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  }

  // If already resolved (ready or error), return cached result.
  if (sound.status !== "pending") {
    return NextResponse.json({
      status: sound.status,
      dataUrl: sound.dataUrl,
      name: sound.name,
      kind: sound.kind,
      duration: sound.duration,
      error: sound.error ?? null,
    });
  }

  try {
    startAudioGeneration(id, sound); // no-op if already running (started eagerly from chat route)
    const latestSound = soundStore.get(id);

    if (!latestSound || latestSound.status === "pending") {
      return NextResponse.json({
        status: "pending",
        dataUrl: null,
        name: sound.name,
        kind: sound.kind,
        duration: sound.duration,
        error: null,
      });
    }

    return NextResponse.json({
      status: latestSound.status,
      dataUrl: latestSound.dataUrl,
      name: latestSound.name,
      kind: latestSound.kind,
      duration: latestSound.duration,
      error: latestSound.error ?? null,
    });
  } catch (err) {
    console.error("[Audio API] Unexpected audio status error:", id, err);
    return NextResponse.json({
      status: "pending",
      dataUrl: null,
      name: sound.name,
      kind: sound.kind,
      duration: sound.duration,
      error: null,
    });
  }
}
