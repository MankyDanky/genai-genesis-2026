# GameForge AI

An AI-powered game creation tool. Chat with an AI agent to create browser-based games in real-time.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file with your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=your-key-here
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

4. Open the app and start chatting — ask the AI to create any game!

## Features

- AI agent with MCP-style tool calling (create, update, clear games)
- Sandboxed game rendering in an iframe
- Dockable, resizable panels (react-mosaic)
- Neo-brutalist UI design
