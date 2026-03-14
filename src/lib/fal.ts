import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FALAI_API_KEY });

type AspectRatio = "1:1" | "16:9" | "21:9" | "3:2" | "4:3" | "5:4" | "4:5" | "3:4" | "2:3" | "9:16";

export async function generateImage(
  prompt: string,
  aspectRatio: AspectRatio = "1:1",
): Promise<string> {
  const result = await fal.subscribe("fal-ai/nano-banana", {
    input: {
      prompt,
      num_images: 1,
      aspect_ratio: aspectRatio,
      output_format: "png",
    },
  });

  const url = result.data?.images?.[0]?.url;
  if (!url) {
    throw new Error("No image returned from fal.ai");
  }

  return url;
}

export async function generateMusicTrackDataUrl(
  prompt: string,
  duration: number,
): Promise<string> {
  const result = await fal.subscribe("fal-ai/stable-audio", {
    input: {
      prompt,
      seconds_total: Math.min(Math.max(Math.round(duration), 1), 180),
      steps: 50,
    },
  });

  const audioUrl = (result.data as { audio_file?: { url?: string } })?.audio_file?.url;
  if (!audioUrl) {
    console.error("[fal.ai] stable-audio unexpected response:", JSON.stringify(result.data));
    throw new Error("No audio returned from fal.ai stable-audio");
  }

  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch fal.ai audio (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const contentType = response.headers.get("content-type") || "audio/wav";
  return `data:${contentType};base64,${base64}`;
}
