import { test, expect } from '@playwright/test'

/**
 * K16: Input During Action - Mobile (Touch + Mouse + Keyboard)
 * 
 * Equivalent behavior across devices: inputs during action are fully ignored
 * on touch, mouse, and keyboard, with identical behavior.
 */

test.describe('K16: Input During Action - Mobile @mobile', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true })
  
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

  async function tapBalloon(page: any, balloonId: string, canvas: any) {
    const bounds = await page.evaluate((id) => 
      window.__tatematika!.getBalloonBounds(id), balloonId)
    
    const tapX = canvas.left + (bounds.x + bounds.width / 2) * canvas.scale
    const tapY = canvas.top + (bounds.y + bounds.height / 2) * canvas.scale
    
    await page.touchscreen.tap(tapX, tapY)
  }

  async function clickBalloon(page: any, balloonId: string, canvas: any) {
    const bounds = await page.evaluate((id) => 
      window.__tatematika!.getBalloonBounds(id), balloonId)
    
    const clickX = canvas.left + (bounds.x + bounds.width / 2) * canvas.scale
    const clickY = canvas.top + (bounds.y + bounds.height / 2) * canvas.scale
    
    await page.mouse.click(clickX, clickY)
  }

  test('Touch inputs during action are fully ignored (same as mouse/keyboard)', async ({ page }) => {
    // Wait for cat to be idle
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
    const wrongBalloons = state.balloons.filter((b: any) => !b.isCorrect)
    const initialStars = state.stars
    const initialWrongAttempts = state.wrongAttempts
    
    const canvas = await getCanvasCoordinates(page)
    
    // Tap correct balloon to start action
    await tapBalloon(page, correctBalloon.id, canvas)
    
    // Tap multiple times during action (should be ignored)
    for (let i = 0; i < 5; i++) {
      await tapBalloon(page, correctBalloon.id, canvas)
      if (wrongBalloons[0]) {
        await tapBalloon(page, wrongBalloons[0].id, canvas)
      }
      await page.waitForTimeout(20)
    }
    
    // Wait for action to complete
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const newState = await page.evaluate(() => window.__tatematika!.getGameState())
      return !jumpState.isJumping && newState.stars > initialStars
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Assert exactly one evaluation
    const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(finalState.stars, 'Stars should increase exactly once').toBe(initialStars + 1)
    expect(finalState.wrongAttempts, 'Wrong attempts unchanged').toBe(initialWrongAttempts)
  })

  test('Mouse inputs during action are fully ignored on touch device', async ({ page }) => {
    // Wait for cat to be idle
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
    const wrongBalloons = state.balloons.filter((b: any) => !b.isCorrect)
    const initialStars = state.stars
    const initialWrongAttempts = state.wrongAttempts
    
    const canvas = await getCanvasCoordinates(page)
    
    // Click correct balloon to start action
    await clickBalloon(page, correctBalloon.id, canvas)
    
    // Click multiple times during action (should be ignored)
    for (let i = 0; i < 5; i++) {
      await clickBalloon(page, correctBalloon.id, canvas)
      if (wrongBalloons[0]) {
        await clickBalloon(page, wrongBalloons[0].id, canvas)
      }
      await page.waitForTimeout(20)
    }
    
    // Wait for action to complete
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const newState = await page.evaluate(() => window.__tatematika!.getGameState())
      return !jumpState.isJumping && newState.stars > initialStars
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Assert exactly one evaluation
    const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(finalState.stars, 'Stars should increase exactly once').toBe(initialStars + 1)
    expect(finalState.wrongAttempts, 'Wrong attempts unchanged').toBe(initialWrongAttempts)
  })

  test('Keyboard inputs during action are fully ignored on touch device', async ({ page }) => {
    // Wait for cat to be idle
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
    const initialStars = state.stars
    const initialWrongAttempts = state.wrongAttempts
    
    const canvas = await getCanvasCoordinates(page)
    
    // Tap correct balloon to start action
    await tapBalloon(page, correctBalloon.id, canvas)
    
    // Press keys multiple times during action (should be ignored)
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Space')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowUp')
      await page.waitForTimeout(20)
    }
    
    // Wait for action to complete
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const newState = await page.evaluate(() => window.__tatematika!.getGameState())
      return !jumpState.isJumping && newState.stars > initialStars
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Assert exactly one evaluation
    const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(finalState.stars, 'Stars should increase exactly once').toBe(initialStars + 1)
    expect(finalState.wrongAttempts, 'Wrong attempts unchanged').toBe(initialWrongAttempts)
  })

  test('Mixed inputs (touch+mouse+keyboard) during action are fully ignored', async ({ page }) => {
    // Wait for cat to be idle
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const wrongBalloons = state.balloons.filter((b: any) => !b.isCorrect)
    const wrongBalloon = wrongBalloons[0]
    const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
    const initialStars = state.stars
    const initialWrongAttempts = state.wrongAttempts
    
    const canvas = await getCanvasCoordinates(page)
    
    // Tap wrong balloon to start action
    await tapBalloon(page, wrongBalloon.id, canvas)
    
    // Mix touch, mouse, keyboard during action (should all be ignored)
    for (let i = 0; i < 3; i++) {
      await tapBalloon(page, correctBalloon.id, canvas)
      await clickBalloon(page, correctBalloon.id, canvas)
      await page.keyboard.press('Space')
      await page.waitForTimeout(20)
    }
    
    // Wait for action to complete
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const newState = await page.evaluate(() => window.__tatematika!.getGameState())
      return !jumpState.isJumping && newState.wrongAttempts > initialWrongAttempts
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Assert exactly one error evaluation
    const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(finalState.wrongAttempts, 'Wrong attempts should increase exactly once').toBe(initialWrongAttempts + 1)
    expect(finalState.stars, 'Stars unchanged').toBe(initialStars)
  })
})
