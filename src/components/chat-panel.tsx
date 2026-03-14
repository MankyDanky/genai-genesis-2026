"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useEffect, useRef, useMemo, useCallback, type FormEvent, type KeyboardEvent } from "react";
import Markdown from "react-markdown";
import type { GameEngine } from "@/lib/game-engine";
import type { ProjectFile } from "@/lib/project-files";

interface ChatPanelProps {
  currentCode: string | null;
  currentEngine: GameEngine;
  projectFiles: ProjectFile[];
  onCodeUpdate: (code: string, engine?: GameEngine) => void;
  onProjectFilesUpdate: (files: ProjectFile[], engine?: GameEngine, deletePaths?: string[]) => void;
  patchProjectFiles: (files: ProjectFile[], engine?: GameEngine) => void;
  patchProjectFileContent: (
    path: string,
    edits: Array<{ find: string; replace: string; replaceAll?: boolean }>
  ) => void;
  onEngineUpdate: (engine: GameEngine) => void;
}

const EXAMPLE_PROMPTS = [
  "Space Invaders",
  "Asteroids",
  "Snake Game",
  "Breakout",
];

const ENGINE_OPTIONS: Array<{ id: GameEngine; label: string }> = [
  { id: "canvas2d", label: "HTML5 Canvas" },
  { id: "threejs", label: "Three.js" },
];

type GenerationPhase = "connecting" | "thinking" | "coding" | "executing" | "done";

const PHASE_MESSAGES: Record<"connecting" | "coding" | "executing", readonly string[]> = {
  connecting: [
    "Booting up the dev environment...",
    "Warming up the GPU...",
    "Loading game engine...",
    "Initializing the pixel forge...",
    "Dusting off the sprite sheets...",
  ],
  coding: [
    "Writing game loop...",
    "Spawning player entity...",
    "Wiring up the controls...",
    "Compiling shaders...",
    "Building the sprite sheet...",
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

function ToolCallCard({ part }: {
  part: { type: string; state?: string; input?: { code?: string; files?: ProjectFile[] } };
}) {
  const toolName = part.type.replace("tool-", "").toUpperCase().replace(/_/g, "_");
  const state = part.state;
  const codeLength = part.input?.code?.length;
  const fileCount = Array.isArray(part.input?.files) ? part.input.files.length : null;

  let statusText: string;
  let statusColor: string;

  if (state === "input-streaming") {
    statusText = "Preparing tool payload...";
    statusColor = "var(--color-accent)";
  } else if (state === "input-available" || state === "output-available") {
    if (typeof codeLength === "number") {
      statusText = `Code ready (${codeLength.toLocaleString()} chars)`;
    } else if (typeof fileCount === "number") {
      statusText = `Files ready (${fileCount})`;
    } else {
      statusText = "Tool output ready";
    }
    statusColor = "var(--color-success)";
  } else {
    statusText = "Preparing...";
    statusColor = "var(--color-text-muted)";
  }

  return (
    <div
      className="mx-1 my-2 border border-[var(--color-border-light)] bg-[var(--color-surface)] overflow-hidden"
      style={{ animation: "fadeIn 0.2s ease-out" }}
    >
      <div className="px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface-light)] flex items-center gap-2">
        <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-[0.15em] font-bold">
          Tool
        </span>
        <span className="text-[10px] text-[var(--color-accent)] uppercase tracking-[0.1em] font-bold">
          {toolName}
        </span>
      </div>
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
    </div>
  );
}

function ReasoningBlock({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  return (
    <details
      open={isStreaming}
      className="mx-1 my-2 border border-[var(--color-border-light)] bg-[var(--color-surface)] overflow-hidden group"
      style={{ animation: "fadeIn 0.2s ease-out" }}
    >
      <summary className="px-3 py-1.5 cursor-pointer select-none flex items-center gap-2 bg-[var(--color-surface-light)] border-b border-[var(--color-border)]">
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
      </summary>
      <div className="px-3 py-2 max-h-[200px] overflow-y-auto">
        <p className="text-[11px] text-[var(--color-text-muted)] italic whitespace-pre-wrap leading-relaxed">
          {text}
        </p>
      </div>
    </details>
  );
}

function useAutoResize(textareaRef: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [textareaRef, value]);
}

export function ChatPanel({
  currentCode,
  currentEngine,
  projectFiles,
  onCodeUpdate,
  onProjectFilesUpdate,
  patchProjectFiles,
  patchProjectFileContent,
  onEngineUpdate,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const processedToolPayloadRef = useRef<Map<string, string>>(new Map());
  const [input, setInput] = useState("");
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [selectedEngine, setSelectedEngine] = useState<GameEngine>(currentEngine);

  const mentionSuggestions = useMemo(() => {
    if (mentionStart === null) return [];
    const query = mentionQuery.toLowerCase();
    return projectFiles
      .map((file) => file.path)
      .filter((path) => path.toLowerCase().includes(query))
      .slice(0, 8);
  }, [mentionQuery, mentionStart, projectFiles]);

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
    transport,
    onError,
    onFinish,
  });

  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        const partType = (part as { type: string }).type;
        if (partType.startsWith("tool-") || partType === "dynamic-tool") {
          console.log("[Chat] Found tool part:", partType, "state:", (part as { state?: string }).state);
        }

        if (partType === "tool-update_sandbox") {
          const toolPart = part as { state: string; input?: { code?: string } };
          if (toolPart.state === "output-available") {
            if (toolPart.input?.code && toolPart.input.code !== currentCode) {
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
          const files = Array.isArray(toolPart.input?.files) ? toolPart.input.files : [];
          const deletePaths = Array.isArray(toolPart.input?.deletePaths) ? toolPart.input.deletePaths : [];
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
              onProjectFilesUpdate(files, selectedEngine, deletePaths);
            } else if (toolPart.state === "input-streaming" || toolPart.state === "input-available") {
              if (files.length > 0) patchProjectFiles(files, selectedEngine);
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
          if (toolPart.state !== "output-available") continue;

          const signature = JSON.stringify({
            path: toolPart.input.path,
            edits: toolPart.input.edits,
          });
          const key = `${message.id}:${partType}:${toolPart.input.path}`;
          if (processedToolPayloadRef.current.get(key) === signature) continue;
          processedToolPayloadRef.current.set(key, signature);
          patchProjectFileContent(toolPart.input.path, toolPart.input.edits);
        }
      }
    }
  }, [messages, currentCode, onCodeUpdate, onProjectFilesUpdate, patchProjectFiles, patchProjectFileContent, selectedEngine]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  const isLoading = status === "streaming" || status === "submitted";

  const phase = getGenerationPhase(
    status,
    messages as Array<{ role: string; parts: Array<{ type: string; state?: string }> }>
  );

  const timer = useElapsedTimer(isLoading);
  const quirkyMessage = useRotatingMessage(phase, isLoading);

  useAutoResize(textareaRef, input);

  const handleEngineChange = (engine: GameEngine) => {
    setSelectedEngine(engine);
    onEngineUpdate(engine);
  };

  const doSubmit = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    const mentionedFiles = Array.from(
      new Set(
        [...text.matchAll(/@([^\s]+)/g)]
          .map((match) => match[1] ?? "")
          .filter((token) => projectFiles.some((file) => file.path === token))
      )
    );
    setInput("");
    setMentionQuery("");
    setMentionStart(null);
    sendMessage({
      text,
    }, {
      body: {
        currentCode,
        currentProjectFiles: projectFiles,
        mentionedFiles,
        gameEngine: selectedEngine,
      },
    })
      .then(() => console.log("[Chat] sendMessage resolved"))
      .catch((err) => console.error("[Chat] sendMessage rejected:", err));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    doSubmit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionSuggestions.length > 0 && e.key === "Tab") {
      e.preventDefault();
      const first = mentionSuggestions[0];
      if (!first) return;

      const cursor = textareaRef.current?.selectionStart ?? input.length;
      const start = mentionStart ?? cursor;
      const next = `${input.slice(0, start)}@${first} ${input.slice(cursor)}`;
      setInput(next);
      setMentionQuery("");
      setMentionStart(null);
      requestAnimationFrame(() => {
        const pos = start + first.length + 2;
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(pos, pos);
      });
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSubmit();
    }
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursor);
    const mentionMatch = beforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_./-]*)$/);
    if (!mentionMatch) {
      setMentionQuery("");
      setMentionStart(null);
      return;
    }
    const query = mentionMatch[1] ?? "";
    setMentionQuery(query);
    setMentionStart(cursor - query.length - 1);
  };

  const applyMention = (path: string) => {
    const cursor = textareaRef.current?.selectionStart ?? input.length;
    const start = mentionStart ?? cursor;
    const next = `${input.slice(0, start)}@${path} ${input.slice(cursor)}`;
    setInput(next);
    setMentionQuery("");
    setMentionStart(null);
    requestAnimationFrame(() => {
      const pos = start + path.length + 2;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  };

  const handleExampleClick = (prompt: string) => {
    setInput(prompt.toLowerCase());
    textareaRef.current?.focus();
  };

  const isEmpty = messages.length === 0;
  const canSend = input.trim().length > 0 && !isLoading;

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-2">
            <div className="text-center space-y-2">
              <p className="text-[13px] text-[var(--color-text-secondary)] font-semibold">
                What do you want to build?
              </p>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Describe a game or try an example
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleExampleClick(prompt)}
                  className="gf-btn-chip text-[10px] text-[var(--color-text-muted)] px-2.5 py-1 border border-[var(--color-border)] uppercase tracking-wider font-semibold"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => {
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

              return (
                <div key={message.id} style={{ animation: "fadeIn 0.2s ease-out" }}>
                  {isUser ? (
                    <div className="flex items-start gap-2">
                      <div className="shrink-0 w-5 h-5 rounded-full bg-[var(--color-accent)] flex items-center justify-center mt-0.5">
                        <span className="text-[9px] text-[var(--color-bg)] font-bold">U</span>
                      </div>
                      <div className="text-[12px] text-[var(--color-text)] whitespace-pre-wrap leading-relaxed pt-0.5">
                        {textContent}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="shrink-0 w-5 h-5 rounded-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-light)] flex items-center justify-center mt-0.5">
                        <span className="text-[9px] text-[var(--color-accent)] font-bold">G</span>
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
                            <Markdown>{textContent}</Markdown>
                          </div>
                        )}
                        {toolParts.map((part, i) => (
                          <ToolCallCard
                            key={i}
                            part={part as { type: string; state?: string; input?: { code?: string; files?: ProjectFile[] } }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && phase !== "done" && phase !== "thinking" && (
              <StreamingIndicator
                phase={phase}
                timer={timer}
                message={quirkyMessage}
              />
            )}

            {error && (
              <div className="px-3 py-2 text-[11px] text-[var(--color-danger)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 uppercase flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="6" cy="6" r="5" />
                  <line x1="6" y1="3.5" x2="6" y2="6.5" />
                  <circle cx="6" cy="8.5" r="0.5" fill="currentColor" />
                </svg>
                {error.message}
              </div>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--color-border)] p-2">
        <div className="mb-2 flex gap-1.5">
          {ENGINE_OPTIONS.map((engine) => (
            <button
              key={engine.id}
              type="button"
              onClick={() => handleEngineChange(engine.id)}
              className={`gf-btn-chip text-[10px] px-2.5 py-1 uppercase tracking-wider font-semibold border ${
                selectedEngine === engine.id
                  ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-glow)]"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)]"
              }`}
            >
              {engine.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isEmpty ? "Describe your game..." : "Ask for changes..."}
            disabled={isLoading}
            rows={1}
            className="gf-input flex-1 min-w-0 bg-[var(--color-surface)] text-[var(--color-text)] text-[12px] leading-relaxed px-3 py-2 border border-[var(--color-border-light)] outline-none placeholder:text-[var(--color-text-muted)] disabled:opacity-50 resize-none overflow-hidden"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="gf-btn-chip shrink-0 w-[34px] self-stretch flex items-center justify-center border border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-text-muted)] disabled:opacity-20 disabled:cursor-default"
            aria-label="Send"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M1 1l10 5-10 5z" />
            </svg>
          </button>
        </form>
        {mentionSuggestions.length > 0 && (
          <div className="mt-1 border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              Mention Files
            </div>
            <div className="max-h-28 overflow-y-auto border-t border-[var(--color-border)]">
              {mentionSuggestions.map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => applyMention(path)}
                  className="w-full text-left px-2 py-1.5 text-[10px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-light)]"
                >
                  @{path}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-[9px] text-[var(--color-text-muted)]">
            Enter to send, Shift+Enter newline, @file mention
          </span>
          {currentCode && (
            <span className="text-[9px] text-[var(--color-success)] flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-[var(--color-success)] rounded-full inline-block" />
              Game loaded
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
