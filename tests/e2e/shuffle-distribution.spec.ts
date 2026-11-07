import { test, expect } from '@playwright/test'

/**
 * Shuffle Distribution E2E Tests
 * 
 * Verifies that the correct balloon's position is randomly distributed
 * across left-to-right slots in actual gameplay, not always leftmost.
 * 
 * Under a fair shuffle, the probability that all 30 rounds place the correct
 * balloon in the same slot is (1/count)^29. For count=3, that's (1/3)^29 ≈ 5.6e-15.
 * The probability that all 30 are in slot 0 specifically is also (1/3)^29.
 * Across 3 test cases, the chance of a false failure is ≤ 3·(1/3)^29 ≈ 1.7e-14.
 */

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

async function playRoundsAndRecordSlots(page: any, count: number, rounds: number): Promise<number[]> {
  const slots: number[] = []
  
  for (let round = 0; round < rounds; round++) {
    // Wait for cat to be idle
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
    const initialBalloonIds = state.balloons.map((b: any) => b.id).sort()
    
    // Get all balloon centerX positions sorted to find slot
    const balloonPositions = await page.evaluate(() => {
      const state = window.__tatematika!.getGameState()
      const positions: Array<{ id: string, centerX: number }> = []
      
      for (const b of state.balloons) {
        const bounds = window.__tatematika!.getBalloonBounds(b.id)
        if (bounds) {
          positions.push({
            id: b.id,
            centerX: bounds.x + bounds.width / 2
          })
        }
      }
      
      return positions
    })
    
    // Sort by centerX to get left-to-right order
    balloonPositions.sort((a, b) => a.centerX - b.centerX)
    
    // Find correct balloon's slot (0-indexed from left)
    const correctSlot = balloonPositions.findIndex(p => p.id === correctBalloon.id)
    if (correctSlot >= 0) {
      slots.push(correctSlot)
    }
    
    // Click correct balloon to advance round
    await page.evaluate((id: string) => window.__tatematika!.clickBalloon(id), correctBalloon.id)
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return jumpState.isJumping
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Wait for new round (balloon ID set change)
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const newState = await page.evaluate(() => window.__tatematika!.getGameState())
      const newBalloonIds = newState.balloons.map((b: any) => b.id).sort()
      return !jumpState.isJumping && JSON.stringify(newBalloonIds) !== JSON.stringify(initialBalloonIds)
    }, { timeout: 5000, intervals: [50] }).toBe(true)
  }
  
  return slots
}

test.describe('Shuffle Distribution - 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })
  
  test('Count 3: correct balloon not always in same slot (30 rounds)', async ({ page }) => {
    const count = 3
    const rounds = 30
    
    await setBalloonCount(page, count)
    const slots = await playRoundsAndRecordSlots(page, count, rounds)
    
    expect(slots.length, 'Should have recorded all rounds').toBe(rounds)
    
    // Correct balloon should not be in the same slot for all rounds
    const uniqueSlots = new Set(slots)
    expect(uniqueSlots.size, 'Correct balloon should appear in different slots').toBeGreaterThan(1)
    
    // Correct balloon should not always be in slot 0 (leftmost)
    const allSlot0 = slots.every(s => s === 0)
    expect(allSlot0, 'Correct balloon should not always be in slot 0').toBe(false)
  })
  
  test('Count 4: correct balloon not always in same slot (30 rounds)', async ({ page }) => {
    const count = 4
    const rounds = 30
    
    await setBalloonCount(page, count)
    const slots = await playRoundsAndRecordSlots(page, count, rounds)
    
    expect(slots.length, 'Should have recorded all rounds').toBe(rounds)
    
    // Correct balloon should not be in the same slot for all rounds
    const uniqueSlots = new Set(slots)
    expect(uniqueSlots.size, 'Correct balloon should appear in different slots').toBeGreaterThan(1)
    
    // Correct balloon should not always be in slot 0 (leftmost)
    const allSlot0 = slots.every(s => s === 0)
    expect(allSlot0, 'Correct balloon should not always be in slot 0').toBe(false)
  })
  
  test('Count 5: correct balloon not always in same slot (30 rounds)', async ({ page }) => {
    const count = 5
    const rounds = 30
    
    await setBalloonCount(page, count)
    const slots = await playRoundsAndRecordSlots(page, count, rounds)
    
    expect(slots.length, 'Should have recorded all rounds').toBe(rounds)
    
    // Correct balloon should not be in the same slot for all rounds
    const uniqueSlots = new Set(slots)
    expect(uniqueSlots.size, 'Correct balloon should appear in different slots').toBeGreaterThan(1)
    
    // Correct balloon should not always be in slot 0 (leftmost)
    const allSlot0 = slots.every(s => s === 0)
    expect(allSlot0, 'Correct balloon should not always be in slot 0').toBe(false)
  })
})
