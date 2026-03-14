import { useRef, useState, useCallback } from 'react'
import { Layout, Model, type IJsonModel, type TabNode } from 'flexlayout-react'
import 'flexlayout-react/style/dark.css'
import ChatPanel from './components/ChatPanel'
import GamePanel from './components/GamePanel'
import { useChat } from './hooks/useChat'
import type { GameState } from './types'

const layoutJson: IJsonModel = {
  global: {
    tabEnableClose: false,
    tabEnableRename: false,
    tabSetEnableMaximize: true,
    splitterSize: 4,
  },
  borders: [],
  layout: {
    type: 'row',
    weight: 100,
    children: [
      {
        type: 'tabset',
        weight: 30,
        children: [
          { type: 'tab', name: 'Chat', component: 'chat' },
        ],
      },
      {
        type: 'tabset',
        weight: 70,
        children: [
          { type: 'tab', name: 'Game', component: 'game' },
        ],
      },
    ],
  },
}

function App() {
  const modelRef = useRef(Model.fromJson(layoutJson))
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [gameState, setGameState] = useState<GameState>({
    title: '',
    code: null,
    isRunning: false,
  })

  const { messages, isLoading, sendUserMessage } = useChat(
    setGameState,
    iframeRef
  )

  const factory = useCallback(
    (node: TabNode) => {
      switch (node.getComponent()) {
        case 'chat':
          return (
            <ChatPanel
              messages={messages}
              isLoading={isLoading}
              onSend={sendUserMessage}
            />
          )
        case 'game':
          return <GamePanel ref={iframeRef} gameState={gameState} />
        default:
          return null
      }
    },
    [messages, isLoading, sendUserMessage, gameState]
  )

  return (
    <div className="app-root">
      <Layout model={modelRef.current} factory={factory} />
    </div>
  )
}

export default App
