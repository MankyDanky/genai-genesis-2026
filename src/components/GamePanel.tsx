import { useEffect, forwardRef } from 'react'
import type { GameState } from '../types'

interface GamePanelProps {
  gameState: GameState
}

const EMPTY_PAGE = `<!DOCTYPE html>
<html>
<head><style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
  body {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: #0a0a0a;
    font-family: 'JetBrains Mono', monospace;
    color: #2a2a2a;
    text-align: center;
  }
  .placeholder { padding: 2rem; }
  h2 { font-size: 0.8rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.3rem; }
  p { font-size: 0.7rem; color: #222; }
</style></head>
<body>
  <div class="placeholder">
    <h2>Awaiting Game</h2>
    <p>Your creation will appear here</p>
  </div>
</body>
</html>`

const GamePanel = forwardRef<HTMLIFrameElement, GamePanelProps>(
  ({ gameState }, ref) => {
    useEffect(() => {
      const iframe = (ref as React.RefObject<HTMLIFrameElement>)?.current
      if (!iframe) return

      const doc = iframe.contentDocument
      if (!doc) return

      doc.open()
      doc.write(gameState.code || EMPTY_PAGE)
      doc.close()
    }, [gameState.code, ref])

    return (
      <div className="game-panel">
        <iframe
          ref={ref}
          title={gameState.title || 'Game Window'}
          sandbox="allow-scripts allow-same-origin"
          className="game-iframe"
        />
      </div>
    )
  }
)

GamePanel.displayName = 'GamePanel'

export default GamePanel
