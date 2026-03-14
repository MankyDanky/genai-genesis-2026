import { anthropic } from "@ai-sdk/anthropic";
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { z } from "zod";
import { getGeneratedAudioId, type GeneratedAudioKind } from "@/lib/generated-audio";
import { getSystemPrompt } from "@/lib/system-prompt";
import { soundStore } from "@/lib/sound-store";

export const maxDuration = 120;

function scheduleGeneratedAudio({
  kind,
  name,
  prompt,
  duration,
}: {
  kind: GeneratedAudioKind;
  name: string;
  prompt: string;
  duration: number;
}) {
  const audioId = getGeneratedAudioId(kind, name);

  soundStore.set(audioId, {
    dataUrl: null,
    name,
    prompt,
    kind,
    duration,
    status: "pending",
    createdAt: Date.now(),
  });

  return audioId;
}

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
            console.log("[API] Scheduling sound effect generation:", {
              prompt,
              name,
              duration,
            });

            try {
              scheduleGeneratedAudio({
                kind: "sfx",
                name,
                prompt,
                duration,
              });

              console.log("[API] Sound effect scheduled:", { name });
              return { soundId: name, name, duration, status: "pending" };
            } catch (err) {
              console.error("[API] Failed to schedule sound effect:", name, err);

              soundStore.set(getGeneratedAudioId("sfx", name), {
                dataUrl: null,
                name,
                prompt,
                kind: "sfx",
                duration,
                status: "error",
                error:
                  err instanceof Error
                    ? err.message
                    : "Sound generation setup failed",
                createdAt: Date.now(),
              });

              return { soundId: name, name, duration, status: "error" };
            }
          },
        }),
        generate_music: tool({
          description:
            "Generate instrumental background music that matches the current game's feel. Returns a musicId to reference in game code via window.__GAMEFORGE_MUSIC__[musicId].",
          inputSchema: z.object({
            prompt: z
              .string()
              .describe(
                "Describe the music's mood, tempo, instrumentation, and energy so it fits the game's atmosphere and pacing."
              ),
            name: z
              .string()
              .describe(
                "Short identifier for the music track, used as the key in game code (e.g., 'title_theme', 'battle_loop', 'ambient_bg')"
              ),
            duration: z
              .number()
              .min(10)
              .max(120)
              .default(30)
              .describe("Duration in seconds (10-120)"),
          }),
          execute: async ({ prompt, name, duration }) => {
            console.log("[API] Scheduling music generation:", {
              prompt,
              name,
              duration,
            });

            try {
              scheduleGeneratedAudio({
                kind: "music",
                name,
                prompt,
                duration,
              });

              console.log("[API] Music scheduled:", { name });
              return { musicId: name, name, duration, status: "pending" };
            } catch (err) {
              console.error("[API] Failed to schedule music:", name, err);

              soundStore.set(getGeneratedAudioId("music", name), {
                dataUrl: null,
                name,
                prompt,
                kind: "music",
                duration,
                status: "error",
                error:
                  err instanceof Error
                    ? err.message
                    : "Music generation setup failed",
                createdAt: Date.now(),
              });

              return { musicId: name, name, duration, status: "error" };
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
