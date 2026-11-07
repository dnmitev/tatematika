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
  const inputExists = await correctPerLevelInput.count()
  
  if (inputExists === 0) {
    throw new Error('setting-correct-per-level input does not exist')
  }
  
  await correctPerLevelInput.fill('100')
  
  // Verify it accepted the value
  const setValue = await correctPerLevelInput.inputValue()
  if (setValue !== '100') {
    throw new Error(`setting-correct-per-level did not accept 100, got: ${setValue}`)
  }
  
  await page.evaluate(() => window.__tatematika!.closeSettings())
  
  // Poll for correct sprite count instead of fixed wait
  await expect.poll(async () => {
    const actualCount = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      return scene.balloonSprites.length
    })
    return actualCount
  }, { timeout: 5000, intervals: [50] }).toBe(count)
}

async function playRoundsAndRecordSlots(page: any, count: number, rounds: number): Promise<{ slots: number[], roundTokens: number[], levelCompleteAppeared: boolean }> {
  const slots: number[] = []
  const roundTokens: number[] = []
  let levelCompleteAppeared = false
  
  // Initialize round token counter in the page
  await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    
    // Track round changes by watching balloonSprites array reference changes
    if (!window.__roundToken) {
      window.__roundToken = 0
      window.__lastBalloonSprites = scene.balloonSprites
      
      // Check for changes on every update
      scene.events.on('postupdate', () => {
        if (scene.balloonSprites !== window.__lastBalloonSprites) {
          window.__roundToken++
          window.__lastBalloonSprites = scene.balloonSprites
        }
      })
    }
  })
  
  for (let round = 0; round < rounds; round++) {
    // Check if level complete screen appeared
    const levelCompleteVisible = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const levelScene = game.scene.getScene('LevelCompleteScene')
      return levelScene && (levelScene as any).scene.isActive()
    }).catch(() => false)
    
    if (levelCompleteVisible) {
      levelCompleteAppeared = true
      break
    }
    
    // Wait for cat to be idle and correct sprite count
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const spriteCount = await page.evaluate(() => {
        const game = window.__tatematika!.getGame()
        const scene = game.scene.getScene('GameScene') as any
        return scene.balloonSprites.length
      })
      return !jumpState.isJumping && spriteCount === count
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
    
    // Record current round token
    const currentToken = await page.evaluate(() => window.__roundToken)
    roundTokens.push(currentToken)
    
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
    
    // Store current round token before click
    const tokenBeforeClick = await page.evaluate(() => window.__roundToken)
    
    // Click correct balloon to advance round
    await page.evaluate((id: string) => window.__tatematika!.clickBalloon(id), correctBalloon.id)
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return jumpState.isJumping
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Wait for new round: cat idle, correct sprite count, and round token incremented
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const spriteCount = await page.evaluate(() => {
        const game = window.__tatematika!.getGame()
        const scene = game.scene.getScene('GameScene') as any
        return scene.balloonSprites.length
      })
      const newToken = await page.evaluate(() => window.__roundToken)
      return !jumpState.isJumping && spriteCount === count && newToken > tokenBeforeClick
    }, { timeout: 10000, intervals: [50] }).toBe(true)
  }
  
  return { slots, roundTokens, levelCompleteAppeared }
}

test.describe('Shuffle Distribution - 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  
  // CPU throttle test to verify round token uniqueness under slow conditions
  test('Count 3 Seed A with 4x CPU throttle: round tokens unique', async ({ page }) => {
    test.setTimeout(180000) // 3 minutes for throttled execution
    
    const rounds = 30
    const count = 3
    
    // Enable 4x CPU throttling via CDP
    const client = await page.context().newCDPSession(page)
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    
    try {
      await page.addInitScript(getMulberry32Code(SEED_A))
      await page.goto('/')
      await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
      
      await setBalloonCount(page, count)
      const result = await playRoundsAndRecordSlots(page, count, rounds)
      
      // Main assertion: all round tokens are unique
      const uniqueTokens = new Set(result.roundTokens)
      expect(uniqueTokens.size, 'All 30 rounds should have unique tokens even with CPU throttle').toBe(rounds)
      
      expect(result.slots.length, 'Should have recorded all rounds').toBe(rounds)
    } finally {
      // Disable throttling
      await client.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    }
  })
  
  for (const count of [3, 4, 5]) {
    test(`Count ${count} Seed A: deterministic shuffle distribution (30 rounds)`, async ({ page }) => {
      // Set timeout for 60 rounds (2 runs of 30) with margin
      test.setTimeout(120000) // 2 minutes
      
      const rounds = 30
      
      // First run: record slots with Seed A
      await page.addInitScript(getMulberry32Code(SEED_A))
      await page.goto('/')
      await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
      
      await setBalloonCount(page, count)
      const result1 = await playRoundsAndRecordSlots(page, count, rounds)
      
      // Second run: verify determinism with same seed
      await page.addInitScript(getMulberry32Code(SEED_A))
      await page.goto('/')
      await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
      
      await setBalloonCount(page, count)
      const result2 = await playRoundsAndRecordSlots(page, count, rounds)
      
      // Now perform all assertions
      expect(result1.levelCompleteAppeared, 'Level complete screen should not appear during first run').toBe(false)
      expect(result2.levelCompleteAppeared, 'Level complete screen should not appear during second run').toBe(false)
      
      expect(result1.slots.length, 'Should have recorded all rounds in first run').toBe(rounds)
      expect(result2.slots.length, 'Should have recorded all rounds in second run').toBe(rounds)
      
      // Verify all round tokens are unique (30 different rounds)
      const uniqueTokens1 = new Set(result1.roundTokens)
      expect(uniqueTokens1.size, 'All 30 rounds should have unique tokens in first run').toBe(rounds)
      
      const uniqueTokens2 = new Set(result2.roundTokens)
      expect(uniqueTokens2.size, 'All 30 rounds should have unique tokens in second run').toBe(rounds)
      
      // Deterministic assertions for this specific seed
      const uniqueSlots = new Set(result1.slots)
      expect(uniqueSlots.size, 'Correct balloon should appear in at least 2 distinct slots').toBeGreaterThanOrEqual(2)
      
      // Should not be slot 0 in every round
      const allSlot0 = result1.slots.every(s => s === 0)
      expect(allSlot0, 'Correct balloon should not always be in slot 0').toBe(false)
      
      // Verify determinism
      expect(result2.slots, 'Same seed should produce identical slot sequence').toEqual(result1.slots)
    })
    
    test(`Count ${count} Seed B: deterministic shuffle distribution (30 rounds)`, async ({ page }) => {
      // Set timeout for 30 rounds with margin
      test.setTimeout(60000) // 1 minute
      
      const rounds = 30
      
      // Record slots with Seed B
      await page.addInitScript(getMulberry32Code(SEED_B))
      await page.goto('/')
      await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
      
      await setBalloonCount(page, count)
      const result = await playRoundsAndRecordSlots(page, count, rounds)
      
      // Now perform all assertions
      expect(result.levelCompleteAppeared, 'Level complete screen should not appear').toBe(false)
      expect(result.slots.length, 'Should have recorded all rounds').toBe(rounds)
      
      // Verify all round tokens are unique (30 different rounds)
      const uniqueTokens = new Set(result.roundTokens)
      expect(uniqueTokens.size, 'All 30 rounds should have unique tokens').toBe(rounds)
      
      // Deterministic assertions for this specific seed
      const uniqueSlots = new Set(result.slots)
      expect(uniqueSlots.size, 'Correct balloon should appear in at least 2 distinct slots').toBeGreaterThanOrEqual(2)
      
      // Should not be slot 0 in every round
      const allSlot0 = result.slots.every(s => s === 0)
      expect(allSlot0, 'Correct balloon should not always be in slot 0').toBe(false)
    })
  }
})
