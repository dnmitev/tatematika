import { test, expect } from '@playwright/test'

/**
 * Painted Balloon Geometry Tests - Exact commandBuffer Parsing
 * 
 * Measures balloon geometry by parsing Graphics.commandBuffer for filled paths.
 * Tests all balloon counts (3, 4, 5) at all viewports (320×568, 375×667, 1280×800).
 * 
 * Method:
 * 1. Parse commandBuffer: find BEGIN_PATH...FILL_PATH sequences
 * 2. Extract MOVE_TO/LINE_TO points for each filled path
 * 3. Take LARGEST path (main balloon, not highlight)
 * 4. Compute exact bounding box from command points
 * 5. Transform to CSS px using canvasRect.width / game.scale.width
 * 
 * Tests:
 * - Synthetic validation: 300×200 game px ellipse measured exactly
 * - Layout: Balloons fit in game area and don't overlap (all counts)
 * - Formula text: ≥32 CSS px and fits inside painted ellipse (all balloons)
 */

interface BalloonGeometry {
  id: string
  centerX: number
  centerY: number
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * Extract exact balloon geometry from Graphics commandBuffer
 */
async function getAllBalloonGeometry(page: any): Promise<{
  balloons: BalloonGeometry[]
  gameWidth: number
  gameHeight: number
  scale: number
}> {
  return await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const balloonSprites = scene.balloonSprites
    
    const Commands = { BEGIN_PATH: 1, LINE_TO: 4, MOVE_TO: 5, FILL_PATH: 8 }
    
    const balloons: BalloonGeometry[] = balloonSprites.map((bs: any) => {
      const sprite = bs.sprite as any
      const commandBuffer = sprite.commandBuffer
      
      // Find all filled paths
      const filledPaths: Array<Array<{ x: number; y: number }>> = []
      let currentPath: Array<{ x: number; y: number }> = []
      let inPath = false
      
      for (let i = 0; i < commandBuffer.length; i++) {
        const cmd = commandBuffer[i]
        
        if (cmd === Commands.BEGIN_PATH) {
          currentPath = []
          inPath = true
        } else if (cmd === Commands.MOVE_TO && inPath) {
          currentPath.push({ x: commandBuffer[i + 1], y: commandBuffer[i + 2] })
          i += 2
        } else if (cmd === Commands.LINE_TO && inPath) {
          currentPath.push({ x: commandBuffer[i + 1], y: commandBuffer[i + 2] })
          i += 2
        } else if (cmd === Commands.FILL_PATH && inPath) {
          if (currentPath.length > 0) {
            filledPaths.push([...currentPath])
          }
          currentPath = []
          inPath = false
        }
      }
      
      // Find largest path (main balloon)
      let largestPath: Array<{ x: number; y: number }> = []
      let largestArea = 0
      
      for (const path of filledPaths) {
        if (path.length < 3) continue
        
        let minX = Infinity, maxX = -Infinity
        let minY = Infinity, maxY = -Infinity
        
        for (const point of path) {
          minX = Math.min(minX, point.x)
          maxX = Math.max(maxX, point.x)
          minY = Math.min(minY, point.y)
          maxY = Math.max(maxY, point.y)
        }
        
        const area = (maxX - minX) * (maxY - minY)
        if (area > largestArea) {
          largestArea = area
          largestPath = path
        }
      }
      
      // Compute bounds
      let minX = Infinity, maxX = -Infinity
      let minY = Infinity, maxY = -Infinity
      
      for (const point of largestPath) {
        minX = Math.min(minX, point.x)
        maxX = Math.max(maxX, point.x)
        minY = Math.min(minY, point.y)
        maxY = Math.max(maxY, point.y)
      }
      
      const width = maxX - minX
      const height = maxY - minY
      
      return {
        id: bs.id,
        centerX: bs.x,
        centerY: bs.y,
        width,
        height,
        left: bs.x + minX,
        right: bs.x + maxX,
        top: bs.y + minY,
        bottom: bs.y + maxY
      }
    })
    
    const canvas = document.querySelector('canvas')!
    const rect = canvas.getBoundingClientRect()
    const scale = rect.width / game.scale.width
    
    return {
      balloons,
      gameWidth: game.scale.width,
      gameHeight: game.scale.height,
      scale
    }
  })
}

/**
 * Check if two ellipses intersect (conservative bounding box check)
 */
function balloonsOverlap(a: BalloonGeometry, b: BalloonGeometry): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

/**
 * Get formula text bounds for all balloons
 */
async function getAllFormulaTextBounds(page: any): Promise<Array<{
  id: string
  widthGame: number
  heightGame: number
  leftGame: number
  topGame: number
  widthCss: number
  heightCss: number
}>> {
  return await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const balloonSprites = scene.balloonSprites
    
    const canvas = document.querySelector('canvas')!
    const rect = canvas.getBoundingClientRect()
    const scale = rect.width / game.scale.width
    
    return balloonSprites.map((bs: any) => {
      const text = bs.text as any
      const bounds = text.getBounds()
      
      return {
        id: bs.id,
        widthGame: bounds.width,
        heightGame: bounds.height,
        leftGame: bounds.x,
        topGame: bounds.y,
        widthCss: bounds.height * scale,  // height is the vertical size
        heightCss: bounds.height * scale
      }
    })
  })
}

/**
 * Set balloon count via settings UI
 */
async function setBalloonCount(page: any, count: number) {
  await page.evaluate(() => window.__tatematika!.openSettings())
  await page.waitForTimeout(200)
  
  const balloonCountInput = page.locator('[data-testid="setting-balloon-count"]')
  await balloonCountInput.fill(count.toString())
  
  await page.evaluate(() => window.__tatematika!.closeSettings())
  await page.waitForTimeout(200)
}

test.describe('Exact Geometry - Synthetic Validation', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Synthetic test: validate commandBuffer measurement with known ellipse', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      
      const testGraphics = scene.add.graphics()
      testGraphics.fillStyle(0xFF0000, 1)
      testGraphics.fillEllipse(0, 0, 300, 200)
      testGraphics.setPosition(400, 300)
      testGraphics.setDepth(10000)
      
      const commandBuffer = testGraphics.commandBuffer
      const Commands = { BEGIN_PATH: 1, LINE_TO: 4, MOVE_TO: 5, FILL_PATH: 8 }
      
      const points: Array<{ x: number; y: number }> = []
      let inPath = false
      
      for (let i = 0; i < commandBuffer.length; i++) {
        const cmd = commandBuffer[i]
        
        if (cmd === Commands.BEGIN_PATH) {
          inPath = true
        } else if (cmd === Commands.MOVE_TO && inPath) {
          points.push({ x: commandBuffer[i + 1], y: commandBuffer[i + 2] })
          i += 2
        } else if (cmd === Commands.LINE_TO && inPath) {
          points.push({ x: commandBuffer[i + 1], y: commandBuffer[i + 2] })
          i += 2
        } else if (cmd === Commands.FILL_PATH) {
          inPath = false
        }
      }
      
      let minX = Infinity, maxX = -Infinity
      let minY = Infinity, maxY = -Infinity
      
      for (const point of points) {
        minX = Math.min(minX, point.x)
        maxX = Math.max(maxX, point.x)
        minY = Math.min(minY, point.y)
        maxY = Math.max(maxY, point.y)
      }
      
      const widthGame = maxX - minX
      const heightGame = maxY - minY
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      testGraphics.destroy()
      
      return {
        widthGame,
        heightGame,
        widthCss: widthGame * scale,
        heightCss: heightGame * scale,
        scale,
        expectedWidth: 300,
        expectedHeight: 200
      }
    })
    
    console.log('\n=== Synthetic Validation (commandBuffer) ===')
    console.log(`Expected: ${result.expectedWidth}×${result.expectedHeight} game px`)
    console.log(`Measured: ${result.widthGame.toFixed(1)}×${result.heightGame.toFixed(1)} game px`)
    console.log(`Scale: ${result.scale}`)
    console.log(`CSS: ${result.widthCss.toFixed(1)}×${result.heightCss.toFixed(1)} px`)
    
    expect(Math.abs(result.widthGame - 300), 'Width must be exactly 300 game px').toBeLessThan(0.1)
    expect(Math.abs(result.heightGame - 200), 'Height must be exactly 200 game px').toBeLessThan(0.1)
    
    const expectedWidthCss = 300 * result.scale
    const expectedHeightCss = 200 * result.scale
    
    expect(Math.abs(result.widthCss - expectedWidthCss), 'CSS width must match scaled game width').toBeLessThan(0.1)
    expect(Math.abs(result.heightCss - expectedHeightCss), 'CSS height must match scaled game height').toBeLessThan(0.1)
  })
})

// Helper function to test a specific viewport and balloon count
async function testLayoutAndText(
  page: any,
  viewport: string,
  count: number
) {
  console.log(`\n=== ${viewport} - Count ${count} ===`)
  
  // Set balloon count
  await setBalloonCount(page, count)
  
  // Verify count took effect
  const actualCount = await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    return scene.balloonSprites.length
  })
  
  expect(actualCount, `Balloon count must be ${count}`).toBe(count)
  
  // Get geometry
  const geometry = await getAllBalloonGeometry(page)
  const textBounds = await getAllFormulaTextBounds(page)
  
  // Get hit areas for all balloons
  const hitAreas = await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const canvas = document.querySelector('canvas')!
    const rect = canvas.getBoundingClientRect()
    const scale = rect.width / game.scale.width
    
    return scene.balloonSprites.map((bs: any) => {
      const hitAreaEllipse = bs.sprite.input?.hitArea as any
      return {
        widthGame: hitAreaEllipse.width,
        heightGame: hitAreaEllipse.height,
        widthCss: hitAreaEllipse.width * scale,
        heightCss: hitAreaEllipse.height * scale
      }
    })
  })
  
  console.log(`Game area: ${geometry.gameWidth}×${geometry.gameHeight}`)
  console.log(`Scale: ${geometry.scale}`)
  
  // Check each balloon: containment, size, and hit area match
  for (let i = 0; i < geometry.balloons.length; i++) {
    const balloon = geometry.balloons[i]
    const hitArea = hitAreas[i]
    const fitsX = balloon.left >= 0 && balloon.right <= geometry.gameWidth
    const fitsY = balloon.top >= 0 && balloon.bottom <= geometry.gameHeight
    
    const paintedWidthCss = balloon.width * geometry.scale
    const paintedHeightCss = balloon.height * geometry.scale
    
    console.log(`Balloon ${balloon.id}: (${balloon.left.toFixed(1)}, ${balloon.top.toFixed(1)}) to (${balloon.right.toFixed(1)}, ${balloon.bottom.toFixed(1)}) - fits: ${fitsX && fitsY}`)
    console.log(`  Painted: ${paintedWidthCss.toFixed(1)}×${paintedHeightCss.toFixed(1)} CSS px (${balloon.width.toFixed(1)}×${balloon.height.toFixed(1)} game px)`)
    console.log(`  Hit area: ${hitArea.widthCss.toFixed(1)}×${hitArea.heightCss.toFixed(1)} CSS px (${hitArea.widthGame}×${hitArea.heightGame} game px)`)
    
    // Containment checks
    expect(balloon.left, `Balloon ${balloon.id} left must be >= 0`).toBeGreaterThanOrEqual(0)
    expect(balloon.right, `Balloon ${balloon.id} right must be <= ${geometry.gameWidth}`).toBeLessThanOrEqual(geometry.gameWidth)
    expect(balloon.top, `Balloon ${balloon.id} top must be >= 0`).toBeGreaterThanOrEqual(0)
    expect(balloon.bottom, `Balloon ${balloon.id} bottom must be <= ${geometry.gameHeight}`).toBeLessThanOrEqual(geometry.gameHeight)
    
    // Spec §3: Painted balloon must be ≥64×64 CSS px
    expect(paintedWidthCss, `Balloon ${balloon.id} painted width ${paintedWidthCss.toFixed(1)} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    expect(paintedHeightCss, `Balloon ${balloon.id} painted height ${paintedHeightCss.toFixed(1)} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    
    // Painted must match hit area within ±10%
    const widthRatio = paintedWidthCss / hitArea.widthCss
    const heightRatio = paintedHeightCss / hitArea.heightCss
    
    console.log(`  Width ratio: ${(widthRatio * 100).toFixed(1)}% (painted/hit)`)
    console.log(`  Height ratio: ${(heightRatio * 100).toFixed(1)}% (painted/hit)`)
    
    expect(widthRatio, `Balloon ${balloon.id} painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(widthRatio, `Balloon ${balloon.id} painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
    expect(heightRatio, `Balloon ${balloon.id} painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(heightRatio, `Balloon ${balloon.id} painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
  }
  
  // Check no two balloons overlap (bounding box check)
  for (let i = 0; i < geometry.balloons.length; i++) {
    for (let j = i + 1; j < geometry.balloons.length; j++) {
      const a = geometry.balloons[i]
      const b = geometry.balloons[j]
      
      const overlap = balloonsOverlap(a, b)
      
      console.log(`Balloons ${a.id} & ${b.id}: overlap = ${overlap}`)
      
      expect(overlap, `Balloons ${a.id} and ${b.id} must not overlap (bounding box check)`).toBe(false)
    }
  }
  
  // Check formula text on each balloon
  for (let i = 0; i < geometry.balloons.length; i++) {
    const balloon = geometry.balloons[i]
    const text = textBounds[i]
    
    console.log(`Formula ${balloon.id}: ${text.heightCss.toFixed(1)} CSS px`)
    
    // Text must be ≥32 CSS px
    expect(text.heightCss, `Formula text on ${balloon.id} must be ≥32 CSS px (got ${text.heightCss.toFixed(1)})`).toBeGreaterThanOrEqual(32)
    
    // Text must fit inside painted ellipse
    const radiusX = balloon.width / 2
    const radiusY = balloon.height / 2
    
    const corners = [
      { x: text.leftGame, y: text.topGame },
      { x: text.leftGame + text.widthGame, y: text.topGame },
      { x: text.leftGame, y: text.topGame + text.heightGame },
      { x: text.leftGame + text.widthGame, y: text.topGame + text.heightGame }
    ]
    
    const cornersInside = corners.map(corner => {
      const dx = (corner.x - balloon.centerX) / radiusX
      const dy = (corner.y - balloon.centerY) / radiusY
      return dx * dx + dy * dy <= 1
    })
    
    const allInside = cornersInside.every(x => x)
    
    if (!allInside) {
      console.log(`  Text ${text.widthGame.toFixed(1)}×${text.heightGame.toFixed(1)} game px doesn't fit in ellipse ${balloon.width.toFixed(1)}×${balloon.height.toFixed(1)} game px`)
      console.log(`  Corners inside: ${cornersInside}`)
    }
    
    expect(allInside, `Formula text on ${balloon.id} must fit inside painted ellipse`).toBe(true)
  }
}

test.describe('Layout and Formula - 320×568', () => {
  test.use({ viewport: { width: 320, height: 568 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Count 3: Layout and formula text', async ({ page }) => {
    await testLayoutAndText(page, '320×568', 3)
  })

  test('Count 4: Layout and formula text', async ({ page }) => {
    await testLayoutAndText(page, '320×568', 4)
  })

  test('Count 5: Layout and formula text', async ({ page }) => {
    await testLayoutAndText(page, '320×568', 5)
  })
})

test.describe('Layout and Formula - 375×667', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Count 3: Layout and formula text', async ({ page }) => {
    await testLayoutAndText(page, '375×667', 3)
  })

  test('Count 4: Layout and formula text', async ({ page }) => {
    await testLayoutAndText(page, '375×667', 4)
  })

  test('Count 5: Layout and formula text', async ({ page }) => {
    await testLayoutAndText(page, '375×667', 5)
  })
})

test.describe('Layout and Formula - 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Count 3: Layout and formula text', async ({ page }) => {
    await testLayoutAndText(page, '1280×800', 3)
  })

  test('Count 4: Layout and formula text', async ({ page }) => {
    await testLayoutAndText(page, '1280×800', 4)
  })

  test('Count 5: Layout and formula text', async ({ page }) => {
    await testLayoutAndText(page, '1280×800', 5)
  })
})
