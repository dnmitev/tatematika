import type { GameSettings, Operation, BalloonSpeed } from './types'

/**
 * Default game settings
 */
export const DEFAULT_SETTINGS: GameSettings = {
  upperLimit: 6,
  operations: 'both',
  balloonCount: 3,
  correctBalloonsPerLevel: 10,
  balloonSpeed: 'slow',
}

const STORAGE_KEY = 'tatematika-kote-balonche-settings'

/**
 * Validate and clamp settings to allowed ranges
 */
export function validateSettings(settings: Partial<GameSettings>): GameSettings {
  const validated: GameSettings = {
    upperLimit: Math.max(5, Math.min(20, settings.upperLimit ?? DEFAULT_SETTINGS.upperLimit)),
    operations: isValidOperation(settings.operations) ? settings.operations : DEFAULT_SETTINGS.operations,
    balloonCount: Math.max(2, Math.min(5, settings.balloonCount ?? DEFAULT_SETTINGS.balloonCount)),
    correctBalloonsPerLevel: Math.max(5, Math.min(20, settings.correctBalloonsPerLevel ?? DEFAULT_SETTINGS.correctBalloonsPerLevel)),
    balloonSpeed: isValidSpeed(settings.balloonSpeed) ? settings.balloonSpeed : DEFAULT_SETTINGS.balloonSpeed,
  }
  return validated
}

function isValidOperation(op: any): op is Operation {
  return op === 'addition' || op === 'subtraction' || op === 'both'
}

function isValidSpeed(speed: any): speed is BalloonSpeed {
  return speed === 'slow' || speed === 'medium'
}

/**
 * Load settings from localStorage, falling back to defaults
 */
export function loadSettings(): GameSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return { ...DEFAULT_SETTINGS }
    }
    const parsed = JSON.parse(stored)
    return validateSettings(parsed)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * Save settings to localStorage
 */
export function saveSettings(settings: GameSettings): void {
  const validated = validateSettings(settings)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(validated))
}

/**
 * Update a single setting and persist
 */
export function updateSetting<K extends keyof GameSettings>(
  key: K,
  value: GameSettings[K]
): GameSettings {
  const current = loadSettings()
  const updated = { ...current, [key]: value }
  const validated = validateSettings(updated)
  saveSettings(validated)
  return validated
}
