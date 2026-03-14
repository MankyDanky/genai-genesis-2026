import type { AnthropicMessage, AnthropicResponse, ToolDefinition } from '../types'

const SYSTEM_PROMPT = `You are GameForge AI, a creative game developer assistant. You create browser-based games using HTML, JavaScript, and CSS.

When asked to create a game, use the create_game tool with a complete, self-contained HTML document. Your games should:
- Be fully functional and playable immediately
- Use the HTML5 Canvas API or DOM elements for rendering
- Include keyboard/mouse controls as appropriate
- Have clean visuals with good color choices
- Include game state management (score, lives, game over, restart)
- Be responsive and fill the available space (use 100vw/100vh)

When asked to modify a running game, use update_game to inject JavaScript.
When asked to clear/reset, use clear_game.

Always respond conversationally after creating or modifying a game — briefly explain what you made and how to play it.`

export async function sendMessage(
  messages: AnthropicMessage[],
  tools: ToolDefinition[]
): Promise<AnthropicResponse> {
  const res = await fetch('/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API error (${res.status}): ${err}`)
  }

  return res.json()
}
