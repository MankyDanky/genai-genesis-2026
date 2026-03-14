import { anthropic } from "@ai-sdk/anthropic";
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { z } from "zod";
import { getSystemPrompt } from "@/lib/system-prompt";
import type { GameEngine } from "@/lib/game-engine";

export const maxDuration = 60;

function isGameEngine(value: unknown): value is GameEngine {
  return value === "canvas2d" || value === "threejs";
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    const parsed = body as { messages?: unknown; currentCode?: unknown; gameEngine?: unknown };
    const messages = parsed.messages;
    const currentCode = typeof parsed.currentCode === "string" ? parsed.currentCode : null;
    const gameEngine: GameEngine = isGameEngine(parsed.gameEngine) ? parsed.gameEngine : "canvas2d";

    console.log("[API] Received request:", {
      messageCount: Array.isArray(messages) ? messages.length : 0,
      hasCurrentCode: !!currentCode,
      gameEngine,
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
      system: getSystemPrompt({ currentCode, gameEngine }),
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
      },
      stopWhen: stepCountIs(2),
      onError: ({ error }) => {
        console.error("[API] streamText error:", error);
      },
    });

    console.log("[API] Streaming response...");
    return result.toUIMessageStreamResponse();
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
