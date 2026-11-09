import { describe, it, expect } from 'vitest'
import { generateRoundFormulas } from '../../src/game-logic/formula-generator'
import type { RandomGenerator } from '../../src/game-logic/types'

/**
 * Shuffle distribution tests
 * 
 * Verifies that the correct balloon's position is randomly distributed,
 * not always in the leftmost slot.
 */

// Fairness thresholds
const MAX_SLOT_RATIO = 2.0 // No slot should get more than 2x its fair share

describe('Balloon shuffle distribution', () => {
  /**
   * Deterministic RNG for reproducible tests
   * Uses a simple Linear Congruential Generator
   */
  class SeededRandom implements RandomGenerator {
    private seed: number
    
    constructor(seed: number) {
      this.seed = seed
    }
    
    random(): number {
      // LCG parameters from Numerical Recipes
      this.seed = (this.seed * 1664525 + 1013904223) % 4294967296
      return this.seed / 4294967296
    }
  }
  
  function testShuffleDistribution(count: number, rounds: number, seed: number) {
    const rng = new SeededRandom(seed)
    const slotCounts = new Array(count).fill(0)
    
    for (let i = 0; i < rounds; i++) {
      const target = 10 // Fixed target for testing
      const formulas = generateRoundFormulas(target, count, 20, 'both', rng)
      
      // Find which position has the correct formula
      const correctIndex = formulas.findIndex(f => f.result === target)
      if (correctIndex >= 0) {
        slotCounts[correctIndex]++
      }
    }
    
    return slotCounts
  }
  
  it('Count 3: correct balloon visits all slots over 300 rounds', () => {
    const count = 3
    const rounds = 300
    const slotCounts = testShuffleDistribution(count, rounds, 12345)
    
    // Every slot must be visited at least once
    for (let slot = 0; slot < count; slot++) {
      expect(slotCounts[slot], `Slot ${slot} should be used at least once`).toBeGreaterThan(0)
    }
    
    // No slot should get more than 2x fair share
    const fairShare = rounds / count
    for (let slot = 0; slot < count; slot++) {
      expect(slotCounts[slot], `Slot ${slot} should not exceed ${MAX_SLOT_RATIO}x fair share`).toBeLessThanOrEqual(fairShare * MAX_SLOT_RATIO)
    }
    
    // Should not be slot 0 in every round
    expect(slotCounts[0], 'Correct balloon should not always be in slot 0').toBeLessThan(rounds)
  })
  
  it('Count 4: correct balloon visits all slots over 300 rounds', () => {
    const count = 4
    const rounds = 300
    const slotCounts = testShuffleDistribution(count, rounds, 23456)
    
    // Every slot must be visited at least once
    for (let slot = 0; slot < count; slot++) {
      expect(slotCounts[slot], `Slot ${slot} should be used at least once`).toBeGreaterThan(0)
    }
    
    // No slot should get more than 2x fair share
    const fairShare = rounds / count
    for (let slot = 0; slot < count; slot++) {
      expect(slotCounts[slot], `Slot ${slot} should not exceed ${MAX_SLOT_RATIO}x fair share`).toBeLessThanOrEqual(fairShare * MAX_SLOT_RATIO)
    }
    
    // Should not be slot 0 in every round
    expect(slotCounts[0], 'Correct balloon should not always be in slot 0').toBeLessThan(rounds)
  })
  
  it('Count 5: correct balloon visits all slots over 300 rounds', () => {
    const count = 5
    const rounds = 300
    const slotCounts = testShuffleDistribution(count, rounds, 34567)
    
    // Every slot must be visited at least once
    for (let slot = 0; slot < count; slot++) {
      expect(slotCounts[slot], `Slot ${slot} should be used at least once`).toBeGreaterThan(0)
    }
    
    // No slot should get more than 2x fair share
    const fairShare = rounds / count
    for (let slot = 0; slot < count; slot++) {
      expect(slotCounts[slot], `Slot ${slot} should not exceed ${MAX_SLOT_RATIO}x fair share`).toBeLessThanOrEqual(fairShare * MAX_SLOT_RATIO)
    }
    
    // Should not be slot 0 in every round
    expect(slotCounts[0], 'Correct balloon should not always be in slot 0').toBeLessThan(rounds)
  })

  it('K17: 3 balloons, 100 rounds, every position at least once, not constant', () => {
    const count = 3
    const rounds = 100
    const rng = new SeededRandom(42)
    const slotCounts = new Array(count).fill(0)
    const positions: number[] = []
    
    for (let i = 0; i < rounds; i++) {
      const target = 10
      const formulas = generateRoundFormulas(target, count, 20, 'both', rng)
      
      const correctIndex = formulas.findIndex(f => f.result === target)
      if (correctIndex >= 0) {
        slotCounts[correctIndex]++
        positions.push(correctIndex)
      }
    }
    
    // Every one of the 3 positions must be used at least once
    expect(slotCounts[0], 'Position 0 (left) should be used at least once').toBeGreaterThan(0)
    expect(slotCounts[1], 'Position 1 (center) should be used at least once').toBeGreaterThan(0)
    expect(slotCounts[2], 'Position 2 (right) should be used at least once').toBeGreaterThan(0)
    
    // Not constant: position should vary (not all rounds in same position)
    const uniquePositions = new Set(positions)
    expect(uniquePositions.size, 'Position should not be constant across all rounds').toBeGreaterThan(1)
  })
})
