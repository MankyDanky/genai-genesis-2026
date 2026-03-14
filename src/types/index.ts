export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: ContentBlock[]
  timestamp: number
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

export interface ToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface GameState {
  title: string
  code: string | null
  isRunning: boolean
}

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: ContentBlock[] | string
}

export interface AnthropicResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: ContentBlock[]
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
}
