import type { GameState, GameSettings } from './types'

/**
 * Add a star to the game state
 */
export function addStar(state: GameState): GameState {
  throw new Error('not implemented')
}

/**
 * Check if the level is complete
 */
export function isLevelComplete(state: GameState): boolean {
  throw new Error('not implemented')
}

/**
 * Start a new level
 */
export function startNewLevel(state: GameState): GameState {
  throw new Error('not implemented')
}

/**
 * Create initial game state
 */
export function createInitialState(settings: GameSettings): GameState {
  throw new Error('not implemented')
}
