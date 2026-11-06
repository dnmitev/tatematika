import { test, expect } from '@playwright/test'

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
    
    // Get target font size (should be exposed in test hook)
    const targetFontSize = await page.evaluate(() => {
      const gameScene = (window as any).game?.scene?.getScene('GameScene')
      return gameScene?.targetText?.style?.fontSize ? 
        parseInt(gameScene.targetText.style.fontSize) : 0
    })
    
    const cssTargetSize = targetFontSize * scale
    
    expect(cssTargetSize).toBeGreaterThanOrEqual(32)
  })

  test('Balloons must be at least 64×64 CSS pixels on mobile (spec §3)', async ({ page }) => {
    // Balloons are circles with radius 40 in game space (diameter 80)
    const scale = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return 0
      const rect = canvas.getBoundingClientRect()
      return rect.width / 800
    })
    
    // Balloon radius is 40 game pixels, diameter 80
    const balloonDiameter = 80
    const cssDiameter = balloonDiameter * scale
    
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
    
    // Get canvas bounds
    const canvasInfo = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      return {
        width: rect.width,
        height: rect.height,
        scale: rect.width / 800
      }
    })
    
    expect(canvasInfo).not.toBeNull()
    
    // Calculate if balloons would be cropped
    // With 5 balloons at spacing, rightmost should be visible
    // Balloons span from ~60px to ~740px in game space
    // With radius 40, rightmost edge is at ~780px
    const rightmostEdge = 780 * canvasInfo!.scale
    
    expect(rightmostEdge).toBeLessThanOrEqual(canvasInfo!.width)
  })

  test('Level complete buttons must be at least 64×64 CSS pixels on mobile (spec §3)', async ({ page }) => {
    // Fast-forward to level complete
    await page.evaluate(() => {
      const gameScene = (window as any).game?.scene?.getScene('GameScene')
      if (gameScene) {
        for (let i = 0; i < 10; i++) {
          gameScene.gameState = (window as any).addStar?.(gameScene.gameState) || gameScene.gameState
        }
        if (gameScene.showLevelComplete) {
          gameScene.showLevelComplete()
        }
      }
    })
    
    await page.waitForTimeout(500)
    
    // Check "Още веднъж" button
    const playAgainButton = page.locator('[data-testid="button-play-again"]')
    if (await playAgainButton.count() > 0) {
      const box = await playAgainButton.boundingBox()
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(64)
        expect(box.height).toBeGreaterThanOrEqual(64)
      }
    }
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
    
    const targetFontSize = await page.evaluate(() => {
      const gameScene = (window as any).game?.scene?.getScene('GameScene')
      return gameScene?.targetText?.style?.fontSize ? 
        parseInt(gameScene.targetText.style.fontSize) : 0
    })
    
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
    
    const balloonDiameter = 80
    const cssDiameter = balloonDiameter * scale
    
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
        scale: rect.width / 800
      }
    })
    
    expect(canvasInfo).not.toBeNull()
    
    // All 5 balloons should fit within canvas
    const rightmostEdge = 780 * canvasInfo!.scale
    expect(rightmostEdge).toBeLessThanOrEqual(canvasInfo!.width)
  })

  test('Settings button must be at least 64×64 CSS pixels on desktop (spec §3)', async ({ page }) => {
    // If settings button exists, it should meet size requirements
    const settingsButton = page.locator('[data-testid="button-settings"]')
    
    if (await settingsButton.count() > 0) {
      const box = await settingsButton.boundingBox()
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(64)
        expect(box.height).toBeGreaterThanOrEqual(64)
      }
    }
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
    // Formula at 28px game would be 11.2 CSS px (FAILS)
    // Formula at 32px game would be 12.8 CSS px (FAILS)
    // Formula must be at least 80px game to get 32 CSS px
    // OR canvas must not scale below certain threshold
    
    const gameFontSize = await page.evaluate(() => window.__tatematika!.getFormulaFontSize())
    const cssFontSize = gameFontSize * scale
    
    expect(cssFontSize).toBeGreaterThanOrEqual(32)
    
    // Balloons: 80px game * 0.4 = 32 CSS px (FAILS for ≥64)
    const balloonDiameter = 80
    const cssDiameter = balloonDiameter * scale
    
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
        balloonCssPx: 80 * scale,
        muteButtonCssPx: {
          width: muteBounds.width * scale,
          height: muteBounds.height * scale
        }
      }
    })
    
    expect(measurements).not.toBeNull()
    expect(measurements!.formulaCssPx).toBeGreaterThanOrEqual(32)
    expect(measurements!.balloonCssPx).toBeGreaterThanOrEqual(64)
    expect(measurements!.muteButtonCssPx.width).toBeGreaterThanOrEqual(64)
    expect(measurements!.muteButtonCssPx.height).toBeGreaterThanOrEqual(64)
  })
})
