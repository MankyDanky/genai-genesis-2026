# Axiom

**[Try it live](https://axiom-omega-five.vercel.app)**

> What if anyone could make a game in under 10 minutes -- no code required?

Axiom is an AI-powered game engine where you describe what you want in plain English and watch it come to life. Sprites, music, sound effects, 3D models, multiplayer networking -- the AI handles all of it. Just talk to it like a creative partner.

Built for [GenAI Genesis 2026](https://genai-genesis-2026.devpost.com).

## Demo

**[axiom-omega-five.vercel.app](https://axiom-omega-five.vercel.app)**

## What makes Axiom different

- **Zero barrier to entry** -- no coding, no asset pipeline, no game engine experience needed
- **20+ AI tools** -- Claude Sonnet orchestrates file management, sprite generation, music composition, sound design, 3D modeling, and game logic through a unified MCP tool server
- **Everything is real-time** -- watch your game build itself in a live sandbox as you chat
- **Multiplayer out of the box** -- tell the AI to "add multiplayer" and it scaffolds PartyKit networking automatically
- **AI-generated assets** -- sprites and textures via Gemini Nano Banana, sound effects and music via ElevenLabs, 3D meshes via fal.ai + Three.js
- **Web search built in** -- the AI can look up docs, tutorials, and references mid-conversation via SerpAPI
- **Explore and remix** -- browse community games, fork them, and publish your own with one click

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16, React 19, TypeScript |
| AI | Claude Sonnet (Anthropic), Vercel AI SDK v6, MCP tool server (20+ tools) |
| Image generation | Gemini (Nano Banana) |
| Audio generation | ElevenLabs |
| 3D | Three.js, fal.ai mesh generation |
| Multiplayer | PartyKit |
| Database | MongoDB |
| UI | Tailwind CSS v4, Dockview, Prism.js |
| Search | SerpAPI |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm

### Environment Variables

Copy the example and fill in your keys:

```bash
cp .env.example .env
```

See `.env.example` for all required variables. The app is **password protected** -- set `AUTH_USERNAME` and `AUTH_PASSWORD` to control access.

### Install and Run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
  app/
    api/
      chat/            # Main AI endpoint with 20+ tools
      games/           # Game CRUD, publishing, thumbnails
      generate-image/  # Image generation
      images/          # Image storage and editing
      meshes/          # 3D mesh storage
      projects/        # Project management and revisions
      sounds/          # Sound file storage
      auth/            # Authentication
    explore/           # Community game browser
    play/[id]/         # Game player page
  components/
    chat-panel.tsx     # AI chat interface
    sandbox.tsx        # Live game preview iframe
    dock-layout.tsx    # Dockview panel system
    toolbar.tsx        # Top menu bar
    images-panel.tsx   # Image asset manager
    audio-panel.tsx    # Audio asset manager
    meshes-panel.tsx   # 3D mesh asset manager
    panels/            # Dockview panel wrappers
  lib/
    system-prompt.ts       # LLM system prompt
    game-forge-context.tsx # Shared state
    elevenlabs.ts          # ElevenLabs integration
    fal.ts                 # fal.ai integration
    multiplayer/           # PartyKit scaffold
    db/                    # MongoDB client and schemas
```

## Team

Built with late nights and too much game testing at GenAI Genesis 2026.

## License

MIT
