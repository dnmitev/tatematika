import { test, expect } from '@playwright/test'

/**
 * K12-K16: Input During Action Tests
 * 
 * After the cat accepts a balloon choice and executes movement/jump/landing,
 * all subsequent inputs (mouse clicks, touch, keyboard) are completely ignored.
 * They do not change the target, count as errors, change stars/hints,
 * produce feedback/bounce, or queue future actions.
 * 
 * The initially accepted choice completes and is evaluated exactly once with
 * normal feedback for correct/wrong. After landing and completing the current
 * action, a new choice can be accepted normally; rejected inputs are never
 * re-executed.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
})

async function getCanvasCoordinates(page: any) {
  return await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const canvas = document.querySelector('canvas')!
    const rect = canvas.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      scale: rect.width / game.scale.width
    }
  })
}

async function clickBalloon(page: any, balloonId: string, canvas: any) {
  const bounds = await page.evaluate((id) => 
    window.__tatematika!.getBalloonBounds(id), balloonId)
  
  const clickX = canvas.left + (bounds.x + bounds.width / 2) * canvas.scale
  const clickY = canvas.top + (bounds.y + bounds.height / 2) * canvas.scale
  
  await page.mouse.click(clickX, clickY)
}

test('K12: Repeated inputs during correct balloon action are fully ignored', async ({ page }) => {
  // Wait for cat to be idle
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  const state = await page.evaluate(() => window.__tatematika!.getGameState())
  const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
  const initialStars = state.stars
  const initialTarget = state.target
  
  const canvas = await getCanvasCoordinates(page)
  
  // Click correct balloon to start action
  await clickBalloon(page, correctBalloon.id, canvas)
  
  // Poll until cat is in action (jumping)
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return jumpState.isJumping
  }, { timeout: 1000, intervals: [10] }).toBe(true)
  
  // Make multiple additional clicks during action
  const otherBalloons = state.balloons.filter((b: any) => !b.isCorrect)
  for (let i = 0; i < 3; i++) {
    await clickBalloon(page, correctBalloon.id, canvas)
    if (otherBalloons[0]) {
      await clickBalloon(page, otherBalloons[0].id, canvas)
    }
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowUp')
  }
  
  // Wait for action to complete
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  // Verify star increased exactly once
  const newState = await page.evaluate(() => window.__tatematika!.getGameState())
  expect(newState.stars, 'Stars should increase exactly once').toBe(initialStars + 1)
  
  // Verify new round started (target changed)
  expect(newState.target !== initialTarget || newState.balloons[0].id !== state.balloons[0].id, 
    'New round should have started').toBe(true)
  
  // Verify cat is idle and ready for next input
  const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
  expect(jumpState.isJumping, 'Cat should be idle after landing').toBe(false)
})

test('K13: Repeated inputs during wrong balloon action are fully ignored', async ({ page }) => {
  // Instrument to detect bounce/sound
  await page.addInitScript(() => {
    (window as any).__bounceCount = 0
    const game = (window as any).__tatematika?.getGame?.()
    if (game) {
      const scene = game.scene?.getScene?.('GameScene')
      if (scene) {
        const originalBounce = scene.bounceBalloon
        if (originalBounce) {
          scene.bounceBalloon = function(...args: any[]) {
            (window as any).__bounceCount++
            return originalBounce.apply(this, args)
          }
        }
      }
    }
  })
  
  await page.goto('/')
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  
  // Wait for cat to be idle
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  const state = await page.evaluate(() => window.__tatematika!.getGameState())
  const wrongBalloons = state.balloons.filter((b: any) => !b.isCorrect)
  const wrongBalloon = wrongBalloons[0]
  const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
  const initialWrongAttempts = state.wrongAttempts
  const initialStars = state.stars
  
  const canvas = await getCanvasCoordinates(page)
  
  // Click wrong balloon to start action
  await clickBalloon(page, wrongBalloon.id, canvas)
  
  // Poll until cat is in action (jumping)
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return jumpState.isJumping
  }, { timeout: 1000, intervals: [10] }).toBe(true)
  
  // Make multiple additional clicks during action
  for (let i = 0; i < 3; i++) {
    await clickBalloon(page, correctBalloon.id, canvas)
    await clickBalloon(page, wrongBalloon.id, canvas)
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowLeft')
  }
  
  // Wait for action to complete
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  // Verify wrongAttempts increased exactly once
  const newState = await page.evaluate(() => window.__tatematika!.getGameState())
  expect(newState.wrongAttempts, 'Wrong attempts should increase exactly once').toBe(initialWrongAttempts + 1)
  
  // Verify stars unchanged
  expect(newState.stars, 'Stars should not change').toBe(initialStars)
  
  // Verify same round (balloons unchanged)
  expect(newState.target, 'Target should remain same').toBe(state.target)
  
  // Verify cat is idle
  const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
  expect(jumpState.isJumping, 'Cat should be idle after landing').toBe(false)
})

test('K14: No re-execution of rejected inputs after landing', async ({ page }) => {
  // Wait for cat to be idle
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  const state = await page.evaluate(() => window.__tatematika!.getGameState())
  const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
  const wrongBalloons = state.balloons.filter((b: any) => !b.isCorrect)
  
  const canvas = await getCanvasCoordinates(page)
  
  // Click correct balloon to start action
  await clickBalloon(page, correctBalloon.id, canvas)
  
  // Poll until jumping
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return jumpState.isJumping
  }, { timeout: 1000, intervals: [10] }).toBe(true)
  
  // Click wrong balloon multiple times during action (these should be rejected)
  if (wrongBalloons[0]) {
    for (let i = 0; i < 5; i++) {
      await clickBalloon(page, wrongBalloons[0].id, canvas)
    }
  }
  
  // Wait for action to complete and new round to start
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    return !jumpState.isJumping && newState.stars > state.stars
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  // Wait a bit to see if any rejected inputs are re-executed
  await page.waitForTimeout(500)
  
  // Verify cat is still idle (no automatic action started)
  const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
  expect(jumpState.isJumping, 'Cat should still be idle - rejected inputs not re-executed').toBe(false)
  
  // Verify no wrongAttempts from rejected inputs
  const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
  expect(finalState.wrongAttempts, 'No errors from rejected inputs').toBe(0)
})

test('K15: New input accepted after action completes', async ({ page }) => {
  // Wait for cat to be idle
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  const state = await page.evaluate(() => window.__tatematika!.getGameState())
  const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
  
  const canvas = await getCanvasCoordinates(page)
  
  // Click correct balloon
  await clickBalloon(page, correctBalloon.id, canvas)
  
  // Wait for action to complete and new round
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    return !jumpState.isJumping && newState.stars > state.stars
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  // Now try new input - it should be accepted
  const newState = await page.evaluate(() => window.__tatematika!.getGameState())
  const newCorrectBalloon = newState.balloons.find((b: any) => b.isCorrect)!
  
  await clickBalloon(page, newCorrectBalloon.id, canvas)
  
  // Verify new action started
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return jumpState.isJumping
  }, { timeout: 1000, intervals: [10] }).toBe(true)
  
  // Wait for completion
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  // Verify another star
  const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
  expect(finalState.stars, 'New input should be processed normally').toBe(newState.stars + 1)
})
