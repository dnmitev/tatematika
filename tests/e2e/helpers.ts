import { expect } from '@playwright/test'

/**
 * Helper: Wait for game to be ready, pop correct balloon, wait for new round
 * Ensures observable, spec-backed readiness without assuming IDs or target change
 * 
 * This helper:
 * 1. Waits for cat to be idle (not jumping)
 * 2. Waits for balloon to exist and not be animating
 * 3. Clicks the balloon
 * 4. Waits for stars to increment
 * 5. Waits for new round readiness (cat idle, one correct balloon, formula valid)
 */
export async function popCorrectBalloonAndWait(page: any) {
  const state = await page.evaluate(() => window.__tatematika!.getGameState())
  const prevStars = state.stars
  const correct = state.balloons.find((b: any) => b.isCorrect)!
  
  // Wait for game to be ready: cat not jumping, balloon exists and not animating
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    const balloonBounds = await page.evaluate((id: string) => 
      window.__tatematika!.getBalloonBounds(id), correct.id)
    const balloonAnim = await page.evaluate((id: string) => 
      window.__tatematika!.getBalloonAnimationState(id), correct.id)
    
    return !jumpState.isJumping && 
           balloonBounds !== null && 
           !balloonAnim.isPopping && 
           !balloonAnim.isBouncing
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  // Click the balloon
  await page.evaluate((id: string) => window.__tatematika!.clickBalloon(id), correct.id)
  
  // Wait for star to increment
  await expect.poll(async () => {
    const s = await page.evaluate(() => window.__tatematika!.getGameState())
    return s.stars
  }, { timeout: 10000, intervals: [50] }).toBe(prevStars + 1)
  
  // Wait for new round to be ready with observable facts per spec:
  // - Cat is idle (not jumping)
  // - Exactly one isCorrect balloon present
  // - The correct balloon's formula evaluates to the current target
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    if (jumpState.isJumping) return false
    
    const s = await page.evaluate(() => window.__tatematika!.getGameState())
    const correctBalloons = s.balloons.filter((b: any) => b.isCorrect)
    if (correctBalloons.length !== 1) return false
    
    // Verify the correct balloon's formula actually equals the target
    const correct = correctBalloons[0]
    const formulaMatch = correct.formula.match(/(\d+)\s*([+−-])\s*(\d+)/)
    if (!formulaMatch) return false
    
    const a = parseInt(formulaMatch[1])
    const op = formulaMatch[2]
    const b = parseInt(formulaMatch[3])
    const result = op === '+' ? a + b : a - b
    
    return result === s.target
  }, { timeout: 10000, intervals: [50] }).toBe(true)
}
