import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_SETTINGS,
  validateSettings,
  loadSettings,
  saveSettings,
  updateSetting,
} from '../../src/game-logic/settings'

describe('Settings', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
  })

  describe('Default settings', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_SETTINGS).toEqual({
        upperLimit: 6,
        operations: 'both',
        balloonCount: 3,
        correctBalloonsPerLevel: 10,
        balloonSpeed: 'slow',
      })
    })
  })

  describe('К9: Settings persistence', () => {
    it('should save upper limit 10 and persist after reload', () => {
      // К9: Given parent changed upper limit to 10
      const settings = {
        ...DEFAULT_SETTINGS,
        upperLimit: 10
      }
      
      saveSettings(settings)
      
      // When page reloads (simulate by loading again)
      const loaded = loadSettings()
      
      // Then all numbers and results are from 0 to 10
      // and setting persists
      expect(loaded.upperLimit).toBe(10)
    })

    it('should persist all settings across reload', () => {
      const customSettings = {
        upperLimit: 15,
        operations: 'addition' as const,
        balloonCount: 4,
        correctBalloonsPerLevel: 12,
        balloonSpeed: 'medium' as const,
      }
      
      saveSettings(customSettings)
      
      const loaded = loadSettings()
      
      expect(loaded).toEqual(customSettings)
    })

    it('should load defaults when no saved settings exist', () => {
      // No settings saved
      const loaded = loadSettings()
      
      expect(loaded).toEqual(DEFAULT_SETTINGS)
    })

    it('should update single setting and persist', () => {
      // Start with defaults
      saveSettings(DEFAULT_SETTINGS)
      
      // Update only upperLimit
      const updated = updateSetting('upperLimit', 10)
      
      expect(updated.upperLimit).toBe(10)
      expect(updated.operations).toBe(DEFAULT_SETTINGS.operations)
      
      // Verify persistence
      const loaded = loadSettings()
      expect(loaded.upperLimit).toBe(10)
    })
  })

  describe('Setting validation and clamping', () => {
    it('should clamp upperLimit to range 5-20', () => {
      const tooLow = validateSettings({ upperLimit: 3 })
      expect(tooLow.upperLimit).toBeGreaterThanOrEqual(5)
      
      const tooHigh = validateSettings({ upperLimit: 25 })
      expect(tooHigh.upperLimit).toBeLessThanOrEqual(20)
      
      const valid = validateSettings({ upperLimit: 10 })
      expect(valid.upperLimit).toBe(10)
    })

    it('should clamp balloonCount to range 2-5', () => {
      const tooLow = validateSettings({ balloonCount: 1 })
      expect(tooLow.balloonCount).toBeGreaterThanOrEqual(2)
      
      const tooHigh = validateSettings({ balloonCount: 10 })
      expect(tooHigh.balloonCount).toBeLessThanOrEqual(5)
      
      const valid = validateSettings({ balloonCount: 4 })
      expect(valid.balloonCount).toBe(4)
    })

    it('should clamp correctBalloonsPerLevel to range 5-20', () => {
      const tooLow = validateSettings({ correctBalloonsPerLevel: 2 })
      expect(tooLow.correctBalloonsPerLevel).toBeGreaterThanOrEqual(5)
      
      const tooHigh = validateSettings({ correctBalloonsPerLevel: 30 })
      expect(tooHigh.correctBalloonsPerLevel).toBeLessThanOrEqual(20)
      
      const valid = validateSettings({ correctBalloonsPerLevel: 15 })
      expect(valid.correctBalloonsPerLevel).toBe(15)
    })

    it('should validate operations setting', () => {
      const valid1 = validateSettings({ operations: 'addition' })
      expect(valid1.operations).toBe('addition')
      
      const valid2 = validateSettings({ operations: 'subtraction' })
      expect(valid2.operations).toBe('subtraction')
      
      const valid3 = validateSettings({ operations: 'both' })
      expect(valid3.operations).toBe('both')
    })

    it('should validate balloonSpeed setting', () => {
      const valid1 = validateSettings({ balloonSpeed: 'slow' })
      expect(valid1.balloonSpeed).toBe('slow')
      
      const valid2 = validateSettings({ balloonSpeed: 'medium' })
      expect(valid2.balloonSpeed).toBe('medium')
    })

    it('should merge partial settings with defaults', () => {
      const partial = validateSettings({ upperLimit: 10 })
      
      // upperLimit is updated
      expect(partial.upperLimit).toBe(10)
      
      // Other settings use defaults
      expect(partial.operations).toBe(DEFAULT_SETTINGS.operations)
      expect(partial.balloonCount).toBe(DEFAULT_SETTINGS.balloonCount)
      expect(partial.correctBalloonsPerLevel).toBe(DEFAULT_SETTINGS.correctBalloonsPerLevel)
      expect(partial.balloonSpeed).toBe(DEFAULT_SETTINGS.balloonSpeed)
    })
  })

  describe('localStorage integration', () => {
    it('should use localStorage key correctly', () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        upperLimit: 12
      }
      
      saveSettings(settings)
      
      // Check that localStorage was written
      const stored = localStorage.getItem('tatematika-kote-balonche-settings')
      expect(stored).toBeTruthy()
      
      const parsed = JSON.parse(stored!)
      expect(parsed.upperLimit).toBe(12)
    })

    it('should handle corrupted localStorage gracefully', () => {
      // Write invalid JSON
      localStorage.setItem('tatematika-kote-balonche-settings', 'invalid json')
      
      // Should fall back to defaults
      const loaded = loadSettings()
      expect(loaded).toEqual(DEFAULT_SETTINGS)
    })
  })
})
