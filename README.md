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
NEXT_PUBLIC_PARTYKIT_HOST=localhost:1999
NEXT_PUBLIC_PARTYKIT_PROTOCOL=ws
```

- `ANTHROPIC_API_KEY` powers chat/tool orchestration.
- `ELEVENLABS_API_KEY` powers sound effect + music generation.
- `FAL_KEY` powers image generation via fal.ai.
- `GEMINI_API_KEY` powers image editing/background workflows.
- `NEXT_PUBLIC_PARTYKIT_HOST` configures realtime multiplayer room host for generated games.
- `NEXT_PUBLIC_PARTYKIT_PROTOCOL` sets websocket protocol (`ws` for local, `wss` for production).

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

## Multiplayer (PartyKit) Quick Start

1. Start Next.js app:

```bash
npm run dev
```

2. Start PartyKit room server (separate terminal):

```bash
pnpm dlx partykit dev
```

3. Ask the composer for a multiplayer game. The agent now has a `multiplayer_partykit_scaffold` tool and can scaffold:
- `src/net/party-session.js` client helper
- `partykit/room.js` room server
- `partykit.json` config
