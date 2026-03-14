"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useState, useEffect, useRef, useMemo, useCallback, memo, type FormEvent, type KeyboardEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mention, MentionsInput } from "react-mentions";
import type { GameEngine } from "@/lib/game-engine";
import type { ProjectFile } from "@/lib/project-files";
import type { PlanningTodo, ConsoleLogEntry, GeneratedImage, PendingFileWrite, GameControl, AudioTrack } from "@/lib/game-forge-context";
import { getGeneratedAudioId } from "@/lib/generated-audio";
import { useWaveformData, AudioWaveform, useAudioPlayback } from "@/components/audio-waveform";
import type { PersistedChatMessage } from "@/lib/db/schema";
import { TemplateGallery } from "@/components/template-gallery";
import type { GameTemplate } from "@/lib/game-templates";

interface ChatPanelProps {
  currentCode: string | null;
  currentEngine: GameEngine;
  projectFiles: ProjectFile[];
  pendingFileWrites: PendingFileWrite[];
  planningTodos: PlanningTodo[];
  consoleLogs: ConsoleLogEntry[];
  generatedImages: GeneratedImage[];
  audioTracks: AudioTrack[];
  onCodeUpdate: (code: string, engine?: GameEngine) => void;
  onProjectFilesUpdate: (files: ProjectFile[], engine?: GameEngine, deletePaths?: string[]) => void;
  patchProjectFiles: (files: ProjectFile[], engine?: GameEngine) => void;
  patchProjectFileContent: (
    path: string,
    edits: Array<{ find: string; replace: string; replaceAll?: boolean }>
  ) => void;
  editProjectFile: (args: {
    targetFile: string;
    oldString: string;
    newString: string;
    replaceAll?: boolean;
    createIfMissing?: boolean;
  }) => boolean;
  deleteProjectFile: (path: string) => void;
  writePlanningTodos: (merge: boolean, todos: PlanningTodo[]) => void;
  onEngineUpdate: (engine: GameEngine) => void;
  addImage: (image: GeneratedImage) => void;
  addAudioTrack: (track: AudioTrack) => void;
  setControls: (controls: GameControl[]) => void;
  chatMessages: PersistedChatMessage[];
  chatSessionId: string;
  setChatMessages: (messages: PersistedChatMessage[]) => void;
  focusCodeFile: (path: string) => void;
  focusConsolePanel: () => void;
  focusImagesPanel: () => void;
  focusAudioPanel: () => void;
  setPendingFileWrites: (
    entries: Array<{ path: string; status: "streaming" | "finalizing"; content?: string }>
  ) => void;
  clearPendingFileWrites: (paths?: string[]) => void;
  setRepromptAudioHandler: (handler: ((message: string) => void) | null) => void;
  setStreamingCode: (code: string | null) => void;
}

type ComposerMode = "agent" | "plan" | "debug" | "ask";


function toMentionSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function inferEngineFromPrompt(prompt: string): GameEngine {
  const text = prompt.toLowerCase();
  const phaserSignals = [
    "phaser",
    "phaserjs",
    "phaser.js",
    "phaser 3",
    "phaser3",
    "arcade physics",
  ];
  if (phaserSignals.some((token) => text.includes(token))) return "phaser";
  const threeSignals = [
    "three.js",
    "threejs",
    "3d",
    "webgl",
    "mesh",
    "orbit",
    "camera",
    "scene",
    "renderer",
    "gltf",
    "obj",
  ];
  return threeSignals.some((token) => text.includes(token)) ? "threejs" : "canvas2d";
}

function isStableProjectPath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  const value = path.trim();
  if (!value) return false;
  if (value.startsWith("/") || value.startsWith("./") || value.includes("\\")) return false;
  if (value.endsWith(".") || value.includes("//")) return false;
  return true;
}

function hasMeaningfulContent(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

type GenerationPhase = "connecting" | "thinking" | "coding" | "executing" | "done";

const PHASE_MESSAGES: Record<"connecting" | "coding" | "executing", readonly string[]> = {
  connecting: [
    "Booting up the dev environment...",
    "Warming up the GPU...",
    "Loading game engine...",
    "Initializing the pixel forge...",
    "Dusting off the pixel art...",
  ],
  coding: [
    "Writing game loop...",
    "Spawning player entity...",
    "Wiring up the controls...",
    "Compiling shaders...",
    "Building the assets...",
    "Setting up collision detection...",
    "Laying out the HUD...",
    "Tuning the frame rate...",
  ],
  executing: [
    "Rendering first frame...",
    "Running smoke tests...",
    "Calibrating physics engine...",
    "Loading assets into VRAM...",
    "Pressing START...",
  ],
};

const PHASE_LABELS: Record<"connecting" | "coding" | "executing", string> = {
  connecting: "CONNECTING",
  coding: "CODING",
  executing: "EXECUTING",
};

function getGenerationPhase(
  status: string,
  messages: Array<{ role: string; parts: Array<{ type: string; state?: string }> }>
): GenerationPhase {
  if (status === "ready" || status === "error") return "done";
  if (status === "submitted") return "connecting";

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return "thinking";

  const toolParts = lastAssistant.parts.filter((p) =>
    p.type.startsWith("tool-") || p.type === "dynamic-tool"
  );

  if (toolParts.length === 0) return "thinking";

  const lastTool = toolParts[toolParts.length - 1];
  const state = lastTool.state;

  if (state === "input-streaming") return "coding";
  if (state === "input-available") return "executing";
  if (state === "output-available") return "done";

  return "thinking";
}

function useElapsedTimer(isActive: boolean) {
  const startRef = useRef(0);
  const [display, setDisplay] = useState("0:00");

  useEffect(() => {
    if (!isActive) return;
    startRef.current = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const m = Math.floor(elapsed / 60000);
      const s = Math.floor((elapsed % 60000) / 1000);
      setDisplay(`${m}:${String(s).padStart(2, "0")}`);
    }, 100);
    return () => clearInterval(interval);
  }, [isActive]);

  return display;
}

function useRotatingMessage(phase: GenerationPhase, isActive: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isActive || phase === "done" || phase === "thinking") return;
    const interval = setInterval(() => {
      setCount((prev) => prev + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, [phase, isActive]);

  if (phase === "done" || phase === "thinking") return "";
  const msgs = PHASE_MESSAGES[phase];
  return msgs[count % msgs.length];
}

function useComposerAutoHeight(
  inputRef: { current: HTMLTextAreaElement | null },
  value: string
) {
  useEffect(() => {
    const inputEl = inputRef.current;
    if (!inputEl) return;
    const rootEl = inputEl.parentElement as HTMLDivElement | null;
    const highlighter = rootEl?.querySelector<HTMLDivElement>(".composer-mentions__highlighter") ?? null;

    inputEl.style.height = "auto";
    if (rootEl) rootEl.style.height = "auto";
    const nextHeight = Math.max(34, Math.min(inputEl.scrollHeight, 150));
    inputEl.style.height = `${nextHeight}px`;
    inputEl.style.overflowY = inputEl.scrollHeight > 150 ? "auto" : "hidden";
    if (rootEl) {
      rootEl.style.height = `${nextHeight}px`;
    }
    if (highlighter) {
      highlighter.style.height = `${nextHeight}px`;
    }
  }, [inputRef, value]);
}

function isMentionQueryActive(value: string, cursor: number) {
  const beforeCursor = value.slice(0, cursor);
  return /(?:^|\s)@([a-zA-Z0-9_./:-]*)$/.test(beforeCursor);
}

function getMentionAtCursor(text: string, cursor: number) {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const left = text.slice(0, safeCursor);
  const right = text.slice(safeCursor);
  const leftToken = left.match(/@([^\s@]+)$/);
  if (!leftToken) return null;
  const rightToken = right.match(/^([^\s@]*)/);
  const token = `${leftToken[1] ?? ""}${rightToken?.[1] ?? ""}`.trim();
  if (!token) return null;
  return `@${token}`;
}

function normalizeMentionToken(raw: string) {
  const token = raw.replace(/^@/, "").trim();
  if (!token) return null;
  if (token.toLowerCase() === "console") return { kind: "console" as const, value: "console" };
  if (token.toLowerCase().startsWith("image:")) {
    return { kind: "images" as const, value: token };
  }
  if (token.toLowerCase().startsWith("audio:")) {
    return { kind: "audio" as const, value: token };
  }
  if (token.toLowerCase().startsWith("code:")) {
    const path = token.slice(5).trim();
    if (!path) return null;
    return { kind: "file" as const, value: path };
  }
  const normalized = token.toLowerCase().startsWith("file:") ? token.slice(5) : token;
  if (!normalized) return null;
  return { kind: "file" as const, value: normalized };
}

const MemoizedMarkdown = memo(function MemoizedMarkdown({ content }: { content: string }) {
  return <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>;
});

function StreamingText({ content }: { content: string }) {
  return (
    <span className="whitespace-pre-wrap">
      {content}
      <span className="streaming-cursor" />
    </span>
  );
}

function ThinkingIndicator({ timer }: { timer: string }) {
  return (
    <div
      className="mx-1 my-2 border border-[var(--color-border-light)] bg-[var(--color-surface)] overflow-hidden"
      style={{ animation: "fadeIn 0.3s ease-out" }}
    >
      <div className="h-[2px] w-full bg-[var(--color-accent)] opacity-20" />
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 bg-[var(--color-text-muted)] rounded-full"
                  style={{
                    animation: `pulseGlow 1.4s ease-in-out ${i * 0.25}s infinite`,
                  }}
                />
              ))}
            </div>
            <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.15em] font-bold">
              THINKING
            </span>
          </div>
          <span className="text-[10px] text-[var(--color-text-muted)] font-mono tabular-nums">
            {timer}
          </span>
        </div>
      </div>
    </div>
  );
}

function StreamingIndicator({ phase, timer, message }: {
  phase: "connecting" | "coding" | "executing";
  timer: string;
  message: string;
}) {
  return (
    <div
      className="mx-1 my-2 border border-[var(--color-border-light)] bg-[var(--color-surface)] overflow-hidden"
      style={{ animation: "fadeIn 0.3s ease-out" }}
    >
      <div className="h-[2px] w-full bg-[var(--color-accent)] opacity-40" />

      <div className="px-3 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 bg-[var(--color-accent)] rounded-full"
                  style={{
                    animation: `pulseGlow 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
            <span className="text-[10px] text-[var(--color-accent)] uppercase tracking-[0.15em] font-bold">
              {PHASE_LABELS[phase]}
            </span>
          </div>
          <span className="text-[10px] text-[var(--color-text-muted)] font-mono tabular-nums">
            {timer}
          </span>
        </div>

        <p
          key={message}
          className="text-[11px] text-[var(--color-text-secondary)] italic"
          style={{ animation: "messageFade 3s ease-in-out" }}
        >
          {message}
        </p>
      </div>
    </div>
  );
}

function GeneratedAudioPlayer({
  audioName,
  audioKind,
  audioTrack,
}: {
  audioName: string;
  audioKind: "sfx" | "music";
  audioTrack?: AudioTrack;
}) {
  const status = audioTrack?.status ?? "pending";
  const dataUrl = audioTrack?.dataUrl ?? null;
  const errorText = audioTrack?.error ?? null;
  const duration = audioTrack?.duration ?? null;
  const peaks = useWaveformData(status === "ready" ? dataUrl : null, 48);
  const { isPlaying, progress, togglePlayback, seek } = useAudioPlayback(
    status === "ready" ? dataUrl : null
  );

  return (
    <div className="px-3 py-2 border-t border-[var(--color-border)] bg-[var(--color-bg)]">
      <div className="flex items-center gap-2">
        {status === "pending" ? (
          <svg width="14" height="14" viewBox="0 0 14 14" className="animate-spin text-[var(--color-accent)] shrink-0">
            <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="24" strokeLinecap="round" />
          </svg>
        ) : status === "ready" ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); togglePlayback(); }}
            className="gf-btn-chip w-6 h-6 shrink-0 flex items-center justify-center border border-[var(--color-border-light)] bg-[var(--color-surface-light)] text-[var(--color-accent)]"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect x="1.5" y="1" width="2.5" height="8" rx="0.5" />
                <rect x="6" y="1" width="2.5" height="8" rx="0.5" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M2.5 1l6 4-6 4z" />
              </svg>
            )}
          </button>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--color-danger)" strokeWidth="1.5" className="shrink-0">
            <circle cx="7" cy="7" r="5.5" />
            <path d="M5 5l4 4M9 5l-4 4" />
          </svg>
        )}

        {status === "ready" && peaks ? (
          <div className="flex-1 min-w-0">
            <AudioWaveform peaks={peaks} progress={progress} onSeek={seek} />
          </div>
        ) : (
          <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.1em] truncate flex-1">
            {audioKind === "music" ? "Music" : "SFX"}: {audioName}{status === "pending" ? " — generating..." : ""}
          </span>
        )}

        {status === "ready" && duration != null && (
          <span className="text-[9px] text-[var(--color-text-muted)] tabular-nums shrink-0">
            {Math.round(duration * 10) / 10}s
          </span>
        )}
      </div>
      {status === "error" && errorText && (
        <p className="mt-1 text-[10px] text-[var(--color-danger)]">{errorText}</p>
      )}
    </div>
  );
}

function ToolCallCard({ part, audioTrack, compact, hideAudio }: {
  part: {
    type: string;
    state?: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
  };
  audioTrack?: AudioTrack;
  compact?: boolean;
  hideAudio?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const rawToolName = part.type.replace("tool-", "");
  const toolName = rawToolName.toUpperCase().replace(/_/g, "_");
  const state = part.state;
  const input = part.input ?? {};
  const isAudioTool = rawToolName === "generate_sound_effect" || rawToolName === "generate_music";
  const audioKind: "sfx" | "music" = rawToolName === "generate_music" ? "music" : "sfx";
  const audioName = typeof input.name === "string" ? input.name : null;
  const audioId = audioName ? getGeneratedAudioId(audioKind, audioName) : null;

  const summarizeToolChange = () => {
    if (rawToolName === "patch_project_file") {
      const path = typeof input.path === "string" ? input.path : null;
      const edits = Array.isArray(input.edits) ? input.edits.length : 0;
      return path ? `${path} (${edits} edit${edits === 1 ? "" : "s"})` : `${edits} patch edits`;
    }

    if (rawToolName === "update_project_files") {
      const files = Array.isArray(input.files) ? input.files : [];
      const deletePaths = Array.isArray(input.deletePaths) ? input.deletePaths : [];
      const labels = files
        .map((file) => (file && typeof file === "object" ? (file as { path?: unknown }).path : null))
        .filter((path): path is string => typeof path === "string" && path.length > 0)
        .slice(0, 3);
      const addMore = files.length > labels.length ? ` +${files.length - labels.length} more` : "";
      const deleteText = deletePaths.length > 0 ? `, ${deletePaths.length} deleted` : "";
      return labels.length > 0 ? `${labels.join(", ")}${addMore}${deleteText}` : `${files.length} files${deleteText}`;
    }

    if (rawToolName === "edit_file") {
      const targetFile = typeof input.targetFile === "string" ? input.targetFile : null;
      const replaceAll = input.replaceAll === true ? " (replace all)" : "";
      return targetFile ? `${targetFile}${replaceAll}` : "single file edit";
    }

    if (rawToolName === "delete_file") {
      const targetFile = typeof input.targetFile === "string" ? input.targetFile : null;
      return targetFile ? `Deleted ${targetFile}` : "Deleted file";
    }

    if (rawToolName === "todo_write") {
      const todos = Array.isArray(input.todos) ? input.todos.length : 0;
      return `${todos} planning todo${todos === 1 ? "" : "s"} updated`;
    }

    if (rawToolName === "todo_read") {
      const status = typeof input.status === "string" ? input.status : "all";
      return `Read planning todos (${status})`;
    }

    if (rawToolName === "update_sandbox") {
      const code = typeof input.code === "string" ? input.code : "";
      return `Sandbox HTML (${code.length.toLocaleString()} chars)`;
    }

    if (rawToolName === "generate_image") {
      const prompt = typeof input.prompt === "string" ? input.prompt : "";
      const success = part.output?.success === true;
      if (success) return `Image generated: ${prompt || "asset"}`;
      return `Image generation requested: ${prompt || "asset"}`;
    }

    if (rawToolName === "update_controls") {
      const controls = Array.isArray(input.controls) ? input.controls.length : 0;
      return `${controls} control${controls === 1 ? "" : "s"} updated`;
    }

    return null;
  };

  const changeSummary = summarizeToolChange();

  let statusText: string;
  let statusColor: string;

  if (state === "input-streaming") {
    statusText = "Preparing tool payload...";
    statusColor = "var(--color-accent)";
  } else if (state === "output-error") {
    statusText = (part as { errorText?: string }).errorText ?? "Tool execution failed";
    statusColor = "var(--color-danger)";
  } else if (state === "input-available" || state === "output-available") {
    statusText = changeSummary ?? "Tool update complete";
    statusColor = "var(--color-success)";
  } else {
    statusText = "Preparing...";
    statusColor = "var(--color-text-muted)";
  }

  const isToolExpanded = isExpanded || state === "input-streaming";

  const detailText = useMemo(() => {
    const chunks: string[] = [];
    if (part.input && Object.keys(part.input).length > 0) {
      chunks.push(`INPUT\n${JSON.stringify(part.input, null, 2)}`);
    }
    if (part.output && Object.keys(part.output).length > 0) {
      chunks.push(`OUTPUT\n${JSON.stringify(part.output, null, 2)}`);
    }
    return chunks.join("\n\n");
  }, [part.input, part.output]);

  return (
    <div
      className={compact ? "" : "mx-1 my-2 border border-[var(--color-border-light)] bg-[var(--color-surface)] overflow-hidden"}
      style={compact ? undefined : { animation: "fadeIn 0.2s ease-out" }}
    >
      {!compact && (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="w-full px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface-light)] flex items-center gap-2 text-left"
          aria-label={isToolExpanded ? "Collapse tool details" : "Expand tool details"}
        >
          <span className="tool-chevron text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <span className={isToolExpanded ? "is-open" : ""}>▸</span>
          </span>
          <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-[0.15em] font-bold">
            Tool
          </span>
          <span className="text-[10px] text-[var(--color-accent)] uppercase tracking-[0.1em] font-bold">
            {toolName}
          </span>
        </button>
      )}
      <div className="px-3 py-2 flex items-center gap-2">
        <span style={{ color: statusColor }}>
          {state === "input-streaming" ? (
            <svg width="10" height="10" viewBox="0 0 10 10" className="animate-spin">
              <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="18" strokeLinecap="round" />
            </svg>
          ) : (
            <span className="text-[10px]">&#9654;</span>
          )}
        </span>
        <span className="text-[11px]" style={{ color: statusColor }}>
          {statusText}
        </span>
      </div>
      <div className={`tool-collapsible ${isToolExpanded ? "is-expanded" : "is-collapsed"}`}>
        <div className="tool-collapsible-inner">
          <div className="mx-3 mb-2 max-h-[100px] overflow-auto border border-[var(--color-border)] bg-[var(--color-bg)]">
            <pre className="px-2 py-1.5 text-[10px] text-[var(--color-text-muted)] whitespace-pre-wrap break-words">
              {detailText || "No detailed payload."}
            </pre>
          </div>
        </div>
      </div>
      {!hideAudio && isAudioTool && (state === "output-available" || state === "output-error") && audioId && audioName ? (
        <GeneratedAudioPlayer
          audioName={audioName}
          audioKind={audioKind}
          audioTrack={audioTrack}
        />
      ) : null}
    </div>
  );
}

function ReasoningBlock({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  const [isOpen, setIsOpen] = useState(isStreaming);

  return (
    <div
      className="reasoning-block mx-1 my-2 border border-[var(--color-border-light)] bg-[var(--color-surface)] overflow-hidden group"
      style={{ animation: "fadeIn 0.2s ease-out" }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-3 py-1.5 cursor-pointer select-none flex items-center gap-2 bg-[var(--color-surface-light)] text-left"
      >
        <span className={`reasoning-chevron text-[10px] text-[var(--color-text-muted)] ${isOpen ? "is-open" : ""}`}>▸</span>
        <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-[0.15em] font-bold">
          Reasoning
        </span>
        {isStreaming && (
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1 h-1 bg-[var(--color-accent)] rounded-full"
                style={{
                  animation: `pulseGlow 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        )}
      </button>
      <div className={`reasoning-content ${isOpen ? "is-open" : "is-closed"}`}>
        <div className="reasoning-content-inner max-h-[200px] overflow-y-auto border-t border-[var(--color-border)]">
          <p className="text-[11px] text-[var(--color-text-muted)] italic whitespace-pre-wrap leading-relaxed">
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}

type ToolPartType = {
  type: string;
  state?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
};

function getToolStatusDot(state?: string) {
  if (state === "input-streaming") return "var(--color-accent)";
  if (state === "output-error") return "var(--color-danger)";
  if (state === "input-available" || state === "output-available") return "var(--color-success)";
  return "var(--color-text-muted)";
}

function getToolSummaryShort(rawToolName: string, input: Record<string, unknown>) {
  if (rawToolName === "update_sandbox") {
    const code = typeof input.code === "string" ? input.code : "";
    return `${code.length.toLocaleString()} chars`;
  }
  if (rawToolName === "update_project_files") {
    const files = Array.isArray(input.files) ? input.files : [];
    return `${files.length} file${files.length === 1 ? "" : "s"}`;
  }
  if (rawToolName === "patch_project_file") {
    const path = typeof input.path === "string" ? input.path : null;
    return path || "patch";
  }
  if (rawToolName === "edit_file") {
    const targetFile = typeof input.targetFile === "string" ? input.targetFile : null;
    return targetFile || "edit";
  }
  if (rawToolName === "generate_image") {
    const prompt = typeof input.prompt === "string" ? input.prompt : "";
    return prompt.slice(0, 40) || "image";
  }
  if (rawToolName === "generate_sound_effect" || rawToolName === "generate_music") {
    const name = typeof input.name === "string" ? input.name : "";
    return name || (rawToolName === "generate_music" ? "music" : "sfx");
  }
  if (rawToolName === "todo_write") {
    const todos = Array.isArray(input.todos) ? input.todos.length : 0;
    return `${todos} task${todos === 1 ? "" : "s"}`;
  }
  if (rawToolName === "update_controls") {
    const controls = Array.isArray(input.controls) ? input.controls.length : 0;
    return `${controls} control${controls === 1 ? "" : "s"}`;
  }
  if (rawToolName === "delete_file") {
    const targetFile = typeof input.targetFile === "string" ? input.targetFile : "";
    return targetFile || "file";
  }
  return null;
}

function ToolCallGroupRow({ part, audioTrackById }: {
  part: ToolPartType;
  audioTrackById: Map<string, AudioTrack>;
}) {
  const isActive = part.state === "input-streaming" || part.state === "input-available";
  const [isOpen, setIsOpen] = useState(isActive);
  const rawToolName = part.type.replace("tool-", "");
  const toolName = rawToolName.toUpperCase().replace(/_/g, "_");
  const input = part.input ?? {};
  const summary = getToolSummaryShort(rawToolName, input);
  const isAudioTool = rawToolName === "generate_sound_effect" || rawToolName === "generate_music";
  const audioKind: "sfx" | "music" = rawToolName === "generate_music" ? "music" : "sfx";
  const audioName = isAudioTool && typeof input.name === "string" ? input.name : null;
  const audioId = audioName ? getGeneratedAudioId(audioKind, audioName) : null;
  const audioTrack = audioId ? audioTrackById.get(audioId) : undefined;
  const showOpen = isOpen || isActive;

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="gf-list-row w-full px-3 py-1.5 flex items-center gap-2 text-left"
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: getToolStatusDot(part.state) }}
        />
        <span className="text-[10px] text-[var(--color-accent)] uppercase tracking-wider font-bold shrink-0">
          {toolName}
        </span>
        {summary && (
          <span className="text-[10px] text-[var(--color-text-muted)] truncate">
            {summary}
          </span>
        )}
        <span className="ml-auto tool-chevron text-[9px] text-[var(--color-text-muted)] shrink-0">
          <span className={showOpen ? "is-open" : ""}>▸</span>
        </span>
      </button>
      {isAudioTool && (part.state === "output-available" || part.state === "output-error") && audioId && audioName && (
        <div className="px-3 pb-1">
          <GeneratedAudioPlayer audioName={audioName} audioKind={audioKind} audioTrack={audioTrack} />
        </div>
      )}
      {showOpen && (
        <div className="border-t border-[var(--color-border)]">
          <ToolCallCard part={part} audioTrack={audioTrack} compact hideAudio />
        </div>
      )}
    </div>
  );
}

function ToolCallGroup({ parts, audioTrackById }: {
  parts: ToolPartType[];
  audioTrackById: Map<string, AudioTrack>;
}) {
  if (parts.length === 1) {
    const part = parts[0]!;
    const rawToolName = part.type.replace("tool-", "");
    const isAudioTool = rawToolName === "generate_sound_effect" || rawToolName === "generate_music";
    const audioName = isAudioTool && typeof part.input?.name === "string" ? part.input.name : null;
    const audioKind: "sfx" | "music" = rawToolName === "generate_music" ? "music" : "sfx";
    const audioId = audioName ? getGeneratedAudioId(audioKind, audioName) : null;
    return <ToolCallCard part={part} audioTrack={audioId ? audioTrackById.get(audioId) : undefined} />;
  }

  return (
    <div
      className="mx-1 my-2 border border-[var(--color-border-light)] bg-[var(--color-surface)] overflow-hidden"
      style={{ animation: "fadeIn 0.2s ease-out" }}
    >
      <div className="px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface-light)] flex items-center gap-2">
        <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-[0.15em] font-bold">
          Tools
        </span>
        <span className="text-[10px] text-[var(--color-accent)] uppercase tracking-[0.1em] font-bold">
          {parts.length}
        </span>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {parts.map((part, i) => (
          <ToolCallGroupRow key={i} part={part} audioTrackById={audioTrackById} />
        ))}
      </div>
    </div>
  );
}

export function ChatPanel({
  currentCode,
  currentEngine,
  projectFiles,
  pendingFileWrites,
  planningTodos,
  consoleLogs,
  generatedImages,
  audioTracks,
  onCodeUpdate,
  onProjectFilesUpdate,
  patchProjectFiles,
  patchProjectFileContent,
  editProjectFile,
  deleteProjectFile,
  writePlanningTodos,
  onEngineUpdate,
  addImage,
  addAudioTrack,
  setControls,
  chatMessages,
  chatSessionId,
  setChatMessages,
  focusCodeFile,
  focusConsolePanel,
  focusImagesPanel,
  focusAudioPanel,
  setPendingFileWrites,
  clearPendingFileWrites,
  setRepromptAudioHandler,
  setStreamingCode,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const planListRef = useRef<HTMLDivElement>(null);
  const lastPlanAutoScrollRef = useRef(0);
  const processedToolPayloadRef = useRef<Map<string, string>>(new Map());
  const audioPollInFlightRef = useRef(false);
  const audioPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedMessageIdsRef = useRef<Set<string>>(new Set());
  const initialChatMessagesRef = useRef(chatMessages);
  const [input, setInput] = useState("");
  const [selectedEngine, setSelectedEngine] = useState<GameEngine>(currentEngine);
  const [composerMode, setComposerMode] = useState<ComposerMode>("agent");
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [isPlanCollapsed, setIsPlanCollapsed] = useState(false);
  const [dragTodoId, setDragTodoId] = useState<string | null>(null);
  const [planDropTarget, setPlanDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const planningMode = composerMode === "plan";
  const mentionItems = useMemo(
    () => {
      const imageSlugCounts = new Map<string, number>();
      const imageMentions = generatedImages.map((image, index) => {
        const base = toMentionSlug(image.prompt) || `asset-${index + 1}`;
        const seen = imageSlugCounts.get(base) ?? 0;
        imageSlugCounts.set(base, seen + 1);
        const slug = seen === 0 ? base : `${base}-${seen + 1}`;
        return {
          id: `image:${slug}`,
          display: `image:${slug}`,
          meta: image.prompt || "image",
        };
      });

      return [
        { id: "console", display: "console", meta: "runtime" },
        ...Array.from(
          new Set(
            projectFiles
              .map((file) => file.path)
              .concat(pendingFileWrites.map((entry) => entry.path))
              .filter((path): path is string => isStableProjectPath(path))
          )
        ).map((path) => ({ id: `code:${path}`, display: `code:${path}`, meta: "file" })),
        ...imageMentions,
        ...audioTracks.map((track, index) => ({
          id: `audio:${toMentionSlug(track.name) || `track-${index + 1}`}`,
          display: `audio:${toMentionSlug(track.name) || `track-${index + 1}`}`,
          meta: track.name || "audio",
        })),
      ];
    },
    [audioTracks, generatedImages, pendingFileWrites, projectFiles]
  );

  const handleMentionChipClick = useCallback(
    (label: string) => {
      const mention = normalizeMentionToken(label);
      if (!mention) return;
      if (mention.kind === "console") {
        focusConsolePanel();
        return;
      }
      if (mention.kind === "images") {
        focusImagesPanel();
        return;
      }
      if (mention.kind === "audio") {
        focusAudioPanel();
        return;
      }
      if (!projectFiles.some((file) => file.path === mention.value)) return;
      focusCodeFile(mention.value);
    },
    [focusAudioPanel, focusCodeFile, focusConsolePanel, focusImagesPanel, projectFiles]
  );

  const renderMessageTextWithMentions = useCallback((text: string) => {
    const segments = text.split(/(@[^\s]+)/g);
    return segments.map((segment, index) => {
      if (!segment.startsWith("@")) {
        return <span key={`txt-${index}`}>{segment}</span>;
      }
      const mention = normalizeMentionToken(segment);
      const isClickable = mention
        ? mention.kind === "console" ||
          mention.kind === "images" ||
          mention.kind === "audio" ||
          projectFiles.some((file) => file.path === mention.value)
        : false;
      if (!isClickable) return <span key={`txt-${index}`}>{segment}</span>;
      return (
        <button
          key={`mention-${index}`}
          type="button"
          className="composer-log-mention"
          onClick={() => handleMentionChipClick(segment)}
          title={
            mention?.kind === "console"
              ? "Open Console panel"
              : mention?.kind === "images"
                ? "Open Images panel"
                : mention?.kind === "audio"
                  ? "Open Audio panel"
              : `Open ${mention?.value ?? ""} in Code panel`
          }
        >
          {segment}
        </button>
      );
    });
  }, [handleMentionChipClick, projectFiles]);

  const audioTrackById = useMemo(
    () => new Map(audioTracks.map((track) => [track.id, track])),
    [audioTracks]
  );

  const pendingAudioIdsKey = useMemo(
    () =>
      audioTracks
        .filter((track) => track.status === "pending")
        .map((track) => track.id)
        .sort()
        .join("|"),
    [audioTracks]
  );

  useEffect(() => {
    if (!pendingAudioIdsKey) {
      if (audioPollTimerRef.current) {
        clearTimeout(audioPollTimerRef.current);
        audioPollTimerRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const maxRounds = 30;
    let round = 0;

    const pollRound = async () => {
      if (cancelled || audioPollInFlightRef.current) return;

      const currentPending = Array.from(audioTrackById.values()).filter(
        (track) => track.status === "pending"
      );
      if (currentPending.length === 0) return;

      round += 1;
      audioPollInFlightRef.current = true;
      try {
        const results = await Promise.all(
          currentPending.map(async (track) => {
            const res = await fetch(`/api/sounds/${encodeURIComponent(track.id)}`);
            if (!res.ok) {
              return {
                id: track.id,
                status: "error" as const,
                error: `Audio status request failed (${res.status})`,
              };
            }
            const payload = (await res.json()) as {
              status?: "pending" | "ready" | "error";
              dataUrl?: string | null;
              duration?: number | null;
              error?: string | null;
              name?: string;
              kind?: "music" | "sfx";
            };
            return {
              id: track.id,
              status: payload.status ?? "pending",
              dataUrl: typeof payload.dataUrl === "string" ? payload.dataUrl : null,
              duration: typeof payload.duration === "number" ? payload.duration : null,
              error: typeof payload.error === "string" ? payload.error : null,
              name: typeof payload.name === "string" ? payload.name : track.name,
              kind: payload.kind === "music" ? "music" : "sfx",
            };
          })
        );

        for (const result of results) {
          if (result.status === "pending") continue;
          const existing = audioTrackById.get(result.id);
          const nextStatus = result.status;
          const nextDataUrl = result.dataUrl ?? existing?.dataUrl ?? null;
          const nextError = result.error ?? null;
          const nextDuration = result.duration ?? existing?.duration ?? null;
          if (
            existing &&
            existing.status === nextStatus &&
            existing.dataUrl === nextDataUrl &&
            (existing.error ?? null) === nextError &&
            existing.duration === nextDuration
          ) {
            continue;
          }
          addAudioTrack({
            id: result.id,
            name: result.name ?? existing?.name ?? result.id,
            type: result.kind ?? existing?.type ?? "sfx",
            description: existing?.description ?? "",
            dataUrl: nextDataUrl,
            status: nextStatus,
            error: nextError,
            duration: nextDuration,
            createdAt: existing?.createdAt ?? Date.now(),
          });
        }

        const hasPending = results.some((result) => result.status === "pending");
        if (!cancelled && hasPending && round < maxRounds) {
          audioPollTimerRef.current = setTimeout(() => {
            void pollRound();
          }, 3000);
        } else if (!cancelled && hasPending && round >= maxRounds) {
          for (const track of currentPending) {
            if (track.status !== "pending") continue;
            addAudioTrack({
              ...track,
              status: "error",
              error: "Audio generation timed out",
            });
          }
        }
      } finally {
        audioPollInFlightRef.current = false;
      }
    };

    if (!audioPollTimerRef.current) {
      void pollRound();
    }

    return () => {
      cancelled = true;
      if (audioPollTimerRef.current) {
        clearTimeout(audioPollTimerRef.current);
        audioPollTimerRef.current = null;
      }
    };
  }, [addAudioTrack, audioTrackById, pendingAudioIdsKey]);

  useEffect(() => {
    setSelectedEngine(currentEngine);
  }, [currentEngine]);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    []
  );

  const onFinish = useCallback(() => {
    console.log("[Chat] onFinish called - stream complete");
  }, []);

  const onError = useCallback((error: Error) => {
    console.error("[Chat] useChat error:", error);
  }, []);

  const { messages, sendMessage, status, error } = useChat({
    id: chatSessionId,
    messages: chatMessages as UIMessage[],
    experimental_throttle: 50,
    transport,
    onError,
    onFinish,
  });

  useEffect(() => {
    initialChatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  useEffect(() => {
    hydratedMessageIdsRef.current = new Set(
      initialChatMessagesRef.current.map((message) => message.id)
    );
    processedToolPayloadRef.current = new Map();
  }, [chatSessionId]);

  useEffect(() => {
    setChatMessages(messages as PersistedChatMessage[]);
  }, [messages, setChatMessages]);

  useEffect(() => {
    for (const message of messages) {
      if (hydratedMessageIdsRef.current.has(message.id)) continue;
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        const partType = (part as { type: string }).type;
        if (partType.startsWith("tool-") || partType === "dynamic-tool") {
          console.log("[Chat] Found tool part:", partType, "state:", (part as { state?: string }).state);
        }

        if (partType === "tool-update_sandbox") {
          const toolPart = part as { state: string; input?: { code?: string } };
          if (toolPart.state === "input-streaming" || toolPart.state === "input-available") {
            if (toolPart.input?.code) {
              setStreamingCode(toolPart.input.code);
            }
          }
          if (toolPart.state === "output-available") {
            setStreamingCode(null);
            if (toolPart.input?.code) {
              const key = `${message.id}:${partType}:${toolPart.state}`;
              if (processedToolPayloadRef.current.get(key) === toolPart.input.code) continue;
              processedToolPayloadRef.current.set(key, toolPart.input.code);
              console.log("[Chat] Updating sandbox code, length:", toolPart.input.code.length);
              onCodeUpdate(toolPart.input.code, selectedEngine);
            }
          }
        }

        if (partType === "tool-update_project_files") {
          const toolPart = part as { state: string; input?: { files?: ProjectFile[]; deletePaths?: string[] } };
          const rawFiles = Array.isArray(toolPart.input?.files) ? toolPart.input.files : [];
          const existingPaths = new Set(projectFiles.map((file) => file.path));
          const files = rawFiles.filter((file) => {
            if (!isStableProjectPath(file?.path)) return false;
            if (existingPaths.has(file.path)) return true;
            return hasMeaningfulContent(file?.content);
          });
          const deletePaths = Array.isArray(toolPart.input?.deletePaths) ? toolPart.input.deletePaths : [];
          const filePaths = files.map((file) => file.path);
          const pendingEntries = files.map((file) => ({
            path: file.path,
            status: toolPart.state === "input-streaming" ? "streaming" as const : "finalizing" as const,
            content: hasMeaningfulContent(file.content) ? file.content : undefined,
          }));

          if (filePaths.length > 0) {
            if (toolPart.state === "input-streaming" || toolPart.state === "input-available") {
              setPendingFileWrites(pendingEntries);
            }
          }

          if (files.length > 0 || deletePaths.length > 0) {
            const signature = JSON.stringify(
              {
                files: files.map((f) => ({
                  path: f.path,
                  kind: f.kind,
                  content: f.content,
                })),
                deletePaths,
              }
            );
            const key = `${message.id}:${partType}:${toolPart.state}`;
            if (processedToolPayloadRef.current.get(key) === signature) continue;
            processedToolPayloadRef.current.set(key, signature);
            if (toolPart.state === "output-available") {
              setStreamingCode(null);
              onProjectFilesUpdate(files, selectedEngine, deletePaths);
              clearPendingFileWrites(filePaths);
            }
          }
        }

        if (partType === "tool-patch_project_file") {
          const toolPart = part as {
            state: string;
            input?: {
              path?: string;
              edits?: Array<{ find: string; replace: string; replaceAll?: boolean }>;
            };
          };
          if (!toolPart.input?.path || !Array.isArray(toolPart.input.edits) || toolPart.input.edits.length === 0) continue;
          if (toolPart.state === "input-streaming" || toolPart.state === "input-available") {
            if (isStableProjectPath(toolPart.input.path)) {
              setPendingFileWrites([
                {
                  path: toolPart.input.path,
                  status: toolPart.state === "input-streaming" ? "streaming" : "finalizing",
                },
              ]);
            }
          }
          if (toolPart.state !== "output-available") continue;

          const signature = JSON.stringify({
            path: toolPart.input.path,
            edits: toolPart.input.edits,
          });
          const key = `${message.id}:${partType}:${toolPart.input.path}`;
          if (processedToolPayloadRef.current.get(key) === signature) continue;
          processedToolPayloadRef.current.set(key, signature);
          patchProjectFileContent(toolPart.input.path, toolPart.input.edits);
          clearPendingFileWrites([toolPart.input.path]);
        }

        if (partType === "tool-edit_file") {
          const toolPart = part as {
            state: string;
            input?: {
              targetFile?: string;
              oldString?: string;
              newString?: string;
              replaceAll?: boolean;
              createIfMissing?: boolean;
            };
          };
          if (toolPart.state === "input-streaming" || toolPart.state === "input-available") {
            if (isStableProjectPath(toolPart.input?.targetFile)) {
              setPendingFileWrites(
                [{
                  path: toolPart.input.targetFile,
                  status: toolPart.state === "input-streaming" ? "streaming" : "finalizing",
                }]
              );
            }
            continue;
          }
          if (toolPart.state !== "output-available") continue;
          if (!isStableProjectPath(toolPart.input?.targetFile) || typeof toolPart.input.newString !== "string") continue;

          const signature = JSON.stringify(toolPart.input);
          const key = `${message.id}:${partType}:${toolPart.input.targetFile}`;
          if (processedToolPayloadRef.current.get(key) === signature) continue;
          processedToolPayloadRef.current.set(key, signature);

          editProjectFile({
            targetFile: toolPart.input.targetFile,
            oldString: toolPart.input.oldString ?? "",
            newString: toolPart.input.newString,
            replaceAll: toolPart.input.replaceAll,
            createIfMissing: toolPart.input.createIfMissing,
          });
          clearPendingFileWrites([toolPart.input.targetFile]);
        }

        if (partType === "tool-delete_file") {
          const toolPart = part as { state: string; input?: { targetFile?: string } };
          if (toolPart.state !== "output-available") continue;
          if (!toolPart.input?.targetFile) continue;
          const key = `${message.id}:${partType}:${toolPart.input.targetFile}`;
          if (processedToolPayloadRef.current.get(key) === "1") continue;
          processedToolPayloadRef.current.set(key, "1");
          deleteProjectFile(toolPart.input.targetFile);
        }

        if (partType === "tool-todo_write") {
          const toolPart = part as {
            state: string;
            input?: { merge?: boolean; todos?: PlanningTodo[] };
          };
          if (toolPart.state !== "output-available") continue;
          if (!Array.isArray(toolPart.input?.todos)) continue;
          const signature = JSON.stringify({
            merge: toolPart.input.merge ?? false,
            todos: toolPart.input.todos,
          });
          const key = `${message.id}:${partType}`;
          if (processedToolPayloadRef.current.get(key) === signature) continue;
          processedToolPayloadRef.current.set(key, signature);
          if (composerMode === "plan") {
            writePlanningTodos(toolPart.input.merge ?? false, toolPart.input.todos);
            continue;
          }

          const existingById = new Map(planningTodos.map((todo) => [todo.id, todo]));
          const statusOnlyUpdates: PlanningTodo[] = [];
          for (const incoming of toolPart.input.todos) {
            const existing = existingById.get(incoming.id);
            if (!existing) continue;
            statusOnlyUpdates.push({
              ...existing,
              status: incoming.status,
            });
          }
          if (statusOnlyUpdates.length > 0) {
            writePlanningTodos(true, statusOnlyUpdates);
          }
        }

        if (partType === "tool-generate_image") {
          const toolPart = part as {
            state: string;
            output?: { success?: boolean; url?: string; prompt?: string };
          };
          if (toolPart.state !== "output-available") continue;
          if (!toolPart.output?.success || !toolPart.output.url) continue;
          const key = `${message.id}:${partType}:${toolPart.output.url}`;
          if (processedToolPayloadRef.current.get(key) === "1") continue;
          processedToolPayloadRef.current.set(key, "1");
          addImage({
            url: toolPart.output.url,
            prompt: toolPart.output.prompt ?? "Generated image",
          });
        }

        if (partType === "tool-update_controls") {
          const toolPart = part as {
            state: string;
            input?: { controls?: Array<{ action?: string; keys?: string }> };
          };
          if (toolPart.state !== "output-available") continue;
          if (!Array.isArray(toolPart.input?.controls) || toolPart.input.controls.length === 0) continue;
          const normalized = toolPart.input.controls
            .filter((item): item is { action: string; keys: string } =>
              typeof item?.action === "string" && typeof item?.keys === "string"
            )
            .map((item) => ({ action: item.action, keys: item.keys }));
          if (normalized.length === 0) continue;
          const signature = JSON.stringify(normalized);
          const key = `${message.id}:${partType}`;
          if (processedToolPayloadRef.current.get(key) === signature) continue;
          processedToolPayloadRef.current.set(key, signature);
          setControls(normalized);
        }

        if (partType === "tool-set_engine") {
          const toolPart = part as {
            state: string;
            output?: { engine?: string };
          };
          if (toolPart.state !== "output-available") continue;
          const newEngine = toolPart.output?.engine;
          if (newEngine === "canvas2d" || newEngine === "phaser" || newEngine === "threejs") {
            const key = `${message.id}:${partType}`;
            if (processedToolPayloadRef.current.get(key) === newEngine) continue;
            processedToolPayloadRef.current.set(key, newEngine);
            console.log("[Chat] set_engine ->", newEngine);
            setSelectedEngine(newEngine);
            onEngineUpdate(newEngine);
          }
        }

        if (partType === "tool-generate_sound_effect" || partType === "tool-generate_music") {
          const toolPart = part as {
            state: string;
            input?: { name?: string; prompt?: string; duration?: number };
          };
          if (toolPart.state !== "output-available" && toolPart.state !== "output-error") continue;
          const name = toolPart.input?.name;
          if (!name) continue;
          const type = partType === "tool-generate_music" ? "music" as const : "sfx" as const;
          const id = getGeneratedAudioId(type, name);
          const key = `${message.id}:${partType}:${id}`;
          if (processedToolPayloadRef.current.get(key) === "1") continue;
          processedToolPayloadRef.current.set(key, "1");
          addAudioTrack({
            id,
            name,
            type,
            description: toolPart.input?.prompt ?? "",
            dataUrl: null,
            status: "pending",
            error: null,
            duration: typeof toolPart.input?.duration === "number" ? toolPart.input.duration : null,
            createdAt: Date.now(),
          });
        }
      }
    }
  }, [
    messages,
    currentCode,
    onCodeUpdate,
    onProjectFilesUpdate,
    patchProjectFiles,
    patchProjectFileContent,
    editProjectFile,
    deleteProjectFile,
    writePlanningTodos,
    planningTodos,
    composerMode,
    addImage,
    addAudioTrack,
    setControls,
    setPendingFileWrites,
    clearPendingFileWrites,
    setStreamingCode,
    selectedEngine,
    projectFiles,
  ]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const threshold = 80;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      isNearBottomRef.current = isNearBottom;
      setShowScrollBtn(!isNearBottom);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  const isLoading = status === "streaming" || status === "submitted";

  // Safety net: clear any leftover streaming state when the chat stream finishes.
  // Tool part state transitions (input-streaming -> output-available) can occasionally
  // be missed by the effect, leaving pending file writes or streaming code stuck.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev !== "ready" && prev !== "error" && (status === "ready" || status === "error")) {
      clearPendingFileWrites();
      setStreamingCode(null);
    }
  }, [status, clearPendingFileWrites, setStreamingCode]);

  const phase = getGenerationPhase(
    status,
    messages as Array<{ role: string; parts: Array<{ type: string; state?: string }> }>
  );

  const timer = useElapsedTimer(isLoading);
  const quirkyMessage = useRotatingMessage(phase, isLoading);
  useComposerAutoHeight(textareaRef, input);

  const handleRepromptAudio = useCallback(
    (message: string) => {
      if (isLoading || !message.trim()) return;
      sendMessage(
        { text: message },
        {
          body: {
            currentCode,
            currentProjectFiles: projectFiles,
            planningTodos,
            mentionedFiles: [],
            audioTracks: audioTracks.map((track) => ({
              id: track.id,
              name: track.name,
              type: track.type,
              description: track.description,
              status: track.status,
              duration: track.duration,
              error: track.error ?? null,
            })),
            consoleLogs: [],
            generatedImages,
            composerMode,
            planningMode,
            gameEngine: selectedEngine,
          },
        }
      );
    },
    [
      isLoading,
      sendMessage,
      currentCode,
      projectFiles,
      planningTodos,
      audioTracks,
      generatedImages,
      composerMode,
      planningMode,
      selectedEngine,
    ]
  );

  useEffect(() => {
    setRepromptAudioHandler(handleRepromptAudio);
    return () => setRepromptAudioHandler(null);
  }, [handleRepromptAudio, setRepromptAudioHandler]);

  const doSubmit = () => {
    const visibleText = textareaRef.current?.value ?? input;
    const text = visibleText.trim();
    if (!text || isLoading) return;
    const isFirstUserPrompt = messages.filter((m) => m.role === "user").length === 0;
    const effectiveEngine = isFirstUserPrompt ? inferEngineFromPrompt(text) : selectedEngine;
    if (isFirstUserPrompt && effectiveEngine !== selectedEngine) {
      setSelectedEngine(effectiveEngine);
      onEngineUpdate(effectiveEngine);
    }
    const mentions = [...text.matchAll(/@([^\s]+)/g)]
      .map((match) => (match[1] ?? "").trim())
      .filter((token) => token.length > 0);
    const autoDebugConsole = composerMode === "debug";
    const explicitFileMentions = mentions
      .filter((token) => token.toLowerCase().startsWith("file:"))
      .map((token) => token.slice(5))
      .filter((token) => token.length > 0);
    const explicitCodeMentions = mentions
      .filter((token) => token.toLowerCase().startsWith("code:"))
      .map((token) => token.slice(5))
      .filter((token) => token.length > 0);
    const implicitFileMentions = mentions.filter(
      (token) =>
        !token.toLowerCase().startsWith("file:") &&
        !token.toLowerCase().startsWith("code:") &&
        token.toLowerCase() !== "console"
    );
    const mentionedFiles = Array.from(
      new Set(
        [
          ...(autoDebugConsole ? ["console"] : []),
          ...mentions.filter((token) => token.toLowerCase() === "console"),
          ...[...explicitFileMentions, ...explicitCodeMentions, ...implicitFileMentions].filter((token) =>
            projectFiles.some((file) => file.path === token)
          ),
        ]
      )
    );
    const mentionedConsole = autoDebugConsole || mentions.some((token) => token.toLowerCase() === "console");
    const consoleContext = mentionedConsole
      ? consoleLogs.slice(-120).map((entry) => ({
          level: entry.level,
          source: entry.source,
          text: entry.text,
          timestamp: entry.timestamp,
        }))
      : [];
    clearPendingFileWrites();
    setInput("");
    sendMessage({
      text,
    }, {
      body: {
        currentCode,
        currentProjectFiles: projectFiles,
        planningTodos,
        mentionedFiles,
        audioTracks: audioTracks.map((track) => ({
          id: track.id,
          name: track.name,
          type: track.type,
          description: track.description,
          status: track.status,
          duration: track.duration,
          error: track.error ?? null,
        })),
        consoleLogs: consoleContext,
        generatedImages,
        composerMode,
        planningMode,
        gameEngine: effectiveEngine,
      },
    })
      .then(() => console.log("[Chat] sendMessage resolved"))
      .catch((err) => console.error("[Chat] sendMessage rejected:", err));
  };

  const handleRetry = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg || isLoading) return;
    const textParts = lastUserMsg.parts.filter(
      (p): p is Extract<typeof p, { type: "text" }> => p.type === "text"
    );
    const text = textParts.map((p) => p.text).join("").trim();
    if (!text) return;
    setInput(text);
    requestAnimationFrame(() => doSubmit());
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    doSubmit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      const cursor = textareaRef.current?.selectionStart ?? input.length;
      if (isMentionQueryActive(input, cursor)) return;
      e.preventDefault();
      doSubmit();
    }
  };

  const handleComposerScroll = useCallback(() => {
    const inputEl = textareaRef.current;
    if (!inputEl) return;
    const rootEl = inputEl.parentElement;
    const highlighter = rootEl?.querySelector<HTMLDivElement>(".composer-mentions__highlighter") ?? null;
    if (!highlighter) return;
    const maxTop = Math.max(0, inputEl.scrollHeight - inputEl.clientHeight);
    const maxLeft = Math.max(0, inputEl.scrollWidth - inputEl.clientWidth);
    const top = Math.min(maxTop, Math.max(0, inputEl.scrollTop));
    const left = Math.min(maxLeft, Math.max(0, inputEl.scrollLeft));
    highlighter.scrollTop = top;
    highlighter.scrollLeft = left;
  }, []);

  const handleTemplateSelect = useCallback(
    (template: GameTemplate) => {
      if (isLoading) return;
      setSelectedEngine(template.engine);
      onEngineUpdate(template.engine);
      clearPendingFileWrites();
      sendMessage(
        { text: template.starterPrompt },
        {
          body: {
            currentCode,
            currentProjectFiles: projectFiles,
            planningTodos,
            mentionedFiles: [],
            audioTracks: audioTracks.map((track) => ({
              id: track.id,
              name: track.name,
              type: track.type,
              description: track.description,
              status: track.status,
              duration: track.duration,
              error: track.error ?? null,
            })),
            consoleLogs: [],
            generatedImages,
            composerMode,
            planningMode,
            gameEngine: template.engine,
            templateSkills: template.skills,
          },
        }
      );
    },
    [
      isLoading,
      sendMessage,
      currentCode,
      projectFiles,
      planningTodos,
      audioTracks,
      generatedImages,
      composerMode,
      planningMode,
      setSelectedEngine,
      onEngineUpdate,
      clearPendingFileWrites,
    ]
  );

  const handleUpdateTodo = (todoId: string, updates: Partial<PlanningTodo>) => {
    const next = planningTodos.map((todo) =>
      todo.id === todoId ? { ...todo, ...updates } : todo
    );
    writePlanningTodos(false, next);
  };

  const handleDeleteTodo = (todoId: string) => {
    const next = planningTodos.filter((todo) => todo.id !== todoId);
    writePlanningTodos(false, next);
  };

  const handleClearTodos = () => {
    writePlanningTodos(false, []);
  };

  const handleAddTodo = () => {
    const id = `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const next: PlanningTodo[] = [
      ...planningTodos,
      { id, content: "New task", status: "pending" },
    ];
    writePlanningTodos(false, next);
  };

  const handleReorderTodos = (targetId: string, position: "before" | "after" = "before") => {
    if (!dragTodoId || dragTodoId === targetId) return;
    const fromIndex = planningTodos.findIndex((todo) => todo.id === dragTodoId);
    const toIndex = planningTodos.findIndex((todo) => todo.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;

    const next = [...planningTodos];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return;
    let insertIndex = toIndex + (position === "after" ? 1 : 0);
    if (fromIndex < insertIndex) insertIndex -= 1;
    insertIndex = Math.max(0, Math.min(next.length, insertIndex));
    next.splice(insertIndex, 0, moved);
    writePlanningTodos(false, next);
  };

  const autoScrollPlanList = (clientY: number) => {
    const listEl = planListRef.current;
    if (!listEl) return;
    const now = Date.now();
    if (now - lastPlanAutoScrollRef.current < 40) return;
    lastPlanAutoScrollRef.current = now;
    const rect = listEl.getBoundingClientRect();
    const threshold = 90;
    const maxSpeed = 5;
    const distanceToTop = clientY - rect.top;
    const distanceToBottom = rect.bottom - clientY;

    if (distanceToTop < threshold) {
      const intensity = Math.max(0, (threshold - distanceToTop) / threshold);
      const delta = Math.max(1, Math.round(maxSpeed * intensity));
      listEl.scrollTop -= delta;
    } else if (distanceToBottom < threshold) {
      const intensity = Math.max(0, (threshold - distanceToBottom) / threshold);
      const delta = Math.max(1, Math.round(maxSpeed * intensity));
      listEl.scrollTop += delta;
    }
  };

  const isEmpty = messages.length === 0;
  const canSend = input.trim().length > 0 && !isLoading;

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto px-3 py-3 space-y-3">
        {isEmpty ? (
          <TemplateGallery onSelect={handleTemplateSelect} />
        ) : (
          <>
            {messages.map((message, messageIndex) => {
              const textParts = message.parts.filter(
                (p): p is Extract<typeof p, { type: "text" }> => p.type === "text"
              );
              const textContent = textParts.map((p) => p.text).join("");

              const reasoningParts = message.role === "assistant"
                ? message.parts.filter(
                    (p): p is Extract<typeof p, { type: "reasoning" }> => p.type === "reasoning"
                  )
                : [];

              const toolParts = message.role === "assistant"
                ? message.parts.filter((p) => (p as { type: string }).type.startsWith("tool-"))
                : [];

              if (!textContent && toolParts.length === 0 && reasoningParts.length === 0) return null;

              const isUser = message.role === "user";
              const isLastAssistant = !isUser && isLoading && messageIndex === messages.length - 1;
              const isStreamingText = isLastAssistant && textContent.length > 0 && phase !== "done";

              return (
                <div key={message.id} style={{ animation: "fadeIn 0.2s ease-out" }}>
                  {isUser ? (
                    <div className="flex items-start gap-2">
                      <div className="shrink-0 w-5 h-5 rounded-full bg-[var(--color-accent)] flex items-center justify-center mt-0.5">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="var(--color-bg)">
                          <circle cx="5" cy="3.5" r="2" />
                          <path d="M1 9.5a4 4 0 018 0z" />
                        </svg>
                      </div>
                      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] px-2.5 py-1.5 text-[12px] text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">
                        {renderMessageTextWithMentions(textContent)}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="shrink-0 w-5 h-5 rounded-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-light)] flex items-center justify-center mt-0.5">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--color-accent)" strokeWidth="1.2" strokeLinecap="round">
                          <path d="M2 2l2 3-2 3" />
                          <path d="M8 2l-2 3 2 3" />
                          <path d="M4 8h2" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        {reasoningParts.map((part, i) => (
                          <ReasoningBlock
                            key={`reasoning-${i}`}
                            text={(part as { text: string }).text}
                            isStreaming={isLoading && (part as { state?: string }).state === "streaming"}
                          />
                        ))}
                        {textContent && (
                          <div className="chat-markdown text-[12px] text-[var(--color-text)] leading-relaxed">
                            {isStreamingText ? (
                              <StreamingText content={textContent} />
                            ) : (
                              <MemoizedMarkdown content={textContent} />
                            )}
                          </div>
                        )}
                        {toolParts.length > 0 && (
                          <ToolCallGroup
                            parts={toolParts as ToolPartType[]}
                            audioTrackById={audioTrackById}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && phase !== "done" && (
              phase === "thinking" ? (
                <ThinkingIndicator timer={timer} />
              ) : (
                <StreamingIndicator
                  phase={phase}
                  timer={timer}
                  message={quirkyMessage}
                />
              )
            )}

            {error && (
              <div
                className="mx-1 my-2 border border-[var(--color-danger)]/30 bg-[var(--color-surface)] overflow-hidden"
                style={{ animation: "fadeIn 0.2s ease-out" }}
              >
                <div className="px-3 py-2.5 flex items-center gap-2">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--color-danger)" strokeWidth="1.5" className="shrink-0">
                    <circle cx="6" cy="6" r="5" />
                    <line x1="6" y1="3.5" x2="6" y2="6.5" />
                    <circle cx="6" cy="8.5" r="0.5" fill="var(--color-danger)" />
                  </svg>
                  <span className="text-[11px] text-[var(--color-danger)] uppercase truncate flex-1">
                    {error.message}
                  </span>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="gf-btn-chip shrink-0 text-[9px] uppercase tracking-[0.1em] font-semibold px-2 py-0.5 border border-[var(--color-border)] text-[var(--color-text-muted)]"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        </div>
        {showScrollBtn && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="scroll-to-bottom-btn absolute bottom-3 right-3 z-10 w-7 h-7 flex items-center justify-center bg-[var(--color-surface)] border border-[var(--color-border-light)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]"
            aria-label="Scroll to bottom"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4.5l4 4 4-4" />
            </svg>
          </button>
        )}
      </div>

      {(composerMode === "plan" || planningTodos.length > 0) && (
        <div className="shrink-0 border-t border-[var(--color-border)] p-2">
          <div className="border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div
              className="px-2 py-1.5 border-b border-[var(--color-border)] flex items-center justify-between gap-2 cursor-pointer"
              onClick={() => setIsPlanCollapsed((prev) => !prev)}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPlanCollapsed((prev) => !prev);
                  }}
                  className="inline-flex h-4 w-4 items-center justify-center text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  aria-label={isPlanCollapsed ? "Expand plan" : "Collapse plan"}
                  title={isPlanCollapsed ? "Expand plan" : "Collapse plan"}
                >
                  <span className={`plan-chevron ${isPlanCollapsed ? "" : "is-open"}`}>▸</span>
                </button>
                <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Plan</span>
                <span className="text-[9px] text-[var(--color-text-muted)]">
                  {planningTodos.length} task{planningTodos.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddTodo();
                  }}
                  className="text-[9px] uppercase tracking-[0.12em] px-1 py-0.5 border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClearTodos();
                  }}
                  disabled={planningTodos.length === 0}
                  className="text-[9px] uppercase tracking-[0.12em] px-1 py-0.5 border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className={`plan-collapsible ${isPlanCollapsed ? "is-collapsed" : "is-expanded"}`}>
              <div className="plan-collapsible-inner">
                {planningTodos.length === 0 ? (
                  <div className="px-2.5 py-2 text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.08em]">
                    No tasks yet. Add one to start planning.
                  </div>
                ) : (
                  <div
                    ref={planListRef}
                    className="max-h-48 overflow-y-auto p-1.5 space-y-1.5"
                    onDragOver={(e) => {
                      if (!dragTodoId) return;
                      e.preventDefault();
                      autoScrollPlanList(e.clientY);
                    }}
                  >
                    {planningTodos.map((todo) => (
                      <div
                        key={todo.id}
                        draggable
                        onDragStart={() => setDragTodoId(todo.id)}
                        onDragEnd={() => {
                          setDragTodoId(null);
                          setPlanDropTarget(null);
                        }}
                        onDragOver={(e) => {
                          if (!dragTodoId) return;
                          e.preventDefault();
                          autoScrollPlanList(e.clientY);
                          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                          const middle = rect.top + rect.height / 2;
                          const position: "before" | "after" = e.clientY < middle ? "before" : "after";
                          setPlanDropTarget({ id: todo.id, position });
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const position =
                            planDropTarget?.id === todo.id ? planDropTarget.position : "before";
                          handleReorderTodos(todo.id, position);
                          setDragTodoId(null);
                          setPlanDropTarget(null);
                        }}
                        className="relative border border-[var(--color-border)] bg-[var(--color-surface-light)] p-1.5 space-y-1.5 cursor-grab active:cursor-grabbing"
                      >
                        {dragTodoId && planDropTarget?.id === todo.id && planDropTarget.position === "before" ? (
                          <div className="absolute -top-[2px] left-1 right-1 h-[2px] bg-[var(--color-accent)]" />
                        ) : null}
                        {dragTodoId && planDropTarget?.id === todo.id && planDropTarget.position === "after" ? (
                          <div className="absolute -bottom-[2px] left-1 right-1 h-[2px] bg-[var(--color-accent)]" />
                        ) : null}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-[var(--color-text-muted)]">⋮⋮</span>
                          <select
                            value={todo.status}
                            onChange={(e) =>
                              handleUpdateTodo(todo.id, {
                                status: e.target.value as PlanningTodo["status"],
                              })
                            }
                            className="bg-[var(--color-surface)] border border-[var(--color-border)] text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] px-1 py-0.5"
                          >
                            <option value="pending">pending</option>
                            <option value="in_progress">in progress</option>
                            <option value="completed">completed</option>
                            <option value="cancelled">cancelled</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleDeleteTodo(todo.id)}
                            className="ml-auto text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                          >
                            Delete
                          </button>
                        </div>
                        <textarea
                          value={todo.content}
                          onChange={(e) => handleUpdateTodo(todo.id, { content: e.target.value })}
                          rows={1}
                          className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[10px] text-[var(--color-text-secondary)] px-1.5 py-1 outline-none resize-y min-h-[30px]"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-[var(--color-border)] p-2">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Mode</span>
          <div className="inline-flex">
            {(["agent", "plan", "debug", "ask"] as const).map((mode, i) => (
              <button
                key={mode}
                type="button"
                onClick={() => setComposerMode(mode)}
                className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 border border-[var(--color-border)] ${i > 0 ? "-ml-px" : ""} ${
                  composerMode === mode
                    ? "bg-[var(--color-accent-glow)] border-[var(--color-accent)] text-[var(--color-accent)] z-[1]"
                    : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="gf-input relative flex-1 min-w-0 border border-[var(--color-border-light)] bg-[var(--color-surface)]">
            <MentionsInput
              value={input}
              onChange={(_, newValue) => setInput(newValue)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsComposerFocused(true)}
              onBlur={() => setIsComposerFocused(false)}
              onScroll={handleComposerScroll}
              onMouseUp={() => {
                const inputEl = textareaRef.current;
                if (!inputEl) return;
                if (inputEl.selectionStart !== inputEl.selectionEnd) return;
                const mention = getMentionAtCursor(inputEl.value, inputEl.selectionStart);
                if (!mention) return;
                handleMentionChipClick(mention);
                requestAnimationFrame(() => inputEl.focus());
              }}
              onMouseDown={(e) => {
                const target = e.target as HTMLElement;
                const chip = target.closest(".composer-mention") as HTMLElement | null;
                if (chip) {
                  e.preventDefault();
                  handleMentionChipClick(chip.innerText || chip.textContent || "");
                  requestAnimationFrame(() => textareaRef.current?.focus());
                  return;
                }
              }}
              inputRef={textareaRef}
              a11ySuggestionsListLabel="File and console mentions"
              className="composer-mentions"
              placeholder={
                composerMode === "ask"
                  ? "Ask about the project..."
                  : isEmpty
                    ? "Describe your game..."
                    : "Ask for changes..."
              }
              allowSuggestionsAboveCursor
              forceSuggestionsAboveCursor={false}
              customSuggestionsContainer={(children) => (
                <div className="composer-mentions-panel">
                  <div className="composer-mentions-panel-title">Mentions</div>
                  <div className="composer-mentions-panel-list">{children}</div>
                </div>
              )}
              spellCheck={false}
            >
              <Mention
                trigger="@"
                data={mentionItems}
                markup="@[__display__](__id__)"
                appendSpaceOnAdd
                displayTransform={(_, display) => `@${display}`}
                className="composer-mention"
                renderSuggestion={(entry, _search, highlightedDisplay) => (
                  <span className="composer-mentions-row">
                    <span className="composer-mentions-row-icon">
                      {entry.id === "console" ? ">" : String(entry.id).startsWith("image:") ? "I" : String(entry.id).startsWith("audio:") ? "A" : "#"}
                    </span>
                    <span className="composer-mentions-row-label">
                      @{highlightedDisplay}
                    </span>
                    <span className="composer-mentions-row-meta">
                      {typeof (entry as { meta?: unknown }).meta === "string" ? (entry as { meta: string }).meta : "resource"}
                    </span>
                  </span>
                )}
              />
            </MentionsInput>
          </div>
          <button
            type="submit"
            disabled={!canSend}
            className={`shrink-0 w-[34px] self-stretch flex items-center justify-center border ${
              canSend
                ? "gf-btn-primary bg-[var(--color-accent)] border-[var(--color-accent)] text-[var(--color-bg)]"
                : "gf-btn-chip border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-text-muted)] opacity-20 cursor-default"
            }`}
            aria-label="Send"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M1 1l10 5-10 5z" />
            </svg>
          </button>
        </form>

        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-[9px] text-[var(--color-text-muted)]">
            {isComposerFocused || !input.trim()
              ? "Enter to send, Shift+Enter newline, @code:path / @console / @image:name / @audio:name"
              : "Enter to send"}
          </span>
        </div>
      </div>
    </div>
  );
}
