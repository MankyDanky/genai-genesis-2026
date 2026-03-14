import { useState, useCallback, useRef } from 'react'
import type {
  ChatMessage,
  ContentBlock,
  AnthropicMessage,
  ToolUseBlock,
  GameState,
} from '../types'
import { sendMessage } from '../services/anthropic'
import { gameTools, createToolExecutor, executeTool } from '../services/tools'
import type { ToolExecutor } from '../services/tools'

export function useChat(
  setGameState: React.Dispatch<React.SetStateAction<GameState>>,
  iframeRef: React.RefObject<HTMLIFrameElement | null>
) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const conversationRef = useRef<AnthropicMessage[]>([])
  const executorRef = useRef<ToolExecutor | null>(null)

  const getExecutor = useCallback(() => {
    if (!executorRef.current) {
      executorRef.current = createToolExecutor(setGameState, iframeRef)
    }
    return executorRef.current
  }, [setGameState, iframeRef])

  const addMessage = useCallback(
    (role: 'user' | 'assistant', content: ContentBlock[]) => {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role,
        content,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, msg])
      return msg
    },
    []
  )

  const sendUserMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return

      const userContent: ContentBlock[] = [{ type: 'text', text }]
      addMessage('user', userContent)
      conversationRef.current.push({ role: 'user', content: text })

      setIsLoading(true)

      try {
        let response = await sendMessage(
          conversationRef.current,
          gameTools
        )

        while (response.stop_reason === 'tool_use') {
          const assistantContent = response.content
          addMessage('assistant', assistantContent)
          conversationRef.current.push({
            role: 'assistant',
            content: assistantContent,
          })

          const toolResults: ContentBlock[] = []
          const executor = getExecutor()

          for (const block of assistantContent) {
            if (block.type === 'tool_use') {
              const result = executeTool(block as ToolUseBlock, executor)
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: result,
              })
            }
          }

          conversationRef.current.push({
            role: 'user',
            content: toolResults,
          })

          response = await sendMessage(
            conversationRef.current,
            gameTools
          )
        }

        addMessage('assistant', response.content)
        conversationRef.current.push({
          role: 'assistant',
          content: response.content,
        })
      } catch (err) {
        const errorText =
          err instanceof Error ? err.message : 'An unknown error occurred'
        addMessage('assistant', [
          { type: 'text', text: `Error: ${errorText}` },
        ])
      } finally {
        setIsLoading(false)
      }
    },
    [isLoading, addMessage, getExecutor]
  )

  return { messages, isLoading, sendUserMessage }
}
