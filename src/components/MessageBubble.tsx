import type { ChatMessage, ContentBlock } from '../types'

interface MessageBubbleProps {
  message: ChatMessage
}

function renderBlock(block: ContentBlock, index: number) {
  switch (block.type) {
    case 'text':
      return (
        <p key={index} className="message-text">
          {block.text}
        </p>
      )
    case 'tool_use':
      return (
        <div key={index} className="tool-call">
          <div className="tool-call-header">
            <span className="tool-call-icon">&#9881;</span>
            <span className="tool-call-name">{block.name}</span>
          </div>
          {block.name === 'create_game' && (
            <span className="tool-call-detail">
              Creating "{(block.input as { title?: string }).title}"...
            </span>
          )}
          {block.name === 'update_game' && (
            <span className="tool-call-detail">Updating game code...</span>
          )}
          {block.name === 'clear_game' && (
            <span className="tool-call-detail">Clearing game window...</span>
          )}
        </div>
      )
    case 'tool_result':
      return null
    default:
      return null
  }
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  const hasVisibleContent = message.content.some(
    (b) => b.type === 'text' || b.type === 'tool_use'
  )
  if (!hasVisibleContent) return null

  return (
    <div className={`message-row ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className={`message-bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
        {message.content.map((block, i) => renderBlock(block, i))}
      </div>
    </div>
  )
}
