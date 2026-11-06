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
  getMuteButtonBounds(): { width: number; height: number }
  getCatPosition(): { x: number; y: number }
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

function getLevelCompleteScene(): any {
  return game.scene.getScene('LevelCompleteScene')
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
    const levelScene = getLevelCompleteScene()
    if (levelScene && levelScene.scene.isActive()) {
      return levelScene.getLevelEndText ? levelScene.getLevelEndText() : null
    }
    return null
  },
  
  // Regression test hooks
  getLastPlayedSound() {
    const gameScene = getGameScene()
    if (!gameScene) {
      throw new Error('GameScene not active')
    }
    return gameScene.getLastPlayedSound ? gameScene.getLastPlayedSound() : null
  },
  
  getFormulaFontSize() {
    const gameScene = getGameScene()
    if (!gameScene) {
      throw new Error('GameScene not active')
    }
    return gameScene.getFormulaFontSize ? gameScene.getFormulaFontSize() : 0
  },
  
  getMuteButtonBounds() {
    const gameScene = getGameScene()
    if (!gameScene) {
      throw new Error('GameScene not active')
    }
    return gameScene.getMuteButtonBounds ? gameScene.getMuteButtonBounds() : { width: 0, height: 0 }
  },
  
  getCatPosition() {
    const gameScene = getGameScene()
    if (!gameScene) {
      throw new Error('GameScene not active')
    }
    return gameScene.getCatPosition ? gameScene.getCatPosition() : { x: 0, y: 0 }
  },
  
  getBalloonAnimationState(balloonId: string) {
    const gameScene = getGameScene()
    if (!gameScene) {
      throw new Error('GameScene not active')
    }
    return gameScene.getBalloonAnimationState ? gameScene.getBalloonAnimationState(balloonId) : { isBouncing: false, isPopping: false }
  },
  
  // Settings UI hooks
  openSettings() {
    const gameScene = getGameScene()
    if (!gameScene) {
      throw new Error('GameScene not active')
    }
    if (gameScene.openSettings) {
      gameScene.openSettings()
    }
  },
  
  closeSettings() {
    const gameScene = getGameScene()
    if (!gameScene) {
      throw new Error('GameScene not active')
    }
    if (gameScene.closeSettings) {
      gameScene.closeSettings()
    }
  },
  
  isSettingsOpen() {
    const gameScene = getGameScene()
    if (!gameScene) {
      return false
    }
    return gameScene.isSettingsOpen ? gameScene.isSettingsOpen() : false
  }
}

export { game }
