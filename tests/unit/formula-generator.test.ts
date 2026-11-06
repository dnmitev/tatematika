import { describe, it, expect } from 'vitest'
import {
  generateFormula,
  generateRoundFormulas,
  generateTarget,
  isValidFormula,
  formatFormula,
} from '../../src/game-logic/formula-generator'
import type { Formula } from '../../src/game-logic/types'

describe('Formula Generator', () => {
  describe('К2: No negative results', () => {
    it('should generate 1000 formulas without negative results or exceeding upper limit', () => {
      // К2: Generate 1000 formulas and verify none have negative results
      // and all numbers are within [0, upperLimit]
      const upperLimit = 6
      const formulas: Formula[] = []
      
      for (let i = 0; i < 1000; i++) {
        const formula = generateFormula(upperLimit, 'both')
        formulas.push(formula)
        
        // All operands must be within [0, upperLimit]
        expect(formula.left).toBeGreaterThanOrEqual(0)
        expect(formula.left).toBeLessThanOrEqual(upperLimit)
        expect(formula.right).toBeGreaterThanOrEqual(0)
        expect(formula.right).toBeLessThanOrEqual(upperLimit)
        
        // Result must be within [0, upperLimit]
        expect(formula.result).toBeGreaterThanOrEqual(0)
        expect(formula.result).toBeLessThanOrEqual(upperLimit)
        
        // For subtraction: minuend >= subtrahend (no negative results)
        if (formula.operator === '−') {
          expect(formula.left).toBeGreaterThanOrEqual(formula.right)
        }
      }
      
      expect(formulas).toHaveLength(1000)
    })
  })

  describe('Math rules: Integer operands 0..limit', () => {
    it('should generate formulas with integers from 0 to upperLimit', () => {
      for (let i = 0; i < 100; i++) {
        const formula = generateFormula(10, 'both')
        
        expect(Number.isInteger(formula.left)).toBe(true)
        expect(Number.isInteger(formula.right)).toBe(true)
        expect(Number.isInteger(formula.result)).toBe(true)
        
        expect(formula.left).toBeGreaterThanOrEqual(0)
        expect(formula.left).toBeLessThanOrEqual(10)
        expect(formula.right).toBeGreaterThanOrEqual(0)
        expect(formula.right).toBeLessThanOrEqual(10)
      }
    })
  })

  describe('Math rules: Correct operator display', () => {
    it('should use U+2212 minus sign, not hyphen', () => {
      // Generate subtraction formulas and check the minus sign
      for (let i = 0; i < 50; i++) {
        const formula = generateFormula(10, 'subtraction')
        
        expect(formula.operator).toBe('−') // U+2212
        expect(formula.operator).not.toBe('-') // Not hyphen
        
        const display = formatFormula(formula)
        expect(display).toContain('−') // U+2212
        expect(display).not.toMatch(/\d\s*-\s*\d/) // No hyphen
      }
    })
  })

  describe('Math rules: Only two-operand formulas', () => {
    it('should generate formulas with exactly two operands', () => {
      for (let i = 0; i < 100; i++) {
        const formula = generateFormula(10, 'both')
        
        // Formula should be "a + b" or "a − b"
        expect(formula.display).toMatch(/^\d+\s*[+−]\s*\d+$/)
      }
    })
  })

  describe('Math rules: Operations setting respected', () => {
    it('should generate only addition when operations = "addition"', () => {
      for (let i = 0; i < 50; i++) {
        const formula = generateFormula(10, 'addition')
        expect(formula.operator).toBe('+')
      }
    })

    it('should generate only subtraction when operations = "subtraction"', () => {
      for (let i = 0; i < 50; i++) {
        const formula = generateFormula(10, 'subtraction')
        expect(formula.operator).toBe('−')
      }
    })

    it('should generate both operations when operations = "both"', () => {
      const operators = new Set<string>()
      
      for (let i = 0; i < 100; i++) {
        const formula = generateFormula(10, 'both')
        operators.add(formula.operator)
      }
      
      // Should have both operators in 100 generations
      expect(operators.has('+')).toBe(true)
      expect(operators.has('−')).toBe(true)
    })
  })

  describe('Math rules: Sums never exceed limit', () => {
    it('should ensure addition results stay within upper limit', () => {
      for (let i = 0; i < 100; i++) {
        const formula = generateFormula(6, 'addition')
        
        expect(formula.left + formula.right).toBeLessThanOrEqual(6)
        expect(formula.result).toBe(formula.left + formula.right)
        expect(formula.result).toBeLessThanOrEqual(6)
      }
    })
  })

  describe('Math rules: No negative results', () => {
    it('should ensure minuend >= subtrahend for subtraction', () => {
      for (let i = 0; i < 100; i++) {
        const formula = generateFormula(10, 'subtraction')
        
        expect(formula.left).toBeGreaterThanOrEqual(formula.right)
        expect(formula.result).toBe(formula.left - formula.right)
        expect(formula.result).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('Round formulas', () => {
    it('should generate exactly one correct balloon per round', () => {
      // К1 requirement: exactly one correct balloon
      const target = 5
      const formulas = generateRoundFormulas(target, 3, 10, 'both')
      
      const correctCount = formulas.filter(f => f.result === target).length
      expect(correctCount).toBe(1)
    })

    it('should generate wrong balloons with different results from target', () => {
      const target = 5
      const formulas = generateRoundFormulas(target, 3, 10, 'both')
      
      const wrongFormulas = formulas.filter(f => f.result !== target)
      wrongFormulas.forEach(f => {
        expect(f.result).not.toBe(target)
      })
    })

    it('should generate wrong balloons with different results from each other', () => {
      const target = 5
      const formulas = generateRoundFormulas(target, 4, 10, 'both')
      
      const results = formulas.map(f => f.result)
      const uniqueResults = new Set(results)
      
      // All results should be unique
      expect(uniqueResults.size).toBe(results.length)
    })

    it('should not generate exact duplicate formulas within a round', () => {
      for (let i = 0; i < 50; i++) {
        const target = Math.floor(Math.random() * 11)
        const formulas = generateRoundFormulas(target, 4, 10, 'both')
        
        const formulaStrings = formulas.map(f => f.display)
        const uniqueFormulas = new Set(formulaStrings)
        
        expect(uniqueFormulas.size).toBe(formulaStrings.length)
      }
    })
  })

  describe('Default settings', () => {
    it('should work with default limit 6, 3 balloons', () => {
      const target = 4
      const formulas = generateRoundFormulas(target, 3, 6, 'both')
      
      expect(formulas).toHaveLength(3)
      
      formulas.forEach(f => {
        expect(f.result).toBeGreaterThanOrEqual(0)
        expect(f.result).toBeLessThanOrEqual(6)
      })
    })
  })

  describe('Setting ranges validation', () => {
    it('should handle limit range 5-20', () => {
      const limits = [5, 10, 15, 20]
      
      limits.forEach(limit => {
        const formula = generateFormula(limit, 'both')
        expect(formula.result).toBeLessThanOrEqual(limit)
      })
    })

    it('should handle balloon count range 2-5', () => {
      const counts = [2, 3, 4, 5]
      
      counts.forEach(count => {
        const formulas = generateRoundFormulas(5, count, 10, 'both')
        expect(formulas).toHaveLength(count)
      })
    })
  })

  describe('Target generation', () => {
    it('should generate targets within upper limit', () => {
      for (let i = 0; i < 100; i++) {
        const target = generateTarget(6)
        expect(target).toBeGreaterThanOrEqual(0)
        expect(target).toBeLessThanOrEqual(6)
      }
    })
  })

  describe('Formula validation', () => {
    it('should validate formulas according to game rules', () => {
      const validAddition: Formula = {
        left: 2,
        operator: '+',
        right: 3,
        result: 5,
        display: '2 + 3'
      }
      
      expect(isValidFormula(validAddition, 6, 'addition')).toBe(true)
      
      const validSubtraction: Formula = {
        left: 5,
        operator: '−',
        right: 2,
        result: 3,
        display: '5 − 2'
      }
      
      expect(isValidFormula(validSubtraction, 6, 'subtraction')).toBe(true)
    })

    it('should reject formulas exceeding upper limit', () => {
      const exceedsLimit: Formula = {
        left: 5,
        operator: '+',
        right: 5,
        result: 10,
        display: '5 + 5'
      }
      
      expect(isValidFormula(exceedsLimit, 6, 'addition')).toBe(false)
    })

    it('should reject negative results', () => {
      const negative: Formula = {
        left: 2,
        operator: '−',
        right: 5,
        result: -3,
        display: '2 − 5'
      }
      
      expect(isValidFormula(negative, 10, 'subtraction')).toBe(false)
    })
  })
})
