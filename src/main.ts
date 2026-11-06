import Phaser from 'phaser'
import { loadSettings } from './game-logic/settings'

/**
 * Test hook API for Playwright e2e tests
 * Exposed on window for test access
 */
export interface TatematikaTestHook {
  getGameState(): {
    target: number
    balloons: Array<{ id: string; formula: string; isCorrect: boolean }>
    stars: number
    wrongAttempts: number
    settings: {
      upperLimit: number
      balloonCount: number
      correctBalloonsPerLevel: number
    }
  }
  clickBalloon(balloonId: string): void
  pressKey(key: 'left' | 'right' | 'space' | 'up'): void
  toggleMute(): void
  isMuted(): boolean
  getLevelEndText(): string | null
}

// Expose test hooks
declare global {
  interface Window {
    __tatematika?: TatematikaTestHook
  }
}

// Minimal Phaser config to boot the game
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game-container',
  scene: {
    create() {
      // Stub scene - will be implemented by developer
      this.add.text(400, 300, 'Котето и балоните', {
        fontSize: '32px',
        color: '#000000'
      }).setOrigin(0.5)
    }
  }
}

// Initialize the game
const game = new Phaser.Game(config)

// Load settings on startup
const settings = loadSettings()

// Stub test hook implementation
window.__tatematika = {
  getGameState() {
    throw new Error('not implemented')
  },
  clickBalloon(balloonId: string) {
    throw new Error('not implemented')
  },
  pressKey(key: 'left' | 'right' | 'space' | 'up') {
    throw new Error('not implemented')
  },
  toggleMute() {
    throw new Error('not implemented')
  },
  isMuted() {
    throw new Error('not implemented')
  },
  getLevelEndText() {
    throw new Error('not implemented')
  }
}

export { game }
