"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useEffect, useRef, useMemo, useCallback, type FormEvent, type KeyboardEvent } from "react";
import Markdown from "react-markdown";

import type { GeneratedImage } from "@/lib/game-forge-context";

interface ChatPanelProps {
  currentCode: string | null;
  onCodeUpdate: (code: string) => void;
  generatedImages: GeneratedImage[];
  addImage: (image: GeneratedImage) => void;
}

const EXAMPLE_PROMPTS = [
  "Space Invaders",
  "Asteroids",
  "Snake Game",
  "Breakout",
];

// ── Phase types & messages ──

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

// ── Phase detection ──

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

// ── Timer hook ──

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

// ── Rotating message hook ──

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

// ── StreamingIndicator ──

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
        {/* Phase label + timer */}
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

        {/* Quirky message */}
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

// ── Tool call card ──

function ToolCallCard({ part }: {
  part: {
    type: string;
    state?: string;
    input?: { code?: string; prompt?: string };
    output?: { success?: boolean; url?: string };
  };
}) {
  const toolName = part.type.replace("tool-", "").toUpperCase().replace(/_/g, "_");
  const state = part.state;
  const isImageTool = part.type === "tool-generate_image";

  let statusText: string;
  let statusColor: string;

  if (isImageTool) {
    if (state === "input-streaming") {
      statusText = "Preparing image prompt...";
      statusColor = "var(--color-accent)";
    } else if (state === "input-available") {
      statusText = "Generating image...";
      statusColor = "var(--color-accent)";
    } else if (state === "output-available") {
      statusText = part.output?.success ? "Image generated" : "Image generation failed";
      statusColor = part.output?.success ? "var(--color-success)" : "var(--color-danger)";
    } else {
      statusText = "Preparing...";
      statusColor = "var(--color-text-muted)";
    }
  } else {
    const codeLength = part.input?.code?.length;
    if (state === "input-streaming") {
      statusText = "Generating game code...";
      statusColor = "var(--color-accent)";
    } else if (state === "input-available" || state === "output-available") {
      statusText = codeLength
        ? `Code ready (${codeLength.toLocaleString()} chars)`
        : "Code ready";
      statusColor = "var(--color-success)";
    } else {
      statusText = "Preparing...";
      statusColor = "var(--color-text-muted)";
    }
  }

  const showSpinner = state === "input-streaming" || (isImageTool && state === "input-available");

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
          {showSpinner ? (
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
      {isImageTool && state === "output-available" && part.output?.success && part.output.url && (
        <div className="px-3 pb-2">
          <img
            src={part.output.url}
            alt={part.input?.prompt ?? "Generated image"}
            className="w-20 h-20 object-cover border border-[var(--color-border)]"
          />
        </div>
      )}
    </div>
  );
}

// ── Reasoning block ──

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

// ── Auto-resize textarea hook ──

function useAutoResize(textareaRef: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [textareaRef, value]);
}

// ── Main component ──

export function ChatPanel({ currentCode, onCodeUpdate, generatedImages, addImage }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");

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

  // Extract code and images from tool invocations
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
              console.log("[Chat] Updating sandbox code, length:", toolPart.input.code.length);
              onCodeUpdate(toolPart.input.code);
            }
          }
        }
        if (partType === "tool-generate_image") {
          const toolPart = part as {
            state: string;
            output?: { success: boolean; url?: string; prompt?: string };
          };
          if (toolPart.state === "output-available" && toolPart.output?.success && toolPart.output.url) {
            addImage({ url: toolPart.output.url, prompt: toolPart.output.prompt ?? "" });
          }
        }
      }
    }
  }, [messages, currentCode, onCodeUpdate, addImage]);

  // Log status changes
  useEffect(() => {
    console.log("[Chat] Status:", status, "| Messages:", messages.length, "| Error:", error?.message ?? "none");
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      console.log("[Chat] Last message role:", lastMsg.role, "parts:", lastMsg.parts.map(p => (p as { type: string }).type));
    }
  }, [status, messages, error]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  const isLoading = status === "streaming" || status === "submitted";

  // Phase detection
  const phase = getGenerationPhase(
    status,
    messages as Array<{ role: string; parts: Array<{ type: string; state?: string }> }>
  );

  // Timer & rotating message
  const timer = useElapsedTimer(isLoading);
  const quirkyMessage = useRotatingMessage(phase, isLoading);

  // Auto-resize textarea
  useAutoResize(textareaRef, input);

  const doSubmit = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    console.log("[Chat] Submitting:", text);
    setInput("");
    sendMessage({ text }, { body: { currentCode, generatedImages } })
      .then(() => console.log("[Chat] sendMessage resolved"))
      .catch((err) => console.error("[Chat] sendMessage rejected:", err));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    doSubmit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSubmit();
    }
  };

  const handleExampleClick = (prompt: string) => {
    setInput(prompt.toLowerCase());
    textareaRef.current?.focus();
  };

  const isEmpty = messages.length === 0;
  const canSend = input.trim().length > 0 && !isLoading;

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {isEmpty ? (
          /* ── Empty state ── */
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
          /* ── Message list ── */
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
                            part={part as {
                              type: string;
                              state?: string;
                              input?: { code?: string; prompt?: string };
                              output?: { success?: boolean; url?: string };
                            }}
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

      {/* ── Input bar (pinned to bottom) ── */}
      <div className="shrink-0 border-t border-[var(--color-border)] p-2">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
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
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-[9px] text-[var(--color-text-muted)]">
            Enter to send, Shift+Enter for newline
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
