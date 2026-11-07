import { test, expect } from '@playwright/test'

/**
 * Shuffle Distribution E2E Tests
 * 
 * Verifies that the correct balloon's position is randomly distributed
 * across left-to-right slots in actual gameplay, not always leftmost.
 * 
 * Uses deterministic seeded PRNG (mulberry32) injected via page.addInitScript
 * to replace Math.random before game loads, ensuring reproducible results.
 */

// Seeded PRNG seeds for deterministic testing
const SEED_A = 0x12345678
const SEED_B = 0x9ABCDEF0

/**
 * Mulberry32 PRNG - simple, fast, and sufficient for testing
 * https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 */
function getMulberry32Code(seed: number): string {
  return `
    (function() {
      let state = ${seed};
      Math.random = function() {
        state |= 0;
        state = state + 0x6D2B79F5 | 0;
        let t = Math.imul(state ^ state >>> 15, 1 | state);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    })();
  `
}

async function setBalloonCount(page: any, count: number) {
  await page.evaluate(() => window.__tatematika!.openSettings())
  
  const balloonCountInput = page.locator('[data-testid="setting-balloon-count"]').first()
  await balloonCountInput.fill(String(count))
  
  // Set correctBalloonsPerLevel high to allow 30 rounds without level complete
  const correctPerLevelInput = page.locator('[data-testid="setting-correct-per-level"]').first()
  await correctPerLevelInput.fill('100')
  
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
    const initialStars = state.stars
    
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
    
    // Wait for new round (star count increases and cat not jumping)
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const newState = await page.evaluate(() => window.__tatematika!.getGameState())
      return !jumpState.isJumping && newState.stars > initialStars
    }, { timeout: 10000, intervals: [100] }).toBe(true)
    
    // Small delay to ensure Date.now() changes for next balloon ID generation
    await page.waitForTimeout(10)
  }
  
  return slots
}

test.describe('Shuffle Distribution - 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  
  for (const count of [3, 4, 5]) {
    test(`Count ${count} Seed A: deterministic shuffle distribution (30 rounds)`, async ({ page }) => {
      const rounds = 30
      
      // Inject seeded PRNG before game loads
      await page.addInitScript(getMulberry32Code(SEED_A))
      await page.goto('/')
      await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
      
      await setBalloonCount(page, count)
      const slots = await playRoundsAndRecordSlots(page, count, rounds)
      
      expect(slots.length, 'Should have recorded all rounds').toBe(rounds)
      
      // Deterministic assertions for this specific seed
      const uniqueSlots = new Set(slots)
      expect(uniqueSlots.size, 'Correct balloon should appear in at least 2 distinct slots').toBeGreaterThanOrEqual(2)
      
      // Should not be slot 0 in every round
      const allSlot0 = slots.every(s => s === 0)
      expect(allSlot0, 'Correct balloon should not always be in slot 0').toBe(false)
      
      // Verify determinism: same seed should give same sequence
      await page.addInitScript(getMulberry32Code(SEED_A))
      await page.goto('/')
      await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
      
      await setBalloonCount(page, count)
      const slots2 = await playRoundsAndRecordSlots(page, count, rounds)
      
      expect(slots2, 'Same seed should produce identical slot sequence').toEqual(slots)
    })
    
    test(`Count ${count} Seed B: deterministic shuffle distribution (30 rounds)`, async ({ page }) => {
      const rounds = 30
      
      // Inject different seeded PRNG
      await page.addInitScript(getMulberry32Code(SEED_B))
      await page.goto('/')
      await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
      
      await setBalloonCount(page, count)
      const slots = await playRoundsAndRecordSlots(page, count, rounds)
      
      expect(slots.length, 'Should have recorded all rounds').toBe(rounds)
      
      // Deterministic assertions for this specific seed
      const uniqueSlots = new Set(slots)
      expect(uniqueSlots.size, 'Correct balloon should appear in at least 2 distinct slots').toBeGreaterThanOrEqual(2)
      
      // Should not be slot 0 in every round
      const allSlot0 = slots.every(s => s === 0)
      expect(allSlot0, 'Correct balloon should not always be in slot 0').toBe(false)
    })
  }
})
