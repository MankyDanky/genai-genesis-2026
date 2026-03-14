const ELEVENLABS_SOUND_ENDPOINT =
  "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128";
const ELEVENLABS_MUSIC_ENDPOINT =
  "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128";
const ELEVENLABS_SOUND_MODEL = "eleven_text_to_sound_v2";
const ELEVENLABS_MUSIC_MODEL = "music_v1";
const ELEVENLABS_SOUND_TIMEOUT_MS = 45_000;
const ELEVENLABS_MUSIC_TIMEOUT_MS = 90_000;

interface ElevenLabsErrorPayload {
  detail?: {
    message?: string;
  };
}

function buildErrorMessage(
  label: "sound" | "music",
  status: number,
  payload: unknown,
): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "detail" in payload &&
    typeof (payload as ElevenLabsErrorPayload).detail?.message === "string"
  ) {
    return `ElevenLabs ${label} generation failed (${status}): ${(payload as ElevenLabsErrorPayload).detail?.message}`;
  }

  return `ElevenLabs ${label} generation failed (${status})`;
}

async function generateAudioDataUrl({
  endpoint,
  label,
  timeoutMs,
  body,
}: {
  endpoint: string;
  label: "sound" | "music";
  timeoutMs: number;
  body: Record<string, boolean | number | string>;
}): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: abortController.signal,
    });

    if (!response.ok) {
      let payload: unknown = null;

      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      throw new Error(buildErrorMessage(label, response.status, payload));
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      throw new Error("ElevenLabs returned empty audio data");
    }

    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const contentType = response.headers.get("content-type") || "audio/mpeg";
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`ElevenLabs ${label} generation timed out`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateSoundEffectDataUrl(
  prompt: string,
  duration: number,
): Promise<string> {
  return generateAudioDataUrl({
    endpoint: ELEVENLABS_SOUND_ENDPOINT,
    label: "sound",
    timeoutMs: ELEVENLABS_SOUND_TIMEOUT_MS,
    body: {
      text: prompt,
      duration_seconds: duration,
      prompt_influence: 0.3,
      loop: false,
      model_id: ELEVENLABS_SOUND_MODEL,
    },
  });
}

export async function generateMusicTrackDataUrl(
  prompt: string,
  duration: number,
): Promise<string> {
  return generateAudioDataUrl({
    endpoint: ELEVENLABS_MUSIC_ENDPOINT,
    label: "music",
    timeoutMs: ELEVENLABS_MUSIC_TIMEOUT_MS,
    body: {
      prompt,
      music_length_ms: Math.round(duration * 1000),
      model_id: ELEVENLABS_MUSIC_MODEL,
      force_instrumental: true,
    },
  });
}
