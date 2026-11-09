import { test, expect } from '@playwright/test'
import { INIT_TIMEOUT_MS } from './test-timeouts'

/**
 * Real Geometry Measurement Tests
 * 
 * These tests measure actual rendered geometry in CSS pixels, independent of test hooks.
 * They verify that elements meet spec minimums §3 (64×64 tap targets) and §7 (≥32px text).
 * 
 * Unlike responsive-css-sizes.spec.ts which relies on self-reported hook values,
 * these tests measure:
 * - Live Phaser Text object bounds (getBounds(), displayHeight)
 * - Actual Graphics hit areas via input.hitArea
 * - Real DOM element sizes where applicable
 * 
 * Purpose: catch discrepancies between what hooks report and what actually renders.
 */

test.describe('Real Geometry - 320×568 (Small Mobile) @mobile', () => {
  test.use({ viewport: { width: 320, height: 568 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  })

  test('Formula text must be at least 32 CSS pixels tall (spec §7)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      if (!scene || !scene.scene.isActive()) {
        throw new Error('GameScene not active')
      }
      
      // Find a formula text object from the balloon sprites
      const balloonSprites = scene.balloonSprites
      if (!balloonSprites || balloonSprites.length === 0) {
        throw new Error('No balloons found')
      }
      
      const firstBalloon = balloonSprites[0]
      const text = firstBalloon.text as Phaser.GameObjects.Text
      
      // Get the text bounds in game space
      const bounds = text.getBounds()
      const gameHeight = bounds.height
      
      // Get the canvas CSS scale
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      return {
        gameHeight,
        cssHeight: gameHeight * scale,
        scale,
        gameWidth: game.scale.width,
        gameScaleWidth: game.scale.width,
        displayWidth: rect.width
      }
    })
    
    expect(result.cssHeight).toBeGreaterThanOrEqual(32)
  })

  test('Target number text must be at least 32 CSS pixels tall (spec §7)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      if (!scene || !scene.scene.isActive()) {
        throw new Error('GameScene not active')
      }
      
      const targetText = scene.targetText as Phaser.GameObjects.Text
      if (!targetText) {
        throw new Error('Target text not found')
      }
      
      const bounds = targetText.getBounds()
      const gameHeight = bounds.height
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      return {
        gameHeight,
        cssHeight: gameHeight * scale,
        scale
      }
    })
    
    expect(result.cssHeight).toBeGreaterThanOrEqual(32)
  })

  test('Balloon hit area must be at least 64×64 CSS pixels (spec §3)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      if (!scene || !scene.scene.isActive()) {
        throw new Error('GameScene not active')
      }
      
      const balloonSprites = scene.balloonSprites
      if (!balloonSprites || balloonSprites.length === 0) {
        throw new Error('No balloons found')
      }
      
      const firstBalloon = balloonSprites[0]
      const sprite = firstBalloon.sprite as Phaser.GameObjects.Graphics
      
      // Get the hit area (should be an ellipse)
      const hitArea = sprite.input?.hitArea as Phaser.Geom.Ellipse
      if (!hitArea) {
        throw new Error('No hit area found')
      }
      
      // Ellipse dimensions in game space (width/height of bounding box)
      const gameWidth = hitArea.width
      const gameHeight = hitArea.height
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      return {
        gameWidth,
        gameHeight,
        cssWidth: gameWidth * scale,
        cssHeight: gameHeight * scale,
        scale
      }
    })
    
    expect(result.cssWidth).toBeGreaterThanOrEqual(64)
    expect(result.cssHeight).toBeGreaterThanOrEqual(64)
  })

  test('Formula must fit inside balloon ellipse without overflow', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      if (!scene || !scene.scene.isActive()) {
        throw new Error('GameScene not active')
      }
      
      const balloonSprites = scene.balloonSprites
      if (!balloonSprites || balloonSprites.length === 0) {
        throw new Error('No balloons found')
      }
      
      const firstBalloon = balloonSprites[0]
      const sprite = firstBalloon.sprite as Phaser.GameObjects.Graphics
      const text = firstBalloon.text as Phaser.GameObjects.Text
      
      const hitArea = sprite.input?.hitArea as Phaser.Geom.Ellipse
      if (!hitArea) {
        throw new Error('No hit area found')
      }
      
      const textBounds = text.getBounds()
      
      // Check if text fits within the ellipse
      // Ellipse is centered at (sprite.x, sprite.y)
      const ellipseRadiusX = hitArea.width / 2
      const ellipseRadiusY = hitArea.height / 2
      
      // Text bounds relative to balloon center
      const textLeft = textBounds.x - sprite.x
      const textRight = textBounds.x + textBounds.width - sprite.x
      const textTop = textBounds.y - sprite.y
      const textBottom = textBounds.y + textBounds.height - sprite.y
      
      return {
        ellipseRadiusX,
        ellipseRadiusY,
        textWidth: textBounds.width,
        textHeight: textBounds.height,
        textLeft,
        textRight,
        textTop,
        textBottom,
        fitsHorizontally: Math.abs(textLeft) < ellipseRadiusX && Math.abs(textRight) < ellipseRadiusX,
        fitsVertically: Math.abs(textTop) < ellipseRadiusY && Math.abs(textBottom) < ellipseRadiusY
      }
    })
    
    expect(result.fitsHorizontally).toBe(true)
    expect(result.fitsVertically).toBe(true)
  })

  test('Mute button must be at least 64×64 CSS pixels (spec §3)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      if (!scene || !scene.scene.isActive()) {
        throw new Error('GameScene not active')
      }
      
      const muteButton = scene.muteButton as Phaser.GameObjects.Text
      if (!muteButton) {
        throw new Error('Mute button not found')
      }
      
      // Get the hit area bounds
      const hitArea = muteButton.input?.hitArea as Phaser.Geom.Rectangle
      if (!hitArea) {
        throw new Error('No hit area found on mute button')
      }
      
      const gameWidth = hitArea.width
      const gameHeight = hitArea.height
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      return {
        gameWidth,
        gameHeight,
        cssWidth: gameWidth * scale,
        cssHeight: gameHeight * scale
      }
    })
    
    expect(result.cssWidth).toBeGreaterThanOrEqual(64)
    expect(result.cssHeight).toBeGreaterThanOrEqual(64)
  })
})

test.describe('Real Geometry - 375×667 (iPhone 6/7/8) @mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  })

  test('All critical elements meet minimums', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      if (!scene || !scene.scene.isActive()) {
        throw new Error('GameScene not active')
      }
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      // Formula text
      const balloonSprites = scene.balloonSprites
      const firstBalloon = balloonSprites[0]
      const formulaText = firstBalloon.text as Phaser.GameObjects.Text
      const formulaBounds = formulaText.getBounds()
      
      // Target text
      const targetText = scene.targetText as Phaser.GameObjects.Text
      const targetBounds = targetText.getBounds()
      
      // Balloon hit area
      const sprite = firstBalloon.sprite as Phaser.GameObjects.Graphics
      const hitArea = sprite.input?.hitArea as Phaser.Geom.Ellipse
      
      // Mute button
      const muteButton = scene.muteButton as Phaser.GameObjects.Text
      const muteHitArea = muteButton.input?.hitArea as Phaser.Geom.Rectangle
      
      return {
        scale,
        gameWidth: game.scale.width,
        displayWidth: rect.width,
        formula: {
          gameHeight: formulaBounds.height,
          cssHeight: formulaBounds.height * scale
        },
        target: {
          gameHeight: targetBounds.height,
          cssHeight: targetBounds.height * scale
        },
        balloon: {
          gameWidth: hitArea.width,
          gameHeight: hitArea.height,
          cssWidth: hitArea.width * scale,
          cssHeight: hitArea.height * scale
        },
        mute: {
          gameWidth: muteHitArea.width,
          gameHeight: muteHitArea.height,
          cssWidth: muteHitArea.width * scale,
          cssHeight: muteHitArea.height * scale
        }
      }
    })
    
    // Text minimums (§7)
    expect(result.formula.cssHeight).toBeGreaterThanOrEqual(32)
    expect(result.target.cssHeight).toBeGreaterThanOrEqual(32)
    
    // Tap target minimums (§3)
    expect(result.balloon.cssWidth).toBeGreaterThanOrEqual(64)
    expect(result.balloon.cssHeight).toBeGreaterThanOrEqual(64)
    expect(result.mute.cssWidth).toBeGreaterThanOrEqual(64)
    expect(result.mute.cssHeight).toBeGreaterThanOrEqual(64)
  })
})

test.describe('Real Geometry - 1280×800 (Desktop)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  })

  test('All elements remain above minimums on desktop', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      if (!scene || !scene.scene.isActive()) {
        throw new Error('GameScene not active')
      }
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      const balloonSprites = scene.balloonSprites
      const firstBalloon = balloonSprites[0]
      const formulaText = firstBalloon.text as Phaser.GameObjects.Text
      const formulaBounds = formulaText.getBounds()
      
      const targetText = scene.targetText as Phaser.GameObjects.Text
      const targetBounds = targetText.getBounds()
      
      const sprite = firstBalloon.sprite as Phaser.GameObjects.Graphics
      const hitArea = sprite.input?.hitArea as Phaser.Geom.Ellipse
      
      const muteButton = scene.muteButton as Phaser.GameObjects.Text
      const muteHitArea = muteButton.input?.hitArea as Phaser.Geom.Rectangle
      
      return {
        scale,
        formula: { cssHeight: formulaBounds.height * scale },
        target: { cssHeight: targetBounds.height * scale },
        balloon: {
          cssWidth: hitArea.width * scale,
          cssHeight: hitArea.height * scale
        },
        mute: {
          cssWidth: muteHitArea.width * scale,
          cssHeight: muteHitArea.height * scale
        }
      }
    })
    
    expect(result.formula.cssHeight).toBeGreaterThanOrEqual(32)
    expect(result.target.cssHeight).toBeGreaterThanOrEqual(32)
    expect(result.balloon.cssWidth).toBeGreaterThanOrEqual(64)
    expect(result.balloon.cssHeight).toBeGreaterThanOrEqual(64)
    expect(result.mute.cssWidth).toBeGreaterThanOrEqual(64)
    expect(result.mute.cssHeight).toBeGreaterThanOrEqual(64)
  })

  test('With 5 balloons and large numbers, text still meets minimums', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('tatematika-kote-balonche-settings', JSON.stringify({
        upperLimit: 20,
        operations: 'both',
        balloonCount: 5,
        correctBalloonsPerLevel: 10,
        balloonSpeed: 'slow'
      }))
    })
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
    
    const result = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      const balloonSprites = scene.balloonSprites
      
      // Check all balloons
      const allBalloons = balloonSprites.map((bs: any) => {
        const text = bs.text as Phaser.GameObjects.Text
        const bounds = text.getBounds()
        const sprite = bs.sprite as Phaser.GameObjects.Graphics
        const hitArea = sprite.input?.hitArea as Phaser.Geom.Ellipse
        
        return {
          formulaCssHeight: bounds.height * scale,
          balloonCssWidth: hitArea.width * scale,
          balloonCssHeight: hitArea.height * scale
        }
      })
      
      return { allBalloons, count: allBalloons.length }
    })
    
    expect(result.count).toBe(5)
    
    for (const balloon of result.allBalloons) {
      expect(balloon.formulaCssHeight).toBeGreaterThanOrEqual(32)
      expect(balloon.balloonCssWidth).toBeGreaterThanOrEqual(64)
      expect(balloon.balloonCssHeight).toBeGreaterThanOrEqual(64)
    }
  })
})

test.describe('Real Geometry - Settings Button @mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  })

  test('Settings button must be at least 64×64 CSS pixels (spec §3)', async ({ page }) => {
    // Settings button is a DOM element, not a Phaser object
    const settingsButton = page.locator('[data-testid="button-settings"]')
    await expect(settingsButton).toBeVisible()
    
    const box = await settingsButton.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(64)
    expect(box!.height).toBeGreaterThanOrEqual(64)
  })
})
