"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useEffect, useRef, useMemo, useCallback, type FormEvent, type KeyboardEvent } from "react";
import type { GameEngine } from "@/lib/game-engine";

interface ChatPanelProps {
  currentCode: string | null;
  currentEngine: GameEngine;
  onCodeUpdate: (code: string, engine?: GameEngine) => void;
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

export function ChatPanel({
  currentCode,
  currentEngine,
  onCodeUpdate,
  onEngineUpdate,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");
  const [selectedEngine, setSelectedEngine] = useState<GameEngine>(currentEngine);

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
              onCodeUpdate(toolPart.input.code, selectedEngine);
            }
          }
        }
      }
    }
  }, [messages, currentCode, onCodeUpdate, selectedEngine]);

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

  const handleEngineChange = (engine: GameEngine) => {
    setSelectedEngine(engine);
    onEngineUpdate(engine);
  };

  const doSubmit = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    console.log("[Chat] Submitting:", text, "| engine:", selectedEngine);
    setInput("");
    sendMessage({ text }, { body: { currentCode, gameEngine: selectedEngine } })
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

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      {/* Describe section */}
      <div className="p-3 space-y-3 border-b border-[var(--color-border)]">
        <div className="gf-section-header px-3 py-1.5">
          <p className="text-[11px] text-[var(--color-text-secondary)] uppercase tracking-[0.12em] font-bold">
            Describe Game
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-[0.12em] font-semibold">
            Engine
          </p>
          <div className="flex gap-1.5">
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
        </div>

        <form onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Create a space shooter with power-ups..."
            disabled={isLoading}
            rows={4}
            className="gf-input w-full bg-[var(--color-surface)] text-[var(--color-text)] text-[12px] leading-relaxed px-3 py-2.5 border border-[var(--color-border-light)] outline-none placeholder:text-[var(--color-text-muted)] disabled:opacity-50 resize-none"
          />
        </form>

        {/* Tag chips */}
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setInput(prompt.toLowerCase())}
              className="gf-btn-chip text-[10px] text-[var(--color-text-muted)] px-2.5 py-1 border border-[var(--color-border)] uppercase tracking-wider font-semibold"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Full-width CTA */}
        <button
          type="button"
          onClick={doSubmit}
          disabled={isLoading || !input.trim()}
          className="gf-btn-primary w-full bg-[var(--color-accent)] text-[var(--color-bg)] py-2.5 text-[11px] font-bold tracking-[0.12em] uppercase disabled:opacity-30"
        >
          Generate Game
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((message) => {
          const textParts = message.parts.filter(
            (p): p is Extract<typeof p, { type: "text" }> => p.type === "text"
          );
          const textContent = textParts.map((p) => p.text).join("");

          if (!textContent) return null;

          const isUser = message.role === "user";

          return (
            <div key={message.id} style={{ animation: "fadeIn 0.2s ease-out" }}>
              {isUser ? (
                <div className="flex justify-end">
                  <div className="max-w-[90%] px-3 py-2 text-[11px] bg-[var(--color-accent)] text-[var(--color-bg)] font-semibold uppercase tracking-wide whitespace-pre-wrap">
                    {textContent}
                  </div>
                </div>
              ) : (
                <div className="px-3 py-2 text-[12px] text-[var(--color-text)] whitespace-pre-wrap leading-relaxed border-l-2 border-[var(--color-accent-glow-strong)] bg-[var(--color-accent-glow)] bg-opacity-30">
                  {textContent}
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-2">
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
            <span className="text-[11px] text-[var(--color-accent)] uppercase tracking-[0.15em] font-medium">
              Generating
            </span>
          </div>
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
      </div>
    </div>
  );
}
