import { test, expect } from '@playwright/test'
import { PNG } from 'pngjs'

/**
 * Painted Balloon Geometry Tests
 * 
 * These tests measure the ACTUAL PAINTED balloon pixels, not hit areas or hooks.
 * 
 * Problem: drawBalloon calls graphics.fillEllipse(x, y, radiusX, radiusY).
 * Phaser 3's fillEllipse takes WIDTH and HEIGHT, not radii.
 * So the painted balloon is only 120×80 game px (half the intended size),
 * while the hit area is 240×160.
 * 
 * Method:
 * 1. Screenshot the canvas region around each balloon center
 * 2. Decode PNG with pngjs
 * 3. Find painted balloon via color detection (non-background pixels)
 * 4. Measure bounding box in CSS pixels
 * 5. Assert ≥64×64 CSS px per spec §3
 * 6. Assert painted size matches hit area within ±10%
 * 7. Assert formula text fits inside PAINTED ellipse, not hit area
 */

interface BalloonPaintedBounds {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/**
 * Find the painted balloon in a screenshot
 * Strategy: Find the largest non-background colored region near the center
 */
function findPaintedBalloon(png: PNG, backgroundColor: { r: number; g: number; b: number }): BalloonPaintedBounds | null {
  const { width, height, data } = png
  
  // Find all potential balloon colors (non-background, non-black colors with significant area)
  const colorCounts = new Map<string, number>()
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      const a = data[idx + 3]
      
      if (a < 128) continue
      
      // Skip background
      const dr = Math.abs(r - backgroundColor.r)
      const dg = Math.abs(g - backgroundColor.g)
      const db = Math.abs(b - backgroundColor.b)
      if (dr <= 15 && dg <= 15 && db <= 15) continue
      
      // Skip black (text)
      if (r < 30 && g < 30 && b < 30) continue
      
      // Skip very dark colors (likely text/outline)
      if (r + g + b < 100) continue
      
      const key = `${Math.floor(r / 10) * 10},${Math.floor(g / 10) * 10},${Math.floor(b / 10) * 10}`
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1)
    }
  }
  
  if (colorCounts.size === 0) return null
  
  // Find the most common colored region (the balloon fill)
  let maxCount = 0
  let balloonColorKey = ''
  for (const [key, count] of colorCounts.entries()) {
    if (count > maxCount) {
      maxCount = count
      balloonColorKey = key
    }
  }
  
  if (maxCount < 50) return null // Too small to be a balloon
  
  const [r0, g0, b0] = balloonColorKey.split(',').map(Number)
  
  // Now find the bounding box of all pixels that match this color (with tolerance)
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  let foundPixels = 0
  
  const tolerance = 25
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      const a = data[idx + 3]
      
      if (a < 128) continue
      
      const dr = Math.abs(r - r0)
      const dg = Math.abs(g - g0)
      const db = Math.abs(b - b0)
      
      if (dr <= tolerance && dg <= tolerance && db <= tolerance) {
        foundPixels++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  
  if (foundPixels < 50) return null
  
  return {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  }
}

test.describe('Painted Geometry - 320×568 (Small Mobile)', () => {
  test.use({ viewport: { width: 320, height: 568 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Painted balloon must be at least 64×64 CSS pixels (spec §3)', async ({ page }) => {
    // Get balloon position and canvas info
    const balloonInfo = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const balloonSprites = scene.balloonSprites
      const firstBalloon = balloonSprites[0]
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      
      // Get hit area for comparison
      const sprite = firstBalloon.sprite as Phaser.GameObjects.Graphics
      const hitArea = sprite.input?.hitArea as Phaser.Geom.Ellipse
      
      const scale = rect.width / game.scale.width
      
      return {
        centerX: firstBalloon.x * scale + rect.left,
        centerY: firstBalloon.y * scale + rect.top,
        canvasLeft: rect.left,
        canvasTop: rect.top,
        scale,
        hitArea: {
          width: hitArea.width * scale,
          height: hitArea.height * scale
        }
      }
    })
    
    // Screenshot a region around the balloon (200x200 CSS px should be enough)
    const screenshotSize = 200
    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: Math.max(0, balloonInfo.centerX - screenshotSize / 2),
        y: Math.max(0, balloonInfo.centerY - screenshotSize / 2),
        width: screenshotSize,
        height: screenshotSize
      }
    })
    
    // Decode PNG
    const png = PNG.sync.read(screenshot)
    
    // Background color is sky blue #87CEEB (135, 206, 235)
    const backgroundColor = { r: 135, g: 206, b: 235 }
    
    const painted = findPaintedBalloon(png, backgroundColor)
    
    expect(painted).not.toBeNull()
    
    console.log(`\n=== 320×568 Painted Balloon ===`)
    console.log(`Painted: ${painted!.width}×${painted!.height} CSS px`)
    console.log(`Hit area: ${balloonInfo.hitArea.width.toFixed(1)}×${balloonInfo.hitArea.height.toFixed(1)} CSS px`)
    
    // Spec §3: Balloons must be ≥64×64 CSS px
    expect(painted!.width).toBeGreaterThanOrEqual(64)
    expect(painted!.height).toBeGreaterThanOrEqual(64)
    
    // Painted size should match hit area within ±10%
    // A tap target must match what the child sees
    const widthRatio = painted!.width / balloonInfo.hitArea.width
    const heightRatio = painted!.height / balloonInfo.hitArea.height
    
    console.log(`Width ratio: ${(widthRatio * 100).toFixed(1)}%`)
    console.log(`Height ratio: ${(heightRatio * 100).toFixed(1)}%`)
    
    expect(widthRatio).toBeGreaterThanOrEqual(0.9)
    expect(widthRatio).toBeLessThanOrEqual(1.1)
    expect(heightRatio).toBeGreaterThanOrEqual(0.9)
    expect(heightRatio).toBeLessThanOrEqual(1.1)
  })

  test('Formula text must fit inside PAINTED ellipse', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const balloonSprites = scene.balloonSprites
      const firstBalloon = balloonSprites[0]
      
      const sprite = firstBalloon.sprite as Phaser.GameObjects.Graphics
      const text = firstBalloon.text as Phaser.GameObjects.Text
      
      // Get text bounds
      const textBounds = text.getBounds()
      
      // We'll get the painted size from the pixel test
      // For now, check against the INTENDED painted size (using correct radii interpretation)
      // The actual drawBalloon uses radiusX=120, radiusY=80 as WIDTH/HEIGHT
      // So painted ellipse is 120×80 game px
      
      const paintedRadiusX = 120 / 2  // 60
      const paintedRadiusY = 80 / 2   // 40
      
      // Check if text corners fit in ellipse
      const corners = [
        { x: textBounds.x, y: textBounds.y },
        { x: textBounds.x + textBounds.width, y: textBounds.y },
        { x: textBounds.x, y: textBounds.y + textBounds.height },
        { x: textBounds.x + textBounds.width, y: textBounds.y + textBounds.height }
      ]
      
      const ellipseCenter = { x: sprite.x, y: sprite.y }
      
      const cornersInside = corners.map(corner => {
        const dx = (corner.x - ellipseCenter.x) / paintedRadiusX
        const dy = (corner.y - ellipseCenter.y) / paintedRadiusY
        return dx * dx + dy * dy <= 1
      })
      
      return {
        paintedSize: { width: 120, height: 80 },
        textSize: { width: textBounds.width, height: textBounds.height },
        allCornersInside: cornersInside.every(x => x),
        cornersInside
      }
    })
    
    console.log(`\nText size: ${result.textSize.width.toFixed(1)}×${result.textSize.height.toFixed(1)} game px`)
    console.log(`Painted ellipse: ${result.paintedSize.width}×${result.paintedSize.height} game px`)
    console.log(`Corners inside: ${result.cornersInside}`)
    
    expect(result.allCornersInside).toBe(true)
  })
})

test.describe('Painted Geometry - 375×667 (iPhone 6/7/8)', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Painted balloon must be at least 64×64 CSS pixels (spec §3)', async ({ page }) => {
    const balloonInfo = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const balloonSprites = scene.balloonSprites
      const firstBalloon = balloonSprites[0]
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      
      const sprite = firstBalloon.sprite as Phaser.GameObjects.Graphics
      const hitArea = sprite.input?.hitArea as Phaser.Geom.Ellipse
      
      const scale = rect.width / game.scale.width
      
      return {
        centerX: firstBalloon.x * scale + rect.left,
        centerY: firstBalloon.y * scale + rect.top,
        canvasLeft: rect.left,
        canvasTop: rect.top,
        scale,
        hitArea: {
          width: hitArea.width * scale,
          height: hitArea.height * scale
        }
      }
    })
    
    const screenshotSize = 200
    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: Math.max(0, balloonInfo.centerX - screenshotSize / 2),
        y: Math.max(0, balloonInfo.centerY - screenshotSize / 2),
        width: screenshotSize,
        height: screenshotSize
      }
    })
    
    const png = PNG.sync.read(screenshot)
    const backgroundColor = { r: 135, g: 206, b: 235 }
    const painted = findPaintedBalloon(png, backgroundColor)
    
    expect(painted).not.toBeNull()
    
    console.log(`\n=== 375×667 Painted Balloon ===`)
    console.log(`Painted: ${painted!.width}×${painted!.height} CSS px`)
    console.log(`Hit area: ${balloonInfo.hitArea.width.toFixed(1)}×${balloonInfo.hitArea.height.toFixed(1)} CSS px`)
    
    expect(painted!.width).toBeGreaterThanOrEqual(64)
    expect(painted!.height).toBeGreaterThanOrEqual(64)
    
    const widthRatio = painted!.width / balloonInfo.hitArea.width
    const heightRatio = painted!.height / balloonInfo.hitArea.height
    
    console.log(`Width ratio: ${(widthRatio * 100).toFixed(1)}%`)
    console.log(`Height ratio: ${(heightRatio * 100).toFixed(1)}%`)
    
    expect(widthRatio).toBeGreaterThanOrEqual(0.9)
    expect(widthRatio).toBeLessThanOrEqual(1.1)
    expect(heightRatio).toBeGreaterThanOrEqual(0.9)
    expect(heightRatio).toBeLessThanOrEqual(1.1)
  })
})

test.describe('Painted Geometry - 1280×800 (Desktop)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Painted balloon must be at least 64×64 CSS pixels (spec §3)', async ({ page }) => {
    const balloonInfo = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const balloonSprites = scene.balloonSprites
      const firstBalloon = balloonSprites[0]
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      
      const sprite = firstBalloon.sprite as Phaser.GameObjects.Graphics
      const hitArea = sprite.input?.hitArea as Phaser.Geom.Ellipse
      
      const scale = rect.width / game.scale.width
      
      return {
        centerX: firstBalloon.x * scale + rect.left,
        centerY: firstBalloon.y * scale + rect.top,
        canvasLeft: rect.left,
        canvasTop: rect.top,
        scale,
        hitArea: {
          width: hitArea.width * scale,
          height: hitArea.height * scale
        }
      }
    })
    
    const screenshotSize = 400  // Larger for desktop
    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: Math.max(0, balloonInfo.centerX - screenshotSize / 2),
        y: Math.max(0, balloonInfo.centerY - screenshotSize / 2),
        width: screenshotSize,
        height: screenshotSize
      }
    })
    
    const png = PNG.sync.read(screenshot)
    const backgroundColor = { r: 135, g: 206, b: 235 }
    const painted = findPaintedBalloon(png, backgroundColor)
    
    expect(painted).not.toBeNull()
    
    console.log(`\n=== 1280×800 Painted Balloon ===`)
    console.log(`Painted: ${painted!.width}×${painted!.height} CSS px`)
    console.log(`Hit area: ${balloonInfo.hitArea.width.toFixed(1)}×${balloonInfo.hitArea.height.toFixed(1)} CSS px`)
    
    expect(painted!.width).toBeGreaterThanOrEqual(64)
    expect(painted!.height).toBeGreaterThanOrEqual(64)
    
    const widthRatio = painted!.width / balloonInfo.hitArea.width
    const heightRatio = painted!.height / balloonInfo.hitArea.height
    
    console.log(`Width ratio: ${(widthRatio * 100).toFixed(1)}%`)
    console.log(`Height ratio: ${(heightRatio * 100).toFixed(1)}%`)
    
    expect(widthRatio).toBeGreaterThanOrEqual(0.9)
    expect(widthRatio).toBeLessThanOrEqual(1.1)
    expect(heightRatio).toBeGreaterThanOrEqual(0.9)
    expect(heightRatio).toBeLessThanOrEqual(1.1)
  })
})
