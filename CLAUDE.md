# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (http://localhost:3000)
npm run build    # Production build
npm run lint     # ESLint (Next.js core-web-vitals + TypeScript rules)
```

No test framework is configured yet.

## What This Is

**Game Forge** — an AI-powered HTML5 game generator. Users describe a game in a chat panel, Claude generates a complete self-contained HTML document, and it renders live in a sandboxed iframe. The UI mimics a game engine editor (dark theme, dockable panels, toolbar).

## Architecture

Single-page Next.js 16 app (App Router, React 19) with one API route and a split-pane UI.

### Data Flow

```
User prompt → ChatPanel → POST /api/chat (with currentCode) → Claude Sonnet 4.6 (streamed, with extended thinking)
  → model calls update_sandbox tool → tool result streamed back
  → ChatPanel extracts code from tool-update_sandbox parts → GameForgeContext.onCodeUpdate()
  → Sandbox re-renders iframe with new srcDoc
```

The key insight: `currentCode` travels a round trip. It's sent as `body.currentCode` with each chat request, injected into the system prompt so the model can iterate on existing code, and updated in context when the model emits new code via the tool.

### Core Modules

1. **API route** (`src/app/api/chat/route.ts`) — Streams responses from Claude via Vercel AI SDK v6. Has one tool: `update_sandbox` (takes a `code` string). Uses `stopWhen: stepCountIs(2)` to limit tool-use rounds. Extended thinking enabled with 10k token budget (`sendReasoning: true`).

2. **System prompt** (`src/lib/system-prompt.ts`) — `getSystemPrompt(currentCode?)` returns the LLM instructions. When `currentCode` is provided, it's appended so the model modifies existing code rather than starting fresh.

3. **GameForgeContext** (`src/lib/game-forge-context.tsx`) — React context holding `currentCode` (latest HTML) and `onCodeUpdate`. The single shared state bridge between chat and sandbox.

4. **ChatPanel** (`src/components/chat-panel.tsx`) — Uses `useChat` from `@ai-sdk/react` with `DefaultChatTransport`. Renders text via `react-markdown`. Displays extended thinking in collapsible "Reasoning" blocks. Shows rotating contextual status messages during generation. An effect scans assistant message parts for `type === "tool-update_sandbox"` to extract code and push to context.

5. **Sandbox** (`src/components/sandbox.tsx`) — Renders `currentCode` as `<iframe srcDoc={code} sandbox="allow-scripts">`. Includes a toolbar with: copy HTML, download `.html`, and open in new tab. Uses a toast notification system.

6. **DockLayout** (`src/components/dock-layout.tsx`) — Dockview-based resizable panel system. Loaded via `next/dynamic` (no SSR). Six panels: Scene View (sandbox), Composer (chat), Inspector, Code (source viewer), Assets (placeholder), Audio (placeholder).

7. **Toolbar** (`src/components/toolbar.tsx`) — Top menu bar with Window menu for toggling/resetting panels.

### Panel Wrappers

Files in `src/components/panels/` are thin wrappers that call `useGameForge()` and pass props to the actual component. This exists because Dockview instantiates components without props — the wrappers bridge that gap via context.

## Key Details

- **Path alias**: `@/*` maps to `./src/*`
- **Styling**: Tailwind CSS v4 with custom theme tokens in `src/app/globals.css`. Colors use CSS variables (`--color-bg`, `--color-accent`, etc.). Dockview is themed via `.game-forge-theme` CSS class overriding `--dv-*` variables, extending `themeAbyss`.
- **Font**: JetBrains Mono via `next/font/google`, set as `--font-mono`
- **AI SDK**: Vercel AI SDK v6 — `ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`. Uses `DefaultChatTransport`, `streamText`, `convertToModelMessages`, and typed tool definitions with Zod schemas.
- **Environment**: Requires `ANTHROPIC_API_KEY`.
- **Dockview SSR guard**: `DockLayout` uses a strict-mode guard (`if (event.api.panels.length > 0) return`) in `onReady` to prevent double-initialization from React 19's strict mode double-mount.
- **Assets/Audio panels**: Currently placeholder stubs — no functionality yet.
