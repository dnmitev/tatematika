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
    await page.goto('/?balloonCount=3')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '320×568', 3, 'after-reload')
  })
  
  test('Count 4: After reload, no balloon overlaps', async ({ page }) => {
    await page.goto('/?balloonCount=4')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '320×568', 4, 'after-reload')
  })
  
  test('Count 5: After reload, no balloon overlaps', async ({ page }) => {
    await page.goto('/?balloonCount=5')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
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
    await page.goto('/?balloonCount=3')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '375×667', 3, 'after-reload')
  })
  
  test('Count 4: After reload, no balloon overlaps', async ({ page }) => {
    await page.goto('/?balloonCount=4')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '375×667', 4, 'after-reload')
  })
  
  test('Count 5: After reload, no balloon overlaps', async ({ page }) => {
    await page.goto('/?balloonCount=5')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
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
    await page.goto('/?balloonCount=3')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '1280×800', 3, 'after-reload')
  })
  
  test('Count 4: After reload, no balloon overlaps', async ({ page }) => {
    await page.goto('/?balloonCount=4')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    await checkSafeZonesContinuous(page, '1280×800', 4, 'after-reload')
  })
  
  test('Count 5: After reload, no balloon overlaps', async ({ page }) => {
    await page.goto('/?balloonCount=5')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
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
 * Label connected components in a binary image
 * Returns array of component labels (0 = background, 1+ = component ID)
 */
function labelConnectedComponents(pixels: Uint8Array, width: number, height: number): {
  labels: number[]
  numComponents: number
} {
  const labels = new Array(width * height).fill(0)
  let nextLabel = 1
  
  // Union-find structure
  const parent: number[] = []
  function find(x: number): number {
    if (parent[x] !== x) {
      parent[x] = find(parent[x])
    }
    return parent[x]
  }
  function union(x: number, y: number) {
    const px = find(x)
    const py = find(y)
    if (px !== py) {
      parent[px] = py
    }
  }
  
  // First pass: assign labels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const pixelIdx = idx * 4
      
      // Check if this is a foreground pixel (any RGBA channel non-zero)
      if (pixels[pixelIdx] === 0 && pixels[pixelIdx + 1] === 0 && 
          pixels[pixelIdx + 2] === 0 && pixels[pixelIdx + 3] === 0) {
        continue
      }
      
      const neighbors: number[] = []
      
      // Check left neighbor
      if (x > 0) {
        const leftLabel = labels[idx - 1]
        if (leftLabel > 0) neighbors.push(leftLabel)
      }
      
      // Check top neighbor
      if (y > 0) {
        const topLabel = labels[idx - width]
        if (topLabel > 0) neighbors.push(topLabel)
      }
      
      if (neighbors.length === 0) {
        labels[idx] = nextLabel
        parent[nextLabel] = nextLabel
        nextLabel++
      } else {
        const minLabel = Math.min(...neighbors)
        labels[idx] = minLabel
        for (const n of neighbors) {
          if (n !== minLabel) {
            union(n, minLabel)
          }
        }
      }
    }
  }
  
  // Second pass: flatten labels
  const labelMap = new Map<number, number>()
  let finalLabel = 1
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] > 0) {
      const root = find(labels[i])
      if (!labelMap.has(root)) {
        labelMap.set(root, finalLabel++)
      }
      labels[i] = labelMap.get(root)!
    }
  }
  
  return {
    labels,
    numComponents: finalLabel - 1
  }
}

/**
 * Compute bounding boxes for each component
 */
function computeComponentBounds(labels: number[], width: number, height: number, numComponents: number): Array<{
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  centerX: number
  centerY: number
}> {
  const bounds: Array<{
    left: number
    top: number
    right: number
    bottom: number
  }> = []
  
  for (let i = 0; i <= numComponents; i++) {
    bounds.push({
      left: Infinity,
      top: Infinity,
      right: -Infinity,
      bottom: -Infinity
    })
  }
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x]
      if (label > 0) {
        bounds[label].left = Math.min(bounds[label].left, x)
        bounds[label].top = Math.min(bounds[label].top, y)
        bounds[label].right = Math.max(bounds[label].right, x)
        bounds[label].bottom = Math.max(bounds[label].bottom, y)
      }
    }
  }
  
  return bounds.slice(1).map(b => ({
    left: b.left,
    top: b.top,
    right: b.right,
    bottom: b.bottom,
    width: b.right - b.left + 1,
    height: b.bottom - b.top + 1,
    centerX: (b.left + b.right) / 2,
    centerY: (b.top + b.bottom) / 2
  }))
}

test.describe('Pixel Ground-Truth Validation', () => {
  test('320×568 count 3: CommandBuffer bounds match painted pixels', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/?balloonCount=3')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Wait for game to be stable
    await page.waitForTimeout(500)
    
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
        scale: rect.width / game.scale.width
      }
    })
    
    // Freeze the game loop and take screenshot with balloons
    const screenshot1Buffer = await page.evaluate(async () => {
      const game = window.__tatematika!.getGame()
      
      try {
        game.loop.sleep()
      } catch (e) {
        return { error: 'Failed to freeze game loop', exception: String(e) }
      }
      
      const canvas = document.querySelector('canvas') as HTMLCanvasElement
      const dataUrl = canvas.toDataURL()
      return { dataUrl }
    })
    
    if ('error' in screenshot1Buffer) {
      throw new Error(`Failed to freeze game: ${screenshot1Buffer.error}: ${screenshot1Buffer.exception}`)
    }
    
    // Get balloon positions before hiding
    const balloonsBefore = await getAllBalloonEllipses(page)
    
    // Hide balloons and their text, render one frame, take screenshot
    const screenshot2Buffer = await page.evaluate(async () => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      
      // Hide balloon graphics and text
      const hiddenObjects: any[] = []
      for (const bs of scene.balloonSprites) {
        bs.sprite.setVisible(false)
        hiddenObjects.push(bs.sprite)
        if (bs.formulaText) {
          bs.formulaText.setVisible(false)
          hiddenObjects.push(bs.formulaText)
        }
      }
      
      // Force one render
      game.loop.wake()
      game.loop.step(performance.now())
      game.loop.sleep()
      
      const canvas = document.querySelector('canvas') as HTMLCanvasElement
      const dataUrl = canvas.toDataURL()
      
      // Restore visibility
      for (const obj of hiddenObjects) {
        obj.setVisible(true)
      }
      
      // Wake the loop
      game.loop.wake()
      
      return { dataUrl }
    })
    
    // Get balloon positions after (should be same)
    const balloonsAfter = await getAllBalloonEllipses(page)
    
    // Check balloon centers didn't move
    for (let i = 0; i < balloonsBefore.length; i++) {
      const before = balloonsBefore[i]
      const after = balloonsAfter.find(b => b.id === before.id)!
      expect(Math.abs(before.centerX - after.centerX), 
        `Balloon ${before.id} X didn't move`).toBeLessThan(0.1)
      expect(Math.abs(before.centerY - after.centerY),
        `Balloon ${before.id} Y didn't move`).toBeLessThan(0.1)
    }
    
    // Decode screenshots
    const png1 = PNG.sync.read(Buffer.from(screenshot1Buffer.dataUrl.split(',')[1], 'base64'))
    const png2 = PNG.sync.read(Buffer.from(screenshot2Buffer.dataUrl.split(',')[1], 'base64'))
    
    expect(png1.width).toBe(png2.width)
    expect(png1.height).toBe(png2.height)
    
    // Compute diff
    const diff = Buffer.alloc(png1.data.length)
    for (let i = 0; i < png1.data.length; i += 4) {
      if (png1.data[i] !== png2.data[i] ||
          png1.data[i + 1] !== png2.data[i + 1] ||
          png1.data[i + 2] !== png2.data[i + 2] ||
          png1.data[i + 3] !== png2.data[i + 3]) {
        diff[i] = 255
        diff[i + 1] = 255
        diff[i + 2] = 255
        diff[i + 3] = 255
      }
    }
    
    // Label connected components
    const { labels, numComponents } = labelConnectedComponents(
      new Uint8Array(diff),
      png1.width,
      png1.height
    )
    
    expect(numComponents, 'Number of balloon regions').toBe(balloonsBefore.length)
    
    // Compute pixel bounding boxes
    const pixelBounds = computeComponentBounds(labels, png1.width, png1.height, numComponents)
    
    // Convert commandBuffer ellipses to CSS pixel bboxes
    const commandBufferBounds = balloonsBefore.map(b => {
      const left = (b.centerX - b.radiusX) * scaleInfo.scale
      const right = (b.centerX + b.radiusX) * scaleInfo.scale
      const top = (b.centerY - b.radiusY) * scaleInfo.scale
      const bottom = (b.centerY + b.radiusY) * scaleInfo.scale
      
      return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
        centerX: (left + right) / 2,
        centerY: (top + bottom) / 2,
        id: b.id
      }
    })
    
    // Match each pixel region to nearest commandBuffer region
    const matches: Array<{
      pixelBounds: any
      commandBounds: any
      widthError: number
      heightError: number
      centerDistX: number
      centerDistY: number
    }> = []
    
    for (const pb of pixelBounds) {
      // Find nearest commandBuffer bounds by center distance
      let nearest = commandBufferBounds[0]
      let minDist = Infinity
      
      for (const cb of commandBufferBounds) {
        const dist = Math.sqrt(
          Math.pow(pb.centerX - cb.centerX, 2) +
          Math.pow(pb.centerY - cb.centerY, 2)
        )
        if (dist < minDist) {
          minDist = dist
          nearest = cb
        }
      }
      
      const widthError = Math.abs(pb.width - nearest.width) / nearest.width
      const heightError = Math.abs(pb.height - nearest.height) / nearest.height
      const centerDistX = Math.abs(pb.centerX - nearest.centerX)
      const centerDistY = Math.abs(pb.centerY - nearest.centerY)
      
      matches.push({
        pixelBounds: pb,
        commandBounds: nearest,
        widthError,
        heightError,
        centerDistX,
        centerDistY
      })
      
      // Assert bounds match within tolerance
      expect(widthError, 
        `Balloon width match (pixel: ${pb.width.toFixed(1)}, command: ${nearest.width.toFixed(1)})`
      ).toBeLessThan(0.05)
      
      expect(heightError,
        `Balloon height match (pixel: ${pb.height.toFixed(1)}, command: ${nearest.height.toFixed(1)})`
      ).toBeLessThan(0.05)
      
      expect(centerDistX, 'Balloon center X match').toBeLessThan(3)
      expect(centerDistY, 'Balloon center Y match').toBeLessThan(3)
    }
    
    console.log('Pixel validation results for 320×568 count 3:')
    console.table(matches.map((m, i) => ({
      balloon: i + 1,
      pixelWidth: m.pixelBounds.width.toFixed(1),
      commandWidth: m.commandBounds.width.toFixed(1),
      widthError: (m.widthError * 100).toFixed(2) + '%',
      pixelHeight: m.pixelBounds.height.toFixed(1),
      commandHeight: m.commandBounds.height.toFixed(1),
      heightError: (m.heightError * 100).toFixed(2) + '%',
      centerDistX: m.centerDistX.toFixed(1) + 'px',
      centerDistY: m.centerDistY.toFixed(1) + 'px'
    })))
  })
  
  test('1280×800 count 5: CommandBuffer bounds match painted pixels', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/?balloonCount=5')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    await page.waitForTimeout(500)
    
    const scaleInfo = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      return {
        gameWidth: game.scale.width,
        gameHeight: game.scale.height,
        cssWidth: rect.width,
        cssHeight: rect.height,
        scale: rect.width / game.scale.width
      }
    })
    
    const screenshot1Buffer = await page.evaluate(async () => {
      const game = window.__tatematika!.getGame()
      
      try {
        game.loop.sleep()
      } catch (e) {
        return { error: 'Failed to freeze game loop', exception: String(e) }
      }
      
      const canvas = document.querySelector('canvas') as HTMLCanvasElement
      const dataUrl = canvas.toDataURL()
      return { dataUrl }
    })
    
    if ('error' in screenshot1Buffer) {
      throw new Error(`Failed to freeze game: ${screenshot1Buffer.error}: ${screenshot1Buffer.exception}`)
    }
    
    const balloonsBefore = await getAllBalloonEllipses(page)
    
    const screenshot2Buffer = await page.evaluate(async () => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      
      const hiddenObjects: any[] = []
      for (const bs of scene.balloonSprites) {
        bs.sprite.setVisible(false)
        hiddenObjects.push(bs.sprite)
        if (bs.formulaText) {
          bs.formulaText.setVisible(false)
          hiddenObjects.push(bs.formulaText)
        }
      }
      
      game.loop.wake()
      game.loop.step(performance.now())
      game.loop.sleep()
      
      const canvas = document.querySelector('canvas') as HTMLCanvasElement
      const dataUrl = canvas.toDataURL()
      
      for (const obj of hiddenObjects) {
        obj.setVisible(true)
      }
      
      game.loop.wake()
      
      return { dataUrl }
    })
    
    const balloonsAfter = await getAllBalloonEllipses(page)
    
    for (let i = 0; i < balloonsBefore.length; i++) {
      const before = balloonsBefore[i]
      const after = balloonsAfter.find(b => b.id === before.id)!
      expect(Math.abs(before.centerX - after.centerX)).toBeLessThan(0.1)
      expect(Math.abs(before.centerY - after.centerY)).toBeLessThan(0.1)
    }
    
    const png1 = PNG.sync.read(Buffer.from(screenshot1Buffer.dataUrl.split(',')[1], 'base64'))
    const png2 = PNG.sync.read(Buffer.from(screenshot2Buffer.dataUrl.split(',')[1], 'base64'))
    
    expect(png1.width).toBe(png2.width)
    expect(png1.height).toBe(png2.height)
    
    const diff = Buffer.alloc(png1.data.length)
    for (let i = 0; i < png1.data.length; i += 4) {
      if (png1.data[i] !== png2.data[i] ||
          png1.data[i + 1] !== png2.data[i + 1] ||
          png1.data[i + 2] !== png2.data[i + 2] ||
          png1.data[i + 3] !== png2.data[i + 3]) {
        diff[i] = 255
        diff[i + 1] = 255
        diff[i + 2] = 255
        diff[i + 3] = 255
      }
    }
    
    const { labels, numComponents } = labelConnectedComponents(
      new Uint8Array(diff),
      png1.width,
      png1.height
    )
    
    expect(numComponents, 'Number of balloon regions').toBe(balloonsBefore.length)
    
    const pixelBounds = computeComponentBounds(labels, png1.width, png1.height, numComponents)
    
    const commandBufferBounds = balloonsBefore.map(b => {
      const left = (b.centerX - b.radiusX) * scaleInfo.scale
      const right = (b.centerX + b.radiusX) * scaleInfo.scale
      const top = (b.centerY - b.radiusY) * scaleInfo.scale
      const bottom = (b.centerY + b.radiusY) * scaleInfo.scale
      
      return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
        centerX: (left + right) / 2,
        centerY: (top + bottom) / 2,
        id: b.id
      }
    })
    
    const matches: Array<{
      pixelBounds: any
      commandBounds: any
      widthError: number
      heightError: number
      centerDistX: number
      centerDistY: number
    }> = []
    
    for (const pb of pixelBounds) {
      let nearest = commandBufferBounds[0]
      let minDist = Infinity
      
      for (const cb of commandBufferBounds) {
        const dist = Math.sqrt(
          Math.pow(pb.centerX - cb.centerX, 2) +
          Math.pow(pb.centerY - cb.centerY, 2)
        )
        if (dist < minDist) {
          minDist = dist
          nearest = cb
        }
      }
      
      const widthError = Math.abs(pb.width - nearest.width) / nearest.width
      const heightError = Math.abs(pb.height - nearest.height) / nearest.height
      const centerDistX = Math.abs(pb.centerX - nearest.centerX)
      const centerDistY = Math.abs(pb.centerY - nearest.centerY)
      
      matches.push({
        pixelBounds: pb,
        commandBounds: nearest,
        widthError,
        heightError,
        centerDistX,
        centerDistY
      })
      
      expect(widthError, 
        `Balloon width match (pixel: ${pb.width.toFixed(1)}, command: ${nearest.width.toFixed(1)})`
      ).toBeLessThan(0.05)
      
      expect(heightError,
        `Balloon height match (pixel: ${pb.height.toFixed(1)}, command: ${nearest.height.toFixed(1)})`
      ).toBeLessThan(0.05)
      
      expect(centerDistX, 'Balloon center X match').toBeLessThan(3)
      expect(centerDistY, 'Balloon center Y match').toBeLessThan(3)
    }
    
    console.log('Pixel validation results for 1280×800 count 5:')
    console.table(matches.map((m, i) => ({
      balloon: i + 1,
      pixelWidth: m.pixelBounds.width.toFixed(1),
      commandWidth: m.commandBounds.width.toFixed(1),
      widthError: (m.widthError * 100).toFixed(2) + '%',
      pixelHeight: m.pixelBounds.height.toFixed(1),
      commandHeight: m.commandBounds.height.toFixed(1),
      heightError: (m.heightError * 100).toFixed(2) + '%',
      centerDistX: m.centerDistX.toFixed(1) + 'px',
      centerDistY: m.centerDistY.toFixed(1) + 'px'
    })))
  })
})


