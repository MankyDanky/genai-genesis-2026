const ELEVENLABS_SOUND_ENDPOINT =
  "https://api.elevenlabs.io/v1/sound-generation?output_format=pcm_44100";
const ELEVENLABS_MUSIC_ENDPOINT =
  "https://api.elevenlabs.io/v1/music?output_format=pcm_44100";
const ELEVENLABS_SOUND_MODEL = "eleven_text_to_sound_v2";
const ELEVENLABS_MUSIC_MODEL = "music_v1";
const ELEVENLABS_SOUND_TIMEOUT_MS = 45_000;
const ELEVENLABS_MUSIC_TIMEOUT_MS = 90_000;
const ELEVENLABS_SOUND_DURATION_MIN_SECONDS = 0.5;
const ELEVENLABS_SOUND_DURATION_MAX_SECONDS = 10;
const ELEVENLABS_SOUND_DURATION_DEFAULT_SECONDS = 2;
const ELEVENLABS_MUSIC_DURATION_MIN_SECONDS = 10;
const ELEVENLABS_MUSIC_DURATION_MAX_SECONDS = 120;
const ELEVENLABS_MUSIC_DURATION_DEFAULT_SECONDS = 30;

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

function clampDuration(value: number, min: number, max: number, fallback: number): number {
  const numericValue = Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, numericValue));
}

/** Wrap raw PCM 16-bit LE mono samples in a WAV container. */
function wrapPcmInWav(pcm: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm.byteLength;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
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

    const wavBuffer = wrapPcmInWav(Buffer.from(arrayBuffer), 44100);
    const base64 = wavBuffer.toString("base64");
    return `data:audio/wav;base64,${base64}`;
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
  const safeDuration = clampDuration(
    duration,
    ELEVENLABS_SOUND_DURATION_MIN_SECONDS,
    ELEVENLABS_SOUND_DURATION_MAX_SECONDS,
    ELEVENLABS_SOUND_DURATION_DEFAULT_SECONDS,
  );

  return generateAudioDataUrl({
    endpoint: ELEVENLABS_SOUND_ENDPOINT,
    label: "sound",
    timeoutMs: ELEVENLABS_SOUND_TIMEOUT_MS,
    body: {
      text: prompt,
      duration_seconds: safeDuration,
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
  const safeDuration = clampDuration(
    duration,
    ELEVENLABS_MUSIC_DURATION_MIN_SECONDS,
    ELEVENLABS_MUSIC_DURATION_MAX_SECONDS,
    ELEVENLABS_MUSIC_DURATION_DEFAULT_SECONDS,
  );

  return generateAudioDataUrl({
    endpoint: ELEVENLABS_MUSIC_ENDPOINT,
    label: "music",
    timeoutMs: ELEVENLABS_MUSIC_TIMEOUT_MS,
    body: {
      prompt,
      music_length_ms: Math.round(safeDuration * 1000),
      model_id: ELEVENLABS_MUSIC_MODEL,
      force_instrumental: true,
    },
  });
}
