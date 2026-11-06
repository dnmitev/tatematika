import type { Formula, Operation } from './types'

/**
 * Generate a random formula based on the given constraints
 */
export function generateFormula(
  upperLimit: number,
  operation: Operation
): Formula {
  throw new Error('not implemented')
}

/**
 * Generate formulas for a round with exactly one correct answer
 */
export function generateRoundFormulas(
  target: number,
  count: number,
  upperLimit: number,
  operation: Operation
): Formula[] {
  throw new Error('not implemented')
}

/**
 * Generate a random target number within the upper limit
 */
export function generateTarget(upperLimit: number): number {
  throw new Error('not implemented')
}

/**
 * Check if a formula is valid according to game rules:
 * - Result is within [0, upperLimit]
 * - No negative results (minuend >= subtrahend for subtraction)
 * - Correct operator usage based on operation setting
 */
export function isValidFormula(
  formula: Formula,
  upperLimit: number,
  operation: Operation
): boolean {
  throw new Error('not implemented')
}

/**
 * Format a formula for display with proper minus sign (U+2212)
 */
export function formatFormula(formula: Formula): string {
  throw new Error('not implemented')
}
