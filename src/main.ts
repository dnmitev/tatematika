import Phaser from 'phaser'
import { loadSettings } from './game-logic/settings'
import { GameScene } from './scenes/GameScene'
import { LevelCompleteScene } from './scenes/LevelCompleteScene'

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
  
  // Regression test hooks for review findings
  getLastPlayedSound(): string | null
  getFormulaFontSize(): number
  getTargetFontSize(): number
  getMuteButtonBounds(): { width: number; height: number }
  getCatPosition(): { x: number; y: number }
  getCatJumpState(): { isJumping: boolean; restingY: number }
  getBalloonBounds(balloonId: string): { x: number; y: number; width: number; height: number } | null
  getBalloonAnimationState(balloonId: string): { isBouncing: boolean; isPopping: boolean }
  
  // Settings UI test hooks
  openSettings(): void
  closeSettings(): void
  isSettingsOpen(): boolean
}

// Expose test hooks
declare global {
  interface Window {
    __tatematika?: TatematikaTestHook
  }
}

// Phaser config with responsive scaling
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game-container',
  scene: [GameScene, LevelCompleteScene],
  backgroundColor: '#87CEEB',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 800,
    height: 600
  }
}

// Initialize the game
const game = new Phaser.Game(config)

// Load settings on startup
loadSettings()

// Get active game scene
function getGameScene(): GameScene | null {
  const scene = game.scene.getScene('GameScene')
  return scene && scene.scene.isActive() ? (scene as GameScene) : null
}

// Test hook implementation
window.__tatematika = {
  getGameState() {
    const gameScene = getGameScene()
    if (!gameScene) {
      throw new Error('GameScene not active')
    }
    return gameScene.getGameState()
  },
  clickBalloon(balloonId: string) {
    const gameScene = getGameScene()
    if (!gameScene) {
      throw new Error('GameScene not active')
    }
    gameScene.clickBalloon(balloonId)
  },
  pressKey(key: 'left' | 'right' | 'space' | 'up') {
    const gameScene = getGameScene()
    if (!gameScene) {
      throw new Error('GameScene not active')
    }
    gameScene.pressKey(key)
  },
  toggleMute() {
    const gameScene = getGameScene()
    if (gameScene) {
      gameScene.toggleMutePublic()
    }
  },
  isMuted() {
    const gameScene = getGameScene()
    if (!gameScene) {
      return false
    }
    return gameScene.isMutedPublic()
  },
  getLevelEndText() {
    const gameScene = getGameScene()
    if (gameScene) {
      return gameScene.getLevelEndText()
    }
    return null
  },
  
  // Regression test hooks - stubs
  getLastPlayedSound() {
    throw new Error('not implemented')
  },
  getFormulaFontSize() {
    throw new Error('not implemented')
  },
  getTargetFontSize() {
    throw new Error('not implemented')
  },
  getMuteButtonBounds() {
    throw new Error('not implemented')
  },
  getCatPosition() {
    throw new Error('not implemented')
  },
  getCatJumpState() {
    throw new Error('not implemented')
  },
  getBalloonBounds(balloonId: string) {
    throw new Error('not implemented')
  },
  getBalloonAnimationState(balloonId: string) {
    throw new Error('not implemented')
  },
  
  // Settings UI hooks - stubs
  openSettings() {
    throw new Error('not implemented')
  },
  closeSettings() {
    throw new Error('not implemented')
  },
  isSettingsOpen() {
    throw new Error('not implemented')
  }
}

export { game }
