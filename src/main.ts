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
  getSoundPlayCount(): number
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
  
  // Real geometry measurement hook
  // Returns the Phaser.Game instance for direct scene/object inspection
  // Used by real-geometry.spec.ts to measure actual rendered sizes
  getGame(): Phaser.Game
  
  /**
   * K17 Test Hook: Controlled RNG for Deterministic Shuffle
   * 
   * CONTRACT (K17 requirement: "рандомизацията е контролирана със зададена последователност"):
   * E2E tests MUST be able to inject a seeded RNG that is used EXCLUSIVELY for:
   * - Balloon position shuffling in createRound
   * - Formula generation (operation selection, number selection) in createRound
   * - Any other round-generation randomness
   * 
   * This RNG should NOT be used for:
   * - Balloon IDs (Date.now() + Math.random() in round.ts is fine)
   * - Color selection (GameScene.ts:605 Math.random is fine)
   * - Any rendering/animation timing-dependent randomness
   * 
   * Implementation requirement:
   * When setRoundRng(fn) is called with a seeded PRNG function, ALL round-generation
   * code in formula-generator.ts must use this injected RNG instead of Math.random().
   * The shuffle function already accepts an optional rng parameter - wire it through
   * from createRound.
   * 
   * Test behavior:
   * Tests inject a seeded Mulberry32 PRNG via this hook AND replace global Math.random
   * as a fallback. With identical seeds, two test runs MUST produce identical balloon
   * position sequences across 30+ rounds (deterministic shuffle distribution).
   * 
   * Until implemented, shuffle-distribution.spec.ts determinism tests will FAIL with
   * "Same seed should produce identical slot sequence" because Math.random call count
   * varies per round (colors, IDs, timing), causing RNG stream drift.
   */
  setRoundRng?(rngFn: () => number): void
}

// Expose test hooks
declare global {
  interface Window {
    __tatematika?: TatematikaTestHook
  }
}

// Phaser config with viewport-matched dimensions
// Game space matches viewport for true responsive layout
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  scene: [GameScene, LevelCompleteScene],
  backgroundColor: '#87CEEB',
  scale: {
    mode: Phaser.Scale.RESIZE,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight
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
    const levelCompleteScene = game.scene.getScene('LevelCompleteScene')
    if (levelCompleteScene && levelCompleteScene.scene.isActive()) {
      return (levelCompleteScene as any).getLevelEndText()
    }
    return null
  },
  
  // Regression test hooks
  getLastPlayedSound() {
    const gameScene = getGameScene()
    if (!gameScene) {
      return null
    }
    return gameScene.getLastPlayedSound()
  },
  getSoundPlayCount() {
    const gameScene = getGameScene()
    if (!gameScene) {
      return 0
    }
    return gameScene.getSoundPlayCount()
  },
  getFormulaFontSize() {
    const gameScene = getGameScene()
    if (!gameScene) {
      throw new Error('GameScene not active')
    }
    return gameScene.getFormulaFontSize()
  },
  getTargetFontSize() {
    const gameScene = getGameScene()
    if (!gameScene) {
      throw new Error('GameScene not active')
    }
    return gameScene.getTargetFontSize()
  },
  getMuteButtonBounds() {
    const gameScene = getGameScene()
    if (!gameScene) {
      throw new Error('GameScene not active')
    }
    return gameScene.getMuteButtonBounds()
  },
  getCatPosition() {
    const gameScene = getGameScene()
    if (!gameScene) {
      throw new Error('GameScene not active')
    }
    return gameScene.getCatPosition()
  },
  getCatJumpState() {
    const gameScene = getGameScene()
    if (!gameScene) {
      throw new Error('GameScene not active')
    }
    return gameScene.getCatJumpState()
  },
  getBalloonBounds(balloonId: string) {
    const gameScene = getGameScene()
    if (!gameScene) {
      return null
    }
    return gameScene.getBalloonBounds(balloonId)
  },
  getBalloonAnimationState(balloonId: string) {
    const gameScene = getGameScene()
    if (!gameScene) {
      return { isBouncing: false, isPopping: false }
    }
    return gameScene.getBalloonAnimationState(balloonId)
  },
  
  // Settings UI hooks
  openSettings() {
    const gameScene = getGameScene()
    if (gameScene) {
      gameScene.openSettings()
    }
  },
  closeSettings() {
    const gameScene = getGameScene()
    if (gameScene) {
      gameScene.closeSettings()
    }
  },
  isSettingsOpen() {
    const gameScene = getGameScene()
    if (!gameScene) {
      return false
    }
    return gameScene.isSettingsOpen()
  },
  
  getGame() {
    return game
  }
}

export { game }
