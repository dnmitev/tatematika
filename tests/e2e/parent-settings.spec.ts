import { test, expect } from '@playwright/test'

/**
 * Tests for parent settings UI
 * Spec §5 "Настройки (за родителя)" and К9 require a parent-facing interface
 * to change settings: upper limit, operations, balloon count, correct per level, speed
 */

test.describe('Parent Settings UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Clear localStorage to start fresh
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Settings UI must be accessible from game', async ({ page }) => {
    // Spec §5: Settings UI for parents must exist
    // Look for settings button (data-testid="button-settings")
    
    const settingsButton = page.locator('[data-testid="button-settings"]')
    await expect(settingsButton).toBeVisible()
    
    // Click to open settings
    await settingsButton.click()
    await page.waitForTimeout(300)
    
    // Settings panel should be visible
    const isOpen = await page.evaluate(() => window.__tatematika!.isSettingsOpen())
    expect(isOpen).toBe(true)
    
    // Settings panel should be visible
    const settingsPanel = page.locator('[data-testid="settings-panel"]')
    await expect(settingsPanel).toBeVisible()
  })

  test('Upper limit setting: change from 6 to 10 (range 5-20)', async ({ page }) => {
    // Spec §5: Upper limit default 6, range 5-20
    // К9: Setting persists after reload
    
    // Open settings
    await page.evaluate(() => window.__tatematika!.openSettings())
    await page.waitForTimeout(200)
    
    // Find upper limit control
    const limitInput = page.locator('[data-testid="setting-upper-limit"]')
    await expect(limitInput).toBeVisible()
    
    // Change to 10
    await limitInput.fill('10')
    
    // Close settings
    await page.evaluate(() => window.__tatematika!.closeSettings())
    await page.waitForTimeout(200)
    
    // Start a new round and verify target is 0-10
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(state.settings.upperLimit).toBe(10)
    expect(state.target).toBeLessThanOrEqual(10)
    
    // Verify it persists after reload
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    const stateAfterReload = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateAfterReload.settings.upperLimit).toBe(10)
  })

  test('Operations setting: change to addition only', async ({ page }) => {
    // Spec §5: Operations - addition only / subtraction only / both
    
    await page.evaluate(() => window.__tatematika!.openSettings())
    await page.waitForTimeout(200)
    
    // Find operations control
    const operationsSelect = page.locator('[data-testid="setting-operations"]')
    await expect(operationsSelect).toBeVisible()
    
    // Select "addition only"
    await operationsSelect.selectOption('addition')
    
    await page.evaluate(() => window.__tatematika!.closeSettings())
    await page.waitForTimeout(200)
    
    // Verify all formulas use addition only
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    
    state.balloons.forEach(balloon => {
      expect(balloon.formula).toContain('+')
      expect(balloon.formula).not.toContain('−')
    })
  })

  test('Operations setting: change to subtraction only', async ({ page }) => {
    // Spec §5: Operations - subtraction only
    
    await page.evaluate(() => window.__tatematika!.openSettings())
    await page.waitForTimeout(200)
    
    const operationsSelect = page.locator('[data-testid="setting-operations"]')
    await operationsSelect.selectOption('subtraction')
    
    await page.evaluate(() => window.__tatematika!.closeSettings())
    await page.waitForTimeout(200)
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    
    state.balloons.forEach(balloon => {
      expect(balloon.formula).toContain('−')
      expect(balloon.formula).not.toContain('+')
    })
  })

  test('Balloon count setting: change from 3 to 5 (range 2-5)', async ({ page }) => {
    // Spec §5: Balloon count default 3, range 2-5
    
    await page.evaluate(() => window.__tatematika!.openSettings())
    await page.waitForTimeout(200)
    
    const balloonCountInput = page.locator('[data-testid="setting-balloon-count"]')
    await balloonCountInput.fill('5')
    
    await page.evaluate(() => window.__tatematika!.closeSettings())
    await page.waitForTimeout(200)
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(state.settings.balloonCount).toBe(5)
    expect(state.balloons).toHaveLength(5)
  })

  test('Correct balloons per level: change from 10 to 15 (range 5-20)', async ({ page }) => {
    // Spec §5: Correct balloons per level default 10, range 5-20
    
    await page.evaluate(() => window.__tatematika!.openSettings())
    await page.waitForTimeout(200)
    
    const perLevelInput = page.locator('[data-testid="setting-correct-per-level"]')
    await perLevelInput.fill('15')
    
    await page.evaluate(() => window.__tatematika!.closeSettings())
    await page.waitForTimeout(200)
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(state.settings.correctBalloonsPerLevel).toBe(15)
  })

  test('Speed setting: change from slow to medium', async ({ page }) => {
    // Spec §5: Speed - slow / medium
    
    await page.evaluate(() => window.__tatematika!.openSettings())
    await page.waitForTimeout(200)
    
    const speedSelect = page.locator('[data-testid="setting-speed"]')
    await speedSelect.selectOption('medium')
    
    await page.evaluate(() => window.__tatematika!.closeSettings())
    await page.waitForTimeout(200)
    
    // Verify setting is saved
    const saved = await page.evaluate(() => {
      const stored = localStorage.getItem('tatematika-kote-balonche-settings')
      return stored ? JSON.parse(stored) : null
    })
    
    expect(saved?.balloonSpeed).toBe('medium')
  })

  test('All settings persist after page reload (К9)', async ({ page }) => {
    // К9: "настройката се запазва след презареждане на страницата"
    
    // Open settings and change multiple values
    await page.evaluate(() => window.__tatematika!.openSettings())
    await page.waitForTimeout(200)
    
    await page.locator('[data-testid="setting-upper-limit"]').fill('15')
    await page.locator('[data-testid="setting-operations"]').selectOption('addition')
    await page.locator('[data-testid="setting-balloon-count"]').fill('4')
    await page.locator('[data-testid="setting-correct-per-level"]').fill('12')
    await page.locator('[data-testid="setting-speed"]').selectOption('medium')
    
    await page.evaluate(() => window.__tatematika!.closeSettings())
    await page.waitForTimeout(200)
    
    // Reload page
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // All settings should persist
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    
    expect(state.settings.upperLimit).toBe(15)
    expect(state.settings.balloonCount).toBe(4)
    expect(state.settings.correctBalloonsPerLevel).toBe(12)
    
    // Operations and speed are saved in localStorage
    const saved = await page.evaluate(() => {
      const stored = localStorage.getItem('tatematika-kote-balonche-settings')
      return stored ? JSON.parse(stored) : null
    })
    
    expect(saved.operations).toBe('addition')
    expect(saved.balloonSpeed).toBe('medium')
  })

  test('Settings validation: upper limit clamped to 5-20', async ({ page }) => {
    // Spec §5: Upper limit range 5-20
    
    await page.evaluate(() => window.__tatematika!.openSettings())
    await page.waitForTimeout(200)
    
    const limitInput = page.locator('[data-testid="setting-upper-limit"]')
    
    // Try to set too low
    await limitInput.fill('3')
    await page.evaluate(() => window.__tatematika!.closeSettings())
    await page.waitForTimeout(200)
    
    let state = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(state.settings.upperLimit).toBeGreaterThanOrEqual(5)
    
    // Try to set too high
    await page.evaluate(() => window.__tatematika!.openSettings())
    await page.waitForTimeout(200)
    await limitInput.fill('25')
    await page.evaluate(() => window.__tatematika!.closeSettings())
    await page.waitForTimeout(200)
    
    state = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(state.settings.upperLimit).toBeLessThanOrEqual(20)
  })

  test('Settings button accessible during gameplay', async ({ page }) => {
    // Settings should be accessible at any time during gameplay
    
    // Play one round
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const correct = state.balloons.find(b => b.isCorrect)!
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correct.id)
    
    await page.waitForTimeout(500)
    
    // Settings button should still be visible and clickable
    const settingsButton = page.locator('[data-testid="button-settings"]')
    await expect(settingsButton).toBeVisible()
    
    await settingsButton.click()
    const isOpen = await page.evaluate(() => window.__tatematika!.isSettingsOpen())
    expect(isOpen).toBe(true)
  })
})
