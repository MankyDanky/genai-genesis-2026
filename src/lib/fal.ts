import { fal } from "@fal-ai/client";

// Auth: @fal-ai/client reads FAL_KEY from process.env automatically

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
