import { test, expect } from '@playwright/test'
import { INIT_TIMEOUT_MS } from './test-timeouts'
import { getGameScaleAndRect } from './helpers'

/**
 * HUD Element Geometry Tests
 * 
 * Tests HUD elements (target, stars, mute, settings) at all viewports.
 * 
 * Requirements:
 * - Target number, stars, mute button, settings button fully inside game area
 * - No HUD element overlaps any balloon's painted ellipse
 * - Target digits ≥32 CSS px
 * - Buttons ≥64×64 CSS px
 * 
 * Measures real objects: Text getBounds(), world transform, button hit areas
 */

interface BalloonEllipse {
  centerX: number
  centerY: number
  radiusX: number
  radiusY: number
}

/**
 * Check if an AABB intersects an ellipse (conservative)
 */
function aabbIntersectsEllipse(
  boxLeft: number,
  boxTop: number,
  boxRight: number,
  boxBottom: number,
  ellipse: BalloonEllipse
): boolean {
  // Find closest point on AABB to ellipse center
  const closestX = Math.max(boxLeft, Math.min(ellipse.centerX, boxRight))
  const closestY = Math.max(boxTop, Math.min(ellipse.centerY, boxBottom))
  
  // Check if point is inside ellipse
  const dx = closestX - ellipse.centerX
  const dy = closestY - ellipse.centerY
  
  return (dx * dx) / (ellipse.radiusX * ellipse.radiusX) +
         (dy * dy) / (ellipse.radiusY * ellipse.radiusY) <= 1
}

/**
 * Get balloon ellipses from commandBuffer
 */
async function getBalloonEllipses(page: any): Promise<BalloonEllipse[]> {
  return await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const balloonSprites = scene.balloonSprites
    
    const Commands = { BEGIN_PATH: 1, LINE_TO: 4, MOVE_TO: 5, FILL_PATH: 8 }
    
    return balloonSprites.map((bs: any) => {
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
        centerX: bs.x,
        centerY: bs.y,
        radiusX: width / 2,
        radiusY: height / 2
      }
    })
  })
}

async function testHUDElements(page: any, viewportName: string, balloonCount: number) {
  const { gameWidth, gameHeight, scale } = await getGameScaleAndRect(page)
  
  // Get balloon ellipses
  const balloonEllipses = await getBalloonEllipses(page)
  
  // Test target number
  const targetBounds = await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const targetText = scene.targetText
    
    const bounds = targetText.getBounds()
    const matrix = targetText.getWorldTransformMatrix()
    
    return {
      left: bounds.x,
      top: bounds.y,
      right: bounds.x + bounds.width,
      bottom: bounds.y + bounds.height,
      width: bounds.width,
      height: bounds.height,
      fontSize: targetText.style.fontSize
    }
  })
  
  // Check target is inside game area
  expect(targetBounds.left, `${viewportName}, count ${balloonCount}: target left must be ≥0`).toBeGreaterThanOrEqual(0)
  expect(targetBounds.top, `${viewportName}, count ${balloonCount}: target top must be ≥0`).toBeGreaterThanOrEqual(0)
  expect(targetBounds.right, `${viewportName}, count ${balloonCount}: target right must be ≤${gameWidth}`).toBeLessThanOrEqual(gameWidth)
  expect(targetBounds.bottom, `${viewportName}, count ${balloonCount}: target bottom must be ≤${gameHeight}`).toBeLessThanOrEqual(gameHeight)
  
  // Check target doesn't overlap balloons
  for (let i = 0; i < balloonEllipses.length; i++) {
    const overlaps = aabbIntersectsEllipse(
      targetBounds.left,
      targetBounds.top,
      targetBounds.right,
      targetBounds.bottom,
      balloonEllipses[i]
    )
    expect(overlaps, `${viewportName}, count ${balloonCount}: target overlaps balloon ${i}`).toBe(false)
  }
  
  // Check target font size ≥32 CSS px
  const targetFontSize = typeof targetBounds.fontSize === 'string' 
    ? parseInt(targetBounds.fontSize) 
    : targetBounds.fontSize
  const targetCssSize = targetFontSize * scale
  expect(targetCssSize, `${viewportName}, count ${balloonCount}: target font size must be ≥32 CSS px`).toBeGreaterThanOrEqual(32)
  
  // Test stars
  const starsBounds = await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const starsText = scene.starsText
    
    const bounds = starsText.getBounds()
    
    return {
      left: bounds.x,
      top: bounds.y,
      right: bounds.x + bounds.width,
      bottom: bounds.y + bounds.height
    }
  })
  
  // Check stars is inside game area
  expect(starsBounds.left, `${viewportName}, count ${balloonCount}: stars left must be ≥0`).toBeGreaterThanOrEqual(0)
  expect(starsBounds.top, `${viewportName}, count ${balloonCount}: stars top must be ≥0`).toBeGreaterThanOrEqual(0)
  expect(starsBounds.right, `${viewportName}, count ${balloonCount}: stars right must be ≤${gameWidth}`).toBeLessThanOrEqual(gameWidth)
  expect(starsBounds.bottom, `${viewportName}, count ${balloonCount}: stars bottom must be ≤${gameHeight}`).toBeLessThanOrEqual(gameHeight)
  
  // Check stars doesn't overlap balloons
  for (let i = 0; i < balloonEllipses.length; i++) {
    const overlaps = aabbIntersectsEllipse(
      starsBounds.left,
      starsBounds.top,
      starsBounds.right,
      starsBounds.bottom,
      balloonEllipses[i]
    )
    expect(overlaps, `${viewportName}, count ${balloonCount}: stars overlaps balloon ${i}`).toBe(false)
  }
  
  // Test mute button
  const muteBounds = await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const muteButton = scene.muteButton
    
    // Get hit area from button
    const hitArea = muteButton.input?.hitArea
    if (hitArea) {
      return {
        left: muteButton.x + hitArea.x,
        top: muteButton.y + hitArea.y,
        right: muteButton.x + hitArea.x + hitArea.width,
        bottom: muteButton.y + hitArea.y + hitArea.height,
        width: hitArea.width,
        height: hitArea.height
      }
    }
    
    // Fallback to bounds
    const bounds = muteButton.getBounds()
    return {
      left: bounds.x,
      top: bounds.y,
      right: bounds.x + bounds.width,
      bottom: bounds.y + bounds.height,
      width: bounds.width,
      height: bounds.height
    }
  })
  
  // Check mute button is inside game area
  expect(muteBounds.left, `${viewportName}, count ${balloonCount}: mute left must be ≥0`).toBeGreaterThanOrEqual(0)
  expect(muteBounds.top, `${viewportName}, count ${balloonCount}: mute top must be ≥0`).toBeGreaterThanOrEqual(0)
  expect(muteBounds.right, `${viewportName}, count ${balloonCount}: mute right must be ≤${gameWidth}`).toBeLessThanOrEqual(gameWidth)
  expect(muteBounds.bottom, `${viewportName}, count ${balloonCount}: mute bottom must be ≤${gameHeight}`).toBeLessThanOrEqual(gameHeight)
  
  // Check mute button doesn't overlap balloons
  for (let i = 0; i < balloonEllipses.length; i++) {
    const overlaps = aabbIntersectsEllipse(
      muteBounds.left,
      muteBounds.top,
      muteBounds.right,
      muteBounds.bottom,
      balloonEllipses[i]
    )
    expect(overlaps, `${viewportName}, count ${balloonCount}: mute button overlaps balloon ${i}`).toBe(false)
  }
  
  // Check mute button size ≥64×64 CSS px
  const muteCssWidth = muteBounds.width * scale
  const muteCssHeight = muteBounds.height * scale
  expect(muteCssWidth, `${viewportName}, count ${balloonCount}: mute width must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
  expect(muteCssHeight, `${viewportName}, count ${balloonCount}: mute height must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
  
  // Test settings button (DOM element)
  const settingsButton = page.locator('[data-testid="button-settings"]')
  await expect(settingsButton).toBeVisible()
  
  const settingsBox = await settingsButton.boundingBox()
  expect(settingsBox).not.toBeNull()
  
  // Check settings button size ≥64×64 CSS px
  expect(settingsBox!.width, `${viewportName}, count ${balloonCount}: settings width must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
  expect(settingsBox!.height, `${viewportName}, count ${balloonCount}: settings height must be ≥64 CSS px`).toBeGreaterThanOrEqual(64)
  
  // Settings button bounds - convert DOM position to game coordinates
  const { canvasRect } = await getGameScaleAndRect(page)
  
  // Settings button is positioned in viewport coordinates
  // Check it's fully visible within viewport
  const viewportWidth = await page.evaluate(() => window.innerWidth)
  const viewportHeight = await page.evaluate(() => window.innerHeight)
  
  expect(settingsBox!.x, `${viewportName}, count ${balloonCount}: settings left must be ≥0`).toBeGreaterThanOrEqual(0)
  expect(settingsBox!.y, `${viewportName}, count ${balloonCount}: settings top must be ≥0`).toBeGreaterThanOrEqual(0)
  expect(settingsBox!.x + settingsBox!.width, `${viewportName}, count ${balloonCount}: settings right must be ≤${viewportWidth}`).toBeLessThanOrEqual(viewportWidth)
  expect(settingsBox!.y + settingsBox!.height, `${viewportName}, count ${balloonCount}: settings bottom must be ≤${viewportHeight}`).toBeLessThanOrEqual(viewportHeight)
  
  // Check settings button doesn't overlap balloons
  // Convert settings button CSS coords to game coords for overlap check
  const settingsGameLeft = (settingsBox!.x - canvasRect.left) / scale
  const settingsGameTop = (settingsBox!.y - canvasRect.top) / scale
  const settingsGameRight = (settingsBox!.x + settingsBox!.width - canvasRect.left) / scale
  const settingsGameBottom = (settingsBox!.y + settingsBox!.height - canvasRect.top) / scale
  
  for (let i = 0; i < balloonEllipses.length; i++) {
    const overlaps = aabbIntersectsEllipse(
      settingsGameLeft,
      settingsGameTop,
      settingsGameRight,
      settingsGameBottom,
      balloonEllipses[i]
    )
    expect(overlaps, `${viewportName}, count ${balloonCount}: settings button overlaps balloon ${i}`).toBe(false)
  }
}

// Helper to set balloon count via settings
async function setBalloonCount(page: any, count: number) {
  await page.evaluate((c: number) => {
    window.__tatematika!.openSettings()
  }, count)
  
  await page.locator('[data-testid="setting-balloon-count"]').fill(String(count))
  
  await page.evaluate(() => {
    window.__tatematika!.closeSettings()
  })
  
  // Verify count took effect
  const state = await page.evaluate(() => window.__tatematika!.getGameState())
  expect(state.balloons).toHaveLength(count)
}

test.describe('HUD Geometry - 320×568 @mobile', () => {
  test.use({ viewport: { width: 320, height: 568 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  })
  
  test('HUD elements with 3 balloons', async ({ page }) => {
    await setBalloonCount(page, 3)
    await testHUDElements(page, '320×568', 3)
  })
  
  test('HUD elements with 4 balloons', async ({ page }) => {
    await setBalloonCount(page, 4)
    await testHUDElements(page, '320×568', 4)
  })
  
  test('HUD elements with 5 balloons', async ({ page }) => {
    await setBalloonCount(page, 5)
    await testHUDElements(page, '320×568', 5)
  })
})

test.describe('HUD Geometry - 375×667 @mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  })
  
  test('HUD elements with 3 balloons', async ({ page }) => {
    await setBalloonCount(page, 3)
    await testHUDElements(page, '375×667', 3)
  })
  
  test('HUD elements with 4 balloons', async ({ page }) => {
    await setBalloonCount(page, 4)
    await testHUDElements(page, '375×667', 4)
  })
  
  test('HUD elements with 5 balloons', async ({ page }) => {
    await setBalloonCount(page, 5)
    await testHUDElements(page, '375×667', 5)
  })
})

test.describe('HUD Geometry - 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  })
  
  test('HUD elements with 3 balloons', async ({ page }) => {
    await setBalloonCount(page, 3)
    await testHUDElements(page, '1280×800', 3)
  })
  
  test('HUD elements with 4 balloons', async ({ page }) => {
    await setBalloonCount(page, 4)
    await testHUDElements(page, '1280×800', 4)
  })
  
  test('HUD elements with 5 balloons', async ({ page }) => {
    await setBalloonCount(page, 5)
    await testHUDElements(page, '1280×800', 5)
  })
})
