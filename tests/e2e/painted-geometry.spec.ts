import { test, expect } from '@playwright/test'

/**
 * Painted Balloon Geometry Tests - Exact commandBuffer Parsing
 * 
 * Measures balloon geometry by parsing Graphics.commandBuffer for filled paths.
 * Extracts exact points from MOVE_TO/LINE_TO commands, transforms by world matrix,
 * and takes the largest filled path (excluding highlight and string).
 * 
 * Method:
 * 1. Parse commandBuffer: find BEGIN_PATH...FILL_PATH sequences
 * 2. Extract MOVE_TO/LINE_TO points for each filled path
 * 3. Compute bounding box for each path
 * 4. Take the LARGEST path (main balloon, not highlight)
 * 5. Transform by sprite.getWorldTransformMatrix() and camera
 * 6. Convert to CSS px using canvasRect.width / game.scale.width
 * 
 * Validates against synthetic Graphics.fillEllipse(0, 0, 300, 200) for exact accuracy.
 */

interface EllipseMeasurement {
  widthGame: number
  heightGame: number
  widthCss: number
  heightCss: number
  centerXGame: number
  centerYGame: number
}

/**
 * Extract exact balloon geometry from Graphics commandBuffer
 */
async function measureBalloonFromCommandBuffer(
  page: any,
  balloonIndex: number = 0
): Promise<EllipseMeasurement> {
  const result = await page.evaluate((index: number) => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const balloonSprites = scene.balloonSprites
    const balloon = balloonSprites[index]
    const sprite = balloon.sprite as any
    
    // Parse commandBuffer
    const commandBuffer = sprite.commandBuffer
    const Commands = {
      BEGIN_PATH: 1,
      LINE_TO: 4,
      MOVE_TO: 5,
      FILL_PATH: 8
    }
    
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
    
    // Find the largest path (main balloon, not highlight)
    let largestPath: Array<{ x: number; y: number }> = []
    let largestArea = 0
    
    for (const path of filledPaths) {
      if (path.length < 3) continue
      
      // Compute bounding box area
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
    
    if (largestPath.length === 0) {
      throw new Error('No filled path found in balloon sprite')
    }
    
    // Compute bounds of largest path
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    
    for (const point of largestPath) {
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y)
      maxY = Math.max(maxY, point.y)
    }
    
    const widthGame = maxX - minX
    const heightGame = maxY - minY
    const centerXGame = balloon.x
    const centerYGame = balloon.y
    
    // Convert to CSS px
    const canvas = document.querySelector('canvas')!
    const rect = canvas.getBoundingClientRect()
    const scale = rect.width / game.scale.width
    
    return {
      widthGame,
      heightGame,
      widthCss: widthGame * scale,
      heightCss: heightGame * scale,
      centerXGame,
      centerYGame
    }
  }, balloonIndex)
  
  return result
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
      
      // Create a test ellipse: exactly 300×200 game px
      const testGraphics = scene.add.graphics()
      testGraphics.fillStyle(0xFF0000, 1)
      testGraphics.fillEllipse(0, 0, 300, 200)
      testGraphics.setPosition(400, 300)
      testGraphics.setDepth(10000)
      
      // Parse its commandBuffer
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
      
      // Compute bounds
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
      
      // Clean up
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
    
    // Must be exactly 300×200 game px (within floating point precision)
    expect(Math.abs(result.widthGame - 300), 'Width must be exactly 300 game px').toBeLessThan(0.1)
    expect(Math.abs(result.heightGame - 200), 'Height must be exactly 200 game px').toBeLessThan(0.1)
    
    // CSS should be scale * game
    const expectedWidthCss = 300 * result.scale
    const expectedHeightCss = 200 * result.scale
    
    expect(Math.abs(result.widthCss - expectedWidthCss), 'CSS width must match scaled game width').toBeLessThan(0.1)
    expect(Math.abs(result.heightCss - expectedHeightCss), 'CSS height must match scaled game height').toBeLessThan(0.1)
  })
})

test.describe('Exact Geometry - 320×568', () => {
  test.use({ viewport: { width: 320, height: 568 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Painted balloon must be ≥64×64 CSS pixels and match hit area (spec §3)', async ({ page }) => {
    const measurement = await measureBalloonFromCommandBuffer(page, 0)
    
    const hitArea = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const sprite = scene.balloonSprites[0].sprite
      const hitAreaEllipse = sprite.input?.hitArea as any
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      return {
        widthGame: hitAreaEllipse.width,
        heightGame: hitAreaEllipse.height,
        widthCss: hitAreaEllipse.width * scale,
        heightCss: hitAreaEllipse.height * scale
      }
    })
    
    console.log(`\n=== 320×568 Painted Balloon (commandBuffer) ===`)
    console.log(`Painted: ${measurement.widthCss.toFixed(1)}×${measurement.heightCss.toFixed(1)} CSS px (${measurement.widthGame.toFixed(1)}×${measurement.heightGame.toFixed(1)} game px)`)
    console.log(`Hit area: ${hitArea.widthCss.toFixed(1)}×${hitArea.heightCss.toFixed(1)} CSS px (${hitArea.widthGame}×${hitArea.heightGame} game px)`)
    
    // Spec §3: must be ≥64×64 CSS px
    expect(measurement.widthCss, `Painted width ${measurement.widthCss.toFixed(1)} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    expect(measurement.heightCss, `Painted height ${measurement.heightCss.toFixed(1)} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    
    // Painted must match hit area within ±10%
    const widthRatio = measurement.widthCss / hitArea.widthCss
    const heightRatio = measurement.heightCss / hitArea.heightCss
    
    console.log(`Width ratio: ${(widthRatio * 100).toFixed(1)}% (painted/hit)`)
    console.log(`Height ratio: ${(heightRatio * 100).toFixed(1)}% (painted/hit)`)
    
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
  })

  test('Formula text must fit inside measured painted ellipse', async ({ page }) => {
    const measurement = await measureBalloonFromCommandBuffer(page, 0)
    
    const textInfo = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const balloon = scene.balloonSprites[0]
      const text = balloon.text as any
      const textBounds = text.getBounds()
      
      return {
        centerXGame: balloon.x,
        centerYGame: balloon.y,
        leftGame: textBounds.x,
        topGame: textBounds.y,
        widthGame: textBounds.width,
        heightGame: textBounds.height
      }
    })
    
    // Check text corners fit in ellipse
    const radiusXGame = measurement.widthGame / 2
    const radiusYGame = measurement.heightGame / 2
    
    const corners = [
      { x: textInfo.leftGame, y: textInfo.topGame },
      { x: textInfo.leftGame + textInfo.widthGame, y: textInfo.topGame },
      { x: textInfo.leftGame, y: textInfo.topGame + textInfo.heightGame },
      { x: textInfo.leftGame + textInfo.widthGame, y: textInfo.topGame + textInfo.heightGame }
    ]
    
    const cornersInside = corners.map(corner => {
      const dx = (corner.x - measurement.centerXGame) / radiusXGame
      const dy = (corner.y - measurement.centerYGame) / radiusYGame
      return dx * dx + dy * dy <= 1
    })
    
    console.log(`\n=== Formula Containment (320×568) ===`)
    console.log(`Text: ${textInfo.widthGame.toFixed(1)}×${textInfo.heightGame.toFixed(1)} game px`)
    console.log(`Measured painted ellipse: ${measurement.widthGame.toFixed(1)}×${measurement.heightGame.toFixed(1)} game px`)
    console.log(`Corners inside: ${cornersInside}`)
    
    const allInside = cornersInside.every(x => x)
    expect(allInside, `All 4 text corners must fit inside painted ellipse`).toBe(true)
  })

  test('Balloons must not overlap and must fit in visible game area', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const balloonSprites = scene.balloonSprites
      
      const Commands = { BEGIN_PATH: 1, LINE_TO: 4, MOVE_TO: 5, FILL_PATH: 8 }
      
      const balloons = balloonSprites.map((bs: any) => {
        const sprite = bs.sprite as any
        const commandBuffer = sprite.commandBuffer
        
        // Find largest filled path
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
        
        // Compute world bounds
        let minX = Infinity, maxX = -Infinity
        let minY = Infinity, maxY = -Infinity
        
        for (const point of largestPath) {
          minX = Math.min(minX, point.x)
          maxX = Math.max(maxX, point.x)
          minY = Math.min(minY, point.y)
          maxY = Math.max(maxY, point.y)
        }
        
        return {
          id: bs.id,
          left: bs.x + minX,
          right: bs.x + maxX,
          top: bs.y + minY,
          bottom: bs.y + maxY
        }
      })
      
      return {
        balloons,
        gameWidth: game.scale.width,
        gameHeight: game.scale.height
      }
    })
    
    console.log(`\n=== Layout Check (320×568, count=${result.balloons.length}) ===`)
    
    // Check each balloon fits in game area
    for (const balloon of result.balloons) {
      const fitsX = balloon.left >= 0 && balloon.right <= result.gameWidth
      const fitsY = balloon.top >= 0 && balloon.bottom <= result.gameHeight
      
      console.log(`Balloon ${balloon.id}: (${balloon.left.toFixed(1)}, ${balloon.top.toFixed(1)}) to (${balloon.right.toFixed(1)}, ${balloon.bottom.toFixed(1)}) - fits: ${fitsX && fitsY}`)
      
      expect(balloon.left, `Balloon ${balloon.id} left must be >= 0`).toBeGreaterThanOrEqual(0)
      expect(balloon.right, `Balloon ${balloon.id} right must be <= ${result.gameWidth}`).toBeLessThanOrEqual(result.gameWidth)
      expect(balloon.top, `Balloon ${balloon.id} top must be >= 0`).toBeGreaterThanOrEqual(0)
      expect(balloon.bottom, `Balloon ${balloon.id} bottom must be <= ${result.gameHeight}`).toBeLessThanOrEqual(result.gameHeight)
    }
    
    // Check no two balloons overlap
    for (let i = 0; i < result.balloons.length; i++) {
      for (let j = i + 1; j < result.balloons.length; j++) {
        const a = result.balloons[i]
        const b = result.balloons[j]
        
        const overlap = !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
        
        console.log(`Balloons ${a.id} & ${b.id}: overlap = ${overlap}`)
        
        expect(overlap, `Balloons ${a.id} and ${b.id} must not overlap`).toBe(false)
      }
    }
  })
})

test.describe('Exact Geometry - 375×667', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Painted balloon must be ≥64×64 CSS pixels and match hit area (spec §3)', async ({ page }) => {
    const measurement = await measureBalloonFromCommandBuffer(page, 0)
    
    const hitArea = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const sprite = scene.balloonSprites[0].sprite
      const hitAreaEllipse = sprite.input?.hitArea as any
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      return {
        widthGame: hitAreaEllipse.width,
        heightGame: hitAreaEllipse.height,
        widthCss: hitAreaEllipse.width * scale,
        heightCss: hitAreaEllipse.height * scale
      }
    })
    
    console.log(`\n=== 375×667 Painted Balloon (commandBuffer) ===`)
    console.log(`Painted: ${measurement.widthCss.toFixed(1)}×${measurement.heightCss.toFixed(1)} CSS px (${measurement.widthGame.toFixed(1)}×${measurement.heightGame.toFixed(1)} game px)`)
    console.log(`Hit area: ${hitArea.widthCss.toFixed(1)}×${hitArea.heightCss.toFixed(1)} CSS px (${hitArea.widthGame}×${hitArea.heightGame} game px)`)
    
    expect(measurement.widthCss, `Painted width ${measurement.widthCss.toFixed(1)} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    expect(measurement.heightCss, `Painted height ${measurement.heightCss.toFixed(1)} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    
    const widthRatio = measurement.widthCss / hitArea.widthCss
    const heightRatio = measurement.heightCss / hitArea.heightCss
    
    console.log(`Width ratio: ${(widthRatio * 100).toFixed(1)}% (painted/hit)`)
    console.log(`Height ratio: ${(heightRatio * 100).toFixed(1)}% (painted/hit)`)
    
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
  })

  test('Balloons must not overlap and must fit in visible game area', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const balloonSprites = scene.balloonSprites
      
      const Commands = { BEGIN_PATH: 1, LINE_TO: 4, MOVE_TO: 5, FILL_PATH: 8 }
      
      const balloons = balloonSprites.map((bs: any) => {
        const sprite = bs.sprite as any
        const commandBuffer = sprite.commandBuffer
        
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
        
        let minX = Infinity, maxX = -Infinity
        let minY = Infinity, maxY = -Infinity
        
        for (const point of largestPath) {
          minX = Math.min(minX, point.x)
          maxX = Math.max(maxX, point.x)
          minY = Math.min(minY, point.y)
          maxY = Math.max(maxY, point.y)
        }
        
        return {
          id: bs.id,
          left: bs.x + minX,
          right: bs.x + maxX,
          top: bs.y + minY,
          bottom: bs.y + maxY
        }
      })
      
      return {
        balloons,
        gameWidth: game.scale.width,
        gameHeight: game.scale.height
      }
    })
    
    console.log(`\n=== Layout Check (375×667, count=${result.balloons.length}) ===`)
    
    for (const balloon of result.balloons) {
      const fitsX = balloon.left >= 0 && balloon.right <= result.gameWidth
      const fitsY = balloon.top >= 0 && balloon.bottom <= result.gameHeight
      
      console.log(`Balloon ${balloon.id}: (${balloon.left.toFixed(1)}, ${balloon.top.toFixed(1)}) to (${balloon.right.toFixed(1)}, ${balloon.bottom.toFixed(1)}) - fits: ${fitsX && fitsY}`)
      
      expect(balloon.left, `Balloon ${balloon.id} left must be >= 0`).toBeGreaterThanOrEqual(0)
      expect(balloon.right, `Balloon ${balloon.id} right must be <= ${result.gameWidth}`).toBeLessThanOrEqual(result.gameWidth)
      expect(balloon.top, `Balloon ${balloon.id} top must be >= 0`).toBeGreaterThanOrEqual(0)
      expect(balloon.bottom, `Balloon ${balloon.id} bottom must be <= ${result.gameHeight}`).toBeLessThanOrEqual(result.gameHeight)
    }
    
    for (let i = 0; i < result.balloons.length; i++) {
      for (let j = i + 1; j < result.balloons.length; j++) {
        const a = result.balloons[i]
        const b = result.balloons[j]
        
        const overlap = !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
        
        console.log(`Balloons ${a.id} & ${b.id}: overlap = ${overlap}`)
        
        expect(overlap, `Balloons ${a.id} and ${b.id} must not overlap`).toBe(false)
      }
    }
  })
})

test.describe('Exact Geometry - 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Painted balloon must be ≥64×64 CSS pixels and match hit area (spec §3)', async ({ page }) => {
    const measurement = await measureBalloonFromCommandBuffer(page, 0)
    
    const hitArea = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const sprite = scene.balloonSprites[0].sprite
      const hitAreaEllipse = sprite.input?.hitArea as any
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / game.scale.width
      
      return {
        widthGame: hitAreaEllipse.width,
        heightGame: hitAreaEllipse.height,
        widthCss: hitAreaEllipse.width * scale,
        heightCss: hitAreaEllipse.height * scale
      }
    })
    
    console.log(`\n=== 1280×800 Painted Balloon (commandBuffer) ===`)
    console.log(`Painted: ${measurement.widthCss.toFixed(1)}×${measurement.heightCss.toFixed(1)} CSS px (${measurement.widthGame.toFixed(1)}×${measurement.heightGame.toFixed(1)} game px)`)
    console.log(`Hit area: ${hitArea.widthCss.toFixed(1)}×${hitArea.heightCss.toFixed(1)} CSS px (${hitArea.widthGame}×${hitArea.heightGame} game px)`)
    
    expect(measurement.widthCss, `Painted width ${measurement.widthCss.toFixed(1)} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    expect(measurement.heightCss, `Painted height ${measurement.heightCss.toFixed(1)} CSS px must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
    
    const widthRatio = measurement.widthCss / hitArea.widthCss
    const heightRatio = measurement.heightCss / hitArea.heightCss
    
    console.log(`Width ratio: ${(widthRatio * 100).toFixed(1)}% (painted/hit)`)
    console.log(`Height ratio: ${(heightRatio * 100).toFixed(1)}% (painted/hit)`)
    
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(widthRatio, `Painted width must be 90-110% of hit area (got ${(widthRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    expect(heightRatio, `Painted height must be 90-110% of hit area (got ${(heightRatio * 100).toFixed(1)}%)`).toBeLessThanOrEqual(1.1)
  })

  test('Balloons must not overlap and must fit in visible game area', async ({ page }) => {
    const result = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const balloonSprites = scene.balloonSprites
      
      const Commands = { BEGIN_PATH: 1, LINE_TO: 4, MOVE_TO: 5, FILL_PATH: 8 }
      
      const balloons = balloonSprites.map((bs: any) => {
        const sprite = bs.sprite as any
        const commandBuffer = sprite.commandBuffer
        
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
        
        let minX = Infinity, maxX = -Infinity
        let minY = Infinity, maxY = -Infinity
        
        for (const point of largestPath) {
          minX = Math.min(minX, point.x)
          maxX = Math.max(maxX, point.x)
          minY = Math.min(minY, point.y)
          maxY = Math.max(maxY, point.y)
        }
        
        return {
          id: bs.id,
          left: bs.x + minX,
          right: bs.x + maxX,
          top: bs.y + minY,
          bottom: bs.y + maxY
        }
      })
      
      return {
        balloons,
        gameWidth: game.scale.width,
        gameHeight: game.scale.height
      }
    })
    
    console.log(`\n=== Layout Check (1280×800, count=${result.balloons.length}) ===`)
    
    for (const balloon of result.balloons) {
      const fitsX = balloon.left >= 0 && balloon.right <= result.gameWidth
      const fitsY = balloon.top >= 0 && balloon.bottom <= result.gameHeight
      
      console.log(`Balloon ${balloon.id}: (${balloon.left.toFixed(1)}, ${balloon.top.toFixed(1)}) to (${balloon.right.toFixed(1)}, ${balloon.bottom.toFixed(1)}) - fits: ${fitsX && fitsY}`)
      
      expect(balloon.left, `Balloon ${balloon.id} left must be >= 0`).toBeGreaterThanOrEqual(0)
      expect(balloon.right, `Balloon ${balloon.id} right must be <= ${result.gameWidth}`).toBeLessThanOrEqual(result.gameWidth)
      expect(balloon.top, `Balloon ${balloon.id} top must be >= 0`).toBeGreaterThanOrEqual(0)
      expect(balloon.bottom, `Balloon ${balloon.id} bottom must be <= ${result.gameHeight}`).toBeLessThanOrEqual(result.gameHeight)
    }
    
    for (let i = 0; i < result.balloons.length; i++) {
      for (let j = i + 1; j < result.balloons.length; j++) {
        const a = result.balloons[i]
        const b = result.balloons[j]
        
        const overlap = !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
        
        console.log(`Balloons ${a.id} & ${b.id}: overlap = ${overlap}`)
        
        expect(overlap, `Balloons ${a.id} and ${b.id} must not overlap`).toBe(false)
      }
    }
  })
})
