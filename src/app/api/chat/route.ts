import { anthropic } from "@ai-sdk/anthropic";
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { z } from "zod";
import { getSystemPrompt } from "@/lib/system-prompt";
import type { GameEngine } from "@/lib/game-engine";
import type { ProjectFile } from "@/lib/project-files";
import { normalizeProjectFiles } from "@/lib/project-files";

export const maxDuration = 60;

function isGameEngine(value: unknown): value is GameEngine {
  return value === "canvas2d" || value === "threejs";
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    const parsed = body as {
      messages?: unknown;
      currentCode?: unknown;
      currentProjectFiles?: unknown;
      gameEngine?: unknown;
    };
    const messages = parsed.messages;
    const currentCode = typeof parsed.currentCode === "string" ? parsed.currentCode : null;
    const currentProjectFiles = Array.isArray(parsed.currentProjectFiles)
      ? normalizeProjectFiles(parsed.currentProjectFiles as Array<Partial<ProjectFile>>)
      : [];
    const gameEngine: GameEngine = isGameEngine(parsed.gameEngine) ? parsed.gameEngine : "canvas2d";

    console.log("[API] Received request:", {
      messageCount: Array.isArray(messages) ? messages.length : 0,
      hasCurrentCode: !!currentCode,
      projectFileCount: currentProjectFiles.length,
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
      system: getSystemPrompt({ currentCode, currentProjectFiles, gameEngine }),
      messages: modelMessages,
      tools: {
        update_project_files: tool({
          description:
            "Create or update the virtual project files (index.html, src/*.js, styles/*.css, assets/*). Use this for all game updates whenever possible.",
          inputSchema: z.object({
            files: z.array(
              z.object({
                path: z.string().min(1).describe("Virtual project file path, e.g. index.html or src/game.js"),
                content: z.string().describe("Complete file contents"),
                kind: z.enum(["html", "style", "script", "asset", "config", "other"]).optional(),
              })
            ),
          }),
          execute: async ({ files }) => {
            const normalized = normalizeProjectFiles(files);
            console.log("[API] Tool update_project_files executed, file count:", normalized.length);
            return { success: true, fileCount: normalized.length };
          },
        }),
        update_sandbox: tool({
          description:
            "Fallback: write a full single HTML file. Prefer update_project_files instead.",
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
