import { NextResponse } from "next/server";
import {
  soundGenerationInflight,
  soundStore,
  type StoredSound,
} from "@/lib/sound-store";
import {
  generateMusicTrackDataUrl,
  generateSoundEffectDataUrl,
} from "@/lib/elevenlabs";

async function startSoundGeneration(id: string, sound: StoredSound) {
  if (soundGenerationInflight.has(id)) {
    return;
  }

  const generationCreatedAt = sound.createdAt;
  const generation = (async () => {
    try {
      const dataUrl =
        sound.kind === "music"
          ? await generateMusicTrackDataUrl(sound.prompt, sound.duration)
          : await generateSoundEffectDataUrl(sound.prompt, sound.duration);
      const latestSound = soundStore.get(id);

      if (!latestSound || latestSound.createdAt !== generationCreatedAt) {
        return;
      }

      soundStore.set(id, {
        ...latestSound,
        dataUrl,
        status: "ready",
        error: undefined,
      });

      console.log("[Audio API] Audio completed and cached:", id);
    } catch (error) {
      const latestSound = soundStore.get(id);

      if (!latestSound || latestSound.createdAt !== generationCreatedAt) {
        return;
      }

      const message =
        error instanceof Error ? error.message : "Audio generation failed";

      console.error("[Audio API] Audio generation failed:", id, error);
      soundStore.set(id, {
        ...latestSound,
        status: "error",
        error: message,
      });
    } finally {
      soundGenerationInflight.delete(id);
    }
  })();

  soundGenerationInflight.set(id, generation);
}

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
    await startSoundGeneration(id, sound);
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
