"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useEffect, useRef, useMemo, useCallback, type FormEvent, type KeyboardEvent } from "react";
import Markdown from "react-markdown";

import type { AudioTrack } from "@/lib/game-forge-context";

interface ChatPanelProps {
  currentCode: string | null;
  onCodeUpdate: (code: string) => void;
  addAudioTrack: (track: AudioTrack) => void;
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

// ── Sound player ──

function SoundPlayer({
  soundName,
  onStatusChange,
}: {
  soundName: string;
  onStatusChange?: (data: {
    status: "ready" | "error";
    dataUrl?: string;
    duration?: number;
    error?: string | null;
  }) => void;
}) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [soundStatus, setSoundStatus] = useState<"pending" | "ready" | "error">("pending");
  const [soundError, setSoundError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Poll for audio data until ready — single source of truth for this sound
  useEffect(() => {
    if (soundStatus !== "pending") return;
    let cancelled = false;

    const poll = () => {
      if (cancelled) return;
      fetch(`/api/sounds/${encodeURIComponent(soundName)}`)
        .then((res) => res.json())
        .then((data: { status: string; dataUrl?: string | null; duration?: number; error?: string | null }) => {
          if (cancelled) return;
          if (data.status === "ready" && data.dataUrl) {
            setAudioUrl(data.dataUrl);
            setSoundStatus("ready");
            if (data.duration) setDuration(data.duration);
            onStatusChange?.({
              status: "ready",
              dataUrl: data.dataUrl,
              duration: data.duration ?? 0,
            });
          } else if (data.status === "error") {
            setSoundStatus("error");
            setSoundError(data.error ?? "Generation failed");
            onStatusChange?.({
              status: "error",
              error: data.error ?? "Generation failed",
            });
          } else if (data.status === "pending") {
            setTimeout(poll, 3000);
          }
        })
        .catch(() => { if (!cancelled) setTimeout(poll, 3000); });
    };
    poll();
    return () => { cancelled = true; };
  }, [soundName, soundStatus, onStatusChange]);

  // Create audio element when URL is available
  useEffect(() => {
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const onLoaded = () => setDuration(audio.duration);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
    };
  }, [audioUrl]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = progressRef.current;
    if (!audio || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  }, [duration]);

  const formatTime = (t: number) => {
    const s = Math.floor(t % 60);
    const m = Math.floor(t / 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  if (soundStatus === "error") {
    return (
      <div className="px-3 py-2 flex items-center gap-2">
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ color: "var(--color-danger)" }}>
          <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <line x1="3" y1="3" x2="7" y2="7" stroke="currentColor" strokeWidth="1.5" />
          <line x1="7" y1="3" x2="3" y2="7" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="text-[10px] text-[var(--color-danger)]">{soundError ?? "Failed"}</span>
      </div>
    );
  }

  if (soundStatus === "pending" || !audioUrl) {
    return (
      <div className="px-3 py-2 flex items-center gap-2">
        <svg width="10" height="10" viewBox="0 0 10 10" className="animate-spin" style={{ color: "var(--color-accent)" }}>
          <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="18" strokeLinecap="round" />
        </svg>
        <span className="text-[10px] text-[var(--color-text-muted)]">
          Generating &quot;{soundName}&quot;...
        </span>
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="px-3 py-2 space-y-2">
      <div className="flex items-center gap-2.5">
        {/* Play/Pause button */}
        <button
          type="button"
          onClick={togglePlay}
          className="shrink-0 w-6 h-6 flex items-center justify-center border border-[var(--color-border-light)] bg-[var(--color-surface-light)] text-[var(--color-accent)] hover:bg-[var(--color-accent-glow)] transition-colors"
        >
          {isPlaying ? (
            <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor">
              <rect x="0" y="0" width="3" height="10" />
              <rect x="5" y="0" width="3" height="10" />
            </svg>
          ) : (
            <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor">
              <polygon points="0,0 8,5 0,10" />
            </svg>
          )}
        </button>

        {/* Progress bar */}
        <div
          ref={progressRef}
          onClick={handleSeek}
          className="flex-1 h-5 flex items-center cursor-pointer group"
        >
          <div className="w-full h-[3px] bg-[var(--color-border)] relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-[var(--color-accent)]"
              style={{ width: `${progress}%` }}
            />
            {/* Waveform visualization overlay */}
            <div className="absolute inset-0 flex items-end gap-px px-px opacity-60">
              {Array.from({ length: 32 }, (_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${30 + Math.sin(i * 0.8) * 40 + Math.sin(i * 1.6) * 25}%`,
                    backgroundColor: (i / 32) * 100 < progress
                      ? "var(--color-accent)"
                      : "var(--color-text-muted)",
                    opacity: (i / 32) * 100 < progress ? 0.8 : 0.3,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Time display */}
        <span className="shrink-0 text-[10px] text-[var(--color-text-muted)] font-mono tabular-nums w-[70px] text-right">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}

// ── Tool call card ──

function ToolCallCard({ part, onSoundStatusChange }: {
  part: { type: string; state?: string; input?: Record<string, unknown> };
  onSoundStatusChange?: (
    name: string,
    data: {
      status: "ready" | "error";
      dataUrl?: string;
      duration?: number;
      error?: string | null;
    }
  ) => void;
}) {
  const toolName = part.type.replace("tool-", "").toUpperCase().replace(/_/g, "_");
  const state = part.state;
  const isSoundTool = part.type === "tool-generate_sound_effect";
  const codeLength = !isSoundTool ? (part.input?.code as string | undefined)?.length : undefined;
  const soundName = isSoundTool ? (part.input?.name as string | undefined) : undefined;

  let statusText: string;
  let statusColor: string;

  if (state === "input-streaming") {
    statusText = isSoundTool ? "Requesting sound effect..." : "Generating game code...";
    statusColor = "var(--color-accent)";
  } else if (state === "input-available") {
    statusText = isSoundTool
      ? `Queuing "${soundName ?? "sound"}"...`
      : codeLength
        ? `Code ready (${codeLength.toLocaleString()} chars)`
        : "Executing...";
    statusColor = "var(--color-accent)";
  } else if (state === "output-available") {
    statusText = isSoundTool
      ? `"${soundName ?? "sound"}" — generating in background`
      : codeLength
        ? `Code ready (${codeLength.toLocaleString()} chars)`
        : "Complete";
    statusColor = isSoundTool ? "var(--color-accent)" : "var(--color-success)";
  } else {
    statusText = isSoundTool ? "Requesting sound effect..." : "Preparing...";
    statusColor = "var(--color-accent)";
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
      {/* Status row — hidden for sound tools once output available (SoundPlayer takes over) */}
      {!(isSoundTool && state === "output-available") && (
        <div className="px-3 py-2 flex items-center gap-2">
          <span style={{ color: statusColor }}>
            {state === "input-streaming" || (isSoundTool && state === "input-available") || !state ? (
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
      )}
      {/* Audio player for sound effects — handles its own loading/ready/error states */}
      {isSoundTool && state === "output-available" && soundName && (
        <SoundPlayer
          soundName={soundName}
          onStatusChange={
            onSoundStatusChange
              ? (data) => onSoundStatusChange(soundName, data)
              : undefined
          }
        />
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

export function ChatPanel({ currentCode, onCodeUpdate, addAudioTrack }: ChatPanelProps) {
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

  const soundCreatedAtRef = useRef<Map<string, number>>(new Map());

  const getSoundCreatedAt = useCallback((soundName: string) => {
    const existing = soundCreatedAtRef.current.get(soundName);
    if (existing) {
      return existing;
    }

    const createdAt = Date.now();
    soundCreatedAtRef.current.set(soundName, createdAt);
    return createdAt;
  }, []);

  const syncGeneratedSound = useCallback((
    soundName: string,
    input: { prompt?: string; duration?: number } | undefined,
    update: {
      status: "pending" | "ready" | "error";
      dataUrl?: string | null;
      duration?: number | null;
      error?: string | null;
    }
  ) => {
    addAudioTrack({
      id: soundName,
      name: soundName,
      type: "sfx",
      description: input?.prompt ?? "",
      dataUrl: update.dataUrl ?? null,
      status: update.status,
      error: update.error ?? null,
      duration: update.duration ?? input?.duration ?? null,
      createdAt: getSoundCreatedAt(soundName),
    });
  }, [addAudioTrack, getSoundCreatedAt]);

  // Extract code from tool invocations
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
        if (partType === "tool-generate_sound_effect") {
          const toolPart = part as {
            state: string;
            input?: { name?: string; prompt?: string; duration?: number };
          };

          if (
            toolPart.state === "output-available" &&
            toolPart.input?.name &&
            !soundCreatedAtRef.current.has(toolPart.input.name)
          ) {
            syncGeneratedSound(toolPart.input.name, toolPart.input, {
              status: "pending",
            });
          }
        }
      }
    }
  }, [messages, currentCode, onCodeUpdate, syncGeneratedSound]);

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
    sendMessage({ text }, { body: { currentCode } })
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
                            part={part as { type: string; state?: string; input?: Record<string, unknown> }}
                            onSoundStatusChange={(name, data) => {
                              const input = (part as {
                                input?: { prompt?: string; duration?: number };
                              }).input;

                              if (data.status === "ready" && data.dataUrl) {
                                syncGeneratedSound(name, input, {
                                  status: "ready",
                                  dataUrl: data.dataUrl,
                                  duration: data.duration ?? input?.duration ?? null,
                                  error: null,
                                });
                                return;
                              }

                              if (data.status === "error") {
                                syncGeneratedSound(name, input, {
                                  status: "error",
                                  error: data.error ?? "Generation failed",
                                });
                              }
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
