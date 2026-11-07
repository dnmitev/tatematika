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

// RESET phase tests - UI button reset
test.describe('Safe Zones - After UI Reset - 320×568', () => {
  test.use({ viewport: { width: 320, height: 568 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })
  
  test('Count 3: After UI reset, no balloon overlaps', async ({ page }) => {
    await setBalloonCount(page, 3)
    
    // Complete the level
    let levelCompleteButton
    while (!levelCompleteButton || !(await levelCompleteButton.isVisible())) {
      await popCorrectBalloonAndWait(page)
      levelCompleteButton = page.locator('[data-testid="button-play-again"]')
    }
    
    // Click play again
    await levelCompleteButton.click()
    
    // Wait for new game to be ready
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '320×568', 3, 'after-ui-reset')
  })
  
  test('Count 4: After UI reset, no balloon overlaps', async ({ page }) => {
    await setBalloonCount(page, 4)
    
    let levelCompleteButton
    while (!levelCompleteButton || !(await levelCompleteButton.isVisible())) {
      await popCorrectBalloonAndWait(page)
      levelCompleteButton = page.locator('[data-testid="button-play-again"]')
    }
    
    await levelCompleteButton.click()
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '320×568', 4, 'after-ui-reset')
  })
  
  test('Count 5: After UI reset, no balloon overlaps', async ({ page }) => {
    await setBalloonCount(page, 5)
    
    let levelCompleteButton
    while (!levelCompleteButton || !(await levelCompleteButton.isVisible())) {
      await popCorrectBalloonAndWait(page)
      levelCompleteButton = page.locator('[data-testid="button-play-again"]')
    }
    
    await levelCompleteButton.click()
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '320×568', 5, 'after-ui-reset')
  })
})

// RESET phase tests - page reload
test.describe('Safe Zones - After Page Reload - 320×568', () => {
  test.use({ viewport: { width: 320, height: 568 } })
  
  test('Count 3: After reload, no balloon overlaps', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Count 3 is default, but explicitly verify BEFORE reload
    const stateBefore = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateBefore.balloons.length).toBe(3)
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    // Verify count is still 3 AFTER reload
    const stateAfter = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateAfter.balloons.length).toBe(3)
    
    await checkSafeZonesContinuous(page, '320×568', 3, 'after-reload')
  })
  
  test('Count 4: After reload, no balloon overlaps', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Set count to 4 via REAL UI settings (not URL param which app doesn't read)
    await setBalloonCount(page, 4)
    
    // Verify count is 4 BEFORE reload
    const stateBefore = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateBefore.balloons.length).toBe(4)
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    // Verify count is still 4 AFTER reload (per spec K9)
    const stateAfter = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateAfter.balloons.length).toBe(4)
    
    await checkSafeZonesContinuous(page, '320×568', 4, 'after-reload')
  })
  
  test('Count 5: After reload, no balloon overlaps', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Set count to 5 via REAL UI settings (not URL param which app doesn't read)
    await setBalloonCount(page, 5)
    
    // Verify count is 5 BEFORE reload
    const stateBefore = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateBefore.balloons.length).toBe(5)
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    // Verify count is still 5 AFTER reload (per spec K9)
    const stateAfter = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateAfter.balloons.length).toBe(5)
    
    await checkSafeZonesContinuous(page, '320×568', 5, 'after-reload')
  })
})

// RESET phase tests for other viewports
test.describe('Safe Zones - After UI Reset - 375×667', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })
  
  test('Count 3: After UI reset, no balloon overlaps', async ({ page }) => {
    await setBalloonCount(page, 3)
    
    let levelCompleteButton
    while (!levelCompleteButton || !(await levelCompleteButton.isVisible())) {
      await popCorrectBalloonAndWait(page)
      levelCompleteButton = page.locator('[data-testid="button-play-again"]')
    }
    
    await levelCompleteButton.click()
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '375×667', 3, 'after-ui-reset')
  })
  
  test('Count 4: After UI reset, no balloon overlaps', async ({ page }) => {
    await setBalloonCount(page, 4)
    
    let levelCompleteButton
    while (!levelCompleteButton || !(await levelCompleteButton.isVisible())) {
      await popCorrectBalloonAndWait(page)
      levelCompleteButton = page.locator('[data-testid="button-play-again"]')
    }
    
    await levelCompleteButton.click()
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '375×667', 4, 'after-ui-reset')
  })
  
  test('Count 5: After UI reset, no balloon overlaps', async ({ page }) => {
    await setBalloonCount(page, 5)
    
    let levelCompleteButton
    while (!levelCompleteButton || !(await levelCompleteButton.isVisible())) {
      await popCorrectBalloonAndWait(page)
      levelCompleteButton = page.locator('[data-testid="button-play-again"]')
    }
    
    await levelCompleteButton.click()
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '375×667', 5, 'after-ui-reset')
  })
})

test.describe('Safe Zones - After Page Reload - 375×667', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test('Count 3: After reload, no balloon overlaps', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Count 3 is default, but explicitly verify BEFORE reload
    const stateBefore = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateBefore.balloons.length).toBe(3)
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    // Verify count is still 3 AFTER reload
    const stateAfter = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateAfter.balloons.length).toBe(3)
    
    await checkSafeZonesContinuous(page, '375×667', 3, 'after-reload')
  })
  
  test('Count 4: After reload, no balloon overlaps', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Set count to 4 via REAL UI settings
    await setBalloonCount(page, 4)
    
    // Verify count is 4 BEFORE reload
    const stateBefore = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateBefore.balloons.length).toBe(4)
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    // Verify count is still 4 AFTER reload (per spec K9)
    const stateAfter = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateAfter.balloons.length).toBe(4)
    
    await checkSafeZonesContinuous(page, '375×667', 4, 'after-reload')
  })
  
  test('Count 5: After reload, no balloon overlaps', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Set count to 5 via REAL UI settings
    await setBalloonCount(page, 5)
    
    // Verify count is 5 BEFORE reload
    const stateBefore = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateBefore.balloons.length).toBe(5)
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    // Verify count is still 5 AFTER reload (per spec K9)
    const stateAfter = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateAfter.balloons.length).toBe(5)
    
    await checkSafeZonesContinuous(page, '375×667', 5, 'after-reload')
  })
})

test.describe('Safe Zones - After UI Reset - 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })
  
  test('Count 3: After UI reset, no balloon overlaps', async ({ page }) => {
    // Multi-reset scenario: ~11 pops to level complete + reset + safe zone check
    // Budget: 11 pops × 4s avg (5s readiness limit, faster typical) + 5s reset + 6s check = ~53s
    // Set to 75s for slower VMs with high page.evaluate latency
    test.setTimeout(75000)
    
    await setBalloonCount(page, 3)
    
    let levelCompleteButton
    while (!levelCompleteButton || !(await levelCompleteButton.isVisible())) {
      await popCorrectBalloonAndWait(page)
      levelCompleteButton = page.locator('[data-testid="button-play-again"]')
    }
    
    await levelCompleteButton.click()
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '1280×800', 3, 'after-ui-reset')
  })
  
  test('Count 4: After UI reset, no balloon overlaps', async ({ page }) => {
    // Multi-reset scenario: ~11 pops to level complete + reset + safe zone check
    // Budget: 11 pops × 4s avg (5s readiness limit, faster typical) + 5s reset + 6s check = ~53s
    // Set to 75s for slower VMs with high page.evaluate latency
    test.setTimeout(75000)
    
    await setBalloonCount(page, 4)
    
    let levelCompleteButton
    while (!levelCompleteButton || !(await levelCompleteButton.isVisible())) {
      await popCorrectBalloonAndWait(page)
      levelCompleteButton = page.locator('[data-testid="button-play-again"]')
    }
    
    await levelCompleteButton.click()
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '1280×800', 4, 'after-ui-reset')
  })
  
  test('Count 5: After UI reset, no balloon overlaps', async ({ page }) => {
    // Multi-reset scenario: ~11 pops to level complete + reset + safe zone check
    // Budget: 11 pops × 4s avg (5s readiness limit, faster typical) + 5s reset + 6s check = ~53s
    // Set to 75s for slower VMs with high page.evaluate latency
    test.setTimeout(75000)
    
    await setBalloonCount(page, 5)
    
    let levelCompleteButton
    while (!levelCompleteButton || !(await levelCompleteButton.isVisible())) {
      await popCorrectBalloonAndWait(page)
      levelCompleteButton = page.locator('[data-testid="button-play-again"]')
    }
    
    await levelCompleteButton.click()
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '1280×800', 5, 'after-ui-reset')
  })
})

test.describe('Safe Zones - After Page Reload - 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  
  test('Count 3: After reload, no balloon overlaps', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Count 3 is default, but explicitly verify BEFORE reload
    const stateBefore = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateBefore.balloons.length).toBe(3)
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    // Verify count is still 3 AFTER reload
    const stateAfter = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateAfter.balloons.length).toBe(3)
    
    await checkSafeZonesContinuous(page, '1280×800', 3, 'after-reload')
  })
  
  test('Count 4: After reload, no balloon overlaps', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Set count to 4 via REAL UI settings
    await setBalloonCount(page, 4)
    
    // Verify count is 4 BEFORE reload
    const stateBefore = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateBefore.balloons.length).toBe(4)
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    // Verify count is still 4 AFTER reload (per spec K9)
    const stateAfter = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateAfter.balloons.length).toBe(4)
    
    await checkSafeZonesContinuous(page, '1280×800', 4, 'after-reload')
  })
  
  test('Count 5: After reload, no balloon overlaps', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Set count to 5 via REAL UI settings
    await setBalloonCount(page, 5)
    
    // Verify count is 5 BEFORE reload
    const stateBefore = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateBefore.balloons.length).toBe(5)
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    // Verify count is still 5 AFTER reload (per spec K9)
    const stateAfter = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateAfter.balloons.length).toBe(5)
    
    await checkSafeZonesContinuous(page, '1280×800', 5, 'after-reload')
  })
})

// MID-JUMP phase tests
/**
 * Check safe zones during cat jump animation
 * Target balloon may overlap cat, but nothing else should
 */
async function checkSafeZonesDuringJump(page: any, viewport: string, count: number) {
  const state = await page.evaluate(() => window.__tatematika!.getGameState())
  const correct = state.balloons.find((b: any) => b.isCorrect)!
  const targetBalloonId = correct.id
  
  // Click the correct balloon to start the jump
  await page.evaluate((id: string) => window.__tatematika!.clickBalloon(id), targetBalloonId)
  
  // Wait for jump to start
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return jumpState.isJumping
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  // Sample every 50ms during the jump
  const samples: any[] = []
  while (true) {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    if (!jumpState.isJumping) break
    
    const balloons = await getAllBalloonEllipses(page)
    const title = await getTitleBounds(page)
    const controls = await getControlBounds(page)
    const settingsBtn = await getSettingsButtonBounds(page)
    const cat = await getCatPaintedBounds(page)
    
    samples.push({
      balloons,
      title,
      controls,
      settingsBtn,
      cat,
      targetBalloonId
    })
    
    await page.waitForTimeout(50)
  }
  
  // Check all samples
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]
    
    // Check cat doesn't intersect title or controls
    const catBox = sample.cat
    const title = sample.title
    
    if (!(catBox.right < title.left || catBox.left > title.right ||
          catBox.bottom < title.top || catBox.top > title.bottom)) {
      throw new Error(
        `${viewport} count ${count} mid-jump sample ${i}: Cat at (${catBox.left.toFixed(1)}, ${catBox.top.toFixed(1)}) ` +
        `to (${catBox.right.toFixed(1)}, ${catBox.bottom.toFixed(1)}) intersects title at ` +
        `(${title.left.toFixed(1)}, ${title.top.toFixed(1)}) to (${title.right.toFixed(1)}, ${title.bottom.toFixed(1)})`
      )
    }
    
    for (const control of sample.controls) {
      const cb = control.bounds
      if (!(catBox.right < cb.left || catBox.left > cb.right ||
            catBox.bottom < cb.top || catBox.top > cb.bottom)) {
        throw new Error(
          `${viewport} count ${count} mid-jump sample ${i}: Cat intersects ${control.name} control`
        )
      }
    }
    
    if (sample.settingsBtn) {
      const sb = sample.settingsBtn
      if (!(catBox.right < sb.left || catBox.left > sb.right ||
            catBox.bottom < sb.top || catBox.top > sb.bottom)) {
        throw new Error(
          `${viewport} count ${count} mid-jump sample ${i}: Cat intersects settings button`
        )
      }
    }
    
    // Check balloons don't intersect title/controls/cat (except target)
    for (const balloon of sample.balloons) {
      const isTarget = balloon.id === sample.targetBalloonId
      
      // Check vs title
      if (ellipseIntersectsAABB(
        balloon.centerX, balloon.centerY,
        balloon.radiusX, balloon.radiusY,
        title.left, title.top, title.right, title.bottom
      )) {
        throw new Error(
          `${viewport} count ${count} mid-jump sample ${i}: Balloon ${balloon.id.substring(0, 20)}... ` +
          `intersects title`
        )
      }
      
      // Check vs controls
      for (const control of sample.controls) {
        if (ellipseIntersectsAABB(
          balloon.centerX, balloon.centerY,
          balloon.radiusX, balloon.radiusY,
          control.bounds.left, control.bounds.top,
          control.bounds.right, control.bounds.bottom
        )) {
          throw new Error(
            `${viewport} count ${count} mid-jump sample ${i}: Balloon ${balloon.id.substring(0, 20)}... ` +
            `intersects ${control.name} control`
          )
        }
      }
      
      // Check vs settings button
      if (sample.settingsBtn && ellipseIntersectsAABB(
        balloon.centerX, balloon.centerY,
        balloon.radiusX, balloon.radiusY,
        sample.settingsBtn.left, sample.settingsBtn.top,
        sample.settingsBtn.right, sample.settingsBtn.bottom
      )) {
        throw new Error(
          `${viewport} count ${count} mid-jump sample ${i}: Balloon ${balloon.id.substring(0, 20)}... ` +
          `intersects settings button`
        )
      }
      
      // Check vs cat (target balloon is allowed to overlap)
      if (!isTarget && ellipseIntersectsAABB(
        balloon.centerX, balloon.centerY,
        balloon.radiusX, balloon.radiusY,
        catBox.left, catBox.top, catBox.right, catBox.bottom
      )) {
        throw new Error(
          `${viewport} count ${count} mid-jump sample ${i}: Non-target balloon ${balloon.id.substring(0, 20)}... ` +
          `intersects cat`
        )
      }
    }
  }
  
  expect(samples.length, 'Should have captured jump samples').toBeGreaterThan(0)
}

test.describe('Safe Zones - Mid-Jump - 320×568', () => {
  test.use({ viewport: { width: 320, height: 568 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })
  
  test('Count 3: During jump, safe zones respected', async ({ page }) => {
    await setBalloonCount(page, 3)
    await checkSafeZonesDuringJump(page, '320×568', 3)
  })
  
  test('Count 4: During jump, safe zones respected', async ({ page }) => {
    await setBalloonCount(page, 4)
    await checkSafeZonesDuringJump(page, '320×568', 4)
  })
  
  test('Count 5: During jump, safe zones respected', async ({ page }) => {
    await setBalloonCount(page, 5)
    await checkSafeZonesDuringJump(page, '320×568', 5)
  })
})

test.describe('Safe Zones - Mid-Jump - 375×667', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })
  
  test('Count 3: During jump, safe zones respected', async ({ page }) => {
    await setBalloonCount(page, 3)
    await checkSafeZonesDuringJump(page, '375×667', 3)
  })
  
  test('Count 4: During jump, safe zones respected', async ({ page }) => {
    await setBalloonCount(page, 4)
    await checkSafeZonesDuringJump(page, '375×667', 4)
  })
  
  test('Count 5: During jump, safe zones respected', async ({ page }) => {
    await setBalloonCount(page, 5)
    await checkSafeZonesDuringJump(page, '375×667', 5)
  })
})

test.describe('Safe Zones - Mid-Jump - 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })
  
  test('Count 3: During jump, safe zones respected', async ({ page }) => {
    await setBalloonCount(page, 3)
    await checkSafeZonesDuringJump(page, '1280×800', 3)
  })
  
  test('Count 4: During jump, safe zones respected', async ({ page }) => {
    await setBalloonCount(page, 4)
    await checkSafeZonesDuringJump(page, '1280×800', 4)
  })
  
  test('Count 5: During jump, safe zones respected', async ({ page }) => {
    await setBalloonCount(page, 5)
    await checkSafeZonesDuringJump(page, '1280×800', 5)
  })
})

// PIXEL GROUND-TRUTH validation tests
import { PNG } from 'pngjs'

/**
 * Test if a CSS pixel is inside or near an ellipse (within tolerance band)
 */
function isPixelInEllipse(
  pixelX: number,
  pixelY: number,
  ellipseCenterX: number,
  ellipseCenterY: number,
  ellipseRadiusX: number,
  ellipseRadiusY: number,
  tolerance: number
): boolean {
  const dx = pixelX - ellipseCenterX
  const dy = pixelY - ellipseCenterY
  const rx = ellipseRadiusX + tolerance
  const ry = ellipseRadiusY + tolerance
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1
}

/**
 * Self-test: verify comparison would fail with shifted ellipse
 */
function selfTestPixelValidation() {
  // Create a simple test case: 100x100 image with one 40x30 ellipse
  const width = 100
  const height = 100
  const diff = new Uint8Array(width * height * 4)
  
  // Paint ellipse at (50, 50) with radii 20, 15
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isPixelInEllipse(x, y, 50, 50, 20, 15, 0)) {
        const idx = (y * width + x) * 4
        diff[idx] = 255
        diff[idx + 3] = 255
      }
    }
  }
  
  const ellipses = [{
    centerX: 50,
    centerY: 50,
    radiusX: 20,
    radiusY: 15,
    width: 40,
    height: 30,
    id: 'test'
  }]
  
  // Correct position should pass
  const correct = validatePixelEllipseMatch(diff, width, height, ellipses, 1.0)
  if (!correct.allMatch) {
    throw new Error('Self-test failed: correct ellipse should match')
  }
  
  // Shifted ellipse should fail
  const shifted = [{
    centerX: 70, // shifted +20px
    centerY: 50,
    radiusX: 20,
    radiusY: 15,
    width: 40,
    height: 30,
    id: 'test-shifted'
  }]
  
  const incorrect = validatePixelEllipseMatch(diff, width, height, shifted, 1.0)
  if (incorrect.allMatch) {
    throw new Error('Self-test failed: shifted ellipse should NOT match')
  }
  
  return true
}

/**
 * Assign changed pixels to balloon ellipses and validate
 */
function validatePixelEllipseMatch(
  diff: Uint8Array,
  width: number,
  height: number,
  ellipses: Array<{
    centerX: number
    centerY: number
    radiusX: number
    radiusY: number
    width: number
    height: number
    id: string
  }>,
  cssScale: number
): {
  allMatch: boolean
  balloonMatches: Array<{
    id: string
    pixelBbox: { left: number; top: number; right: number; bottom: number; width: number; height: number; centerX: number; centerY: number }
    commandBbox: { width: number; height: number; centerX: number; centerY: number }
    widthError: number
    heightError: number
    centerDistX: number
    centerDistY: number
    pixelCount: number
  }>
  totalChangedPixels: number
  coveredPixels: number
  coveragePercent: number
} {
  const tolerance = 3 // CSS pixels - accounts for antialiasing beyond commandBuffer geometry
  
  // Count changed pixels and assign to balloons
  const balloonPixels: Map<string, Set<string>> = new Map()
  ellipses.forEach(e => balloonPixels.set(e.id, new Set()))
  
  let totalChanged = 0
  let covered = 0
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      if (diff[idx] > 0 || diff[idx + 1] > 0 || diff[idx + 2] > 0 || diff[idx + 3] > 0) {
        totalChanged++
        
        // Check which ellipse(s) cover this pixel
        let anyCover = false
        for (const ellipse of ellipses) {
          if (isPixelInEllipse(x, y, ellipse.centerX, ellipse.centerY, ellipse.radiusX, ellipse.radiusY, tolerance)) {
            balloonPixels.get(ellipse.id)!.add(`${x},${y}`)
            anyCover = true
          }
        }
        if (anyCover) covered++
      }
    }
  }
  
  const coveragePercent = totalChanged > 0 ? (covered / totalChanged) * 100 : 0
  
  // Compute pixel bbox for each balloon
  const balloonMatches = ellipses.map(ellipse => {
    const pixels = balloonPixels.get(ellipse.id)!
    
    if (pixels.size === 0) {
      return {
        id: ellipse.id,
        pixelBbox: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, centerX: 0, centerY: 0 },
        commandBbox: { width: ellipse.width, height: ellipse.height, centerX: ellipse.centerX, centerY: ellipse.centerY },
        widthError: 1.0,
        heightError: 1.0,
        centerDistX: 9999,
        centerDistY: 9999,
        pixelCount: 0
      }
    }
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const coord of pixels) {
      const [x, y] = coord.split(',').map(Number)
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    
    const pixelBbox = {
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    }
    
    const widthError = Math.abs(pixelBbox.width - ellipse.width) / ellipse.width
    const heightError = Math.abs(pixelBbox.height - ellipse.height) / ellipse.height
    const centerDistX = Math.abs(pixelBbox.centerX - ellipse.centerX)
    const centerDistY = Math.abs(pixelBbox.centerY - ellipse.centerY)
    
    return {
      id: ellipse.id,
      pixelBbox,
      commandBbox: { width: ellipse.width, height: ellipse.height, centerX: ellipse.centerX, centerY: ellipse.centerY },
      widthError,
      heightError,
      centerDistX,
      centerDistY,
      pixelCount: pixels.size
    }
  })
  
  // All balloons must match
  const allMatch = balloonMatches.every(m => 
    m.widthError < 0.05 && 
    m.heightError < 0.05 && 
    m.centerDistX < 3 && 
    m.centerDistY < 3 &&
    m.pixelCount > 0
  ) && coveragePercent >= 95
  
  return {
    allMatch,
    balloonMatches,
    totalChangedPixels: totalChanged,
    coveredPixels: covered,
    coveragePercent
  }
}

test.describe('Pixel Ground-Truth Validation', () => {
  test('Self-test: shifted ellipse detection', () => {
    expect(selfTestPixelValidation()).toBe(true)
  })
  
  test('320×568 count 3: CommandBuffer bounds match painted pixels', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Count 3 is default, verify it
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(state.balloons.length).toBe(3)
    
    // Wait for game to be stable AND all balloons to be fully visible
    await page.waitForTimeout(500)
    
    // Wait until all balloons are fully spawned and visible
    await page.waitForFunction(() => {
      const game = (window as any).__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      if (!scene || !scene.balloonSprites) return false
      
      // Check all balloons are visible, on-canvas, and fully opaque
      return scene.balloonSprites.every((bs: any) => {
        if (!bs.sprite || !bs.sprite.visible || bs.sprite.alpha < 1) return false
        
        // Check balloon is within canvas bounds (with margin)
        const canvas = game.canvas
        const margin = 50
        return bs.x > margin && bs.x < canvas.width - margin &&
               bs.y > margin && bs.y < canvas.height - margin
      })
    }, { timeout: 5000 })
    
    // Get scale info
    const scaleInfo = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      return {
        gameWidth: game.scale.width,
        gameHeight: game.scale.height,
        cssWidth: rect.width,
        cssHeight: rect.height,
        scale: rect.width / game.scale.width,
        devicePixelRatio: window.devicePixelRatio || 1
      }
    })
    
    // Single attempt with proper render-without-update
    // Wrap freeze/capture in try/finally to ensure resume always runs
    let captureData: any
    let balloonData: any
    let screenshot1: Buffer
    let screenshot2: Buffer
    
    try {
      captureData = await page.evaluate(async () => {
        const game = window.__tatematika!.getGame()
        const scene = game.scene.getScene('GameScene') as any
        
        const getBalloonBounds = () => scene.balloonSprites.map((bs: any) => ({
          id: bs.id,
          worldX: bs.x,
          worldY: bs.y,
          displayX: bs.sprite.x,
          displayY: bs.sprite.y
        }))
        
        // Freeze everything
        scene.tweens.pauseAll()
        scene.time.paused = true
        if (scene.physics) scene.physics.pause()
        game.loop.sleep()
        
        // Wait for settle
        await new Promise(resolve => setTimeout(resolve, 200))
        
        const boundsBefore = getBalloonBounds()
        
        // Render WITHOUT stepping (Phaser 3.80 API)
        // Keep game loop asleep, manually render the scene
        const renderer = game.renderer
        const camera = scene.cameras.main
        
        renderer.preRender()
        scene.sys.render(renderer, scene.children, camera)
        renderer.postRender()
        
        // Wait for render to paint
        await new Promise(resolve => 
          requestAnimationFrame(() => 
            requestAnimationFrame(() => 
              requestAnimationFrame(() => 
                requestAnimationFrame(resolve)))))
        
        const boundsAfterFirst = getBalloonBounds()
        
        return { boundsBefore, boundsAfterFirst }
      })
      
      // Take screenshot 1 with Playwright
      screenshot1 = await page.locator('canvas').screenshot()
      
      // Get balloon geometry and hide for second screenshot
      balloonData = await page.evaluate(async () => {
        const game = window.__tatematika!.getGame()
        const scene = game.scene.getScene('GameScene') as any
        
        const getBalloonBounds = () => scene.balloonSprites.map((bs: any) => ({
          id: bs.id,
          worldX: bs.x,
          worldY: bs.y,
          displayX: bs.sprite.x,
          displayY: bs.sprite.y
        }))
        
        // Get balloon commandBuffer geometry
        const balloons = scene.balloonSprites.map((bs: any) => {
          const sprite = bs.sprite as any
          const commandBuffer = sprite.commandBuffer
          
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
          const Commands = { MOVE_TO: 5, LINE_TO: 4, FILL_PATH: 8 }
          let currentPath: Array<{ x: number; y: number }> = []
          
          let i = 0
          while (i < commandBuffer.length) {
            const cmd = commandBuffer[i++]
            if (cmd === Commands.MOVE_TO || cmd === Commands.LINE_TO) {
              currentPath.push({ x: commandBuffer[i], y: commandBuffer[i + 1] })
              i += 2
            } else if (cmd === Commands.FILL_PATH) {
              for (const p of currentPath) {
                minX = Math.min(minX, p.x)
                maxX = Math.max(maxX, p.x)
                minY = Math.min(minY, p.y)
                maxY = Math.max(maxY, p.y)
              }
              currentPath = []
            } else if (cmd >= 0 && cmd <= 2) {
              // no args
            } else if (cmd === 6) {
              i += 3
            } else if (cmd === 7) {
              i += 2
            } else if (cmd === 0) {
              i += 6
            } else if (cmd === 10) {
              i += 6
            }
          }
          
          const scaleX = sprite.scaleX || 1
          const scaleY = sprite.scaleY || 1
          const effectiveWidth = (maxX - minX) * scaleX
          const effectiveHeight = (maxY - minY) * scaleY
          
          return {
            id: bs.id,
            centerX: bs.x,
            centerY: bs.y,
            radiusX: effectiveWidth / 2,
            radiusY: effectiveHeight / 2,
            visible: bs.sprite.visible,
            alpha: bs.sprite.alpha
          }
        })
        
        // Hide balloons
        for (const bs of scene.balloonSprites) {
          bs.sprite.setVisible(false)
        }
        
        // Render WITHOUT stepping
        const renderer = game.renderer
        const camera = scene.cameras.main
        
        renderer.preRender()
        scene.sys.render(renderer, scene.children, camera)
        renderer.postRender()
        
        // Wait for render to paint
        await new Promise(resolve => 
          requestAnimationFrame(() => 
            requestAnimationFrame(() => 
              requestAnimationFrame(() => 
                requestAnimationFrame(resolve)))))
        
        const boundsAfterSecond = getBalloonBounds()
        
        return { balloons, boundsAfterSecond }
      })
      
      // Take screenshot 2 with Playwright
      screenshot2 = await page.locator('canvas').screenshot()
    } finally {
      // Always restore game state, even if capture or assertions throw
      await page.evaluate(() => {
        const game = window.__tatematika!.getGame()
        const scene = game.scene.getScene('GameScene') as any
        
        for (const bs of scene.balloonSprites) {
          bs.sprite.setVisible(true)
        }
        scene.tweens.resumeAll()
        scene.time.paused = false
        if (scene.physics) scene.physics.resume()
        game.loop.wake()
      })
    }
    
    // Verify positions stayed stable (<=0.5px tolerance)
    const allBounds = [
      ...captureData.boundsBefore,
      ...captureData.boundsAfterFirst,
      ...balloonData.boundsAfterSecond
    ]
    
    for (let i = 0; i < captureData.boundsBefore.length; i++) {
      const before = captureData.boundsBefore[i]
      const afterFirst = captureData.boundsAfterFirst[i]
      const afterSecond = balloonData.boundsAfterSecond[i]
      
      const driftFirst = Math.max(
        Math.abs(before.worldX - afterFirst.worldX),
        Math.abs(before.worldY - afterFirst.worldY)
      )
      const driftSecond = Math.max(
        Math.abs(before.worldX - afterSecond.worldX),
        Math.abs(before.worldY - afterSecond.worldY)
      )
      
      expect(driftFirst, `Balloon ${before.id} stayed frozen during first capture`).toBeLessThanOrEqual(0.5)
      expect(driftSecond, `Balloon ${before.id} stayed frozen during second capture`).toBeLessThanOrEqual(0.5)
    }
    
    // Decode Playwright screenshots
    const png1 = PNG.sync.read(screenshot1)
    const png2 = PNG.sync.read(screenshot2)
    
    expect(png1.width).toBe(png2.width)
    expect(png1.height).toBe(png2.height)
    
    // Compute diff
    const diff = new Uint8Array(png1.data.length)
    let changedPixelCount = 0
    for (let i = 0; i < png1.data.length; i += 4) {
      if (png1.data[i] !== png2.data[i] ||
          png1.data[i + 1] !== png2.data[i + 1] ||
          png1.data[i + 2] !== png2.data[i + 2] ||
          png1.data[i + 3] !== png2.data[i + 3]) {
        diff[i] = 255
        diff[i + 1] = 255
        diff[i + 2] = 255
        diff[i + 3] = 255
        changedPixelCount++
      }
    }
    
    // Check for empty diff (capture race)
    if (changedPixelCount === 0) {
      throw new Error('no balloon pixels changed between captures: capture race')
    }
    
    // Convert balloons to CSS pixel ellipses
    const ellipsesCSS = balloonData.balloons.map((b: any) => ({
      centerX: b.centerX * scaleInfo.scale,
      centerY: b.centerY * scaleInfo.scale,
      radiusX: b.radiusX * scaleInfo.scale,
      radiusY: b.radiusY * scaleInfo.scale,
      width: b.radiusX * 2 * scaleInfo.scale + 3,
      height: b.radiusY * 2 * scaleInfo.scale + 3,
      id: b.id,
      visible: b.visible,
      alpha: b.alpha
    }))
    
    // Validate pixel-ellipse match
    const validation = validatePixelEllipseMatch(diff, png1.width, png1.height, ellipsesCSS, scaleInfo.scale)
    
    // Check for balloons with 0 pixels and save artifacts
    const failedBalloons = validation.balloonMatches.filter(m => m.pixelCount === 0)
    if (failedBalloons.length > 0) {
      const fs = await import('fs')
      const path = await import('path')
      const artifactDir = `/opt/cursor/artifacts/pixel-fail-${Date.now()}`
      await fs.promises.mkdir(artifactDir, { recursive: true })
      
      // Save screenshots
      await fs.promises.writeFile(path.join(artifactDir, 'screenshot1.png'), screenshot1)
      await fs.promises.writeFile(path.join(artifactDir, 'screenshot2.png'), screenshot2)
      
      // Save diff mask
      const diffPng = new PNG({ width: png1.width, height: png1.height })
      diffPng.data = Buffer.from(diff)
      await fs.promises.writeFile(path.join(artifactDir, 'diff.png'), PNG.sync.write(diffPng))
      
      // Save debug info
      const debugInfo = {
        scaleInfo,
        balloons: ellipsesCSS,
        failedBalloons: failedBalloons.map(m => ({
          id: m.id,
          visible: ellipsesCSS.find((e: any) => e.id === m.id)?.visible,
          alpha: ellipsesCSS.find((e: any) => e.id === m.id)?.alpha,
          commandBox: m.commandBbox,
          pixelBox: m.pixelBbox,
          pixelCount: m.pixelCount
        })),
        allBounds
      }
      await fs.promises.writeFile(
        path.join(artifactDir, 'debug.json'),
        JSON.stringify(debugInfo, null, 2)
      )
      
      throw new Error(`Balloon(s) with 0 pixels detected. Artifacts saved to: ${artifactDir}. Failed: ${failedBalloons.map(m => m.id).join(', ')}`)
    }
    
    // Assert unconditionally for EVERY balloon
    for (const match of validation.balloonMatches) {
      expect(match.pixelCount,
        `Balloon ${match.id.substring(0, 20)}... has painted pixels`
      ).toBeGreaterThan(0)
      
      expect(match.widthError,
        `Balloon ${match.id.substring(0, 20)}... width (pixel: ${match.pixelBbox.width.toFixed(1)}, command+AA: ${match.commandBbox.width.toFixed(1)})`
      ).toBeLessThan(0.05)
      
      expect(match.heightError,
        `Balloon ${match.id.substring(0, 20)}... height (pixel: ${match.pixelBbox.height.toFixed(1)}, command+AA: ${match.commandBbox.height.toFixed(1)})`
      ).toBeLessThan(0.05)
      
      expect(match.centerDistX,
        `Balloon ${match.id.substring(0, 20)}... center X`
      ).toBeLessThan(3)
      
      expect(match.centerDistY,
        `Balloon ${match.id.substring(0, 20)}... center Y`
      ).toBeLessThan(3)
    }
    
    // Assert 95% coverage
    expect(validation.coveragePercent,
      `${validation.coveragePercent.toFixed(1)}% of ${validation.totalChangedPixels} changed pixels covered by ellipses`
    ).toBeGreaterThanOrEqual(95)
    
    console.log('Pixel validation results for 320×568 count 3:')
    console.table(validation.balloonMatches.map((m, i) => ({
      balloon: i + 1,
      pixelWidth: m.pixelBbox.width.toFixed(1),
      commandWidth: m.commandBbox.width.toFixed(1),
      widthError: (m.widthError * 100).toFixed(2) + '%',
      pixelHeight: m.pixelBbox.height.toFixed(1),
      commandHeight: m.commandBbox.height.toFixed(1),
      heightError: (m.heightError * 100).toFixed(2) + '%',
      centerDistX: m.centerDistX.toFixed(1) + 'px',
      centerDistY: m.centerDistY.toFixed(1) + 'px',
      pixels: m.pixelCount
    })))
    console.log(`Coverage: ${validation.coveragePercent.toFixed(1)}% (${validation.coveredPixels}/${validation.totalChangedPixels} pixels)`)
  })
  test('1280×800 count 5: CommandBuffer bounds match painted pixels', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Set count to 5 via REAL UI settings
    await setBalloonCount(page, 5)
    
    // Verify count is 5
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(state.balloons.length).toBe(5)
    
    // Wait for game to be stable AND all balloons to be fully visible
    await page.waitForTimeout(500)
    
    // Wait until all balloons are fully spawned and visible
    await page.waitForFunction(() => {
      const game = (window as any).__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      if (!scene || !scene.balloonSprites) return false
      
      // Check all balloons are visible, on-canvas, and fully opaque
      return scene.balloonSprites.every((bs: any) => {
        if (!bs.sprite || !bs.sprite.visible || bs.sprite.alpha < 1) return false
        
        // Check balloon is within canvas bounds (with margin)
        const canvas = game.canvas
        const margin = 50
        return bs.x > margin && bs.x < canvas.width - margin &&
               bs.y > margin && bs.y < canvas.height - margin
      })
    }, { timeout: 5000 })
    
    // Get scale info
    const scaleInfo = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      return {
        gameWidth: game.scale.width,
        gameHeight: game.scale.height,
        cssWidth: rect.width,
        cssHeight: rect.height,
        scale: rect.width / game.scale.width,
        devicePixelRatio: window.devicePixelRatio || 1
      }
    })
    
    // Single attempt with proper render-without-update
    // Wrap freeze/capture in try/finally to ensure resume always runs
    let captureData: any
    let balloonData: any
    let screenshot1: Buffer
    let screenshot2: Buffer
    
    try {
      captureData = await page.evaluate(async () => {
        const game = window.__tatematika!.getGame()
        const scene = game.scene.getScene('GameScene') as any
        
        const getBalloonBounds = () => scene.balloonSprites.map((bs: any) => ({
          id: bs.id,
          worldX: bs.x,
          worldY: bs.y,
          displayX: bs.sprite.x,
          displayY: bs.sprite.y
        }))
        
        // Freeze everything
        scene.tweens.pauseAll()
        scene.time.paused = true
        if (scene.physics) scene.physics.pause()
        game.loop.sleep()
        
        // Wait for settle
        await new Promise(resolve => setTimeout(resolve, 200))
        
        const boundsBefore = getBalloonBounds()
        
        // Render WITHOUT stepping (Phaser 3.80 API)
        // Keep game loop asleep, manually render the scene
        const renderer = game.renderer
        const camera = scene.cameras.main
        
        renderer.preRender()
        scene.sys.render(renderer, scene.children, camera)
        renderer.postRender()
        
        // Wait for render to paint
        await new Promise(resolve => 
          requestAnimationFrame(() => 
            requestAnimationFrame(() => 
              requestAnimationFrame(() => 
                requestAnimationFrame(resolve)))))
        
        const boundsAfterFirst = getBalloonBounds()
        
        return { boundsBefore, boundsAfterFirst }
      })
      
      // Take screenshot 1 with Playwright
      screenshot1 = await page.locator('canvas').screenshot()
      
      // Get balloon geometry and hide for second screenshot
      balloonData = await page.evaluate(async () => {
        const game = window.__tatematika!.getGame()
        const scene = game.scene.getScene('GameScene') as any
        
        const getBalloonBounds = () => scene.balloonSprites.map((bs: any) => ({
          id: bs.id,
          worldX: bs.x,
          worldY: bs.y,
          displayX: bs.sprite.x,
          displayY: bs.sprite.y
        }))
        
        // Get balloon commandBuffer geometry
        const balloons = scene.balloonSprites.map((bs: any) => {
          const sprite = bs.sprite as any
          const commandBuffer = sprite.commandBuffer
          
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
          const Commands = { MOVE_TO: 5, LINE_TO: 4, FILL_PATH: 8 }
          let currentPath: Array<{ x: number; y: number }> = []
          
          let i = 0
          while (i < commandBuffer.length) {
            const cmd = commandBuffer[i++]
            if (cmd === Commands.MOVE_TO || cmd === Commands.LINE_TO) {
              currentPath.push({ x: commandBuffer[i], y: commandBuffer[i + 1] })
              i += 2
            } else if (cmd === Commands.FILL_PATH) {
              for (const p of currentPath) {
                minX = Math.min(minX, p.x)
                maxX = Math.max(maxX, p.x)
                minY = Math.min(minY, p.y)
                maxY = Math.max(maxY, p.y)
              }
              currentPath = []
            } else if (cmd >= 0 && cmd <= 2) {
              // no args
            } else if (cmd === 6) {
              i += 3
            } else if (cmd === 7) {
              i += 2
            } else if (cmd === 0) {
              i += 6
            } else if (cmd === 10) {
              i += 6
            }
          }
          
          const scaleX = sprite.scaleX || 1
          const scaleY = sprite.scaleY || 1
          const effectiveWidth = (maxX - minX) * scaleX
          const effectiveHeight = (maxY - minY) * scaleY
          
          return {
            id: bs.id,
            centerX: bs.x,
            centerY: bs.y,
            radiusX: effectiveWidth / 2,
            radiusY: effectiveHeight / 2,
            visible: bs.sprite.visible,
            alpha: bs.sprite.alpha
          }
        })
        
        // Hide balloons
        for (const bs of scene.balloonSprites) {
          bs.sprite.setVisible(false)
        }
        
        // Render WITHOUT stepping
        const renderer = game.renderer
        const camera = scene.cameras.main
        
        renderer.preRender()
        scene.sys.render(renderer, scene.children, camera)
        renderer.postRender()
        
        // Wait for render to paint
        await new Promise(resolve => 
          requestAnimationFrame(() => 
            requestAnimationFrame(() => 
              requestAnimationFrame(() => 
                requestAnimationFrame(resolve)))))
        
        const boundsAfterSecond = getBalloonBounds()
        
        return { balloons, boundsAfterSecond }
      })
      
      // Take screenshot 2 with Playwright
      screenshot2 = await page.locator('canvas').screenshot()
    } finally {
      // Always restore game state, even if capture or assertions throw
      await page.evaluate(() => {
        const game = window.__tatematika!.getGame()
        const scene = game.scene.getScene('GameScene') as any
        
        for (const bs of scene.balloonSprites) {
          bs.sprite.setVisible(true)
        }
        scene.tweens.resumeAll()
        scene.time.paused = false
        if (scene.physics) scene.physics.resume()
        game.loop.wake()
      })
    }
    
    // Verify positions stayed stable (<=0.5px tolerance)
    const allBounds = [
      ...captureData.boundsBefore,
      ...captureData.boundsAfterFirst,
      ...balloonData.boundsAfterSecond
    ]
    
    for (let i = 0; i < captureData.boundsBefore.length; i++) {
      const before = captureData.boundsBefore[i]
      const afterFirst = captureData.boundsAfterFirst[i]
      const afterSecond = balloonData.boundsAfterSecond[i]
      
      const driftFirst = Math.max(
        Math.abs(before.worldX - afterFirst.worldX),
        Math.abs(before.worldY - afterFirst.worldY)
      )
      const driftSecond = Math.max(
        Math.abs(before.worldX - afterSecond.worldX),
        Math.abs(before.worldY - afterSecond.worldY)
      )
      
      expect(driftFirst, `Balloon ${before.id} stayed frozen during first capture`).toBeLessThanOrEqual(0.5)
      expect(driftSecond, `Balloon ${before.id} stayed frozen during second capture`).toBeLessThanOrEqual(0.5)
    }
    
    // Decode Playwright screenshots
    const png1 = PNG.sync.read(screenshot1)
    const png2 = PNG.sync.read(screenshot2)
    
    expect(png1.width).toBe(png2.width)
    expect(png1.height).toBe(png2.height)
    
    // Compute diff
    const diff = new Uint8Array(png1.data.length)
    let changedPixelCount = 0
    for (let i = 0; i < png1.data.length; i += 4) {
      if (png1.data[i] !== png2.data[i] ||
          png1.data[i + 1] !== png2.data[i + 1] ||
          png1.data[i + 2] !== png2.data[i + 2] ||
          png1.data[i + 3] !== png2.data[i + 3]) {
        diff[i] = 255
        diff[i + 1] = 255
        diff[i + 2] = 255
        diff[i + 3] = 255
        changedPixelCount++
      }
    }
    
    // Check for empty diff (capture race)
    if (changedPixelCount === 0) {
      throw new Error('no balloon pixels changed between captures: capture race')
    }
    
    // Convert balloons to CSS pixel ellipses
    const ellipsesCSS = balloonData.balloons.map((b: any) => ({
      centerX: b.centerX * scaleInfo.scale,
      centerY: b.centerY * scaleInfo.scale,
      radiusX: b.radiusX * scaleInfo.scale,
      radiusY: b.radiusY * scaleInfo.scale,
      width: b.radiusX * 2 * scaleInfo.scale + 3,
      height: b.radiusY * 2 * scaleInfo.scale + 3,
      id: b.id,
      visible: b.visible,
      alpha: b.alpha
    }))
    
    // Validate pixel-ellipse match
    const validation = validatePixelEllipseMatch(diff, png1.width, png1.height, ellipsesCSS, scaleInfo.scale)
    
    // Check for balloons with 0 pixels and save artifacts
    const failedBalloons = validation.balloonMatches.filter(m => m.pixelCount === 0)
    if (failedBalloons.length > 0) {
      const fs = await import('fs')
      const path = await import('path')
      const artifactDir = `/opt/cursor/artifacts/pixel-fail-${Date.now()}`
      await fs.promises.mkdir(artifactDir, { recursive: true })
      
      // Save screenshots
      await fs.promises.writeFile(path.join(artifactDir, 'screenshot1.png'), screenshot1)
      await fs.promises.writeFile(path.join(artifactDir, 'screenshot2.png'), screenshot2)
      
      // Save diff mask
      const diffPng = new PNG({ width: png1.width, height: png1.height })
      diffPng.data = Buffer.from(diff)
      await fs.promises.writeFile(path.join(artifactDir, 'diff.png'), PNG.sync.write(diffPng))
      
      // Save debug info
      const debugInfo = {
        scaleInfo,
        balloons: ellipsesCSS,
        failedBalloons: failedBalloons.map(m => ({
          id: m.id,
          visible: ellipsesCSS.find((e: any) => e.id === m.id)?.visible,
          alpha: ellipsesCSS.find((e: any) => e.id === m.id)?.alpha,
          commandBox: m.commandBbox,
          pixelBox: m.pixelBbox,
          pixelCount: m.pixelCount
        })),
        allBounds
      }
      await fs.promises.writeFile(
        path.join(artifactDir, 'debug.json'),
        JSON.stringify(debugInfo, null, 2)
      )
      
      throw new Error(`Balloon(s) with 0 pixels detected. Artifacts saved to: ${artifactDir}. Failed: ${failedBalloons.map(m => m.id).join(', ')}`)
    }
    
    // Assert unconditionally for EVERY balloon
    for (const match of validation.balloonMatches) {
      expect(match.pixelCount,
        `Balloon ${match.id.substring(0, 20)}... has painted pixels`
      ).toBeGreaterThan(0)
      
      expect(match.widthError,
        `Balloon ${match.id.substring(0, 20)}... width (pixel: ${match.pixelBbox.width.toFixed(1)}, command+AA: ${match.commandBbox.width.toFixed(1)})`
      ).toBeLessThan(0.05)
      
      expect(match.heightError,
        `Balloon ${match.id.substring(0, 20)}... height (pixel: ${match.pixelBbox.height.toFixed(1)}, command+AA: ${match.commandBbox.height.toFixed(1)})`
      ).toBeLessThan(0.05)
      
      expect(match.centerDistX,
        `Balloon ${match.id.substring(0, 20)}... center X`
      ).toBeLessThan(3)
      
      expect(match.centerDistY,
        `Balloon ${match.id.substring(0, 20)}... center Y`
      ).toBeLessThan(3)
    }
    
    // Assert 95% coverage
    expect(validation.coveragePercent,
      `${validation.coveragePercent.toFixed(1)}% of ${validation.totalChangedPixels} changed pixels covered by ellipses`
    ).toBeGreaterThanOrEqual(95)
    
    console.log('Pixel validation results for 1280×800 count 5:')
    console.table(validation.balloonMatches.map((m, i) => ({
      balloon: i + 1,
      pixelWidth: m.pixelBbox.width.toFixed(1),
      commandWidth: m.commandBbox.width.toFixed(1),
      widthError: (m.widthError * 100).toFixed(2) + '%',
      pixelHeight: m.pixelBbox.height.toFixed(1),
      commandHeight: m.commandBbox.height.toFixed(1),
      heightError: (m.heightError * 100).toFixed(2) + '%',
      centerDistX: m.centerDistX.toFixed(1) + 'px',
      centerDistY: m.centerDistY.toFixed(1) + 'px',
      pixels: m.pixelCount
    })))
    console.log(`Coverage: ${validation.coveragePercent.toFixed(1)}% (${validation.coveredPixels}/${validation.totalChangedPixels} pixels)`)
  })


})
