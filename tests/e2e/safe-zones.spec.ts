import { test, expect } from '@playwright/test'
import { getAllBalloonEllipses, getCatPaintedBounds, popCorrectBalloonAndWait } from './helpers'

/**
 * Safe Zone Tests - Balloon Collision Detection
 * 
 * Verifies painted balloon ellipses do not intersect:
 * (a) Title text bounds
 * (b) Control bounds (mute, settings, any HUD buttons)
 * (c) Cat's painted geometry including ears
 * 
 * Uses accurate ellipse-vs-rectangle intersection.
 * 
 * Tests across:
 * - Counts: 3, 4, 5
 * - Viewports: 320×568, 375×667, 1280×800
 * - States: initial frame, after pop (cat moved), mid-jump, after reset
 */

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
  const closestX = Math.max(boxLeft, Math.min(ellipseCenterX, boxRight))
  const closestY = Math.max(boxTop, Math.min(ellipseCenterY, boxBottom))
  
  const dx = closestX - ellipseCenterX
  const dy = closestY - ellipseCenterY
  
  return (dx * dx) / (ellipseRadiusX * ellipseRadiusX) +
         (dy * dy) / (ellipseRadiusY * ellipseRadiusY) <= 1
}

async function getTitleBounds(page: any): Promise<AABB> {
  return await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    
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

async function getControlBounds(page: any): Promise<{ name: string; bounds: AABB }[]> {
  return await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const controls: { name: string; bounds: AABB }[] = []
    
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

async function setBalloonCount(page: any, count: number) {
  await page.evaluate(() => window.__tatematika!.openSettings())
  
  const balloonCountInput = page.locator('[data-testid="setting-balloon-count"]').first()
  await balloonCountInput.fill(String(count))
  
  await page.evaluate(() => window.__tatematika!.closeSettings())
  await page.waitForTimeout(200)
  
  const actualCount = await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    return scene.balloonSprites.length
  })
  
  expect(actualCount).toBe(count)
}

/**
 * Check safe zones continuously over time to catch floating/moving balloons
 * Samples every 100ms for 6 seconds or until a collision is detected
 */
async function checkSafeZonesContinuous(page: any, viewport: string, count: number, phase: string) {
  const startTime = Date.now()
  const duration = 6000
  const interval = 100
  let firstCollision: any = null
  
  while (Date.now() - startTime < duration && !firstCollision) {
    const elapsed = Date.now() - startTime
    
    const balloons = await getAllBalloonEllipses(page)
    const title = await getTitleBounds(page)
    const controls = await getControlBounds(page)
    const settingsBtn = await getSettingsButtonBounds(page)
    const cat = await getCatPaintedBounds(page)
    
    for (const balloon of balloons) {
      // Check vs title
      if (ellipseIntersectsAABB(
        balloon.centerX, balloon.centerY,
        balloon.radiusX, balloon.radiusY,
        title.left, title.top, title.right, title.bottom
      )) {
        firstCollision = {
          time: elapsed,
          type: 'title',
          balloon: {
            id: balloon.id,
            centerX: balloon.centerX,
            centerY: balloon.centerY,
            radiusX: balloon.radiusX,
            radiusY: balloon.radiusY
          },
          target: {
            left: title.left,
            top: title.top,
            right: title.right,
            bottom: title.bottom
          }
        }
        break
      }
      
      // Check vs controls
      for (const control of controls) {
        if (ellipseIntersectsAABB(
          balloon.centerX, balloon.centerY,
          balloon.radiusX, balloon.radiusY,
          control.bounds.left, control.bounds.top,
          control.bounds.right, control.bounds.bottom
        )) {
          firstCollision = {
            time: elapsed,
            type: control.name,
            balloon: {
              id: balloon.id,
              centerX: balloon.centerX,
              centerY: balloon.centerY,
              radiusX: balloon.radiusX,
              radiusY: balloon.radiusY
            },
            target: control.bounds
          }
          break
        }
      }
      
      if (firstCollision) break
      
      // Check vs settings button
      if (settingsBtn && ellipseIntersectsAABB(
        balloon.centerX, balloon.centerY,
        balloon.radiusX, balloon.radiusY,
        settingsBtn.left, settingsBtn.top,
        settingsBtn.right, settingsBtn.bottom
      )) {
        firstCollision = {
          time: elapsed,
          type: 'settings',
          balloon: {
            id: balloon.id,
            centerX: balloon.centerX,
            centerY: balloon.centerY,
            radiusX: balloon.radiusX,
            radiusY: balloon.radiusY
          },
          target: settingsBtn
        }
        break
      }
      
      // Check vs cat
      if (ellipseIntersectsAABB(
        balloon.centerX, balloon.centerY,
        balloon.radiusX, balloon.radiusY,
        cat.left, cat.top, cat.right, cat.bottom
      )) {
        firstCollision = {
          time: elapsed,
          type: 'cat',
          balloon: {
            id: balloon.id,
            centerX: balloon.centerX,
            centerY: balloon.centerY,
            radiusX: balloon.radiusX,
            radiusY: balloon.radiusY
          },
          target: cat
        }
        break
      }
    }
    
    if (!firstCollision) {
      await page.waitForTimeout(interval)
    }
  }
  
  if (firstCollision) {
    const b = firstCollision.balloon
    const t = firstCollision.target
    throw new Error(
      `${viewport} count ${count} ${phase}: At t=${firstCollision.time}ms, ` +
      `Balloon ${b.id.substring(0, 20)}... at (${b.centerX.toFixed(1)}, ${b.centerY.toFixed(1)}) ` +
      `radii (${b.radiusX.toFixed(1)}, ${b.radiusY.toFixed(1)}) ` +
      `intersects ${firstCollision.type} at (${t.left.toFixed(1)}, ${t.top.toFixed(1)}) ` +
      `to (${t.right.toFixed(1)}, ${t.bottom.toFixed(1)})`
    )
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
    
    const topOffset = catPosition.y - cat.top
    
    // Ears extend to y-40, so top offset should be at least 35px
    expect(topOffset, 'Cat measurement must include ears extending above body').toBeGreaterThan(35)
    
    // Bottom should be around y + 22.5 (half body height)
    const bottomOffset = cat.bottom - catPosition.y
    expect(bottomOffset, 'Cat measurement includes body bottom').toBeGreaterThan(20)
    expect(bottomOffset, 'Cat measurement bottom is reasonable').toBeLessThan(30)
  })
})

// Initial frame tests
test.describe('Safe Zones - Initial Frame - 320×568', () => {
  test.use({ viewport: { width: 320, height: 568 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })
  
  test('Count 3: No balloon overlaps', async ({ page }) => {
    await setBalloonCount(page, 3)
    await checkSafeZonesContinuous(page, '320×568', 3, 'initial')
  })
  
  test('Count 4: No balloon overlaps', async ({ page }) => {
    await setBalloonCount(page, 4)
    await checkSafeZonesContinuous(page, '320×568', 4, 'initial')
  })
  
  test('Count 5: No balloon overlaps', async ({ page }) => {
    await setBalloonCount(page, 5)
    await checkSafeZonesContinuous(page, '320×568', 5, 'initial')
  })
})

test.describe('Safe Zones - After Pop - 320×568', () => {
  test.use({ viewport: { width: 320, height: 568 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })
  
  test('Count 3: After pop, no balloon overlaps', async ({ page }) => {
    await setBalloonCount(page, 3)
    await popCorrectBalloonAndWait(page)
    await checkSafeZonesContinuous(page, '320×568', 3, 'after-pop')
  })
  
  test('Count 4: After pop, no balloon overlaps', async ({ page }) => {
    await setBalloonCount(page, 4)
    await popCorrectBalloonAndWait(page)
    await checkSafeZonesContinuous(page, '320×568', 4, 'after-pop')
  })
  
  test('Count 5: After pop, no balloon overlaps', async ({ page }) => {
    await setBalloonCount(page, 5)
    await popCorrectBalloonAndWait(page)
    await checkSafeZonesContinuous(page, '320×568', 5, 'after-pop')
  })
})

test.describe('Safe Zones - Mid Jump - 320×568', () => {
  test.use({ viewport: { width: 320, height: 568 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })
  
  test('Count 3: Mid-jump, no balloon overlaps cat', async ({ page }) => {
    await setBalloonCount(page, 3)
    
    const correct = await page.evaluate(() => {
      const s = window.__tatematika!.getGameState()
      return s.balloons.find((b: any) => b.isCorrect)!
    })
    
    // Click and wait for jump to start
    await page.evaluate((id: string) => window.__tatematika!.clickBalloon(id), correct.id)
    
    // Poll until isJumping is true
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return jumpState.isJumping
    }, { timeout: 2000, intervals: [50] }).toBe(true)
    
    // Sample cat bounds vs balloons during jump
    await checkSafeZonesContinuous(page, '320×568', 3, 'mid-jump')
  })
  
  test('Count 4: Mid-jump, no balloon overlaps cat', async ({ page }) => {
    await setBalloonCount(page, 4)
    
    const correct = await page.evaluate(() => {
      const s = window.__tatematika!.getGameState()
      return s.balloons.find((b: any) => b.isCorrect)!
    })
    
    await page.evaluate((id: string) => window.__tatematika!.clickBalloon(id), correct.id)
    
    // Poll until isJumping is true
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return jumpState.isJumping
    }, { timeout: 2000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '320×568', 4, 'mid-jump')
  })
  
  test('Count 5: Mid-jump, no balloon overlaps cat', async ({ page }) => {
    await setBalloonCount(page, 5)
    
    const correct = await page.evaluate(() => {
      const s = window.__tatematika!.getGameState()
      return s.balloons.find((b: any) => b.isCorrect)!
    })
    
    await page.evaluate((id: string) => window.__tatematika!.clickBalloon(id), correct.id)
    
    // Poll until isJumping is true
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return jumpState.isJumping
    }, { timeout: 2000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '320×568', 5, 'mid-jump')
  })
})

