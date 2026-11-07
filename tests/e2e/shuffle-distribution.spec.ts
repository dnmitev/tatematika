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

interface CellPosition {
  row: number
  col: number
}

async function playRoundsAndRecordSlots(page: any, count: number, rounds: number, seed?: number): Promise<{ 
  slots: number[], 
  cells: CellPosition[],
  roundTokens: number[], 
  levelCompleteAppeared: boolean 
}> {
  const slots: number[] = []
  const cells: CellPosition[] = []
  const roundTokens: number[] = []
  let levelCompleteAppeared = false
  
  // Inject seeded RNG for round generation via K17 test hook
  // This ensures deterministic shuffle by isolating round-generation randomness
  // from timing-dependent Math.random calls (colors, IDs)
  if (seed !== undefined) {
    await page.evaluate((s) => {
      // Create a dedicated Mulberry32 PRNG for round generation
      let state = s
      const roundRng = () => {
        state |= 0
        state = state + 0x6D2B79F5 | 0
        let t = Math.imul(state ^ state >>> 15, 1 | state)
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
        return ((t ^ t >>> 14) >>> 0) / 4294967296
      }
      
      // Inject via K17 test hook (will be no-op until implemented in src)
      if (window.__tatematika!.setRoundRng) {
        window.__tatematika!.setRoundRng(roundRng)
      }
      // Note: Global Math.random replacement (in addInitScript) remains as fallback
      // Once setRoundRng is wired up in src, it will override Math.random for round generation
    }, seed)
  }
  
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
    
    // Get all balloon positions (X and Y) for 2D cell tracking
    const balloonPositions = await page.evaluate(() => {
      const state = window.__tatematika!.getGameState()
      const positions: Array<{ id: string, centerX: number, centerY: number }> = []
      
      for (const b of state.balloons) {
        const bounds = window.__tatematika!.getBalloonBounds(b.id)
        if (bounds) {
          positions.push({
            id: b.id,
            centerX: bounds.x + bounds.width / 2,
            centerY: bounds.y + bounds.height / 2
          })
        }
      }
      
      return positions
    })
    
    // Sort by centerX to get left-to-right order (for 1D slot)
    const sortedByX = [...balloonPositions].sort((a, b) => a.centerX - b.centerX)
    
    // Find correct balloon's slot (0-indexed from left)
    const correctSlot = sortedByX.findIndex(p => p.id === correctBalloon.id)
    if (correctSlot >= 0) {
      slots.push(correctSlot)
    }
    
    // For counts 4 and 5: track 2D cell (row, column)
    if (count >= 4) {
      // Cluster balloons into rows by centerY (tolerance: 50px)
      const rowTolerance = 50
      const rows: Array<Array<{ id: string, centerX: number, centerY: number }>> = []
      
      for (const pos of balloonPositions) {
        let foundRow = false
        for (const row of rows) {
          if (Math.abs(row[0].centerY - pos.centerY) < rowTolerance) {
            row.push(pos)
            foundRow = true
            break
          }
        }
        if (!foundRow) {
          rows.push([pos])
        }
      }
      
      // Sort rows by average Y (top to bottom)
      rows.sort((a, b) => {
        const avgA = a.reduce((sum, p) => sum + p.centerY, 0) / a.length
        const avgB = b.reduce((sum, p) => sum + p.centerY, 0) / b.length
        return avgA - avgB
      })
      
      // Within each row, sort by centerX (left to right)
      for (const row of rows) {
        row.sort((a, b) => a.centerX - b.centerX)
      }
      
      // Find correct balloon's cell (row, col)
      let correctCell: CellPosition | null = null
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const colIndex = rows[rowIndex].findIndex(p => p.id === correctBalloon.id)
        if (colIndex >= 0) {
          correctCell = { row: rowIndex, col: colIndex }
          break
        }
      }
      
      if (correctCell) {
        cells.push(correctCell)
      }
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
  
  return { slots, cells, roundTokens, levelCompleteAppeared }
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
      const result1 = await playRoundsAndRecordSlots(page, count, rounds, SEED_A)
      
      // Second run: verify determinism with same seed
      await page.addInitScript(getMulberry32Code(SEED_A))
      await page.goto('/')
      await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
      
      await setBalloonCount(page, count)
      const result2 = await playRoundsAndRecordSlots(page, count, rounds, SEED_A)
      
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
      const result = await playRoundsAndRecordSlots(page, count, rounds, SEED_B)
      
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
  
  // 2D Cell distribution tests for counts 4 and 5 (multi-row layouts)
  for (const count of [4, 5]) {
    test(`Count ${count} Seed A: 2D cell distribution - every cell visited (60 rounds)`, async ({ page }) => {
      test.setTimeout(180000) // 3 minutes for 60 rounds
      
      const rounds = 60
      
      await page.addInitScript(getMulberry32Code(SEED_A))
      await page.goto('/')
      await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
      
      await setBalloonCount(page, count)
      const result = await playRoundsAndRecordSlots(page, count, rounds)
      
      expect(result.levelCompleteAppeared, 'Level complete screen should not appear').toBe(false)
      expect(result.cells.length, 'Should have recorded all rounds').toBe(rounds)
      
      // Determine expected cells based on actual layout
      // Count 4: 2×2 grid (4 cells)
      // Count 5: 4+1 layout (4 on top row, 1 on bottom row)
      const expectedCells = count === 4 
        ? [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }]
        : [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 1, col: 0 }]
      
      // Track which cells have been visited
      const visitedCells = new Set<string>()
      for (const cell of result.cells) {
        visitedCells.add(`${cell.row},${cell.col}`)
      }
      
      // Assert every expected cell was visited at least once
      for (const expectedCell of expectedCells) {
        const cellKey = `${expectedCell.row},${expectedCell.col}`
        expect(visitedCells.has(cellKey), 
          `Cell (row=${expectedCell.row}, col=${expectedCell.col}) should be visited at least once`
        ).toBe(true)
      }
      
      // Assert row is not constant (should vary across rounds)
      const rows = result.cells.map(c => c.row)
      const uniqueRows = new Set(rows)
      expect(uniqueRows.size, 
        `Correct balloon should appear in multiple rows (found rows: ${Array.from(uniqueRows).join(', ')})`
      ).toBeGreaterThan(1)
      
      // Should not be all in row 0
      const allRow0 = rows.every(r => r === 0)
      expect(allRow0, 'Correct balloon should not always be in row 0').toBe(false)
    })
    
    test(`Count ${count} Seed B: 2D cell distribution - every cell visited (60 rounds)`, async ({ page }) => {
      test.setTimeout(180000) // 3 minutes for 60 rounds
      
      const rounds = 60
      
      await page.addInitScript(getMulberry32Code(SEED_B))
      await page.goto('/')
      await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
      
      await setBalloonCount(page, count)
      const result = await playRoundsAndRecordSlots(page, count, rounds)
      
      expect(result.levelCompleteAppeared, 'Level complete screen should not appear').toBe(false)
      expect(result.cells.length, 'Should have recorded all rounds').toBe(rounds)
      
      // Determine expected cells based on actual layout
      // Count 4: 2×2 grid (4 cells)
      // Count 5: 4+1 layout (4 on top row, 1 on bottom row)
      const expectedCells = count === 4 
        ? [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }]
        : [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 1, col: 0 }]
      
      // Track which cells have been visited
      const visitedCells = new Set<string>()
      for (const cell of result.cells) {
        visitedCells.add(`${cell.row},${cell.col}`)
      }
      
      // Assert every expected cell was visited at least once
      for (const expectedCell of expectedCells) {
        const cellKey = `${expectedCell.row},${expectedCell.col}`
        expect(visitedCells.has(cellKey), 
          `Cell (row=${expectedCell.row}, col=${expectedCell.col}) should be visited at least once`
        ).toBe(true)
      }
      
      // Assert row is not constant (should vary across rounds)
      const rows = result.cells.map(c => c.row)
      const uniqueRows = new Set(rows)
      expect(uniqueRows.size, 
        `Correct balloon should appear in multiple rows (found rows: ${Array.from(uniqueRows).join(', ')})`
      ).toBeGreaterThan(1)
      
      // Should not be all in row 0
      const allRow0 = rows.every(r => r === 0)
      expect(allRow0, 'Correct balloon should not always be in row 0').toBe(false)
    })
  }
})
