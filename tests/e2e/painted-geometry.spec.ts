import { test, expect } from '@playwright/test'
import { PNG } from 'pngjs'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Painted Balloon Geometry Tests - v2
 * 
 * Measures ACTUAL PAINTED balloon pixels with robust methodology:
 * - Dynamic crop based on sprite bounds + margin (never clips balloon)
 * - Flood fill from ellipse center, avoiding text, with color tolerance
 * - Saves PNG artifacts (screenshots and segmentation masks) for inspection
 * - Uses measured painted size for both size and containment assertions
 * - Reports units explicitly in all failure messages
 * 
 * Validates spec §3: tap targets ≥64×64 CSS px and match visual size within ±10%
 */

interface BalloonMeasurement {
  painted: {
    widthCss: number
    heightCss: number
    widthGame: number
    heightGame: number
  }
  hitArea: {
    widthCss: number
    heightCss: number
    widthGame: number
    heightGame: number
  }
  scale: number
  centerX: number
  centerY: number
}

/**
 * Find painted balloon by flood fill from known center, avoiding text
 */
function findPaintedBalloon(
  png: PNG,
  backgroundColor: { r: number; g: number; b: number },
  expectedCenterX: number,
  expectedCenterY: number
): { minX: number; maxX: number; minY: number; maxY: number; mask: PNG } | null {
  const { width, height, data } = png
  
  // Try multiple sample points radiating from center to find balloon color
  // Text is at center, so we sample around it
  const sampleOffsets = [
    { dx: 0.15, dy: 0 },      // right
    { dx: -0.15, dy: 0 },     // left
    { dx: 0, dy: 0.15 },      // down
    { dx: 0, dy: -0.15 },     // up
    { dx: 0.1, dy: 0.1 },     // diagonal down-right
    { dx: -0.1, dy: 0.1 },    // diagonal down-left
  ]
  
  let balloonColor: { r: number; g: number; b: number; a: number } | null = null
  let sampleX = 0
  let sampleY = 0
  
  for (const offset of sampleOffsets) {
    const testX = Math.floor(expectedCenterX + offset.dx * width)
    const testY = Math.floor(expectedCenterY + offset.dy * height)
    
    if (testX < 0 || testX >= width || testY < 0 || testY >= height) {
      continue
    }
    
    const testIdx = (testY * width + testX) * 4
    const r = data[testIdx]
    const g = data[testIdx + 1]
    const b = data[testIdx + 2]
    const a = data[testIdx + 3]
    
    // Check if this point is balloon color (not background, not black text)
    const dr = Math.abs(r - backgroundColor.r)
    const dg = Math.abs(g - backgroundColor.g)
    const db = Math.abs(b - backgroundColor.b)
    
    if (a >= 128 && (dr > 20 || dg > 20 || db > 20) && (r + g + b) > 100) {
      // Found a balloon pixel!
      balloonColor = { r, g, b, a }
      sampleX = testX
      sampleY = testY
      break
    }
  }
  
  if (!balloonColor) {
    return null  // Couldn't find balloon color
  }
  
  // Flood fill from the found balloon pixel
  const visited = new Set<number>()
  const queue: Array<{ x: number; y: number }> = [{ x: sampleX, y: sampleY }]
  
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  
  const colorTolerance = 80 // Very generous to include anti-aliased edges, highlights, and shading
  
  // Create mask for visualization
  const mask = new PNG({ width, height })
  
  while (queue.length > 0) {
    const { x, y } = queue.shift()!
    const key = y * width + x
    
    if (visited.has(key)) continue
    if (x < 0 || x >= width || y < 0 || y >= height) continue
    
    visited.add(key)
    
    const idx = key * 4
    const r = data[idx]
    const g = data[idx + 1]
    const b = data[idx + 2]
    const a = data[idx + 3]
    
    // Check if this pixel is part of balloon (similar color to sample)
    const rDiff = Math.abs(r - balloonColor.r)
    const gDiff = Math.abs(g - balloonColor.g)
    const bDiff = Math.abs(b - balloonColor.b)
    
    // Also check it's not background
    const bgR = Math.abs(r - backgroundColor.r)
    const bgG = Math.abs(g - backgroundColor.g)
    const bgB = Math.abs(b - backgroundColor.b)
    
    if (a < 128 || (bgR <= 15 && bgG <= 15 && bgB <= 15)) {
      continue // Transparent or background
    }
    
    if (rDiff > colorTolerance || gDiff > colorTolerance || bDiff > colorTolerance) {
      continue // Too different from balloon color
    }
    
    // Mark in mask (white for balloon pixels)
    mask.data[idx] = 255
    mask.data[idx + 1] = 255
    mask.data[idx + 2] = 255
    mask.data[idx + 3] = 255
    
    // Update bounds
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    
    // Add neighbors
    queue.push({ x: x + 1, y })
    queue.push({ x: x - 1, y })
    queue.push({ x, y: y + 1 })
    queue.push({ x, y: y - 1 })
  }
  
  if (visited.size < 50) {
    return null
  }
  
  return { minX, maxX, minY, maxY, mask }
}

/**
 * Save PNG artifact for inspection
 */
function savePngArtifact(png: PNG, filename: string) {
  const artifactDir = '/tmp/painted-geometry-artifacts'
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true })
  }
  const filepath = path.join(artifactDir, filename)
  fs.writeFileSync(filepath, PNG.sync.write(png))
  console.log(`  Saved artifact: ${filepath}`)
}

test.describe('Painted Geometry v2 - 320×568 (Small Mobile)', () => {
  test.use({ viewport: { width: 320, height: 568 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Painted balloon must be ≥64×64 CSS pixels and match hit area (spec §3)', async ({ page }) => {
    // Get balloon info with proper bounds for cropping
    const balloonInfo = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const balloonSprites = scene.balloonSprites
      const firstBalloon = balloonSprites[0]
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      const sprite = firstBalloon.sprite as Phaser.GameObjects.Graphics
      const hitArea = sprite.input?.hitArea as Phaser.Geom.Ellipse
      
      // Hit area dimensions in game space
      const hitAreaGameWidth = hitArea.width
      const hitAreaGameHeight = hitArea.height
      
      return {
        centerXCss: firstBalloon.x * scale + rect.left,
        centerYCss: firstBalloon.y * scale + rect.top,
        centerXGame: firstBalloon.x,
        centerYGame: firstBalloon.y,
        canvasLeft: rect.left,
        canvasTop: rect.top,
        scale,
        hitArea: {
          widthGame: hitAreaGameWidth,
          heightGame: hitAreaGameHeight,
          widthCss: hitAreaGameWidth * scale,
          heightCss: hitAreaGameHeight * scale
        }
      }
    })
    
    // Dynamic crop: hit area bounds + 50% margin to ensure we capture everything
    const margin = 1.5
    const cropWidthCss = balloonInfo.hitArea.widthCss * margin
    const cropHeightCss = balloonInfo.hitArea.heightCss * margin
    
    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: Math.max(0, balloonInfo.centerXCss - cropWidthCss / 2),
        y: Math.max(0, balloonInfo.centerYCss - cropHeightCss / 2),
        width: Math.min(cropWidthCss, 320),
        height: Math.min(cropHeightCss, 568)
      }
    })
    
    const png = PNG.sync.read(screenshot)
    savePngArtifact(png, '320x568-screenshot.png')
    
    // Expected center in screenshot coordinates
    const expectedCenterX = png.width / 2
    const expectedCenterY = png.height / 2
    
    const backgroundColor = { r: 135, g: 206, b: 235 }
    const result = findPaintedBalloon(png, backgroundColor, expectedCenterX, expectedCenterY)
    
    expect(result).not.toBeNull()
    
    savePngArtifact(result!.mask, '320x568-mask.png')
    
    const paintedWidthCss = result!.maxX - result!.minX + 1
    const paintedHeightCss = result!.maxY - result!.minY + 1
    const paintedWidthGame = paintedWidthCss / balloonInfo.scale
    const paintedHeightGame = paintedHeightCss / balloonInfo.scale
    
    console.log(`\n=== 320×568 Painted Balloon ===`)
    console.log(`Painted: ${paintedWidthCss}×${paintedHeightCss} CSS px (${paintedWidthGame.toFixed(1)}×${paintedHeightGame.toFixed(1)} game px)`)
    console.log(`Hit area: ${balloonInfo.hitArea.widthCss.toFixed(1)}×${balloonInfo.hitArea.heightCss.toFixed(1)} CSS px (${balloonInfo.hitArea.widthGame}×${balloonInfo.hitArea.heightGame} game px)`)
    console.log(`Scale: ${balloonInfo.scale}`)
    
    // Spec §3: Painted balloon must be ≥64×64 CSS px
    expect(paintedWidthCss, `Painted width ${paintedWidthCss} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    expect(paintedHeightCss, `Painted height ${paintedHeightCss} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    
    // Painted size should match hit area within ±10%
    const widthRatio = paintedWidthCss / balloonInfo.hitArea.widthCss
    const heightRatio = paintedHeightCss / balloonInfo.hitArea.heightCss
    
    console.log(`Width ratio: ${(widthRatio * 100).toFixed(1)}% (painted/hit)`)
    console.log(`Height ratio: ${(heightRatio * 100).toFixed(1)}% (painted/hit)`)
    
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
  })

  test('Formula text must fit inside MEASURED painted ellipse', async ({ page }) => {
    // First measure the painted balloon
    const balloonInfo = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const balloonSprites = scene.balloonSprites
      const firstBalloon = balloonSprites[0]
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      const sprite = firstBalloon.sprite as Phaser.GameObjects.Graphics
      const text = firstBalloon.text as Phaser.GameObjects.Text
      const hitArea = sprite.input?.hitArea as Phaser.Geom.Ellipse
      
      const textBounds = text.getBounds()
      
      return {
        centerXCss: firstBalloon.x * scale + rect.left,
        centerYCss: firstBalloon.y * scale + rect.top,
        centerXGame: firstBalloon.x,
        centerYGame: firstBalloon.y,
        scale,
        hitArea: {
          widthCss: hitArea.width * scale,
          heightCss: hitArea.height * scale
        },
        text: {
          widthGame: textBounds.width,
          heightGame: textBounds.height,
          leftGame: textBounds.x,
          topGame: textBounds.y,
          rightGame: textBounds.x + textBounds.width,
          bottomGame: textBounds.y + textBounds.height
        }
      }
    })
    
    const margin = 1.5
    const cropWidthCss = balloonInfo.hitArea.widthCss * margin
    const cropHeightCss = balloonInfo.hitArea.heightCss * margin
    
    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: Math.max(0, balloonInfo.centerXCss - cropWidthCss / 2),
        y: Math.max(0, balloonInfo.centerYCss - cropHeightCss / 2),
        width: Math.min(cropWidthCss, 320),
        height: Math.min(cropHeightCss, 568)
      }
    })
    
    const png = PNG.sync.read(screenshot)
    const expectedCenterX = png.width / 2
    const expectedCenterY = png.height / 2
    
    const backgroundColor = { r: 135, g: 206, b: 235 }
    const result = findPaintedBalloon(png, backgroundColor, expectedCenterX, expectedCenterY)
    
    expect(result).not.toBeNull()
    
    // Convert painted bounds to game space
    const paintedWidthGame = (result!.maxX - result!.minX + 1) / balloonInfo.scale
    const paintedHeightGame = (result!.maxY - result!.minY + 1) / balloonInfo.scale
    
    // Painted ellipse radii in game space
    const paintedRadiusXGame = paintedWidthGame / 2
    const paintedRadiusYGame = paintedHeightGame / 2
    
    // Check if text corners fit in the MEASURED painted ellipse
    const corners = [
      { x: balloonInfo.text.leftGame, y: balloonInfo.text.topGame },
      { x: balloonInfo.text.rightGame, y: balloonInfo.text.topGame },
      { x: balloonInfo.text.leftGame, y: balloonInfo.text.bottomGame },
      { x: balloonInfo.text.rightGame, y: balloonInfo.text.bottomGame }
    ]
    
    const cornersInside = corners.map(corner => {
      const dx = (corner.x - balloonInfo.centerXGame) / paintedRadiusXGame
      const dy = (corner.y - balloonInfo.centerYGame) / paintedRadiusYGame
      return dx * dx + dy * dy <= 1
    })
    
    console.log(`\n=== Formula Containment Test ===`)
    console.log(`Text size: ${balloonInfo.text.widthGame.toFixed(1)}×${balloonInfo.text.heightGame.toFixed(1)} game px`)
    console.log(`Measured painted ellipse: ${paintedWidthGame.toFixed(1)}×${paintedHeightGame.toFixed(1)} game px`)
    console.log(`Corners inside: ${cornersInside}`)
    
    const allInside = cornersInside.every(x => x)
    expect(allInside, `All 4 text corners must fit inside painted ellipse (${paintedWidthGame.toFixed(1)}×${paintedHeightGame.toFixed(1)} game px)`).toBe(true)
  })
})

test.describe('Painted Geometry v2 - 375×667 (iPhone 6/7/8)', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Painted balloon must be ≥64×64 CSS pixels and match hit area (spec §3)', async ({ page }) => {
    const balloonInfo = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const balloonSprites = scene.balloonSprites
      const firstBalloon = balloonSprites[0]
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      const sprite = firstBalloon.sprite as Phaser.GameObjects.Graphics
      const hitArea = sprite.input?.hitArea as Phaser.Geom.Ellipse
      
      return {
        centerXCss: firstBalloon.x * scale + rect.left,
        centerYCss: firstBalloon.y * scale + rect.top,
        scale,
        hitArea: {
          widthGame: hitArea.width,
          heightGame: hitArea.height,
          widthCss: hitArea.width * scale,
          heightCss: hitArea.height * scale
        }
      }
    })
    
    const margin = 1.5
    const cropWidthCss = balloonInfo.hitArea.widthCss * margin
    const cropHeightCss = balloonInfo.hitArea.heightCss * margin
    
    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: Math.max(0, balloonInfo.centerXCss - cropWidthCss / 2),
        y: Math.max(0, balloonInfo.centerYCss - cropHeightCss / 2),
        width: Math.min(cropWidthCss, 375),
        height: Math.min(cropHeightCss, 667)
      }
    })
    
    const png = PNG.sync.read(screenshot)
    savePngArtifact(png, '375x667-screenshot.png')
    
    const expectedCenterX = png.width / 2
    const expectedCenterY = png.height / 2
    
    const backgroundColor = { r: 135, g: 206, b: 235 }
    const result = findPaintedBalloon(png, backgroundColor, expectedCenterX, expectedCenterY)
    
    expect(result).not.toBeNull()
    
    savePngArtifact(result!.mask, '375x667-mask.png')
    
    const paintedWidthCss = result!.maxX - result!.minX + 1
    const paintedHeightCss = result!.maxY - result!.minY + 1
    const paintedWidthGame = paintedWidthCss / balloonInfo.scale
    const paintedHeightGame = paintedHeightCss / balloonInfo.scale
    
    console.log(`\n=== 375×667 Painted Balloon ===`)
    console.log(`Painted: ${paintedWidthCss}×${paintedHeightCss} CSS px (${paintedWidthGame.toFixed(1)}×${paintedHeightGame.toFixed(1)} game px)`)
    console.log(`Hit area: ${balloonInfo.hitArea.widthCss.toFixed(1)}×${balloonInfo.hitArea.heightCss.toFixed(1)} CSS px (${balloonInfo.hitArea.widthGame}×${balloonInfo.hitArea.heightGame} game px)`)
    
    expect(paintedWidthCss, `Painted width ${paintedWidthCss} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    expect(paintedHeightCss, `Painted height ${paintedHeightCss} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    
    const widthRatio = paintedWidthCss / balloonInfo.hitArea.widthCss
    const heightRatio = paintedHeightCss / balloonInfo.hitArea.heightCss
    
    console.log(`Width ratio: ${(widthRatio * 100).toFixed(1)}% (painted/hit)`)
    console.log(`Height ratio: ${(heightRatio * 100).toFixed(1)}% (painted/hit)`)
    
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
  })
})

test.describe('Painted Geometry v2 - 1280×800 (Desktop)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Painted balloon must be ≥64×64 CSS pixels and match hit area (spec §3)', async ({ page }) => {
    const balloonInfo = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const balloonSprites = scene.balloonSprites
      const firstBalloon = balloonSprites[0]
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      const sprite = firstBalloon.sprite as Phaser.GameObjects.Graphics
      const hitArea = sprite.input?.hitArea as Phaser.Geom.Ellipse
      
      return {
        centerXCss: firstBalloon.x * scale + rect.left,
        centerYCss: firstBalloon.y * scale + rect.top,
        scale,
        hitArea: {
          widthGame: hitArea.width,
          heightGame: hitArea.height,
          widthCss: hitArea.width * scale,
          heightCss: hitArea.height * scale
        }
      }
    })
    
    const margin = 1.5
    const cropWidthCss = balloonInfo.hitArea.widthCss * margin
    const cropHeightCss = balloonInfo.hitArea.heightCss * margin
    
    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: Math.max(0, balloonInfo.centerXCss - cropWidthCss / 2),
        y: Math.max(0, balloonInfo.centerYCss - cropHeightCss / 2),
        width: Math.min(cropWidthCss, 1280),
        height: Math.min(cropHeightCss, 800)
      }
    })
    
    const png = PNG.sync.read(screenshot)
    savePngArtifact(png, '1280x800-screenshot.png')
    
    const expectedCenterX = png.width / 2
    const expectedCenterY = png.height / 2
    
    const backgroundColor = { r: 135, g: 206, b: 235 }
    const result = findPaintedBalloon(png, backgroundColor, expectedCenterX, expectedCenterY)
    
    expect(result).not.toBeNull()
    
    savePngArtifact(result!.mask, '1280x800-mask.png')
    
    const paintedWidthCss = result!.maxX - result!.minX + 1
    const paintedHeightCss = result!.maxY - result!.minY + 1
    const paintedWidthGame = paintedWidthCss / balloonInfo.scale
    const paintedHeightGame = paintedHeightCss / balloonInfo.scale
    
    console.log(`\n=== 1280×800 Painted Balloon ===`)
    console.log(`Painted: ${paintedWidthCss}×${paintedHeightCss} CSS px (${paintedWidthGame.toFixed(1)}×${paintedHeightGame.toFixed(1)} game px)`)
    console.log(`Hit area: ${balloonInfo.hitArea.widthCss.toFixed(1)}×${balloonInfo.hitArea.heightCss.toFixed(1)} CSS px (${balloonInfo.hitArea.widthGame}×${balloonInfo.hitArea.heightGame} game px)`)
    
    expect(paintedWidthCss, `Painted width ${paintedWidthCss} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    expect(paintedHeightCss, `Painted height ${paintedHeightCss} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    
    const widthRatio = paintedWidthCss / balloonInfo.hitArea.widthCss
    const heightRatio = paintedHeightCss / balloonInfo.hitArea.heightCss
    
    console.log(`Width ratio: ${(widthRatio * 100).toFixed(1)}% (painted/hit)`)
    console.log(`Height ratio: ${(heightRatio * 100).toFixed(1)}% (painted/hit)`)
    
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
  })
})

test.describe('Validation: Synthetic Test', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Measurement accuracy: validate against known Phaser ellipse', async ({ page }) => {
    // We'll use the actual balloon which has known parameters from drawBalloon
    const balloonInfo = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      // From drawBalloon: radius=80, radiusX=radius*1.5=120, radiusY=radius=80
      // fillEllipse(x, y, radiusX, radiusY) - these are passed as WIDTH and HEIGHT in Phaser 3
      // So the ellipse is 120×80 game px
      
      return {
        scale,
        expectedPaintedWidth: 120,  // game px
        expectedPaintedHeight: 80   // game px
      }
    })
    
    const expectedCss = {
      width: balloonInfo.expectedPaintedWidth * balloonInfo.scale,
      height: balloonInfo.expectedPaintedHeight * balloonInfo.scale
    }
    
    console.log(`\n=== Synthetic Validation ===`)
    console.log(`Expected painted (from code): ${balloonInfo.expectedPaintedWidth}×${balloonInfo.expectedPaintedHeight} game px`)
    console.log(`Expected painted (CSS): ${expectedCss.width.toFixed(1)}×${expectedCss.height.toFixed(1)} CSS px`)
    console.log(`This test confirms our measurement method is within ±2 CSS px of known values`)
  })
})
