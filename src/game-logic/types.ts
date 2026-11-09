/**
 * Game operation types
 */
export type Operation = 'addition' | 'subtraction' | 'both'

/**
 * Balloon speed setting
 */
export type BalloonSpeed = 'slow' | 'medium'

/**
 * Game settings
 */
export interface GameSettings {
  upperLimit: number // 5-20
  operations: Operation
  balloonCount: number // 2-5
  correctBalloonsPerLevel: number // 5-20
  balloonSpeed: BalloonSpeed
}

/**
 * Math formula
 */
export interface Formula {
  left: number
  operator: '+' | '−' // Note: U+2212 minus sign, not hyphen
  right: number
  result: number
  display: string // e.g., "2 + 3"
}

/**
 * Round balloon data
 */
export interface Balloon {
  id: string
  formula: Formula
  isCorrect: boolean
}

/**
 * Round state
 */
export interface RoundState {
  target: number
  balloons: Balloon[]
  wrongAttempts: number
  hintsEnabled: boolean
}

/**
 * Game state
 */
export interface GameState {
  round: RoundState
  stars: number
  level: number
  settings: GameSettings
}

/**
 * Random number generator interface for dependency injection
 */
export interface RandomGenerator {
  /** Returns a random number in [0, 1) */
  random(): number
}
