import { anthropic } from "@ai-sdk/anthropic";
import { xai } from "@ai-sdk/xai";
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { z } from "zod";
import { getSystemPrompt } from "@/lib/system-prompt";
import type { GameEngine } from "@/lib/game-engine";
import type { ProjectFile } from "@/lib/project-files";
import { normalizeProjectFiles } from "@/lib/project-files";
import { getGeneratedAudioId, type GeneratedAudioKind } from "@/lib/generated-audio";
import { storeImage } from "@/lib/image-store";
import { putSound } from "@/lib/sound-store";
import { buildPartyKitScaffold } from "@/lib/multiplayer/partykit-scaffold";
import { putMesh } from "@/lib/mesh-store";

export const maxDuration = 60;

const SFX_DURATION_MIN_SECONDS = 0.5;
const SFX_DURATION_MAX_SECONDS = 10;
const SFX_DURATION_DEFAULT_SECONDS = 2;
const MUSIC_DURATION_MIN_SECONDS = 10;
const MUSIC_DURATION_MAX_SECONDS = 120;
const MUSIC_DURATION_DEFAULT_SECONDS = 30;

function clampDuration(value: unknown, min: number, max: number, fallback: number) {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numericValue));
}

function createDurationSchema(min: number, max: number, fallback: number) {
  return z.preprocess((value) => clampDuration(value, min, max, fallback), z.number());
}

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
  void putSound(audioId, {
    dataUrl: null,
    name,
    prompt,
    kind,
    duration,
    status: "pending",
    createdAt: Date.now(),
  }).catch((error) => {
    console.error("[Audio] Failed to schedule generated audio", error);
  });
  return audioId;
}

interface ConsoleLogPayload {
  level: "log" | "info" | "warn" | "error";
  source: "console" | "error" | "unhandledrejection";
  text: string;
  timestamp: number;
}

interface GeneratedImagePayload {
  url: string;
  prompt: string;
}

interface AudioTrackPayload {
  id: string;
  name: string;
  type: "music" | "sfx";
  description: string;
  status: "pending" | "ready" | "error";
  duration: number | null;
  error?: string | null;
}

interface GeneratedMeshPayload {
  id: string;
  name: string;
  prompt: string;
  status: "pending" | "ready" | "error";
  glbUrl: string | null;
  thumbnailUrl: string | null;
  error?: string | null;
}

interface PlanningTodoPayload {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

type ComposerMode = "agent" | "plan" | "debug" | "ask";
type ModelChoice =
  | "claude-sonnet-4-6"
  | "grok-code-fast-1"
  | "grok-4.20-multi-agent-beta-0309";

function isComposerMode(value: unknown): value is ComposerMode {
  return value === "agent" || value === "plan" || value === "debug" || value === "ask";
}

function isModelChoice(value: unknown): value is ModelChoice {
  return (
    value === "claude-sonnet-4-6" ||
    value === "grok-code-fast-1" ||
    value === "grok-4.20-multi-agent-beta-0309"
  );
}

function safeJsonPreview(value: unknown, max = 300): string {
  try {
    const raw = JSON.stringify(value);
    if (!raw) return "";
    return raw.length > max ? `${raw.slice(0, max)}…` : raw;
  } catch {
    return String(value);
  }
}

function summarizeIncomingMessages(messages: unknown[]) {
  return messages.map((raw, index) => {
    if (!raw || typeof raw !== "object") {
      return { index, valid: false, reason: "not-object" };
    }

    const message = raw as { role?: unknown; content?: unknown; parts?: unknown };
    const partTypes = Array.isArray(message.parts)
      ? message.parts
          .map((p) => (p && typeof p === "object" ? (p as { type?: unknown }).type : null))
          .filter((t): t is string => typeof t === "string")
      : [];

    const toolParts = Array.isArray(message.parts)
      ? message.parts.filter(
          (p) => p && typeof p === "object" && typeof (p as { type?: unknown }).type === "string" && String((p as { type?: unknown }).type).startsWith("tool-")
        )
      : [];

    const invalidToolInputs = toolParts
      .map((p) => p as { type?: unknown; input?: unknown })
      .filter((p) => p.input !== undefined && (typeof p.input !== "object" || p.input === null))
      .map((p) => ({
        type: p.type,
        inputType: typeof p.input,
        inputPreview: safeJsonPreview(p.input, 120),
      }));

    return {
      index,
      role: message.role,
      contentType: typeof message.content,
      partTypes,
      invalidToolInputs,
    };
  });
}

function extractErrorDetails(error: unknown) {
  const e = error as {
    name?: string;
    message?: string;
    stack?: string;
    cause?: unknown;
    status?: unknown;
    responseBody?: unknown;
    body?: unknown;
  };

  const cause = e.cause as {
    message?: string;
    status?: unknown;
    responseBody?: unknown;
    body?: unknown;
  } | undefined;

  return {
    name: e.name,
    message: e.message,
    status: e.status ?? cause?.status,
    responseBody: e.responseBody ?? e.body ?? cause?.responseBody ?? cause?.body,
    causeMessage: cause?.message,
    stack: e.stack,
  };
}

function isGameEngine(value: unknown): value is GameEngine {
  return value === "canvas2d" || value === "threejs" || value === "phaser";
}

function sanitizeMessagesForModel(messages: unknown[]): Array<{ role: "user" | "assistant"; parts: Array<{ type: "text"; text: string }> }> {
  const sanitized: Array<{ role: "user" | "assistant"; parts: Array<{ type: "text"; text: string }> }> = [];

  for (const rawMessage of messages) {
    if (!rawMessage || typeof rawMessage !== "object") continue;
    const message = rawMessage as {
      role?: unknown;
      content?: unknown;
      parts?: unknown;
    };

    if (message.role !== "user" && message.role !== "assistant") continue;

    const textParts: Array<{ type: "text"; text: string }> = [];

    if (typeof message.content === "string" && message.content.trim().length > 0) {
      textParts.push({ type: "text", text: message.content });
    }

    if (Array.isArray(message.parts)) {
      for (const rawPart of message.parts) {
        if (!rawPart || typeof rawPart !== "object") continue;
        const part = rawPart as { type?: unknown; text?: unknown };
        if (part.type === "text" && typeof part.text === "string" && part.text.trim().length > 0) {
          textParts.push({ type: "text", text: part.text });
        }
      }
    }

    if (textParts.length === 0) continue;
    sanitized.push({ role: message.role, parts: textParts });
  }

  return sanitized;
}

function normalizePath(path: string): string {
  return path.trim().replace(/^\.\//, "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function normalizeDir(dir: string): string {
  const normalized = normalizePath(dir);
  if (!normalized) return "";
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function parseJsonIfString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function toFileMap(files: ProjectFile[]): Map<string, ProjectFile> {
  return new Map(files.map((file) => [normalizePath(file.path), file]));
}

function numberedSlice(content: string, offset?: number, limit?: number): string {
  const lines = content.split("\n");
  const start = Math.max(0, (offset ?? 1) - 1);
  const end = limit ? Math.min(lines.length, start + Math.max(0, limit)) : lines.length;
  return lines
    .slice(start, end)
    .map((line, idx) => `${start + idx + 1}|${line}`)
    .join("\n");
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLE_STAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLE_STAR::/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function matchesAnyGlob(path: string, globs?: string[]): boolean {
  if (!globs || globs.length === 0) return false;
  return globs.some((glob) => globToRegExp(glob).test(path));
}

function listDirEntries(files: ProjectFile[], targetDirectory: string, ignoreGlobs?: string[]) {
  const dir = normalizeDir(targetDirectory);
  const names = new Map<string, { name: string; path: string; type: "file" | "directory" }>();

  for (const file of files) {
    const path = normalizePath(file.path);
    if (dir && !path.startsWith(dir)) continue;
    if (matchesAnyGlob(path, ignoreGlobs)) continue;

    const rest = dir ? path.slice(dir.length) : path;
    if (!rest) continue;
    const [head, ...tail] = rest.split("/");
    if (!head) continue;

    if (tail.length === 0) {
      names.set(head, { name: head, path: `${dir}${head}`, type: "file" });
    } else {
      names.set(head, { name: head, path: `${dir}${head}/`, type: "directory" });
    }
  }

  return Array.from(names.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function buildDirTree(files: ProjectFile[], rootDir = "") {
  const rootPrefix = normalizeDir(rootDir);
  type TreeNode = { type: "directory"; name: string; path: string; children: TreeNode[] } | { type: "file"; name: string; path: string };
  const root: { type: "directory"; name: string; path: string; children: TreeNode[] } = {
    type: "directory",
    name: rootPrefix || ".",
    path: rootPrefix,
    children: [],
  };

  for (const file of files) {
    const filePath = normalizePath(file.path);
    if (rootPrefix && !filePath.startsWith(rootPrefix)) continue;
    const rel = rootPrefix ? filePath.slice(rootPrefix.length) : filePath;
    if (!rel) continue;

    const parts = rel.split("/").filter(Boolean);
    let cursor = root;

    for (let i = 0; i < parts.length; i += 1) {
      const name = parts[i]!;
      const isLast = i === parts.length - 1;
      const currentPath = rootPrefix + parts.slice(0, i + 1).join("/");

      if (isLast) {
        if (!cursor.children.some((node) => node.type === "file" && node.path === currentPath)) {
          cursor.children.push({ type: "file", name, path: currentPath });
        }
        continue;
      }

      let nextDir = cursor.children.find(
        (node): node is Extract<TreeNode, { type: "directory" }> =>
          node.type === "directory" && node.path === currentPath
      );
      if (!nextDir) {
        nextDir = { type: "directory", name, path: currentPath, children: [] };
        cursor.children.push(nextDir);
      }
      cursor = nextDir;
    }
  }

  const sortTree = (node: Extract<TreeNode, { type: "directory" }>) => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) {
      if (child.type === "directory") sortTree(child);
    }
  };
  sortTree(root);
  return root;
}

function grepFiles(files: ProjectFile[], input: {
  pattern: string;
  path?: string;
  glob?: string;
  outputMode?: "content" | "files_with_matches" | "count";
  before?: number;
  after?: number;
  context?: number;
  caseInsensitive?: boolean;
  headLimit?: number;
  multiline?: boolean;
}) {
  const flags = `${input.caseInsensitive ? "i" : ""}${input.multiline ? "s" : ""}g`;
  const regex = new RegExp(input.pattern, flags);
  const targetDir = input.path ? normalizeDir(input.path) : "";
  const outputMode = input.outputMode ?? "content";

  const matched: Array<{ path: string; lines: string[]; count: number }> = [];

  for (const file of files) {
    const path = normalizePath(file.path);
    if (targetDir && !path.startsWith(targetDir)) continue;
    if (input.glob && !globToRegExp(input.glob).test(path)) continue;

    const content = file.content;
    if (!regex.test(content)) continue;
    regex.lastIndex = 0;

    const lines = content.split("\n");
    const lineMatches: string[] = [];
    let count = 0;

    for (let i = 0; i < lines.length; i += 1) {
      if (!regex.test(lines[i] ?? "")) {
        regex.lastIndex = 0;
        continue;
      }
      regex.lastIndex = 0;
      count += 1;

      const radius = input.context ?? 0;
      const before = input.before ?? radius;
      const after = input.after ?? radius;
      const from = Math.max(0, i - before);
      const to = Math.min(lines.length - 1, i + after);

      for (let j = from; j <= to; j += 1) {
        lineMatches.push(`${j + 1}|${lines[j]}`);
      }
    }

    matched.push({ path, lines: Array.from(new Set(lineMatches)), count });
  }

  if (outputMode === "files_with_matches") {
    const filesOut = matched.map((m) => m.path);
    return input.headLimit ? filesOut.slice(0, input.headLimit) : filesOut;
  }

  if (outputMode === "count") {
    const counts = matched.map((m) => ({ path: m.path, count: m.count }));
    return input.headLimit ? counts.slice(0, input.headLimit) : counts;
  }

  const contentOut = matched.map((m) => ({ path: m.path, lines: m.lines }));
  return input.headLimit ? contentOut.slice(0, input.headLimit) : contentOut;
}

function lintVirtualFiles(files: ProjectFile[], paths?: string[]) {
  const pathSet = paths && paths.length > 0 ? new Set(paths.map((p) => normalizePath(p))) : null;
  const diagnostics: Array<{ path: string; severity: "error" | "warning"; message: string; line?: number }> = [];

  for (const file of files) {
    const path = normalizePath(file.path);
    if (pathSet && !pathSet.has(path)) continue;

    if (file.kind === "script") {
      try {
        new Function(file.content);
      } catch (error) {
        diagnostics.push({
          path,
          severity: "error",
          message: error instanceof Error ? error.message : "Script parse error",
        });
      }
    }

    if (file.kind === "config" && path.toLowerCase().endsWith(".json")) {
      try {
        JSON.parse(file.content);
      } catch (error) {
        diagnostics.push({
          path,
          severity: "error",
          message: error instanceof Error ? error.message : "JSON parse error",
        });
      }
    }

    if (/console\.log\(/.test(file.content)) {
      diagnostics.push({
        path,
        severity: "warning",
        message: "Found console.log; remove for production if unnecessary",
      });
    }
  }

  return diagnostics;
}

const GEMINI_MODEL = "gemini-2.5-flash-image";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function removeBg(imageBuffer: Buffer, mimeType: string): Promise<{ data: string; mimeType: string }> {
  const moduleName = "@imgly/background-removal-node";
  const dynamicImport = new Function("moduleName", "return import(moduleName);") as (
    name: string
  ) => Promise<unknown>;
  let removeBackgroundFn: ((input: Blob, options?: unknown) => Promise<Blob>) | null = null;

  try {
    const pkg = await dynamicImport(moduleName);
    const maybeFn = (pkg as { removeBackground?: unknown }).removeBackground;
    if (typeof maybeFn === "function") {
      removeBackgroundFn = maybeFn as (input: Blob, options?: unknown) => Promise<Blob>;
    }
  } catch {
    removeBackgroundFn = null;
  }

  if (!removeBackgroundFn) {
    throw new Error(
      "Background removal is unavailable. Install '@imgly/background-removal-node' to use removeBackground."
    );
  }

  const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
  const resultBlob = await removeBackgroundFn(blob, { model: "small", output: { format: "image/png" } });
  const arrayBuffer = await resultBlob.arrayBuffer();
  const b64 = Buffer.from(arrayBuffer).toString("base64");
  return { data: b64, mimeType: "image/png" };
}

async function generateImage(prompt: string, origin: string, shouldRemoveBg: boolean): Promise<{ url: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetch(`${GEMINI_API_URL}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
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
      let { mimeType, data: b64 } = part.inlineData as { mimeType: string; data: string };

      if (shouldRemoveBg) {
        const imageBuffer = Buffer.from(b64, "base64");
        const result = await removeBg(imageBuffer, mimeType);
        b64 = result.data;
        mimeType = result.mimeType;
      }

      const id = await storeImage(mimeType, b64);
      return { url: `${origin}/api/images/${id}` };
    }
  }

  throw new Error("Gemini response contained no image data");
}

export async function POST(req: Request) {
  const requestId = `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const body: unknown = await req.json();
    const parsed = body as {
      messages?: unknown;
      currentCode?: unknown;
      currentProjectFiles?: unknown;
      planningTodos?: unknown;
      mentionedFiles?: unknown;
      consoleLogs?: unknown;
      generatedImages?: unknown;
      audioTracks?: unknown;
      generatedMeshes?: unknown;
      modelChoice?: unknown;
      composerMode?: unknown;
      planningMode?: unknown;
      gameEngine?: unknown;
      templateSkills?: unknown;
    };

    const messages = parsed.messages;
    const currentCode = typeof parsed.currentCode === "string" ? parsed.currentCode : null;
    const currentProjectFiles = Array.isArray(parsed.currentProjectFiles)
      ? normalizeProjectFiles(parsed.currentProjectFiles as Array<Partial<ProjectFile>>)
      : [];
    const fileMap = toFileMap(currentProjectFiles);
    const planningTodos: PlanningTodoPayload[] = Array.isArray(parsed.planningTodos)
      ? parsed.planningTodos
          .filter((v): v is PlanningTodoPayload => {
            if (!v || typeof v !== "object") return false;
            const candidate = v as Partial<PlanningTodoPayload>;
            return (
              typeof candidate.id === "string" &&
              typeof candidate.content === "string" &&
              (candidate.status === "pending" ||
                candidate.status === "in_progress" ||
                candidate.status === "completed" ||
                candidate.status === "cancelled")
            );
          })
          .slice(-400)
      : [];
    const mentionedFiles = Array.isArray(parsed.mentionedFiles)
      ? parsed.mentionedFiles.filter((v): v is string => typeof v === "string" && v.length > 0)
      : [];
    const consoleLogs: ConsoleLogPayload[] = Array.isArray(parsed.consoleLogs)
      ? parsed.consoleLogs
          .filter((v): v is ConsoleLogPayload => {
            if (!v || typeof v !== "object") return false;
            const candidate = v as Partial<ConsoleLogPayload>;
            return (
              (candidate.level === "log" || candidate.level === "info" || candidate.level === "warn" || candidate.level === "error") &&
              (candidate.source === "console" || candidate.source === "error" || candidate.source === "unhandledrejection") &&
              typeof candidate.text === "string" &&
              typeof candidate.timestamp === "number"
            );
          })
          .slice(-120)
      : [];
    const generatedImages: GeneratedImagePayload[] = Array.isArray(parsed.generatedImages)
      ? parsed.generatedImages
          .filter((v): v is GeneratedImagePayload => {
            if (!v || typeof v !== "object") return false;
            const candidate = v as Partial<GeneratedImagePayload>;
            return typeof candidate.url === "string" && typeof candidate.prompt === "string";
          })
          .map((v) => ({ url: v.url, prompt: v.prompt }))
          .slice(-120)
      : [];
    const audioTracks: AudioTrackPayload[] = Array.isArray(parsed.audioTracks)
      ? parsed.audioTracks
          .filter((v): v is AudioTrackPayload => {
            if (!v || typeof v !== "object") return false;
            const candidate = v as Partial<AudioTrackPayload>;
            return (
              typeof candidate.id === "string" &&
              typeof candidate.name === "string" &&
              (candidate.type === "music" || candidate.type === "sfx") &&
              typeof candidate.description === "string" &&
              (candidate.status === "pending" || candidate.status === "ready" || candidate.status === "error") &&
              (typeof candidate.duration === "number" || candidate.duration === null)
            );
          })
          .slice(-240)
      : [];
    const generatedMeshes: GeneratedMeshPayload[] = Array.isArray(parsed.generatedMeshes)
      ? parsed.generatedMeshes
          .filter((v): v is GeneratedMeshPayload => {
            if (!v || typeof v !== "object") return false;
            const candidate = v as Partial<GeneratedMeshPayload>;
            return (
              typeof candidate.id === "string" &&
              typeof candidate.name === "string" &&
              typeof candidate.prompt === "string" &&
              (candidate.status === "pending" || candidate.status === "ready" || candidate.status === "error")
            );
          })
          .slice(-100)
      : [];
    const composerMode: ComposerMode = isComposerMode(parsed.composerMode)
      ? parsed.composerMode
      : parsed.planningMode === true
        ? "plan"
        : "agent";
    const modelChoice: ModelChoice = isModelChoice(parsed.modelChoice)
      ? parsed.modelChoice
      : "claude-sonnet-4-6";
    const planningMode = composerMode === "plan";
    const gameEngine: GameEngine = isGameEngine(parsed.gameEngine) ? parsed.gameEngine : "canvas2d";
    const templateSkills = typeof parsed.templateSkills === "string"
      ? parsed.templateSkills.slice(0, 4000) : null;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages array is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("[API] /api/chat request", {
      requestId,
      messageCount: messages.length,
      composerMode,
      modelChoice,
      gameEngine,
      projectFileCount: currentProjectFiles.length,
      generatedImageCount: generatedImages.length,
      mentionedFilesCount: mentionedFiles.length,
      incomingMessageSummary: summarizeIncomingMessages(messages).slice(-8),
    });

    const sanitizedMessages = sanitizeMessagesForModel(messages);
    const modelMessages = await convertToModelMessages(sanitizedMessages);

    const isXaiModel = modelChoice.startsWith("grok-");

    if (isXaiModel && !process.env.XAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: `XAI_API_KEY is required when modelChoice is '${modelChoice}'` }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const selectedModel = isXaiModel ? xai(modelChoice) : anthropic(modelChoice);

    console.log("[API] model message summary", {
      requestId,
      sanitizedCount: sanitizedMessages.length,
      modelMessageCount: modelMessages.length,
      modelRoles: modelMessages.map((m) => m.role),
    });

    const result = streamText({
      model: selectedModel,
      system: getSystemPrompt({
        currentCode,
        currentProjectFiles,
        mentionedFiles,
        consoleLogs,
        generatedImages,
        currentAudioTracks: audioTracks,
        currentMeshes: generatedMeshes,
        composerMode,
        gameEngine,
        planningMode,
        templateSkills,
      }),
      messages: modelMessages,
      activeTools: (
        (() => {
          const allTools = [
            "update_project_files",
            "patch_project_file",
            "update_sandbox",
            "update_controls",
            "multiplayer_partykit_scaffold",
            "generate_image",
            "generate_sound_effect",
            "generate_music",
            "todo_read",
            "list_audio_assets",
            "list_image_assets",
            "generate_mesh",
            "list_mesh_assets",
            "read_file",
            "list_dir",
            "dir_tree",
            "glob_file_search",
            "grep",
            "delete_file",
            "read_lints",
            "edit_file",
            "todo_write",
            "set_engine",
          ] as const;

          const mutatingTools = new Set<string>([
            "update_project_files",
            "patch_project_file",
            "update_sandbox",
            "delete_file",
            "edit_file",
          ]);

          if (composerMode === "agent" || composerMode === "debug") {
            return [...allTools];
          }

          if (composerMode === "plan") {
            return allTools.filter((name) => !mutatingTools.has(name));
          }

          return allTools.filter((name) => !mutatingTools.has(name));
        })()
      ),
      tools: {
        update_project_files: tool({
          description:
            "Create or update virtual project files. This is merge-based: unspecified files are preserved. Use deletePaths to remove files explicitly.",
          inputSchema: z.object({
            files: z.preprocess(
              parseJsonIfString,
              z.array(
                z.object({
                  path: z.string().min(1),
                  content: z.string(),
                  kind: z.enum(["html", "style", "script", "asset", "config", "other"]).optional(),
                })
              )
            ).default([]),
            deletePaths: z.preprocess(parseJsonIfString, z.array(z.string().min(1))).optional(),
          }),
          execute: async ({ files, deletePaths }) => {
            const normalized = normalizeProjectFiles(files);
            return { success: true, fileCount: normalized.length, deleteCount: deletePaths?.length ?? 0 };
          },
        }),
        patch_project_file: tool({
          description: "Patch an existing text file with targeted replacements.",
          inputSchema: z.object({
            path: z.string().min(1),
            edits: z.array(
              z.object({
                find: z.string().min(1),
                replace: z.string(),
                replaceAll: z.boolean().optional(),
              })
            ).min(1),
          }),
          execute: async ({ path, edits }) => ({ success: true, path, editCount: edits.length }),
        }),
        update_sandbox: tool({
          description: "Fallback single-file HTML update.",
          inputSchema: z.object({ code: z.string() }),
          execute: async ({ code }) => ({ success: true, codeLength: code.length }),
        }),
        update_controls: tool({
          description: "Publish game controls for the Controls panel.",
          inputSchema: z.object({
            controls: z.array(
              z.object({
                action: z.string().min(1),
                keys: z.string().min(1),
              })
            ).min(1).max(12),
          }),
          execute: async ({ controls }) => ({ success: true, count: controls.length }),
        }),
        multiplayer_partykit_scaffold: tool({
          description:
            "Return PartyKit multiplayer scaffold files and quick-start instructions. Use this first when adding multiplayer support.",
          inputSchema: z.object({
            roomType: z.string().min(1).optional(),
          }),
          execute: async ({ roomType }) => buildPartyKitScaffold(roomType ?? "game"),
        }),
        generate_image: tool({
          description:
            "Generate an image asset and return a URL. Call this before code updates when the game needs new visual assets.",
          inputSchema: z.object({
            prompt: z.string().min(1),
            removeBackground: z.boolean().default(false),
          }),
          execute: async ({ prompt, removeBackground: shouldRemoveBg }) => {
            try {
              const origin = new URL(req.url).origin;
              const { url } = await generateImage(prompt, origin, shouldRemoveBg);
              return { success: true, url, prompt };
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : "Image generation failed",
                prompt,
              };
            }
          },
        }),
        generate_sound_effect: tool({
          description:
            "Generate an AI sound effect from text. Returns a sound id/name and schedules async generation. Duration is clamped to 0.5-10 seconds.",
          inputSchema: z.object({
            prompt: z.string().min(1),
            name: z.string().min(1),
            duration: createDurationSchema(
              SFX_DURATION_MIN_SECONDS,
              SFX_DURATION_MAX_SECONDS,
              SFX_DURATION_DEFAULT_SECONDS,
            ),
          }),
          execute: async ({ prompt, name, duration }) => {
            try {
              scheduleGeneratedAudio({ kind: "sfx", name, prompt, duration });
              return { soundId: name, name, duration, status: "pending" };
            } catch (error) {
              await putSound(getGeneratedAudioId("sfx", name), {
                dataUrl: null,
                name,
                prompt,
                kind: "sfx",
                duration,
                status: "error",
                error: error instanceof Error ? error.message : "Sound generation setup failed",
                createdAt: Date.now(),
              });
              return { soundId: name, name, duration, status: "error" };
            }
          },
        }),
        generate_music: tool({
          description:
            "Generate instrumental background music from text. Returns a music id/name and schedules async generation. Duration is clamped to 10-120 seconds.",
          inputSchema: z.object({
            prompt: z.string().min(1),
            name: z.string().min(1),
            duration: createDurationSchema(
              MUSIC_DURATION_MIN_SECONDS,
              MUSIC_DURATION_MAX_SECONDS,
              MUSIC_DURATION_DEFAULT_SECONDS,
            ),
          }),
          execute: async ({ prompt, name, duration }) => {
            try {
              scheduleGeneratedAudio({ kind: "music", name, prompt, duration });
              return { musicId: name, name, duration, status: "pending" };
            } catch (error) {
              await putSound(getGeneratedAudioId("music", name), {
                dataUrl: null,
                name,
                prompt,
                kind: "music",
                duration,
                status: "error",
                error: error instanceof Error ? error.message : "Music generation setup failed",
                createdAt: Date.now(),
              });
              return { musicId: name, name, duration, status: "error" };
            }
          },
        }),
        todo_read: tool({
          description: "Read the current planning todo list. Use this before writing todos when unsure.",
          inputSchema: z.object({
            status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
            limit: z.number().int().positive().max(200).optional(),
          }),
          execute: async ({ status, limit }) => {
            const filtered = status ? planningTodos.filter((todo) => todo.status === status) : planningTodos;
            const items = typeof limit === "number" ? filtered.slice(0, limit) : filtered;
            return { count: items.length, todos: items };
          },
        }),
        list_audio_assets: tool({
          description: "List known generated audio tracks with descriptions and statuses.",
          inputSchema: z.object({
            status: z.enum(["pending", "ready", "error"]).optional(),
            type: z.enum(["music", "sfx"]).optional(),
            limit: z.number().int().positive().max(200).optional(),
          }),
          execute: async ({ status, type, limit }) => {
            let items = [...audioTracks];
            if (status) items = items.filter((track) => track.status === status);
            if (type) items = items.filter((track) => track.type === type);
            if (typeof limit === "number") items = items.slice(0, limit);
            return {
              count: items.length,
              tracks: items.map((track) => ({
                id: track.id,
                name: track.name,
                type: track.type,
                description: track.description,
                status: track.status,
                duration: track.duration,
                error: track.error ?? null,
              })),
            };
          },
        }),
        list_image_assets: tool({
          description: "List known generated image assets with prompt descriptions and URLs.",
          inputSchema: z.object({
            limit: z.number().int().positive().max(200).optional(),
          }),
          execute: async ({ limit }) => {
            const items = typeof limit === "number" ? generatedImages.slice(0, limit) : generatedImages;
            return {
              count: items.length,
              images: items.map((image, index) => ({
                id: `image:${index + 1}`,
                url: image.url,
                description: image.prompt,
              })),
            };
          },
        }),
        generate_mesh: tool({
          description:
            "Generate a textured 3D mesh model from a text description using the Meshy API. The mesh goes through two stages: geometry generation (preview) then automatic texturing (refine). Returns a mesh id/name and schedules async generation. The mesh will be available as a textured GLB file once both stages complete.",
          inputSchema: z.object({
            prompt: z.string().min(1).max(600),
            name: z.string().min(1),
            modelType: z.enum(["standard", "lowpoly"]).optional(),
          }),
          execute: async ({ prompt, name, modelType }) => {
            try {
              const key = process.env.MESHY_API_KEY;
              if (!key) throw new Error("MESHY_API_KEY is not set");

              const res = await fetch("https://api.meshy.ai/openapi/v2/text-to-3d", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${key}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  mode: "preview",
                  prompt,
                  ai_model: "latest",
                  ...(modelType ? { model_type: modelType } : {}),
                }),
              });

              if (!res.ok) {
                const text = await res.text();
                throw new Error(`Meshy API error (${res.status}): ${text}`);
              }

              const data = (await res.json()) as { result: string };
              const meshId = `mesh:${name}`;
              await putMesh(meshId, {
                name,
                prompt,
                status: "pending",
                meshyTaskId: data.result,
                refineTaskId: null,
                glbUrl: null,
                thumbnailUrl: null,
                artifactId: null,
                thumbnailArtifactId: null,
                createdAt: Date.now(),
              });

              return { meshId, name, status: "pending", meshyTaskId: data.result };
            } catch (error) {
              const meshId = `mesh:${name}`;
              await putMesh(meshId, {
                name,
                prompt,
                status: "error",
                meshyTaskId: "",
                refineTaskId: null,
                glbUrl: null,
                thumbnailUrl: null,
                artifactId: null,
                thumbnailArtifactId: null,
                error: error instanceof Error ? error.message : "Mesh generation failed",
                createdAt: Date.now(),
              });
              return { meshId, name, status: "error", error: error instanceof Error ? error.message : "Mesh generation failed" };
            }
          },
        }),
        list_mesh_assets: tool({
          description: "List known generated 3D mesh assets with prompt descriptions and statuses.",
          inputSchema: z.object({
            status: z.enum(["pending", "refining", "ready", "error"]).optional(),
            limit: z.number().int().positive().max(100).optional(),
          }),
          execute: async ({ status, limit }) => {
            let items = [...generatedMeshes];
            if (status) items = items.filter((mesh) => mesh.status === status);
            if (typeof limit === "number") items = items.slice(0, limit);
            return {
              count: items.length,
              meshes: items.map((mesh) => ({
                id: mesh.id,
                name: mesh.name,
                prompt: mesh.prompt,
                status: mesh.status,
                glbUrl: mesh.glbUrl,
                error: mesh.error ?? null,
              })),
            };
          },
        }),
        read_file: tool({
          description: "Read a virtual file with optional line slicing.",
          inputSchema: z.object({
            targetFile: z.string().min(1),
            offset: z.number().int().positive().optional(),
            limit: z.number().int().positive().optional(),
          }),
          execute: async ({ targetFile, offset, limit }) => {
            const file = fileMap.get(normalizePath(targetFile));
            if (!file) return { found: false, targetFile };
            return {
              found: true,
              targetFile,
              kind: file.kind,
              content: numberedSlice(file.content, offset, limit),
            };
          },
        }),
        list_dir: tool({
          description: "List files and subdirectories in a virtual directory.",
          inputSchema: z.object({
            targetDirectory: z.string(),
            ignoreGlobs: z.array(z.string()).optional(),
          }),
          execute: async ({ targetDirectory, ignoreGlobs }) => ({
            targetDirectory,
            entries: listDirEntries(currentProjectFiles, targetDirectory, ignoreGlobs),
          }),
        }),
        dir_tree: tool({
          description: "Return a nested directory tree for virtual files.",
          inputSchema: z.object({
            targetDirectory: z.string().optional(),
          }),
          execute: async ({ targetDirectory }) => ({
            targetDirectory: targetDirectory ?? "",
            tree: buildDirTree(currentProjectFiles, targetDirectory ?? ""),
          }),
        }),
        glob_file_search: tool({
          description: "Find virtual files matching a glob pattern.",
          inputSchema: z.object({
            globPattern: z.string().min(1),
            targetDirectory: z.string().optional(),
          }),
          execute: async ({ globPattern, targetDirectory }) => {
            const re = globToRegExp(globPattern);
            const dir = targetDirectory ? normalizeDir(targetDirectory) : "";
            const files = currentProjectFiles
              .map((file) => normalizePath(file.path))
              .filter((path) => (!dir || path.startsWith(dir)) && re.test(path));
            return { globPattern, targetDirectory: targetDirectory ?? "", files };
          },
        }),
        grep: tool({
          description: "Search virtual files with a regex pattern.",
          inputSchema: z.object({
            pattern: z.string().min(1),
            path: z.string().optional(),
            glob: z.string().optional(),
            outputMode: z.enum(["content", "files_with_matches", "count"]).optional(),
            before: z.number().int().nonnegative().optional(),
            after: z.number().int().nonnegative().optional(),
            context: z.number().int().nonnegative().optional(),
            caseInsensitive: z.boolean().optional(),
            headLimit: z.number().int().positive().optional(),
            multiline: z.boolean().optional(),
          }),
          execute: async (input) => ({ results: grepFiles(currentProjectFiles, input) }),
        }),
        delete_file: tool({
          description: "Delete a virtual file from the project.",
          inputSchema: z.object({ targetFile: z.string().min(1) }),
          execute: async ({ targetFile }) => ({ success: true, targetFile }),
        }),
        read_lints: tool({
          description: "Run lightweight lint checks on virtual files and return diagnostics.",
          inputSchema: z.object({ paths: z.array(z.string()).optional() }),
          execute: async ({ paths }) => ({ diagnostics: lintVirtualFiles(currentProjectFiles, paths) }),
        }),
        edit_file: tool({
          description: "Safely edit one virtual file using context matching on oldString.",
          inputSchema: z.object({
            targetFile: z.string().min(1),
            oldString: z.string(),
            newString: z.string(),
            replaceAll: z.boolean().optional(),
            createIfMissing: z.boolean().optional(),
          }),
          execute: async ({ targetFile, oldString, newString, replaceAll, createIfMissing }) => ({
            success: true,
            targetFile,
            oldLength: oldString.length,
            newLength: newString.length,
            replaceAll: replaceAll ?? false,
            createIfMissing: createIfMissing ?? false,
          }),
        }),
        todo_write: tool({
          description:
            "Create or update planning todos. Input must be an object with keys merge:boolean and todos:array.",
          inputSchema: z.object({
            merge: z.boolean(),
            todos: z.array(
              z.object({
                id: z.string().min(1),
                content: z.string().min(1),
                status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
              })
            ).min(1),
          }),
          execute: async ({ merge, todos }) => ({ success: true, merge, count: todos.length }),
        }),
        set_engine: tool({
          description:
            "Switch the rendering engine. Call once before generating code on the first message if the best engine differs from the current one.",
          inputSchema: z.object({
            engine: z.enum(["canvas2d", "phaser", "threejs"]),
            reason: z.string().optional(),
          }),
          execute: async ({ engine, reason }) => ({
            success: true,
            engine,
            label: engine === "threejs" ? "Three.js / WebGL" : engine === "phaser" ? "Phaser.js" : "HTML5 Canvas",
            reason: reason ?? null,
          }),
        }),
      },
      providerOptions: {
        anthropic: {
          thinking: { type: "enabled", budgetTokens: 10000 },
        },
      },
      stopWhen: stepCountIs(composerMode === "plan" ? 3 : 5),
      onStepFinish: (step) => {
        const toolCalls = (step.toolCalls ?? []).map((call) => ({
          toolName: call.toolName,
          inputType: typeof call.input,
          inputPreview: safeJsonPreview(call.input, 220),
        }));

        console.log("[API] step finish", {
          requestId,
          finishReason: step.finishReason,
          usage: step.usage,
          textPreview: safeJsonPreview(step.text?.slice(0, 180), 220),
          toolCallCount: toolCalls.length,
          toolCalls,
        });
      },
      onError: ({ error }) => {
        console.error("[API] streamText error", {
          requestId,
          ...extractErrorDetails(error),
        });
      },
    });

    return result.toUIMessageStreamResponse({ sendReasoning: true });
  } catch (error) {
    console.error("[API] /api/chat unhandled error", {
      requestId,
      ...extractErrorDetails(error),
    });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
