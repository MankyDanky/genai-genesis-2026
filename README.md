# Game Forge

AI-powered browser game generator with a live sandbox preview.

## Commands

```bash
npm run dev
npm run build
npm run lint
```

## Environment

Create `.env.local` with:

```bash
ANTHROPIC_API_KEY=your_anthropic_key
```

## What It Does

- Chat-driven game generation via `/api/chat`
- Streams model responses + tool calls
- Updates sandbox iframe with full HTML documents
- Supports engine mode selection in Composer:
  - `HTML5 Canvas`
  - `Three.js`

## Flow

```text
Prompt -> ChatPanel -> /api/chat
  -> model chooses tools (update_sandbox)
  -> ChatPanel reads tool parts from stream
  -> code updates GameForgeContext.currentCode
  -> sandbox iframe re-renders with new srcDoc
```
