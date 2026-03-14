import { anthropic } from "@ai-sdk/anthropic";
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { z } from "zod";
import { getSystemPrompt } from "@/lib/system-prompt";
import { generateSoundEffect } from "@/lib/fal";
import { soundStore } from "@/lib/sound-store";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, currentCode } = body;

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
      system: getSystemPrompt(currentCode),
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
        generate_sound_effect: tool({
          description:
            "Generate an AI sound effect from a text description. Returns a soundId to reference in game code via window.__GAMEFORGE_SOUNDS__[soundId].",
          inputSchema: z.object({
            prompt: z
              .string()
              .describe(
                "Description of the sound effect (e.g., '8-bit explosion with reverb', 'coin pickup chime')"
              ),
            name: z
              .string()
              .describe(
                "Short identifier for the sound, used as the key in game code (e.g., 'explosion', 'laser', 'coin_pickup')"
              ),
            duration: z
              .number()
              .min(0.5)
              .max(10)
              .default(2)
              .describe("Duration in seconds (0.5-10)"),
          }),
          execute: async ({ prompt, name, duration }) => {
            console.log("[API] Queuing sound effect:", { prompt, name, duration });

            // Store as pending immediately
            soundStore.set(name, {
              dataUrl: null,
              name,
              duration,
              status: "pending",
              createdAt: Date.now(),
            });

            // Fire and forget — generate in background
            generateSoundEffect(prompt, duration)
              .then(async (result) => {
                console.log("[API] Sound generated, fetching audio from:", result.url);
                const response = await fetch(result.url);
                const arrayBuffer = await response.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString("base64");
                const contentType = response.headers.get("content-type") || "audio/wav";
                const dataUrl = `data:${contentType};base64,${base64}`;

                soundStore.set(name, {
                  dataUrl,
                  name,
                  duration,
                  status: "ready",
                  createdAt: Date.now(),
                });
                console.log("[API] Sound ready:", name);
              })
              .catch((err) => {
                console.error("[API] Sound generation failed:", name, err);
                soundStore.set(name, {
                  dataUrl: null,
                  name,
                  duration,
                  status: "error",
                  error: err instanceof Error ? err.message : "Generation failed",
                  createdAt: Date.now(),
                });
              });

            // Return immediately — client will poll for completion
            return { soundId: name, name, duration, status: "pending" };
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
