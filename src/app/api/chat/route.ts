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

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    const parsed = body as {
      messages?: unknown;
      currentCode?: unknown;
      currentProjectFiles?: unknown;
      mentionedFiles?: unknown;
      planningMode?: unknown;
      gameEngine?: unknown;
    };

    const messages = parsed.messages;
    const currentCode = typeof parsed.currentCode === "string" ? parsed.currentCode : null;
    const currentProjectFiles = Array.isArray(parsed.currentProjectFiles)
      ? normalizeProjectFiles(parsed.currentProjectFiles as Array<Partial<ProjectFile>>)
      : [];
    const fileMap = toFileMap(currentProjectFiles);
    const mentionedFiles = Array.isArray(parsed.mentionedFiles)
      ? parsed.mentionedFiles.filter((v): v is string => typeof v === "string" && v.length > 0)
      : [];
    const planningMode = parsed.planningMode === true;
    const gameEngine: GameEngine = isGameEngine(parsed.gameEngine) ? parsed.gameEngine : "canvas2d";

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages array is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sanitizedMessages = sanitizeMessagesForModel(messages);
    const modelMessages = await convertToModelMessages(sanitizedMessages);

    const result = streamText({
      model: anthropic("claude-sonnet-4-6"),
      system: getSystemPrompt({ currentCode, currentProjectFiles, mentionedFiles, gameEngine, planningMode }),
      messages: modelMessages,
      tools: {
        update_project_files: tool({
          description:
            "Create or update virtual project files. This is merge-based: unspecified files are preserved. Use deletePaths to remove files explicitly.",
          inputSchema: z.object({
            files: z.array(
              z.object({
                path: z.string().min(1),
                content: z.string(),
                kind: z.enum(["html", "style", "script", "asset", "config", "other"]).optional(),
              })
            ).default([]),
            deletePaths: z.array(z.string().min(1)).optional(),
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
          description: "Create or update planning todos.",
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
      },
      providerOptions: {
        anthropic: {
          thinking: { type: "enabled", budgetTokens: 10000 },
        },
      },
      stopWhen: stepCountIs(5),
      onError: ({ error }) => {
        console.error("[API] streamText error:", error);
      },
    });

    return result.toUIMessageStreamResponse({ sendReasoning: true });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
