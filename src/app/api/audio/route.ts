import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { getAudioSystemPrompt } from "@/lib/audio-prompt";

export const maxDuration = 30;

const VALID_TYPES = ["music", "sfx", "ambient"] as const;
type AudioType = (typeof VALID_TYPES)[number];

export async function POST(req: Request) {
  try {
    const { description, type } = await req.json();

    if (!description || typeof description !== "string") {
      return new Response(JSON.stringify({ error: "description is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!VALID_TYPES.includes(type)) {
      return new Response(
        JSON.stringify({ error: `type must be one of: ${VALID_TYPES.join(", ")}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("[Audio API] Generating", type, "for:", description);

    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      system: getAudioSystemPrompt(type as AudioType),
      prompt: `Generate a ${type} audio function for: ${description}`,
    });

    // Claude may wrap in markdown fences despite instructions — strip them
    const cleaned = text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

    let parsed: { name: string; functionName: string; code: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[Audio API] Failed to parse JSON:", cleaned.slice(0, 200));
      return new Response(
        JSON.stringify({ error: "Model returned invalid JSON" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!parsed.name || !parsed.functionName || !parsed.code) {
      return new Response(
        JSON.stringify({ error: "Model response missing required fields" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("[Audio API] Generated function:", parsed.functionName, "code length:", parsed.code.length);

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Audio API] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
