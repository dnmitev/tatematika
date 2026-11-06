import type { RoundState, Balloon, GameSettings } from './types'

/**
 * Create a new round with balloons
 */
export function createRound(settings: GameSettings): RoundState {
  throw new Error('not implemented')
}

/**
 * Check if a balloon is correct for the current target
 */
export function checkBalloon(round: RoundState, balloonId: string): boolean {
  throw new Error('not implemented')
}

/**
 * Handle a correct balloon pop
 * Returns updated round state (should start a new round)
 */
export function handleCorrectPop(round: RoundState, settings: GameSettings): RoundState {
  throw new Error('not implemented')
}

/**
 * Handle a wrong balloon attempt
 * Returns updated round state with incremented wrong attempts
 */
export function handleWrongAttempt(round: RoundState): RoundState {
  throw new Error('not implemented')
}

/**
 * Check if hints should be shown (after 2 wrong attempts)
 */
export function shouldShowHint(round: RoundState): boolean {
  throw new Error('not implemented')
}

/**
 * Reset balloons to top (when they reach bottom)
 */
export function resetBalloons(round: RoundState): RoundState {
  throw new Error('not implemented')
}
