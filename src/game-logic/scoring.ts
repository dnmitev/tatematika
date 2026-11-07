import type { GameState, GameSettings } from './types'
import { createRound } from './round'

/**
 * Add a star to the game state
 */
export function addStar(state: GameState): GameState {
  return {
    ...state,
    stars: state.stars + 1
  }
}

/**
 * Check if the level is complete
 */
export function isLevelComplete(state: GameState): boolean {
  return state.stars >= state.settings.correctBalloonsPerLevel
}

/**
 * Start a new level
 */
export function startNewLevel(state: GameState): GameState {
  return {
    ...state,
    stars: 0,
    level: state.level + 1,
    round: createRound(state.settings)
  }
}

/**
 * Create initial game state
 */
export function createInitialState(settings: GameSettings): GameState {
  return {
    round: createRound(settings),
    stars: 0,
    level: 1,
    settings
  }
}
