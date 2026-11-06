import { describe, it, expect } from 'vitest'
import {
  addStar,
  isLevelComplete,
  startNewLevel,
  createInitialState,
} from '../../src/game-logic/scoring'
import { DEFAULT_SETTINGS } from '../../src/game-logic/settings'

describe('Scoring', () => {
  describe('Feedback logic: Correct pop adds exactly 1 star', () => {
    it('should add exactly one star on correct pop', () => {
      const state = createInitialState(DEFAULT_SETTINGS)
      const initialStars = state.stars
      
      const updatedState = addStar(state)
      
      expect(updatedState.stars).toBe(initialStars + 1)
    })

    it('should accumulate stars correctly', () => {
      let state = createInitialState(DEFAULT_SETTINGS)
      expect(state.stars).toBe(0)
      
      state = addStar(state)
      expect(state.stars).toBe(1)
      
      state = addStar(state)
      expect(state.stars).toBe(2)
      
      state = addStar(state)
      expect(state.stars).toBe(3)
    })
  })

  describe('К7: Level end', () => {
    it('should not complete level with 9 stars (default is 10)', () => {
      // К7: Given child has 9 stars
      let state = createInitialState(DEFAULT_SETTINGS)
      
      for (let i = 0; i < 9; i++) {
        state = addStar(state)
      }
      
      expect(state.stars).toBe(9)
      
      // Then level is not complete yet
      expect(isLevelComplete(state)).toBe(false)
    })

    it('should complete level after reaching configured star count', () => {
      // К7: Given child has 9 stars
      // When they pop one more correct balloon
      let state = createInitialState(DEFAULT_SETTINGS)
      
      for (let i = 0; i < 10; i++) {
        state = addStar(state)
      }
      
      // Then celebration screen shows with "Ти успя!"
      // and buttons "Още веднъж" and "Към менюто"
      expect(isLevelComplete(state)).toBe(true)
      expect(state.stars).toBe(10)
    })

    it('should respect custom correctBalloonsPerLevel setting', () => {
      const customSettings = {
        ...DEFAULT_SETTINGS,
        correctBalloonsPerLevel: 15
      }
      
      let state = createInitialState(customSettings)
      
      // 14 stars should not complete level
      for (let i = 0; i < 14; i++) {
        state = addStar(state)
      }
      expect(isLevelComplete(state)).toBe(false)
      
      // 15th star completes level
      state = addStar(state)
      expect(isLevelComplete(state)).toBe(true)
    })
  })

  describe('Feedback logic: Level ends at configured number of stars', () => {
    it('should end level at exactly the configured star count', () => {
      const testCounts = [5, 10, 15, 20]
      
      testCounts.forEach(count => {
        const settings = {
          ...DEFAULT_SETTINGS,
          correctBalloonsPerLevel: count
        }
        
        let state = createInitialState(settings)
        
        // Add stars up to count - 1
        for (let i = 0; i < count - 1; i++) {
          state = addStar(state)
        }
        expect(isLevelComplete(state)).toBe(false)
        
        // Add final star
        state = addStar(state)
        expect(isLevelComplete(state)).toBe(true)
      })
    })
  })

  describe('Level progression', () => {
    it('should start new level after completion', () => {
      let state = createInitialState(DEFAULT_SETTINGS)
      
      // Complete first level
      for (let i = 0; i < 10; i++) {
        state = addStar(state)
      }
      
      expect(isLevelComplete(state)).toBe(true)
      const completedLevel = state.level
      
      // Start new level
      state = startNewLevel(state)
      
      // Level incremented
      expect(state.level).toBe(completedLevel + 1)
      
      // Stars reset to 0
      expect(state.stars).toBe(0)
      
      // Not complete anymore
      expect(isLevelComplete(state)).toBe(false)
    })
  })

  describe('Initial state', () => {
    it('should create initial state with 0 stars and level 1', () => {
      const state = createInitialState(DEFAULT_SETTINGS)
      
      expect(state.stars).toBe(0)
      expect(state.level).toBe(1)
      expect(state.settings).toEqual(DEFAULT_SETTINGS)
    })

    it('should create initial round state', () => {
      const state = createInitialState(DEFAULT_SETTINGS)
      
      expect(state.round).toBeDefined()
      expect(state.round.balloons).toHaveLength(DEFAULT_SETTINGS.balloonCount)
      expect(state.round.wrongAttempts).toBe(0)
    })
  })

  describe('Setting ranges: correctBalloonsPerLevel 5-20', () => {
    it('should handle minimum correctBalloonsPerLevel of 5', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        correctBalloonsPerLevel: 5
      }
      
      let state = createInitialState(settings)
      
      for (let i = 0; i < 5; i++) {
        state = addStar(state)
      }
      
      expect(isLevelComplete(state)).toBe(true)
    })

    it('should handle maximum correctBalloonsPerLevel of 20', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        correctBalloonsPerLevel: 20
      }
      
      let state = createInitialState(settings)
      
      for (let i = 0; i < 19; i++) {
        state = addStar(state)
      }
      expect(isLevelComplete(state)).toBe(false)
      
      state = addStar(state)
      expect(isLevelComplete(state)).toBe(true)
    })
  })
})
