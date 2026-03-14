import { useState, useRef, useEffect } from 'react'
import type { ChatMessage } from '../types'
import MessageBubble from './MessageBubble'

interface ChatPanelProps {
  messages: ChatMessage[]
  isLoading: boolean
  onSend: (text: string) => void
}

export default function ChatPanel({ messages, isLoading, onSend }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return
    onSend(input.trim())
    setInput('')
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <h3>GameForge</h3>
            <p>Describe a game and I'll build it.</p>
            <div className="chat-suggestions">
              <button onClick={() => onSend('Make me a snake game')} className="suggestion-btn">
                Snake Game
              </button>
              <button onClick={() => onSend('Create a breakout/brick breaker game')} className="suggestion-btn">
                Breakout
              </button>
              <button onClick={() => onSend('Build a simple platformer game')} className="suggestion-btn">
                Platformer
              </button>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isLoading && (
          <div className="message-row message-assistant">
            <div className="message-bubble bubble-assistant">
              <div className="loading-dots">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Describe a game to create..."
          rows={1}
          className="chat-input"
          disabled={isLoading}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className="send-btn"
        >
          &#10148;
        </button>
      </div>
    </div>
  )
}
