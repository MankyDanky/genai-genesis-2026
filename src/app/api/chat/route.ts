import { anthropic } from "@ai-sdk/anthropic";
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { z } from "zod";
import { getSystemPrompt } from "@/lib/system-prompt";
import { storeImage } from "@/lib/image-store";
import { removeBackground } from "@imgly/background-removal-node";

export const maxDuration = 120;

const GEMINI_MODEL = "gemini-2.5-flash-image";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function removeBg(imageBuffer: Buffer, mimeType: string): Promise<{ data: string; mimeType: string }> {
  console.log("[BG-REMOVE] Starting background removal...");
  const blob = new Blob([imageBuffer], { type: mimeType });
  const resultBlob = await removeBackground(blob, { model: "small", output: { format: "image/png" } });
  const arrayBuffer = await resultBlob.arrayBuffer();
  const b64 = Buffer.from(arrayBuffer).toString("base64");
  console.log("[BG-REMOVE] Done, output size:", b64.length, "chars base64");
  return { data: b64, mimeType: "image/png" };
}

async function generateImage(prompt: string, origin: string, shouldRemoveBg: boolean): Promise<{ url: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  console.log("[GEMINI] Generating image with", GEMINI_MODEL, "removeBg:", shouldRemoveBg);

  const res = await fetch(`${GEMINI_API_URL}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts) throw new Error("Gemini returned no content parts");

  for (const part of parts) {
    if (part.inlineData) {
      let { mimeType, data: b64 } = part.inlineData;

      if (shouldRemoveBg) {
        const imageBuffer = Buffer.from(b64, "base64");
        const result = await removeBg(imageBuffer, mimeType);
        b64 = result.data;
        mimeType = result.mimeType;
      }

      const id = storeImage(mimeType, b64);
      const url = `${origin}/api/images/${id}`;
      console.log("[GEMINI] Image stored, id:", id, "size:", b64.length, "chars base64");
      return { url };
    }
  }

  throw new Error("Gemini response contained no image data");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, currentCode, generatedImages } = body;

    console.log("[API] Received request:", {
      messageCount: messages?.length ?? 0,
      hasCurrentCode: !!currentCode,
    });

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error("[API] Invalid messages:", messages);
      return new Response(
        JSON.stringify({ error: "Messages array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const modelMessages = await convertToModelMessages(messages);
    console.log("[API] Converted to model messages:", modelMessages.length);

    const result = streamText({
      model: anthropic("claude-sonnet-4-6"),
      system: getSystemPrompt(currentCode, generatedImages),
      messages: modelMessages,
      tools: {
        update_sandbox: tool({
          description:
            "Write or update the HTML/CSS/JS code running in the sandbox iframe. Use this to create or modify games and interactive experiences.",
          inputSchema: z.object({
            code: z
              .string()
              .describe(
                "Complete self-contained HTML document with inline CSS and JS"
              ),
          }),
          execute: async ({ code }) => {
            console.log("[API] Tool update_sandbox executed, code length:", code.length);
            return { success: true, codeLength: code.length };
          },
        }),
        generate_image: tool({
          description:
            "Generate an image using AI. Returns a URL you can use in game HTML via <img> tags or new Image() in JS. Call this BEFORE update_sandbox so you can embed the returned URL in your game code. Set removeBackground to true for sprites, characters, items, and any asset that needs to be composited on top of other graphics.",
          inputSchema: z.object({
            prompt: z
              .string()
              .describe(
                "Detailed description of the image to generate. Be specific about style, colors, perspective, and content."
              ),
            removeBackground: z
              .boolean()
              .default(false)
              .describe(
                "Whether to remove the background and make it transparent. Use true for sprites, characters, objects, items, UI elements. Use false for backgrounds, textures, full scenes."
              ),
          }),
          execute: async ({ prompt, removeBackground: shouldRemoveBg }) => {
            console.log("[API] Tool generate_image called, prompt:", prompt, "removeBg:", shouldRemoveBg);
            try {
              const origin = new URL(req.url).origin;
              const { url } = await generateImage(prompt, origin, shouldRemoveBg);
              console.log("[API] Image generated:", url);
              return { success: true, url, prompt };
            } catch (err) {
              console.error("[API] Image generation failed:", err);
              return {
                success: false,
                error: err instanceof Error ? err.message : "Image generation failed",
                prompt,
              };
            }
          },
        }),
      },
      providerOptions: {
        anthropic: {
          thinking: { type: "enabled", budgetTokens: 10000 },
        },
      },
      stopWhen: stepCountIs(3),
      onError: ({ error }) => {
        console.error("[API] streamText error:", error);
      },
    });

    console.log("[API] Streaming response...");
    return result.toUIMessageStreamResponse({ sendReasoning: true });
  } catch (error) {
    console.error("[API] Unhandled error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
