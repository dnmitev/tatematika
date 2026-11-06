import { expect, Page } from '@playwright/test'

/**
 * Get game scale and canvas dimensions using live game.scale.width/height
 * Never assumes hardcoded 800×600 game dimensions
 */
export async function getGameScaleAndRect(page: Page): Promise<{
  gameWidth: number
  gameHeight: number
  canvasRect: DOMRect
  scale: number
}> {
  return await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const canvas = document.querySelector('canvas')!
    const rect = canvas.getBoundingClientRect()
    const scale = rect.width / game.scale.width
    
    return {
      gameWidth: game.scale.width,
      gameHeight: game.scale.height,
      canvasRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left
      } as DOMRect,
      scale
    }
  })
}

/**
 * Helper: Wait for game to be ready, pop correct balloon, wait for new round
 * Ensures observable, spec-backed readiness without assuming IDs or target change
 * 
 * This helper:
 * 1. Waits for cat to be idle (not jumping)
 * 2. Waits for balloon to exist and not be animating
 * 3. Clicks the balloon
 * 4. Waits for stars to increment
 * 5. Waits for new round readiness (cat idle, one correct balloon, formula valid)
 */
/**
 * Parse Graphics commandBuffer to extract painted geometry bounds
 * Handles filled paths, triangles, ellipses, circles
 * Returns bounding box of all filled shapes in local coordinates
 */
function parseCommandBufferBounds(commandBuffer: number[]): {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
} | null {
  const Commands = {
    ARC: 0,
    BEGIN_PATH: 1,
    CLOSE_PATH: 2,
    LINE_TO: 4,
    MOVE_TO: 5,
    LINE_STYLE: 6,
    FILL_STYLE: 7,
    FILL_PATH: 8,
    STROKE_PATH: 9,
    FILL_TRIANGLE: 10
  }
  
  const allPoints: Array<{ x: number; y: number }> = []
  let currentPath: Array<{ x: number; y: number }> = []
  
  let i = 0
  while (i < commandBuffer.length) {
    const cmd = commandBuffer[i]
    i++
    
    if (cmd === Commands.MOVE_TO) {
      currentPath.push({ x: commandBuffer[i], y: commandBuffer[i + 1] })
      i += 2
    } else if (cmd === Commands.LINE_TO) {
      currentPath.push({ x: commandBuffer[i], y: commandBuffer[i + 1] })
      i += 2
    } else if (cmd === Commands.FILL_PATH) {
      allPoints.push(...currentPath)
      currentPath = []
    } else if (cmd === Commands.STROKE_PATH) {
      currentPath = []
    } else if (cmd === Commands.FILL_TRIANGLE) {
      allPoints.push({ x: commandBuffer[i], y: commandBuffer[i + 1] })
      allPoints.push({ x: commandBuffer[i + 2], y: commandBuffer[i + 3] })
      allPoints.push({ x: commandBuffer[i + 4], y: commandBuffer[i + 5] })
      i += 6
    } else if (cmd === Commands.BEGIN_PATH) {
      currentPath = []
    } else if (cmd === Commands.CLOSE_PATH) {
      // Path closed, not filled yet
    } else if (cmd === Commands.FILL_STYLE) {
      i += 2
    } else if (cmd === Commands.LINE_STYLE) {
      i += 3
    } else if (cmd === Commands.ARC) {
      i += 6
    }
  }
  
  if (currentPath.length > 0) {
    allPoints.push(...currentPath)
  }
  
  if (allPoints.length === 0) {
    return null
  }
  
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  
  for (const point of allPoints) {
    if (typeof point.x === 'number' && typeof point.y === 'number') {
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y)
      maxY = Math.max(maxY, point.y)
    }
  }
  
  return {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
    width: maxX - minX,
    height: maxY - minY
  }
}

/**
 * Get all balloon ellipse geometries using validated commandBuffer parsing
 * Returns ellipse parameters (center and radii) in game coordinates
 */
export async function getAllBalloonEllipses(page: Page): Promise<Array<{
  id: string
  centerX: number
  centerY: number
  radiusX: number
  radiusY: number
}>> {
  return await page.evaluate((parser: string) => {
    const parseCommandBufferBounds = new Function('return ' + parser)()
    
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const balloonSprites = scene.balloonSprites
    
    return balloonSprites.map((bs: any) => {
      const sprite = bs.sprite as any
      const commandBuffer = sprite.commandBuffer
      
      const bounds = parseCommandBufferBounds(commandBuffer)
      if (!bounds) {
        throw new Error(`No painted bounds found for balloon ${bs.id}`)
      }
      
      // Get sprite world transform
      const scaleX = sprite.scaleX || 1
      const scaleY = sprite.scaleY || 1
      
      // Apply scale to bounds
      const effectiveWidth = bounds.width * scaleX
      const effectiveHeight = bounds.height * scaleY
      
      return {
        id: bs.id,
        centerX: bs.x,
        centerY: bs.y,
        radiusX: effectiveWidth / 2,
        radiusY: effectiveHeight / 2
      }
    })
  }, parseCommandBufferBounds.toString())
}

/**
 * Get cat painted bounds using validated commandBuffer parsing
 * Returns bounding box in game coordinates
 */
export async function getCatPaintedBounds(page: Page): Promise<{
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}> {
  return await page.evaluate((parser: string) => {
    const parseCommandBufferBounds = new Function('return ' + parser)()
    
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const catGraphics = scene.cat
    
    const commandBuffer = catGraphics.commandBuffer
    const bounds = parseCommandBufferBounds(commandBuffer)
    
    if (!bounds) {
      throw new Error('No painted bounds found for cat Graphics')
    }
    
    return bounds
  }, parseCommandBufferBounds.toString())
}

export async function popCorrectBalloonAndWait(page: any) {
  const state = await page.evaluate(() => window.__tatematika!.getGameState())
  const prevStars = state.stars
  const correct = state.balloons.find((b: any) => b.isCorrect)!
  
  // Wait for game to be ready: cat not jumping, balloon exists and not animating
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    const balloonBounds = await page.evaluate((id: string) => 
      window.__tatematika!.getBalloonBounds(id), correct.id)
    const balloonAnim = await page.evaluate((id: string) => 
      window.__tatematika!.getBalloonAnimationState(id), correct.id)
    
    return !jumpState.isJumping && 
           balloonBounds !== null && 
           !balloonAnim.isPopping && 
           !balloonAnim.isBouncing
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  // Click the balloon
  await page.evaluate((id: string) => window.__tatematika!.clickBalloon(id), correct.id)
  
  // Wait for star to increment
  await expect.poll(async () => {
    const s = await page.evaluate(() => window.__tatematika!.getGameState())
    return s.stars
  }, { timeout: 10000, intervals: [50] }).toBe(prevStars + 1)
  
  // Wait for new round to be ready with observable facts per spec:
  // - Cat is idle (not jumping)
  // - Exactly one isCorrect balloon present
  // - The correct balloon's formula evaluates to the current target
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    if (jumpState.isJumping) return false
    
    const s = await page.evaluate(() => window.__tatematika!.getGameState())
    const correctBalloons = s.balloons.filter((b: any) => b.isCorrect)
    if (correctBalloons.length !== 1) return false
    
    // Verify the correct balloon's formula actually equals the target
    const correct = correctBalloons[0]
    const formulaMatch = correct.formula.match(/(\d+)\s*([+−-])\s*(\d+)/)
    if (!formulaMatch) return false
    
    const a = parseInt(formulaMatch[1])
    const op = formulaMatch[2]
    const b = parseInt(formulaMatch[3])
    const result = op === '+' ? a + b : a - b
    
    return result === s.target
  }, { timeout: 10000, intervals: [50] }).toBe(true)
}
