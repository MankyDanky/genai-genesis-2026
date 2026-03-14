import { NextResponse } from "next/server";
import { logOptionalDbFailure } from "@/lib/db/client";
import { storeBinaryArtifact } from "@/lib/db/artifacts";
import { generateMusicTrackDataUrl, generateSoundEffectDataUrl } from "@/lib/elevenlabs";
import { parseDataUrl } from "@/lib/data-url";
import { getSound, putSound, soundGenerationInflight, type StoredSound } from "@/lib/sound-store";

async function startSoundGeneration(id: string, sound: StoredSound, origin: string) {
  if (soundGenerationInflight.has(id)) {
    return;
  }

  const generationCreatedAt = sound.createdAt;
  const generation = (async () => {
    try {
      const sourceDataUrl =
        sound.kind === "music"
          ? await generateMusicTrackDataUrl(sound.prompt, sound.duration)
          : await generateSoundEffectDataUrl(sound.prompt, sound.duration);

      const latestSound = await getSound(id);
      if (!latestSound || latestSound.createdAt !== generationCreatedAt) {
        return;
      }

      try {
        const parsed = parseDataUrl(sourceDataUrl);
        const artifactId = await storeBinaryArtifact({
          kind: "audio-binary",
          contentType: parsed.contentType,
          data: parsed.isBase64
            ? Buffer.from(parsed.data, "base64")
            : Buffer.from(decodeURIComponent(parsed.data), "utf8"),
          filename: `${id}.bin`,
        });

        await putSound(id, {
          ...latestSound,
          dataUrl: `${origin}/api/sound-files/${artifactId}`,
          artifactId,
          status: "ready",
          error: undefined,
        });
      } catch (artifactError) {
        logOptionalDbFailure("Audio artifact persistence", artifactError);
        await putSound(id, {
          ...latestSound,
          dataUrl: sourceDataUrl,
          artifactId: null,
          status: "ready",
          error: undefined,
        });
      }
    } catch (error) {
      const latestSound = await getSound(id);
      if (!latestSound || latestSound.createdAt !== generationCreatedAt) {
        return;
      }

      await putSound(id, {
        ...latestSound,
        status: "error",
        error: error instanceof Error ? error.message : "Audio generation failed",
      });
    } finally {
      soundGenerationInflight.delete(id);
    }
  })();

  soundGenerationInflight.set(id, generation);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sound = await getSound(id);

  if (!sound) {
    return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  }

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
    const origin = new URL(request.url).origin;
    await startSoundGeneration(id, sound, origin);
    const latestSound = await getSound(id);

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
  } catch (error) {
    console.error("[Audio API] Unexpected audio status error:", id, error);
    await putSound(id, {
      ...sound,
      status: "error",
      error: error instanceof Error ? error.message : "Audio generation failed",
    });
    return NextResponse.json({
      status: "error",
      dataUrl: null,
      name: sound.name,
      kind: sound.kind,
      duration: sound.duration,
      error: error instanceof Error ? error.message : "Audio generation failed",
    });
  }
}
