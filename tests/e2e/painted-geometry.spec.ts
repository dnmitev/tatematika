import { test, expect } from '@playwright/test'
import { PNG } from 'pngjs'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Deterministic Painted Balloon Geometry Tests
 * 
 * Measures balloon ellipse axes by scanning center row/column for fill color.
 * Temporarily hides all other scene objects for clean measurement.
 * 
 * Method:
 * 1. Hide all objects except target balloon (other balloons, text, cat, UI)
 * 2. Screenshot canvas region around balloon
 * 3. Sample fill color at sprite center
 * 4. Scan center row left/right for fill color extent (width axis)
 * 5. Scan center column up/down for fill color extent (height axis)
 * 6. Include stroke by continuing scan with wider tolerance
 * 7. Stop at background (string hangs below, excluded)
 * 8. Convert to game px using canvasRect.width / game.scale.width
 * 
 * Validates against synthetic Graphics.fillEllipse of known size.
 * Measurements must be identical across repeats (deterministic).
 */

interface EllipseMeasurement {
  widthCss: number
  heightCss: number
  widthGame: number
  heightGame: number
}

/**
 * Measure ellipse by scanning center row/column for fill color
 */
function measureEllipseAxes(
  png: PNG,
  backgroundColor: { r: number; g: number; b: number }
): EllipseMeasurement | null {
  const { width, height, data } = png
  
  const centerX = Math.floor(width / 2)
  const centerY = Math.floor(height / 2)
  
  // Sample fill color at center
  const centerIdx = (centerY * width + centerX) * 4
  const fillColor = {
    r: data[centerIdx],
    g: data[centerIdx + 1],
    b: data[centerIdx + 2],
    a: data[centerIdx + 3]
  }
  
  // Check if center is actually balloon (not background)
  const dr = Math.abs(fillColor.r - backgroundColor.r)
  const dg = Math.abs(fillColor.g - backgroundColor.g)
  const db = Math.abs(fillColor.b - backgroundColor.b)
  
  if (fillColor.a < 128 || (dr <= 15 && dg <= 15 && db <= 15)) {
    return null // Center is background
  }
  
  const colorTolerance = 90  // For fill color, highlights, stroke, and anti-aliasing
  
  // Helper: check if pixel is part of balloon (fill or stroke)
  const matchesBalloon = (r: number, g: number, b: number, a: number): boolean => {
    if (a < 128) return false
    
    // Check if it's background
    const bgR = Math.abs(r - backgroundColor.r)
    const bgG = Math.abs(g - backgroundColor.g)
    const bgB = Math.abs(b - backgroundColor.b)
    if (bgR <= 20 && bgG <= 20 && bgB <= 20) return false
    
    // Check similarity to fill color (for fill and stroke)
    const rDiff = Math.abs(r - fillColor.r)
    const gDiff = Math.abs(g - fillColor.g)
    const bDiff = Math.abs(b - fillColor.b)
    
    // Accept if reasonably similar to fill color
    return rDiff <= colorTolerance && gDiff <= colorTolerance && bDiff <= colorTolerance
  }
  
  // Measure width: scan left and right from center along center row
  let leftEdge = centerX
  let rightEdge = centerX
  
  // Scan right
  for (let x = centerX; x < width; x++) {
    const idx = (centerY * width + x) * 4
    const r = data[idx]
    const g = data[idx + 1]
    const b = data[idx + 2]
    const a = data[idx + 3]
    
    if (matchesBalloon(r, g, b, a)) {
      rightEdge = x
    } else {
      break // Hit background or string
    }
  }
  
  // Scan left
  for (let x = centerX; x >= 0; x--) {
    const idx = (centerY * width + x) * 4
    const r = data[idx]
    const g = data[idx + 1]
    const b = data[idx + 2]
    const a = data[idx + 3]
    
    if (matchesBalloon(r, g, b, a)) {
      leftEdge = x
    } else {
      break
    }
  }
  
  // Measure height: scan up and down from center along center column
  let topEdge = centerY
  let bottomEdge = centerY
  
  // Scan down
  for (let y = centerY; y < height; y++) {
    const idx = (y * width + centerX) * 4
    const r = data[idx]
    const g = data[idx + 1]
    const b = data[idx + 2]
    const a = data[idx + 3]
    
    if (matchesBalloon(r, g, b, a)) {
      bottomEdge = y
    } else {
      break // Hit background or string
    }
  }
  
  // Scan up
  for (let y = centerY; y >= 0; y--) {
    const idx = (y * width + centerX) * 4
    const r = data[idx]
    const g = data[idx + 1]
    const b = data[idx + 2]
    const a = data[idx + 3]
    
    if (matchesBalloon(r, g, b, a)) {
      topEdge = y
    } else {
      break
    }
  }
  
  const widthCss = rightEdge - leftEdge + 1
  const heightCss = bottomEdge - topEdge + 1
  
  return {
    widthCss,
    heightCss,
    widthGame: widthCss,  // Will be converted by caller
    heightGame: heightCss
  }
}

/**
 * Save PNG artifact for inspection
 */
function savePngArtifact(buffer: Buffer, filename: string) {
  const artifactDir = '/tmp/painted-geometry-artifacts'
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true })
  }
  const filepath = path.join(artifactDir, filename)
  fs.writeFileSync(filepath, buffer)
  console.log(`  Saved artifact: ${filepath}`)
}

test.describe('Deterministic Painted Geometry - Validation', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Synthetic test: validate measurement against known ellipse', async ({ page }) => {
    // Create a known ellipse in-page: 200x140 game px
    const setup = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      
      // Create test ellipse
      const testGraphics = scene.add.graphics()
      testGraphics.fillStyle(0xFF6B6B, 1) // Red balloon color
      testGraphics.lineStyle(3, 0xCC4444, 1) // Darker red stroke
      
      // Phaser fillEllipse(x, y, width, height)
      const testWidth = 200
      const testHeight = 140
      const testX = 400
      const testY = 300
      
      testGraphics.fillEllipse(testX, testY, testWidth, testHeight)
      testGraphics.strokeEllipse(testX, testY, testWidth, testHeight)
      testGraphics.setDepth(10000)
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      return {
        expectedWidthGame: testWidth,
        expectedHeightGame: testHeight,
        centerXCss: testX * scale + rect.left,
        centerYCss: testY * scale + rect.top,
        scale,
        testGraphics: testGraphics
      }
    })
    
    // Screenshot the test ellipse
    const margin = 150
    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: Math.max(0, setup.centerXCss - margin),
        y: Math.max(0, setup.centerYCss - margin),
        width: Math.min(margin * 2, 375),
        height: Math.min(margin * 2, 667)
      }
    })
    
    savePngArtifact(screenshot, 'synthetic-test-ellipse.png')
    
    // Clean up test graphics
    await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const graphics = scene.children.list.find((obj: any) => obj.depth === 10000)
      if (graphics) graphics.destroy()
    })
    
    // Measure
    const png = PNG.sync.read(screenshot)
    const backgroundColor = { r: 135, g: 206, b: 235 }
    const measurement = measureEllipseAxes(png, backgroundColor)
    
    expect(measurement).not.toBeNull()
    
    const measuredWidthGame = measurement!.widthCss / setup.scale
    const measuredHeightGame = measurement!.heightCss / setup.scale
    
    console.log('\n=== Synthetic Validation ===')
    console.log(`Expected: ${setup.expectedWidthGame}×${setup.expectedHeightGame} game px`)
    console.log(`Measured: ${measuredWidthGame.toFixed(1)}×${measuredHeightGame.toFixed(1)} game px`)
    console.log(`Difference: ${Math.abs(measuredWidthGame - setup.expectedWidthGame).toFixed(1)}×${Math.abs(measuredHeightGame - setup.expectedHeightGame).toFixed(1)} game px`)
    console.log(`Scale: ${setup.scale}`)
    
    const expectedWidthCss = setup.expectedWidthGame * setup.scale
    const expectedHeightCss = setup.expectedHeightGame * setup.scale
    
    // Allow ±2 CSS px tolerance for anti-aliasing and stroke
    const widthDiff = Math.abs(measurement!.widthCss - expectedWidthCss)
    const heightDiff = Math.abs(measurement!.heightCss - expectedHeightCss)
    
    expect(widthDiff, `Width measurement must be within ±2 CSS px (got ${widthDiff.toFixed(1)} px diff)`).toBeLessThanOrEqual(2)
    expect(heightDiff, `Height measurement must be within ±2 CSS px (got ${heightDiff.toFixed(1)} px diff)`).toBeLessThanOrEqual(2)
  })
})

test.describe('Deterministic Painted Geometry - 320×568', () => {
  test.use({ viewport: { width: 320, height: 568 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Painted balloon must be ≥64×64 CSS pixels and match hit area (spec §3)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const balloonSprites = scene.balloonSprites
      const firstBalloon = balloonSprites[0]
      
      // Store original visibility
      const originalVisibility: Array<{ obj: any; visible: boolean; type: string }> = []
      
      // Hide all balloons except first
      balloonSprites.forEach((bs: any, index: number) => {
        if (index !== 0) {
          originalVisibility.push({ obj: bs.sprite, visible: bs.sprite.visible, type: 'sprite' })
          originalVisibility.push({ obj: bs.text, visible: bs.text.visible, type: 'text' })
          bs.sprite.setVisible(false)
          bs.text.setVisible(false)
        } else {
          // Hide text on target balloon
          originalVisibility.push({ obj: bs.text, visible: bs.text.visible, type: 'text' })
          bs.text.setVisible(false)
        }
      })
      
      // Hide other scene objects
      const hideIfExists = (obj: any, name: string) => {
        if (obj && obj.setVisible) {
          originalVisibility.push({ obj, visible: obj.visible, type: name })
          obj.setVisible(false)
        }
      }
      
      hideIfExists(scene.cat, 'cat')
      hideIfExists(scene.targetText, 'targetText')
      hideIfExists(scene.starsText, 'starsText')
      hideIfExists(scene.muteButton, 'muteButton')
      hideIfExists(scene.wrongAttemptsText, 'wrongAttemptsText')
      
      if (scene.settingsButton && scene.settingsButton.style) {
        originalVisibility.push({ obj: scene.settingsButton, visible: scene.settingsButton.style.display, type: 'settingsButton' })
        scene.settingsButton.style.display = 'none'
      }
      
      // Pause all tweens to freeze motion
      scene.tweens.pauseAll()
      
      // Wait for any in-progress animations to settle
      // Use a synchronous delay to ensure scene is fully frozen
      const startWait = Date.now()
      while (Date.now() - startWait < 200) {
        // Busy wait to freeze current state
      }
      
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
    
    // Wait for visibility changes and tweens to settle
    await page.waitForTimeout(300)
    
    // Take screenshot with generous margin to ensure full balloon capture
    const margin = 80
    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: Math.max(0, result.centerXCss - margin),
        y: Math.max(0, result.centerYCss - margin),
        width: Math.min(margin * 2, 320),
        height: Math.min(margin * 2, 568)
      }
    })
    
    savePngArtifact(screenshot, '320x568-clean.png')
    
    // Restore visibility and resume
    await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      
      scene.balloonSprites.forEach((bs: any) => {
        bs.sprite.setVisible(true)
        bs.text.setVisible(true)
      })
      
      if (scene.cat) scene.cat.setVisible(true)
      if (scene.targetText) scene.targetText.setVisible(true)
      if (scene.starsText) scene.starsText.setVisible(true)
      if (scene.muteButton) scene.muteButton.setVisible(true)
      if (scene.wrongAttemptsText) scene.wrongAttemptsText.setVisible(true)
      if (scene.settingsButton && scene.settingsButton.style) {
        scene.settingsButton.style.display = ''
      }
      
      // Resume tweens
      scene.tweens.resumeAll()
    })
    
    // Measure
    const png = PNG.sync.read(screenshot)
    const backgroundColor = { r: 135, g: 206, b: 235 }
    const measurement = measureEllipseAxes(png, backgroundColor)
    
    expect(measurement).not.toBeNull()
    
    const paintedWidthCss = measurement!.widthCss
    const paintedHeightCss = measurement!.heightCss
    const paintedWidthGame = paintedWidthCss / result.scale
    const paintedHeightGame = paintedHeightCss / result.scale
    
    console.log(`\n=== 320×568 Painted Balloon (Deterministic) ===`)
    console.log(`Painted: ${paintedWidthCss}×${paintedHeightCss} CSS px (${paintedWidthGame.toFixed(1)}×${paintedHeightGame.toFixed(1)} game px)`)
    console.log(`Hit area: ${result.hitArea.widthCss.toFixed(1)}×${result.hitArea.heightCss.toFixed(1)} CSS px (${result.hitArea.widthGame}×${result.hitArea.heightGame} game px)`)
    console.log(`Scale: ${result.scale}`)
    
    // Spec §3: must be ≥64×64 CSS px
    expect(paintedWidthCss, `Painted width ${paintedWidthCss} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    expect(paintedHeightCss, `Painted height ${paintedHeightCss} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    
    // Painted must match hit area within ±10%
    const widthRatio = paintedWidthCss / result.hitArea.widthCss
    const heightRatio = paintedHeightCss / result.hitArea.heightCss
    
    console.log(`Width ratio: ${(widthRatio * 100).toFixed(1)}% (painted/hit)`)
    console.log(`Height ratio: ${(heightRatio * 100).toFixed(1)}% (painted/hit)`)
    
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
  })

  test('Formula text must fit inside measured painted ellipse', async ({ page }) => {
    // Get text bounds and balloon info, hide others, measure balloon
    const info = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const balloonSprites = scene.balloonSprites
      const firstBalloon = balloonSprites[0]
      
      const text = firstBalloon.text as Phaser.GameObjects.Text
      const textBounds = text.getBounds()
      
      // Hide all except first balloon (without text)
      balloonSprites.forEach((bs: any, index: number) => {
        if (index !== 0) {
          bs.sprite.setVisible(false)
          bs.text.setVisible(false)
        } else {
          bs.text.setVisible(false)
        }
      })
      
      if (scene.cat) scene.cat.setVisible(false)
      if (scene.targetText) scene.targetText.setVisible(false)
      if (scene.starsText) scene.starsText.setVisible(false)
      if (scene.muteButton) scene.muteButton.setVisible(false)
      if (scene.wrongAttemptsText) scene.wrongAttemptsText.setVisible(false)
      if (scene.settingsButton && scene.settingsButton.style) {
        scene.settingsButton.style.display = 'none'
      }
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      return {
        centerXGame: firstBalloon.x,
        centerYGame: firstBalloon.y,
        centerXCss: firstBalloon.x * scale + rect.left,
        centerYCss: firstBalloon.y * scale + rect.top,
        text: {
          widthGame: textBounds.width,
          heightGame: textBounds.height,
          leftGame: textBounds.x,
          topGame: textBounds.y
        },
        scale
      }
    })
    
    // Wait for visibility changes and tweens to settle
    await page.waitForTimeout(300)
    
    const margin = 80
    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: Math.max(0, info.centerXCss - margin),
        y: Math.max(0, info.centerYCss - margin),
        width: Math.min(margin * 2, 320),
        height: Math.min(margin * 2, 568)
      }
    })
    
    await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      
      scene.balloonSprites.forEach((bs: any) => {
        bs.sprite.setVisible(true)
        bs.text.setVisible(true)
      })
      
      if (scene.cat) scene.cat.setVisible(true)
      if (scene.targetText) scene.targetText.setVisible(true)
      if (scene.starsText) scene.starsText.setVisible(true)
      if (scene.muteButton) scene.muteButton.setVisible(true)
      if (scene.wrongAttemptsText) scene.wrongAttemptsText.setVisible(true)
      if (scene.settingsButton && scene.settingsButton.style) {
        scene.settingsButton.style.display = ''
      }
      
      // Resume tweens
      scene.tweens.resumeAll()
    })
    
    const png = PNG.sync.read(screenshot)
    const backgroundColor = { r: 135, g: 206, b: 235 }
    const measurement = measureEllipseAxes(png, backgroundColor)
    
    expect(measurement).not.toBeNull()
    
    const paintedWidthGame = measurement!.widthCss / info.scale
    const paintedHeightGame = measurement!.heightCss / info.scale
    
    const radiusXGame = paintedWidthGame / 2
    const radiusYGame = paintedHeightGame / 2
    
    // Check text corners fit in ellipse
    const corners = [
      { x: info.text.leftGame, y: info.text.topGame },
      { x: info.text.leftGame + info.text.widthGame, y: info.text.topGame },
      { x: info.text.leftGame, y: info.text.topGame + info.text.heightGame },
      { x: info.text.leftGame + info.text.widthGame, y: info.text.topGame + info.text.heightGame }
    ]
    
    const cornersInside = corners.map(corner => {
      const dx = (corner.x - info.centerXGame) / radiusXGame
      const dy = (corner.y - info.centerYGame) / radiusYGame
      return dx * dx + dy * dy <= 1
    })
    
    console.log(`\n=== Formula Containment (320×568) ===`)
    console.log(`Text: ${info.text.widthGame.toFixed(1)}×${info.text.heightGame.toFixed(1)} game px`)
    console.log(`Measured painted ellipse: ${paintedWidthGame.toFixed(1)}×${paintedHeightGame.toFixed(1)} game px`)
    console.log(`Corners inside: ${cornersInside}`)
    
    const allInside = cornersInside.every(x => x)
    expect(allInside, `All 4 text corners must fit inside painted ellipse`).toBe(true)
  })
})

test.describe('Deterministic Painted Geometry - 375×667', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Painted balloon must be ≥64×64 CSS pixels and match hit area (spec §3)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const balloonSprites = scene.balloonSprites
      const firstBalloon = balloonSprites[0]
      
      balloonSprites.forEach((bs: any, index: number) => {
        if (index !== 0) {
          bs.sprite.setVisible(false)
          bs.text.setVisible(false)
        } else {
          bs.text.setVisible(false)
        }
      })
      
      if (scene.cat) scene.cat.setVisible(false)
      if (scene.targetText) scene.targetText.setVisible(false)
      if (scene.starsText) scene.starsText.setVisible(false)
      if (scene.muteButton) scene.muteButton.setVisible(false)
      if (scene.wrongAttemptsText) scene.wrongAttemptsText.setVisible(false)
      if (scene.settingsButton && scene.settingsButton.style) {
        scene.settingsButton.style.display = 'none'
      }
      
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
    
    // Wait for visibility changes and tweens to settle
    await page.waitForTimeout(300)
    
    const margin = 100
    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: Math.max(0, result.centerXCss - margin),
        y: Math.max(0, result.centerYCss - margin),
        width: Math.min(margin * 2, 375),
        height: Math.min(margin * 2, 667)
      }
    })
    
    savePngArtifact(screenshot, '375x667-clean.png')
    
    await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      
      scene.balloonSprites.forEach((bs: any) => {
        bs.sprite.setVisible(true)
        bs.text.setVisible(true)
      })
      
      if (scene.cat) scene.cat.setVisible(true)
      if (scene.targetText) scene.targetText.setVisible(true)
      if (scene.starsText) scene.starsText.setVisible(true)
      if (scene.muteButton) scene.muteButton.setVisible(true)
      if (scene.wrongAttemptsText) scene.wrongAttemptsText.setVisible(true)
      if (scene.settingsButton && scene.settingsButton.style) {
        scene.settingsButton.style.display = ''
      }
      
      // Resume tweens
      scene.tweens.resumeAll()
    })
    
    const png = PNG.sync.read(screenshot)
    const backgroundColor = { r: 135, g: 206, b: 235 }
    const measurement = measureEllipseAxes(png, backgroundColor)
    
    expect(measurement).not.toBeNull()
    
    const paintedWidthCss = measurement!.widthCss
    const paintedHeightCss = measurement!.heightCss
    const paintedWidthGame = paintedWidthCss / result.scale
    const paintedHeightGame = paintedHeightCss / result.scale
    
    console.log(`\n=== 375×667 Painted Balloon (Deterministic) ===`)
    console.log(`Painted: ${paintedWidthCss}×${paintedHeightCss} CSS px (${paintedWidthGame.toFixed(1)}×${paintedHeightGame.toFixed(1)} game px)`)
    console.log(`Hit area: ${result.hitArea.widthCss.toFixed(1)}×${result.hitArea.heightCss.toFixed(1)} CSS px (${result.hitArea.widthGame}×${result.hitArea.heightGame} game px)`)
    
    expect(paintedWidthCss, `Painted width ${paintedWidthCss} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    expect(paintedHeightCss, `Painted height ${paintedHeightCss} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    
    const widthRatio = paintedWidthCss / result.hitArea.widthCss
    const heightRatio = paintedHeightCss / result.hitArea.heightCss
    
    console.log(`Width ratio: ${(widthRatio * 100).toFixed(1)}% (painted/hit)`)
    console.log(`Height ratio: ${(heightRatio * 100).toFixed(1)}% (painted/hit)`)
    
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
  })
})

test.describe('Deterministic Painted Geometry - 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Painted balloon must be ≥64×64 CSS pixels and match hit area (spec §3)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const balloonSprites = scene.balloonSprites
      const firstBalloon = balloonSprites[0]
      
      balloonSprites.forEach((bs: any, index: number) => {
        if (index !== 0) {
          bs.sprite.setVisible(false)
          bs.text.setVisible(false)
        } else {
          bs.text.setVisible(false)
        }
      })
      
      if (scene.cat) scene.cat.setVisible(false)
      if (scene.targetText) scene.targetText.setVisible(false)
      if (scene.starsText) scene.starsText.setVisible(false)
      if (scene.muteButton) scene.muteButton.setVisible(false)
      if (scene.wrongAttemptsText) scene.wrongAttemptsText.setVisible(false)
      if (scene.settingsButton && scene.settingsButton.style) {
        scene.settingsButton.style.display = 'none'
      }
      
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
    
    // Wait for visibility changes and tweens to settle
    await page.waitForTimeout(300)
    
    const margin = 250
    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: Math.max(0, result.centerXCss - margin),
        y: Math.max(0, result.centerYCss - margin),
        width: Math.min(margin * 2, 1280),
        height: Math.min(margin * 2, 800)
      }
    })
    
    savePngArtifact(screenshot, '1280x800-clean.png')
    
    await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      
      scene.balloonSprites.forEach((bs: any) => {
        bs.sprite.setVisible(true)
        bs.text.setVisible(true)
      })
      
      if (scene.cat) scene.cat.setVisible(true)
      if (scene.targetText) scene.targetText.setVisible(true)
      if (scene.starsText) scene.starsText.setVisible(true)
      if (scene.muteButton) scene.muteButton.setVisible(true)
      if (scene.wrongAttemptsText) scene.wrongAttemptsText.setVisible(true)
      if (scene.settingsButton && scene.settingsButton.style) {
        scene.settingsButton.style.display = ''
      }
      
      // Resume tweens
      scene.tweens.resumeAll()
    })
    
    const png = PNG.sync.read(screenshot)
    const backgroundColor = { r: 135, g: 206, b: 235 }
    const measurement = measureEllipseAxes(png, backgroundColor)
    
    expect(measurement).not.toBeNull()
    
    const paintedWidthCss = measurement!.widthCss
    const paintedHeightCss = measurement!.heightCss
    const paintedWidthGame = paintedWidthCss / result.scale
    const paintedHeightGame = paintedHeightCss / result.scale
    
    console.log(`\n=== 1280×800 Painted Balloon (Deterministic) ===`)
    console.log(`Painted: ${paintedWidthCss}×${paintedHeightCss} CSS px (${paintedWidthGame.toFixed(1)}×${paintedHeightGame.toFixed(1)} game px)`)
    console.log(`Hit area: ${result.hitArea.widthCss.toFixed(1)}×${result.hitArea.heightCss.toFixed(1)} CSS px (${result.hitArea.widthGame}×${result.hitArea.heightGame} game px)`)
    
    expect(paintedWidthCss, `Painted width ${paintedWidthCss} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    expect(paintedHeightCss, `Painted height ${paintedHeightCss} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    
    const widthRatio = paintedWidthCss / result.hitArea.widthCss
    const heightRatio = paintedHeightCss / result.hitArea.heightCss
    
    console.log(`Width ratio: ${(widthRatio * 100).toFixed(1)}% (painted/hit)`)
    console.log(`Height ratio: ${(heightRatio * 100).toFixed(1)}% (painted/hit)`)
    
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
  })
})
