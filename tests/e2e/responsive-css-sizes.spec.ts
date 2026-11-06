import { test, expect } from '@playwright/test'
import { popCorrectBalloonAndWait } from './helpers'

/**
 * Responsive CSS pixel size tests
 * 
 * These tests verify that Scale.FIT does not shrink elements below spec minimums.
 * All measurements are in CSS pixels (on-screen size), not Phaser game-space pixels.
 * 
 * Spec requirements:
 * - §7: Formula and target digits ≥32 CSS px
 * - §3: Balloons, mute button, all buttons ≥64×64 CSS px
 * - §5: With 5 balloons (max), all must be visible without cropping
 */

test.describe('Responsive CSS Sizes - Mobile 375×667', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Formula digits must be at least 32 CSS pixels on mobile (spec §7)', async ({ page }) => {
    // Get canvas scale factor
    const scale = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return 0
      
      const rect = canvas.getBoundingClientRect()
      // Game space is 800×600, calculate scale from actual CSS size
      return rect.width / 800
    })
    
    // Get formula font size from game (Phaser game-space pixels)
    const gameFontSize = await page.evaluate(() => window.__tatematika!.getFormulaFontSize())
    
    // Convert to CSS pixels
    const cssFontSize = gameFontSize * scale
    
    expect(cssFontSize).toBeGreaterThanOrEqual(32)
  })

  test('Target number digits must be at least 32 CSS pixels on mobile (spec §7)', async ({ page }) => {
    // The target number should also be ≥32 CSS px
    const scale = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return 0
      const rect = canvas.getBoundingClientRect()
      return rect.width / 800
    })
    
    // Get target font size through hook
    const targetFontSize = await page.evaluate(() => window.__tatematika!.getTargetFontSize())
    
    const cssTargetSize = targetFontSize * scale
    
    expect(cssTargetSize).toBeGreaterThanOrEqual(32)
  })

  test('Balloons must be at least 64×64 CSS pixels on mobile (spec §3)', async ({ page }) => {
    const scale = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return 0
      const rect = canvas.getBoundingClientRect()
      return rect.width / 800
    })
    
    // Get real balloon bounds from hook
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const firstBalloon = state.balloons[0]
    
    const balloonBounds = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), firstBalloon.id)
    expect(balloonBounds).not.toBeNull()
    
    const cssDiameter = Math.max(balloonBounds!.width, balloonBounds!.height) * scale
    
    expect(cssDiameter).toBeGreaterThanOrEqual(64)
  })

  test('Mute button must be at least 64×64 CSS pixels on mobile (spec §3)', async ({ page }) => {
    const scale = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return 0
      const rect = canvas.getBoundingClientRect()
      return rect.width / 800
    })
    
    const bounds = await page.evaluate(() => window.__tatematika!.getMuteButtonBounds())
    
    const cssWidth = bounds.width * scale
    const cssHeight = bounds.height * scale
    
    expect(cssWidth).toBeGreaterThanOrEqual(64)
    expect(cssHeight).toBeGreaterThanOrEqual(64)
  })

  test('With 5 balloons, all must be visible without cropping on mobile (spec §5)', async ({ page }) => {
    // Set balloon count to 5 (max)
    await page.evaluate(() => {
      localStorage.setItem('tatematika-kote-balonche-settings', JSON.stringify({
        upperLimit: 6,
        operations: 'both',
        balloonCount: 5,
        correctBalloonsPerLevel: 10,
        balloonSpeed: 'slow'
      }))
    })
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(state.balloons).toHaveLength(5)
    
    // Get canvas bounds and scale
    const canvasInfo = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        scale: rect.width / 800
      }
    })
    
    expect(canvasInfo).not.toBeNull()
    
    // Get viewport size
    const viewportHeight = 667
    const viewportWidth = 375
    
    // Check each balloon is fully visible (within viewport)
    for (const balloon of state.balloons) {
      const bounds = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), balloon.id)
      expect(bounds).not.toBeNull()
      
      // Convert to CSS pixels
      const cssLeft = bounds!.x * canvasInfo!.scale + canvasInfo!.left
      const cssTop = bounds!.y * canvasInfo!.scale + canvasInfo!.top
      const cssRight = (bounds!.x + bounds!.width) * canvasInfo!.scale + canvasInfo!.left
      const cssBottom = (bounds!.y + bounds!.height) * canvasInfo!.scale + canvasInfo!.top
      
      // All edges must be within viewport
      expect(cssLeft).toBeGreaterThanOrEqual(0)
      expect(cssTop).toBeGreaterThanOrEqual(0)
      expect(cssRight).toBeLessThanOrEqual(viewportWidth)
      expect(cssBottom).toBeLessThanOrEqual(viewportHeight)
    }
  })

  test('Level complete buttons must be at least 64×64 CSS pixels on mobile (spec §3)', async ({ page }) => {
    // Lower requirement for speed
    await page.evaluate(() => {
      localStorage.setItem('tatematika-kote-balonche-settings', JSON.stringify({
        upperLimit: 6,
        operations: 'both',
        balloonCount: 3,
        correctBalloonsPerLevel: 5,
        balloonSpeed: 'slow'
      }))
    })
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Complete level (5 stars) using the shared helper that waits for cat readiness
    for (let i = 0; i < 5; i++) {
      await popCorrectBalloonAndWait(page)
    }
    
    // Poll until level complete scene is visible
    await expect.poll(async () => {
      const levelText = await page.evaluate(() => window.__tatematika!.getLevelEndText())
      return levelText !== null && levelText.includes('Ті успя')
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Check "Още веднъж" button
    const playAgainButton = page.locator('[data-testid="button-play-again"]')
    await expect(playAgainButton).toBeVisible({ timeout: 5000 })
    
    const box = await playAgainButton.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(64)
    expect(box!.height).toBeGreaterThanOrEqual(64)
  })

  test('Formulas remain readable when scaled down on mobile', async ({ page }) => {
    // With 5 balloons and formulas, ensure text doesn't overlap or become unreadable
    await page.evaluate(() => {
      localStorage.setItem('tatematika-kote-balonche-settings', JSON.stringify({
        upperLimit: 20, // Larger numbers = longer formulas
        operations: 'both',
        balloonCount: 5,
        correctBalloonsPerLevel: 10,
        balloonSpeed: 'slow'
      }))
    })
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    const scale = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return 0
      const rect = canvas.getBoundingClientRect()
      return rect.width / 800
    })
    
    const gameFontSize = await page.evaluate(() => window.__tatematika!.getFormulaFontSize())
    const cssFontSize = gameFontSize * scale
    
    // Even with 5 balloons and large numbers, formulas must be ≥32 CSS px
    expect(cssFontSize).toBeGreaterThanOrEqual(32)
  })
})

test.describe('Responsive CSS Sizes - Desktop 1920×1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Formula digits must be at least 32 CSS pixels on desktop (spec §7)', async ({ page }) => {
    const scale = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return 0
      const rect = canvas.getBoundingClientRect()
      return rect.width / 800
    })
    
    const gameFontSize = await page.evaluate(() => window.__tatematika!.getFormulaFontSize())
    const cssFontSize = gameFontSize * scale
    
    expect(cssFontSize).toBeGreaterThanOrEqual(32)
  })

  test('Target number digits must be at least 32 CSS pixels on desktop (spec §7)', async ({ page }) => {
    const scale = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return 0
      const rect = canvas.getBoundingClientRect()
      return rect.width / 800
    })
    
    const targetFontSize = await page.evaluate(() => window.__tatematika!.getTargetFontSize())
    
    const cssTargetSize = targetFontSize * scale
    
    expect(cssTargetSize).toBeGreaterThanOrEqual(32)
  })

  test('Balloons must be at least 64×64 CSS pixels on desktop (spec §3)', async ({ page }) => {
    const scale = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return 0
      const rect = canvas.getBoundingClientRect()
      return rect.width / 800
    })
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const firstBalloon = state.balloons[0]
    
    const balloonBounds = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), firstBalloon.id)
    expect(balloonBounds).not.toBeNull()
    
    const cssDiameter = Math.max(balloonBounds!.width, balloonBounds!.height) * scale
    
    expect(cssDiameter).toBeGreaterThanOrEqual(64)
  })

  test('Mute button must be at least 64×64 CSS pixels on desktop (spec §3)', async ({ page }) => {
    const scale = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return 0
      const rect = canvas.getBoundingClientRect()
      return rect.width / 800
    })
    
    const bounds = await page.evaluate(() => window.__tatematika!.getMuteButtonBounds())
    
    const cssWidth = bounds.width * scale
    const cssHeight = bounds.height * scale
    
    expect(cssWidth).toBeGreaterThanOrEqual(64)
    expect(cssHeight).toBeGreaterThanOrEqual(64)
  })

  test('With 5 balloons, all must be visible without cropping on desktop (spec §5)', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('tatematika-kote-balonche-settings', JSON.stringify({
        upperLimit: 6,
        operations: 'both',
        balloonCount: 5,
        correctBalloonsPerLevel: 10,
        balloonSpeed: 'slow'
      }))
    })
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(state.balloons).toHaveLength(5)
    
    const canvasInfo = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        scale: rect.width / 800
      }
    })
    
    expect(canvasInfo).not.toBeNull()
    
    // Check each balloon is fully within canvas
    for (const balloon of state.balloons) {
      const bounds = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), balloon.id)
      expect(bounds).not.toBeNull()
      
      const cssLeft = bounds!.x * canvasInfo!.scale + canvasInfo!.left
      const cssTop = bounds!.y * canvasInfo!.scale + canvasInfo!.top
      const cssRight = (bounds!.x + bounds!.width) * canvasInfo!.scale + canvasInfo!.left
      const cssBottom = (bounds!.y + bounds!.height) * canvasInfo!.scale + canvasInfo!.top
      
      // All edges must be within canvas
      expect(cssLeft).toBeGreaterThanOrEqual(canvasInfo!.left)
      expect(cssTop).toBeGreaterThanOrEqual(canvasInfo!.top)
      expect(cssRight).toBeLessThanOrEqual(canvasInfo!.left + canvasInfo!.width)
      expect(cssBottom).toBeLessThanOrEqual(canvasInfo!.top + canvasInfo!.height)
    }
  })

  test('Settings button must be at least 64×64 CSS pixels on desktop (spec §3)', async ({ page }) => {
    // Settings button must exist and meet size requirements
    const settingsButton = page.locator('[data-testid="button-settings"]')
    await expect(settingsButton).toBeVisible({ timeout: 5000 })
    
    const box = await settingsButton.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(64)
    expect(box!.height).toBeGreaterThanOrEqual(64)
  })
})

test.describe('Responsive CSS Sizes - Scale Factor Edge Cases', () => {
  test('Elements remain above minimums even with aggressive FIT scaling at 320×568', async ({ page }) => {
    // iPhone SE size - most aggressive scaling
    await page.setViewportSize({ width: 320, height: 568 })
    
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    const scale = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return 0
      const rect = canvas.getBoundingClientRect()
      return rect.width / 800
    })
    
    // At 320px width, scale would be 320/800 = 0.4
    // This is the critical test: elements must still meet minimums
    
    const gameFontSize = await page.evaluate(() => window.__tatematika!.getFormulaFontSize())
    const cssFontSize = gameFontSize * scale
    
    expect(cssFontSize).toBeGreaterThanOrEqual(32)
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const firstBalloon = state.balloons[0]
    const balloonBounds = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), firstBalloon.id)
    expect(balloonBounds).not.toBeNull()
    
    const cssDiameter = Math.max(balloonBounds!.width, balloonBounds!.height) * scale
    
    expect(cssDiameter).toBeGreaterThanOrEqual(64)
  })

  test('At 375×667 (iPhone 6/7/8), all elements meet minimums', async ({ page }) => {
    // Standard mobile size
    await page.setViewportSize({ width: 375, height: 667 })
    
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    const measurements = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return null
      
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / 800
      
      const gameFontSize = window.__tatematika!.getFormulaFontSize()
      const muteBounds = window.__tatematika!.getMuteButtonBounds()
      
      return {
        scale,
        formulaCssPx: gameFontSize * scale,
        muteButtonCssPx: {
          width: muteBounds.width * scale,
          height: muteBounds.height * scale
        }
      }
    })
    
    expect(measurements).not.toBeNull()
    expect(measurements!.formulaCssPx).toBeGreaterThanOrEqual(32)
    expect(measurements!.muteButtonCssPx.width).toBeGreaterThanOrEqual(64)
    expect(measurements!.muteButtonCssPx.height).toBeGreaterThanOrEqual(64)
    
    // Also check balloons
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const firstBalloon = state.balloons[0]
    const balloonBounds = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), firstBalloon.id)
    expect(balloonBounds).not.toBeNull()
    
    const cssDiameter = Math.max(balloonBounds!.width, balloonBounds!.height) * measurements!.scale
    expect(cssDiameter).toBeGreaterThanOrEqual(64)
  })
})
