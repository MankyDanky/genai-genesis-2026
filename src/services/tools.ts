import type { ToolDefinition, ToolUseBlock, GameState } from '../types'

export const gameTools: ToolDefinition[] = [
  {
    name: 'create_game',
    description:
      'Create a new game in the game window. Provide complete HTML with embedded JavaScript and CSS. The code runs in a sandboxed iframe. Use canvas, DOM elements, or any browser API. Include all game logic, rendering, and input handling in a single self-contained HTML document.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The name/title of the game',
        },
        code: {
          type: 'string',
          description:
            'Complete HTML document with embedded JS/CSS for the game. Must be a full valid HTML page with <!DOCTYPE html>.',
        },
      },
      required: ['title', 'code'],
    },
  },
  {
    name: 'update_game',
    description:
      'Execute JavaScript code in the currently running game to modify it. Use this to tweak gameplay, fix bugs, or add features to an existing game.',
    input_schema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute in the game iframe context',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'clear_game',
    description: 'Clear the current game and reset the game window to its empty state.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
]

export type ToolExecutor = {
  create_game: (input: { title: string; code: string }) => string
  update_game: (input: { code: string }) => string
  clear_game: () => string
}

export function createToolExecutor(
  setGameState: React.Dispatch<React.SetStateAction<GameState>>,
  iframeRef: React.RefObject<HTMLIFrameElement | null>
): ToolExecutor {
  return {
    create_game: ({ title, code }) => {
      setGameState({ title, code, isRunning: true })
      return `Game "${title}" created and running.`
    },
    update_game: ({ code }) => {
      try {
        const iframe = iframeRef.current
        if (!iframe?.contentWindow) {
          return 'Error: No game is currently running.'
        }
        const fn = new (iframe.contentWindow as unknown as { Function: typeof Function }).Function(code)
        fn()
        return 'Game updated successfully.'
      } catch (e) {
        return `Error updating game: ${e instanceof Error ? e.message : String(e)}`
      }
    },
    clear_game: () => {
      setGameState({ title: '', code: null, isRunning: false })
      return 'Game cleared.'
    },
  }
}

export function executeTool(
  toolUse: ToolUseBlock,
  executor: ToolExecutor
): string {
  const fn = executor[toolUse.name as keyof ToolExecutor]
  if (!fn) {
    return `Unknown tool: ${toolUse.name}`
  }
  try {
    return (fn as (input: Record<string, unknown>) => string)(
      toolUse.input as Record<string, unknown>
    )
  } catch (e) {
    return `Tool execution error: ${e instanceof Error ? e.message : String(e)}`
  }
}
