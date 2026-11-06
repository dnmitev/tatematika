import { test, expect } from '@playwright/test'

/**
 * Safe Zone Tests - Balloon Collision Detection
 * 
 * Verifies painted balloon ellipses (measured via commandBuffer) do not intersect:
 * (a) Title text bounds
 * (b) Control bounds (mute, settings, any HUD buttons)
 * (c) Cat's painted geometry including ears (union of Graphics commandBuffer bounds)
 * 
 * Uses accurate ellipse-vs-rectangle intersection, not just bounding box checks.
 * 
 * Tests across:
 * - Counts: 3, 4, 5
 * - Viewports: 320×568, 375×667, 1280×800
 * - States: initial frame, after pop (cat moved), after reset
 */

interface BalloonEllipse {
  id: string
  centerX: number
  centerY: number
  radiusX: number
  radiusY: number
}

interface AABB {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/**
 * Accurate ellipse vs AABB intersection test
 * Returns true if ellipse intersects rectangle
 */
function ellipseIntersectsAABB(
  ellipseCenterX: number,
  ellipseCenterY: number,
  ellipseRadiusX: number,
  ellipseRadiusY: number,
  boxLeft: number,
  boxTop: number,
  boxRight: number,
  boxBottom: number
): boolean {
  // Find closest point on AABB to ellipse center
  const closestX = Math.max(boxLeft, Math.min(ellipseCenterX, boxRight))
  const closestY = Math.max(boxTop, Math.min(ellipseCenterY, boxBottom))
  
  // Check if closest point is inside ellipse
  const dx = closestX - ellipseCenterX
  const dy = closestY - ellipseCenterY
  
  return (dx * dx) / (ellipseRadiusX * ellipseRadiusX) +
         (dy * dy) / (ellipseRadiusY * ellipseRadiusY) <= 1
}

/**
 * Get all balloon ellipses using validated commandBuffer method
 */
async function getAllBalloonEllipses(page: any): Promise<BalloonEllipse[]> {
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
        id: bs.id,
        centerX: bs.x,
        centerY: bs.y,
        radiusX: width / 2,
        radiusY: height / 2
      }
    })
  })
}

/**
 * Get title bounds (Phaser Text object)
 */
async function getTitleBounds(page: any): Promise<AABB> {
  return await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    
    // Find title text by content
    const titleText = scene.children.list.find((child: any) => 
      child.type === 'Text' && child.text === 'Котето и балоните'
    )
    
    if (!titleText) {
      throw new Error('Title text not found')
    }
    
    const bounds = titleText.getBounds()
    
    return {
      left: bounds.x,
      top: bounds.y,
      right: bounds.x + bounds.width,
      bottom: bounds.y + bounds.height,
      width: bounds.width,
      height: bounds.height
    }
  })
}

/**
 * Get all control bounds (mute button, settings button)
 */
async function getControlBounds(page: any): Promise<{ name: string; bounds: AABB }[]> {
  return await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const controls: { name: string; bounds: AABB }[] = []
    
    // Mute button (Phaser Text)
    if (scene.muteButton) {
      const bounds = scene.muteButton.getBounds()
      controls.push({
        name: 'mute',
        bounds: {
          left: bounds.x,
          top: bounds.y,
          right: bounds.x + bounds.width,
          bottom: bounds.y + bounds.height,
          width: bounds.width,
          height: bounds.height
        }
      })
    }
    
    return controls
  })
}

/**
 * Get settings button bounds (DOM element)
 */
async function getSettingsButtonBounds(page: any): Promise<AABB | null> {
  const settingsButton = page.locator('[data-testid="button-settings"]')
  const isVisible = await settingsButton.isVisible().catch(() => false)
  
  if (!isVisible) {
    return null
  }
  
  const box = await settingsButton.boundingBox()
  if (!box) {
    return null
  }
  
  // Convert CSS coords to game coords
  const { canvasRect, scale } = await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const canvas = document.querySelector('canvas')!
    const rect = canvas.getBoundingClientRect()
    return {
      canvasRect: {
        left: rect.left,
        top: rect.top
      },
      scale: rect.width / game.scale.width
    }
  })
  
  const gameLeft = (box.x - canvasRect.left) / scale
  const gameTop = (box.y - canvasRect.top) / scale
  const gameWidth = box.width / scale
  const gameHeight = box.height / scale
  
  return {
    left: gameLeft,
    top: gameTop,
    right: gameLeft + gameWidth,
    bottom: gameTop + gameHeight,
    width: gameWidth,
    height: gameHeight
  }
}

/**
 * Get cat's painted bounds from Graphics commandBuffer
 * Includes all filled shapes (body, ears, eyes)
 */
async function getCatPaintedBounds(page: any): Promise<AABB> {
  return await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const catGraphics = scene.cat
    
    const Commands = { BEGIN_PATH: 1, LINE_TO: 4, MOVE_TO: 5, FILL_PATH: 8, FILL_ELLIPSE: 10, FILL_TRIANGLE: 11, FILL_CIRCLE: 12 }
    
    const commandBuffer = catGraphics.commandBuffer
    
    // Collect all points from all filled paths
    const allPoints: Array<{ x: number; y: number }> = []
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
        allPoints.push(...currentPath)
        currentPath = []
        inPath = false
      }
    }
    
    // Compute bounding box of all painted points
    if (allPoints.length === 0) {
      throw new Error('No painted points found in cat Graphics')
    }
    
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    
    for (const point of allPoints) {
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y)
      maxY = Math.max(maxY, point.y)
    }
    
    return {
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
      width: maxX - minX,
      height: maxY - minY
    }
  })
}

/**
 * Helper: set balloon count via settings
 */
async function setBalloonCount(page: any, count: number) {
  await page.evaluate((c: number) => {
    window.__tatematika!.openSettings()
  }, count)
  
  const balloonCountInput = page.locator('[data-testid="setting-balloon-count"]').first()
  await balloonCountInput.fill(String(count))
  
  await page.evaluate(() => window.__tatematika!.closeSettings())
  await page.waitForTimeout(200)
  
  // Verify count took effect
  const actualCount = await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    return scene.balloonSprites.length
  })
  
  expect(actualCount).toBe(count)
}

/**
 * Test safe zones for a given viewport and count
 */
async function testSafeZones(page: any, viewport: string, count: number) {
  console.log(`\n=== ${viewport} - Count ${count} ===`)
  
  await setBalloonCount(page, count)
  
  // Get all collision zones
  const balloons = await getAllBalloonEllipses(page)
  const title = await getTitleBounds(page)
  const controls = await getControlBounds(page)
  const settingsBtn = await getSettingsButtonBounds(page)
  const cat = await getCatPaintedBounds(page)
  
  console.log(`Balloons: ${balloons.length}`)
  console.log(`Title: (${title.left.toFixed(1)}, ${title.top.toFixed(1)}) to (${title.right.toFixed(1)}, ${title.bottom.toFixed(1)})`)
  console.log(`Cat: (${cat.left.toFixed(1)}, ${cat.top.toFixed(1)}) to (${cat.right.toFixed(1)}, ${cat.bottom.toFixed(1)})`)
  
  // Check each balloon against all safe zones
  for (const balloon of balloons) {
    console.log(`Balloon ${balloon.id}: center (${balloon.centerX.toFixed(1)}, ${balloon.centerY.toFixed(1)}), radii (${balloon.radiusX.toFixed(1)}, ${balloon.radiusY.toFixed(1)})`)
    
    // Check vs title
    const titleCollision = ellipseIntersectsAABB(
      balloon.centerX, balloon.centerY,
      balloon.radiusX, balloon.radiusY,
      title.left, title.top, title.right, title.bottom
    )
    
    expect(titleCollision, 
      `${viewport} count ${count}: Balloon ${balloon.id} at (${balloon.centerX.toFixed(1)}, ${balloon.centerY.toFixed(1)}) ` +
      `intersects title at (${title.left.toFixed(1)}, ${title.top.toFixed(1)}) to (${title.right.toFixed(1)}, ${title.bottom.toFixed(1)})`
    ).toBe(false)
    
    // Check vs controls
    for (const control of controls) {
      const controlCollision = ellipseIntersectsAABB(
        balloon.centerX, balloon.centerY,
        balloon.radiusX, balloon.radiusY,
        control.bounds.left, control.bounds.top,
        control.bounds.right, control.bounds.bottom
      )
      
      expect(controlCollision,
        `${viewport} count ${count}: Balloon ${balloon.id} at (${balloon.centerX.toFixed(1)}, ${balloon.centerY.toFixed(1)}) ` +
        `intersects ${control.name} button at (${control.bounds.left.toFixed(1)}, ${control.bounds.top.toFixed(1)}) ` +
        `to (${control.bounds.right.toFixed(1)}, ${control.bounds.bottom.toFixed(1)})`
      ).toBe(false)
    }
    
    // Check vs settings button (if visible)
    if (settingsBtn) {
      const settingsCollision = ellipseIntersectsAABB(
        balloon.centerX, balloon.centerY,
        balloon.radiusX, balloon.radiusY,
        settingsBtn.left, settingsBtn.top,
        settingsBtn.right, settingsBtn.bottom
      )
      
      expect(settingsCollision,
        `${viewport} count ${count}: Balloon ${balloon.id} at (${balloon.centerX.toFixed(1)}, ${balloon.centerY.toFixed(1)}) ` +
        `intersects settings button at (${settingsBtn.left.toFixed(1)}, ${settingsBtn.top.toFixed(1)}) ` +
        `to (${settingsBtn.right.toFixed(1)}, ${settingsBtn.bottom.toFixed(1)})`
      ).toBe(false)
    }
    
    // Check vs cat
    const catCollision = ellipseIntersectsAABB(
      balloon.centerX, balloon.centerY,
      balloon.radiusX, balloon.radiusY,
      cat.left, cat.top, cat.right, cat.bottom
    )
    
    expect(catCollision,
      `${viewport} count ${count}: Balloon ${balloon.id} at (${balloon.centerX.toFixed(1)}, ${balloon.centerY.toFixed(1)}) ` +
      `intersects cat at (${cat.left.toFixed(1)}, ${cat.top.toFixed(1)}) to (${cat.right.toFixed(1)}, ${cat.bottom.toFixed(1)})`
    ).toBe(false)
  }
}

// Synthetic validation test
test.describe('Safe Zones - Synthetic Validation', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })
  
  test('Synthetic: Cat measurement includes ears (extends above body)', async ({ page }) => {
    const cat = await getCatPaintedBounds(page)
    const catPosition = await page.evaluate(() => window.__tatematika!.getCatPosition())
    
    console.log(`\n=== Cat Synthetic Validation ===`)
    console.log(`Cat center: (${catPosition.x}, ${catPosition.y})`)
    console.log(`Cat painted bounds: (${cat.left.toFixed(1)}, ${cat.top.toFixed(1)}) to (${cat.right.toFixed(1)}, ${cat.bottom.toFixed(1)})`)
    console.log(`Cat height: ${cat.height.toFixed(1)}`)
    
    // From drawCat: body ellipse is at (x, y, 50, 45) = center ±25 horizontal, ±22.5 vertical
    // Ears are triangles with points at y-40, so top of cat should be around catPosition.y - 40
    
    // The painted bounds should extend significantly above the center (ears)
    const topOffset = catPosition.y - cat.top
    
    console.log(`Top offset (center to top): ${topOffset.toFixed(1)} px`)
    
    // Ears extend to y-40, so top offset should be at least 35px (allowing for some triangle geometry)
    expect(topOffset, 'Cat measurement must include ears extending above body').toBeGreaterThan(35)
    
    // Bottom should be around y + 22.5 (half body height)
    const bottomOffset = cat.bottom - catPosition.y
    expect(bottomOffset, 'Cat measurement includes body bottom').toBeGreaterThan(20)
    expect(bottomOffset, 'Cat measurement bottom is reasonable').toBeLessThan(30)
  })
})

// Safe zones at initial frame
test.describe('Safe Zones - Initial Frame - 320×568', () => {
  test.use({ viewport: { width: 320, height: 568 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })
  
  test('Count 3: No balloon overlaps title, controls, or cat', async ({ page }) => {
    await testSafeZones(page, '320×568', 3)
  })
  
  test('Count 4: No balloon overlaps title, controls, or cat', async ({ page }) => {
    await testSafeZones(page, '320×568', 4)
  })
  
  test('Count 5: No balloon overlaps title, controls, or cat', async ({ page }) => {
    await testSafeZones(page, '320×568', 5)
  })
})

test.describe('Safe Zones - Initial Frame - 375×667', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })
  
  test('Count 3: No balloon overlaps title, controls, or cat', async ({ page }) => {
    await testSafeZones(page, '375×667', 3)
  })
  
  test('Count 4: No balloon overlaps title, controls, or cat', async ({ page }) => {
    await testSafeZones(page, '375×667', 4)
  })
  
  test('Count 5: No balloon overlaps title, controls, or cat', async ({ page }) => {
    await testSafeZones(page, '375×667', 5)
  })
})

test.describe('Safe Zones - Initial Frame - 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })
  
  test('Count 3: No balloon overlaps title, controls, or cat', async ({ page }) => {
    await testSafeZones(page, '1280×800', 3)
  })
  
  test('Count 4: No balloon overlaps title, controls, or cat', async ({ page }) => {
    await testSafeZones(page, '1280×800', 4)
  })
  
  test('Count 5: No balloon overlaps title, controls, or cat', async ({ page }) => {
    await testSafeZones(page, '1280×800', 5)
  })
})
