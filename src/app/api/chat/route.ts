import { anthropic } from "@ai-sdk/anthropic";
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { z } from "zod";
import { getSystemPrompt } from "@/lib/system-prompt";

export const maxDuration = 120;

const FAL_MODEL = "fal-ai/flux/schnell";

async function generateImageWithFal(prompt: string): Promise<{ url: string }> {
  const key = process.env.FALAI_API_KEY;
  if (!key) throw new Error("FALAI_API_KEY is not set");

  const submitRes = await fetch(`https://queue.fal.run/${FAL_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: "square",
      num_inference_steps: 4,
      enable_safety_checker: true,
    }),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(`fal.ai submit failed (${submitRes.status}): ${text}`);
  }

  const { request_id, status: initialStatus, response_url } = await submitRes.json();
  console.log("[FAL] Submitted job:", request_id, "status:", initialStatus, "model:", FAL_MODEL);

  if (initialStatus === "COMPLETED") {
    const resultRes = await fetch(response_url, {
      headers: { Authorization: `Key ${key}` },
    });
    const data = await resultRes.json();
    return { url: data.images[0].url };
  }

  const statusUrl = `${response_url}/status`;
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1000));

    const pollRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${key}` },
    });
    if (!pollRes.ok) {
      console.warn("[FAL] Poll failed:", pollRes.status);
      continue;
    }
    const pollData = await pollRes.json();
    console.log("[FAL] Poll attempt", i + 1, "status:", pollData.status);

    if (pollData.status === "COMPLETED") {
      const resultRes = await fetch(response_url, {
        headers: { Authorization: `Key ${key}` },
      });
      const data = await resultRes.json();
      return { url: data.images[0].url };
    }

    if (pollData.status === "FAILED") {
      throw new Error(`fal.ai job failed: ${JSON.stringify(pollData)}`);
    }
  }

  throw new Error("fal.ai image generation timed out after 60s");
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
            "Generate an image using AI. Returns a URL you can use in game HTML via <img> tags or new Image() in JS. Call this BEFORE update_sandbox so you can embed the returned URL in your game code.",
          inputSchema: z.object({
            prompt: z
              .string()
              .describe(
                "Detailed description of the image to generate. Be specific about style, colors, perspective, and content."
              ),
          }),
          execute: async ({ prompt }) => {
            console.log("[API] Tool generate_image called, prompt:", prompt);
            try {
              const { url } = await generateImageWithFal(prompt);
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
