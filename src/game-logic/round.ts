import type { RoundState, Balloon, GameSettings, RandomGenerator } from './types'
import { generateTarget, generateRoundFormulas } from './formula-generator'

// Global RNG for round generation (injectable via setRoundRng hook)
let roundRng: RandomGenerator | undefined

export function setRoundRng(rngFn: (() => number) | undefined) {
  if (rngFn) {
    roundRng = { random: rngFn }
  } else {
    roundRng = undefined
  }
}

/**
 * Create a new round with balloons
 */
export function createRound(settings: GameSettings): RoundState {
  const target = generateTarget(settings.upperLimit, roundRng)
  const formulas = generateRoundFormulas(
    target,
    settings.balloonCount,
    settings.upperLimit,
    settings.operations,
    roundRng
  )

  const balloons: Balloon[] = formulas.map((formula, index) => ({
    id: `balloon-${Date.now()}-${index}-${Math.random()}`,
    formula,
    isCorrect: formula.result === target
  }))

  return {
    target,
    balloons,
    wrongAttempts: 0,
    hintsEnabled: false
  }
}

/**
 * Check if a balloon is correct for the current target
 */
export function checkBalloon(round: RoundState, balloonId: string): boolean {
  const balloon = round.balloons.find(b => b.id === balloonId)
  return balloon?.isCorrect ?? false
}

/**
 * Handle a correct balloon pop
 * Returns updated round state (should start a new round)
 */
export function handleCorrectPop(round: RoundState, settings: GameSettings): RoundState {
  return createRound(settings)
}

/**
 * Handle a wrong balloon attempt
 * Returns updated round state with incremented wrong attempts
 */
export function handleWrongAttempt(round: RoundState): RoundState {
  const newWrongAttempts = round.wrongAttempts + 1
  return {
    ...round,
    wrongAttempts: newWrongAttempts,
    hintsEnabled: newWrongAttempts >= 2
  }
}

/**
 * Check if hints should be shown (after 2 wrong attempts)
 */
export function shouldShowHint(round: RoundState): boolean {
  return round.hintsEnabled
}

/**
 * Reset balloons to top (when they reach bottom)
 */
export function resetBalloons(round: RoundState): RoundState {
  return {
    ...round
  }
}
