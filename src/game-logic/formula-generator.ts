import type { Formula, Operation, RandomGenerator } from './types'

/**
 * Generate a random formula based on the given constraints
 */
export function generateFormula(
  upperLimit: number,
  operation: Operation
): Formula {
  let formula: Formula
  let attempts = 0
  const maxAttempts = 1000

  do {
    const actualOp = operation === 'both' 
      ? (Math.random() < 0.5 ? 'addition' : 'subtraction')
      : operation

    if (actualOp === 'addition') {
      const left = randomInt(0, upperLimit)
      const maxRight = upperLimit - left
      const right = randomInt(0, maxRight)
      const result = left + right
      formula = {
        left,
        operator: '+',
        right,
        result,
        display: formatFormula({ left, operator: '+', right, result, display: '' })
      }
    } else {
      const left = randomInt(0, upperLimit)
      const right = randomInt(0, left)
      const result = left - right
      formula = {
        left,
        operator: '−',
        right,
        result,
        display: formatFormula({ left, operator: '−', right, result, display: '' })
      }
    }

    attempts++
    if (attempts >= maxAttempts) {
      break
    }
  } while (!isValidFormula(formula, upperLimit, operation))

  return formula
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Generate formulas for a round with exactly one correct answer
 */
export function generateRoundFormulas(
  target: number,
  count: number,
  upperLimit: number,
  operation: Operation,
  rng?: RandomGenerator
): Formula[] {
  const formulas: Formula[] = []
  const usedResults = new Set<number>([target])
  const usedFormulas = new Set<string>()

  let correctFormula: Formula | null = null
  const maxAttempts = 1000
  
  for (let attempt = 0; attempt < maxAttempts && !correctFormula; attempt++) {
    const formula = generateFormula(upperLimit, operation)
    if (formula.result === target && !usedFormulas.has(formula.display)) {
      correctFormula = formula
      usedFormulas.add(formula.display)
    }
  }

  if (!correctFormula) {
    correctFormula = createFormulaForTarget(target, operation)
    usedFormulas.add(correctFormula.display)
  }

  formulas.push(correctFormula)

  for (let i = 1; i < count; i++) {
    let wrongFormula: Formula | null = null
    for (let attempt = 0; attempt < maxAttempts && !wrongFormula; attempt++) {
      const formula = generateFormula(upperLimit, operation)
      if (
        formula.result !== target &&
        !usedResults.has(formula.result) &&
        !usedFormulas.has(formula.display)
      ) {
        wrongFormula = formula
        usedResults.add(formula.result)
        usedFormulas.add(formula.display)
      }
    }

    if (wrongFormula) {
      formulas.push(wrongFormula)
    }
  }

  // Shuffle array using Fisher-Yates with injected RNG or Math.random
  const random = rng ? () => rng.random() : () => Math.random()
  for (let i = formulas.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[formulas[i], formulas[j]] = [formulas[j], formulas[i]]
  }

  return formulas
}

function createFormulaForTarget(target: number, operation: Operation): Formula {
  const actualOp = operation === 'both' ? 'addition' : operation
  
  if (actualOp === 'addition') {
    const left = Math.floor(target / 2)
    const right = target - left
    return {
      left,
      operator: '+',
      right,
      result: target,
      display: `${left} + ${right}`
    }
  } else {
    const right = 0
    const left = target
    return {
      left,
      operator: '−',
      right,
      result: target,
      display: `${left} − ${right}`
    }
  }
}

/**
 * Generate a random target number within the upper limit
 */
export function generateTarget(upperLimit: number): number {
  return randomInt(0, upperLimit)
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
  if (formula.left < 0 || formula.left > upperLimit) return false
  if (formula.right < 0 || formula.right > upperLimit) return false
  if (formula.result < 0 || formula.result > upperLimit) return false

  if (formula.operator === '−' && formula.left < formula.right) return false

  if (operation === 'addition' && formula.operator === '−') return false
  if (operation === 'subtraction' && formula.operator === '+') return false

  const expectedResult = formula.operator === '+' 
    ? formula.left + formula.right 
    : formula.left - formula.right
  if (formula.result !== expectedResult) return false

  return true
}

/**
 * Format a formula for display with proper minus sign (U+2212)
 */
export function formatFormula(formula: Formula): string {
  return `${formula.left} ${formula.operator} ${formula.right}`
}
