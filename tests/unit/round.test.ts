import { describe, it, expect } from 'vitest'
import {
  createRound,
  checkBalloon,
  handleCorrectPop,
  handleWrongAttempt,
  shouldShowHint,
  resetBalloons,
} from '../../src/game-logic/round'
import { DEFAULT_SETTINGS } from '../../src/game-logic/settings'

describe('Round Management', () => {
  describe('К1: Round start', () => {
    it('should start round with correct number of balloons and valid target', () => {
      // К1: Given game started with default settings
      // When a new round begins
      const round = createRound(DEFAULT_SETTINGS)
      
      // Then there are 3 balloons
      expect(round.balloons).toHaveLength(3)
      
      // Target is from 0 to 6
      expect(round.target).toBeGreaterThanOrEqual(0)
      expect(round.target).toBeLessThanOrEqual(6)
      
      // Exactly one balloon is correct
      const correctBalloons = round.balloons.filter(b => b.isCorrect)
      expect(correctBalloons).toHaveLength(1)
      
      // The correct balloon's formula result equals the target
      const correctBalloon = correctBalloons[0]
      expect(correctBalloon.formula.result).toBe(round.target)
    })

    it('should initialize wrong attempts to 0', () => {
      const round = createRound(DEFAULT_SETTINGS)
      expect(round.wrongAttempts).toBe(0)
    })

    it('should not show hints initially', () => {
      const round = createRound(DEFAULT_SETTINGS)
      expect(round.hintsEnabled).toBe(false)
    })
  })

  describe('К3: Correct balloon', () => {
    it('should identify correct balloon when popped', () => {
      // К3: Given child is in front of correct balloon
      const round = createRound(DEFAULT_SETTINGS)
      const correctBalloon = round.balloons.find(b => b.isCorrect)!
      
      // When cat jumps and pops it
      const isCorrect = checkBalloon(round, correctBalloon.id)
      
      // Then it is recognized as correct
      expect(isCorrect).toBe(true)
    })

    it('should start new round after correct pop', () => {
      // К3: When correct balloon is popped
      // Then a new round starts
      const round = createRound(DEFAULT_SETTINGS)
      const correctBalloon = round.balloons.find(b => b.isCorrect)!
      
      const newRound = handleCorrectPop(round, DEFAULT_SETTINGS)
      
      // New round has different balloons
      expect(newRound.balloons).not.toEqual(round.balloons)
      
      // Wrong attempts reset
      expect(newRound.wrongAttempts).toBe(0)
      
      // Hints disabled
      expect(newRound.hintsEnabled).toBe(false)
    })
  })

  describe('К4: Wrong balloon', () => {
    it('should identify wrong balloon when attempted', () => {
      // К4: Given child is in front of wrong balloon
      const round = createRound(DEFAULT_SETTINGS)
      const wrongBalloon = round.balloons.find(b => !b.isCorrect)!
      
      // When cat jumps at it
      const isCorrect = checkBalloon(round, wrongBalloon.id)
      
      // Then it is recognized as wrong
      expect(isCorrect).toBe(false)
    })

    it('should keep same balloons after wrong attempt', () => {
      // К4: When wrong balloon is attempted
      // Then balloons stay the same
      const round = createRound(DEFAULT_SETTINGS)
      const wrongBalloon = round.balloons.find(b => !b.isCorrect)!
      
      const updatedRound = handleWrongAttempt(round)
      
      // Balloons remain unchanged
      expect(updatedRound.balloons).toEqual(round.balloons)
      expect(updatedRound.target).toBe(round.target)
    })

    it('should increment wrong attempts without decreasing stars', () => {
      // К4: Stars never decrease on wrong attempt
      const round = createRound(DEFAULT_SETTINGS)
      
      const updatedRound = handleWrongAttempt(round)
      
      expect(updatedRound.wrongAttempts).toBe(1)
      // Star count is managed in scoring module, not here
      // But round state doesn't cause star decrease
    })

    it('should track multiple wrong attempts', () => {
      let round = createRound(DEFAULT_SETTINGS)
      
      round = handleWrongAttempt(round)
      expect(round.wrongAttempts).toBe(1)
      
      round = handleWrongAttempt(round)
      expect(round.wrongAttempts).toBe(2)
      
      round = handleWrongAttempt(round)
      expect(round.wrongAttempts).toBe(3)
    })
  })

  describe('К5: Hint after 2 wrong tries', () => {
    it('should not show hint after 0 wrong attempts', () => {
      // К5: Given 0 wrong attempts
      const round = createRound(DEFAULT_SETTINGS)
      
      // Then no hint
      expect(shouldShowHint(round)).toBe(false)
    })

    it('should not show hint after 1 wrong attempt', () => {
      // К5: Given 1 wrong attempt
      let round = createRound(DEFAULT_SETTINGS)
      round = handleWrongAttempt(round)
      
      // Then no hint yet
      expect(shouldShowHint(round)).toBe(false)
    })

    it('should show hint after exactly 2 wrong attempts', () => {
      // К5: Given child has made 2 mistakes in one round
      let round = createRound(DEFAULT_SETTINGS)
      round = handleWrongAttempt(round)
      round = handleWrongAttempt(round)
      
      // When the next moment is shown
      // Then the correct balloon glows (hint is enabled)
      expect(shouldShowHint(round)).toBe(true)
      expect(round.wrongAttempts).toBe(2)
    })

    it('should keep showing hint after more than 2 attempts', () => {
      let round = createRound(DEFAULT_SETTINGS)
      round = handleWrongAttempt(round)
      round = handleWrongAttempt(round)
      round = handleWrongAttempt(round)
      
      expect(shouldShowHint(round)).toBe(true)
      expect(round.wrongAttempts).toBe(3)
    })
  })

  describe('К6: Balloons reach bottom', () => {
    it('should reset balloons to top when they reach bottom', () => {
      // К6: Given no correct balloon was popped
      // When balloons reach the bottom
      const round = createRound(DEFAULT_SETTINGS)
      const originalTarget = round.target
      
      // Then they return to top
      const resetRound = resetBalloons(round)
      
      // Target stays the same
      expect(resetRound.target).toBe(originalTarget)
      
      // Balloons are the same (same formulas)
      expect(resetRound.balloons).toEqual(round.balloons)
      
      // Nothing is lost (wrong attempts preserved)
      expect(resetRound.wrongAttempts).toBe(round.wrongAttempts)
    })

    it('should preserve hint state when balloons reset', () => {
      let round = createRound(DEFAULT_SETTINGS)
      
      // Make 2 wrong attempts to enable hints
      round = handleWrongAttempt(round)
      round = handleWrongAttempt(round)
      expect(shouldShowHint(round)).toBe(true)
      
      // Reset balloons (simulate reaching bottom)
      const resetRound = resetBalloons(round)
      
      // Hints should still be enabled
      expect(shouldShowHint(resetRound)).toBe(true)
    })
  })

  describe('Feedback logic: Stars never decrease', () => {
    it('should not decrease stars on wrong balloon attempt', () => {
      // This is tested in scoring module, but round logic
      // should not trigger star decrease
      const round = createRound(DEFAULT_SETTINGS)
      
      const updatedRound = handleWrongAttempt(round)
      
      // Round state doesn't track stars, but doesn't cause decrease
      // Stars are only added on correct pop (в scoring module)
      expect(updatedRound.wrongAttempts).toBeGreaterThan(0)
    })
  })

  describe('Feedback logic: Same balloons stay after wrong attempt', () => {
    it('should keep exact same balloon instances after wrong try', () => {
      const round = createRound(DEFAULT_SETTINGS)
      const balloonIds = round.balloons.map(b => b.id)
      
      const updatedRound = handleWrongAttempt(round)
      const updatedIds = updatedRound.balloons.map(b => b.id)
      
      expect(updatedIds).toEqual(balloonIds)
    })
  })
})
