# Game Forge

AI-powered browser game generator with a live sandbox preview.

## Commands

```bash
npm run dev
npm run build
npm run lint
```

## Environment

Create `.env.local` (or copy from `.env.example`) with:

```bash
ANTHROPIC_API_KEY=your-api-key
ELEVENLABS_API_KEY=your-api-key
FAL_KEY=your-api-key
GEMINI_API_KEY=your-api-key
```

- `ANTHROPIC_API_KEY` powers chat/tool orchestration.
- `ELEVENLABS_API_KEY` powers sound effect + music generation.
- `FAL_KEY` powers image generation via fal.ai.
- `GEMINI_API_KEY` powers image editing/background workflows.

## What It Does

- Chat-driven game generation via `/api/chat`
- Streams model responses + tool calls
- Updates sandbox iframe with live multi-file project output
- Supports engine mode selection in Composer:
  - `HTML5 Canvas`
  - `Three.js`
- Supports generated image and audio assets integrated into sandbox runtime

## Flow

```text
Prompt -> ChatPanel -> /api/chat
  -> model chooses tools (read/edit/update/todo/image/audio)
  -> ChatPanel reads tool parts from stream
  -> project files + state update in GameForgeContext
  -> sandbox iframe re-renders with new srcDoc
```
