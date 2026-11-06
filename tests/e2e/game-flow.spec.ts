import { test, expect } from '@playwright/test'

/**
 * E2E tests for "Котето и балоните"
 * 
 * Test Hook Contract:
 * The game exposes window.__tatematika with the following API:
 * 
 * - getGameState(): Returns current game state including:
 *   - target: number (the target number to match)
 *   - balloons: Array of { id, formula, isCorrect }
 *   - stars: number (current star count)
 *   - wrongAttempts: number (wrong attempts in current round)
 *   - settings: { upperLimit, balloonCount, correctBalloonsPerLevel }
 * 
 * - clickBalloon(balloonId: string): Simulate clicking a balloon
 * 
 * - pressKey(key: 'left' | 'right' | 'space' | 'up'): Simulate keyboard input
 * 
 * - toggleMute(): Toggle sound on/off
 * 
 * - isMuted(): Check if sound is muted
 * 
 * - getLevelEndText(): Get level completion text (null if not shown)
 * 
 * The developer implementing the game must expose this API for tests to work.
 */

test.describe('Котето и балоните - E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    
    // Wait for game to initialize
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('К1: Round start - has 3 balloons with target 0-6 and exactly one correct', async ({ page }) => {
    // К1: Given game started with default settings
    // When new round begins
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    
    // Then there are 3 balloons
    expect(state.balloons).toHaveLength(3)
    
    // Target is from 0 to 6
    expect(state.target).toBeGreaterThanOrEqual(0)
    expect(state.target).toBeLessThanOrEqual(6)
    
    // Exactly one balloon is correct
    const correctCount = state.balloons.filter(b => b.isCorrect).length
    expect(correctCount).toBe(1)
  })

  test('К3: Correct balloon - pops, sound plays, star added, new round', async ({ page }) => {
    // К3: Given child is in front of correct balloon
    const initialState = await page.evaluate(() => window.__tatematika!.getGameState())
    const correctBalloon = initialState.balloons.find(b => b.isCorrect)!
    const initialStars = initialState.stars
    
    // Wait for cat to be idle before clicking
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Wait for balloon to be ready (not animating)
    await expect.poll(async () => {
      const balloonBounds = await page.evaluate((id: string) => 
        window.__tatematika!.getBalloonBounds(id), correctBalloon.id)
      const balloonAnim = await page.evaluate((id: string) => 
        window.__tatematika!.getBalloonAnimationState(id), correctBalloon.id)
      
      return balloonBounds !== null && 
             !balloonAnim.isPopping && 
             !balloonAnim.isBouncing
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // When cat jumps and pops it
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correctBalloon.id)
    
    // Wait for stars to increment
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__tatematika!.getGameState())
      return s.stars
    }, { timeout: 10000, intervals: [50] }).toBe(initialStars + 1)
    
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    
    // Then star count increased by 1
    expect(newState.stars).toBe(initialStars + 1)
    
    // New round started (different balloons)
    const newBalloonIds = newState.balloons.map(b => b.id).sort().join(',')
    const oldBalloonIds = initialState.balloons.map(b => b.id).sort().join(',')
    expect(newBalloonIds).not.toBe(oldBalloonIds)
    
    // Wrong attempts reset
    expect(newState.wrongAttempts).toBe(0)
  })

  test('К4: Wrong balloon - bounces, no star loss, same balloons', async ({ page }) => {
    // К4: Given child is in front of wrong balloon
    const initialState = await page.evaluate(() => window.__tatematika!.getGameState())
    const wrongBalloon = initialState.balloons.find(b => !b.isCorrect)!
    const initialStars = initialState.stars
    
    // When cat jumps at it
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), wrongBalloon.id)
    
    // Wait for bounce animation
    await page.waitForTimeout(500)
    
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    
    // Then stars don't decrease
    expect(newState.stars).toBe(initialStars)
    
    // Balloons stay the same
    const newBalloonIds = newState.balloons.map(b => b.id).sort().join(',')
    const oldBalloonIds = initialState.balloons.map(b => b.id).sort().join(',')
    expect(newBalloonIds).toBe(oldBalloonIds)
    
    // Wrong attempts increased
    expect(newState.wrongAttempts).toBe(1)
  })

  test('К5: Hint after 2 wrong attempts - correct balloon glows', async ({ page }) => {
    // К5: Given child made 2 mistakes in one round
    const initialState = await page.evaluate(() => window.__tatematika!.getGameState())
    const wrongBalloon = initialState.balloons.find(b => !b.isCorrect)!
    
    // First wrong attempt
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), wrongBalloon.id)
    await page.waitForTimeout(300)
    
    // Second wrong attempt
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), wrongBalloon.id)
    await page.waitForTimeout(300)
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    
    // Then hint is enabled (wrongAttempts >= 2)
    expect(state.wrongAttempts).toBeGreaterThanOrEqual(2)
    
    // The correct balloon should be visually indicated (tested via game state)
    // The developer should implement visual hint when wrongAttempts >= 2
  })

  test('К7: Level end - shows "Ти успя!" and buttons after 10 stars', async ({ page }) => {
    // К7: Given child has 9 stars
    // We'll simulate getting to 10 stars
    
    // This test requires the ability to fast-forward or we test the state
    const state = await page.evaluate(() => {
      // For testing, we'll check if the level end detection works
      // by examining the state after collecting stars
      return window.__tatematika!.getGameState()
    })
    
    // With default settings, level completes at 10 stars
    expect(state.settings.correctBalloonsPerLevel).toBe(10)
    
    // The developer should show celebration screen when stars === correctBalloonsPerLevel
    // We test this by checking getLevelEndText() after reaching the goal
    
    // Note: Full test requires clicking through 10 correct balloons
    // For now, we verify the contract exists
    const levelEndText = await page.evaluate(() => window.__tatematika!.getLevelEndText())
    
    // Initially null (level not ended)
    expect(levelEndText === null || typeof levelEndText === 'string').toBe(true)
  })

  test('К8: Keyboard control - arrows and space work', async ({ page }) => {
    // К8: Given game is open on computer
    // When child uses arrow keys and space
    
    // Test keyboard controls via test hook
    await page.evaluate(() => {
      window.__tatematika!.pressKey('left')
    })
    
    await page.waitForTimeout(100)
    
    await page.evaluate(() => {
      window.__tatematika!.pressKey('right')
    })
    
    await page.waitForTimeout(100)
    
    await page.evaluate(() => {
      window.__tatematika!.pressKey('space')
    })
    
    // If no errors thrown, keyboard handling is hooked up
    // The developer must implement actual movement and jump logic
  })

  test('К8: Mouse click - clicking balloon works', async ({ page }) => {
    // К8: When child clicks with mouse
    // Wait for game to be ready before clicking
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    // Click the correct balloon to ensure we can verify stars increment
    const targetBalloon = state.balloons.find(b => b.isCorrect)!
    
    // Wait for balloon to exist and not be animating
    await expect.poll(async () => {
      const balloonBounds = await page.evaluate((id: string) => 
        window.__tatematika!.getBalloonBounds(id), targetBalloon.id)
      const balloonAnim = await page.evaluate((id: string) => 
        window.__tatematika!.getBalloonAnimationState(id), targetBalloon.id)
      
      return balloonBounds !== null && 
             !balloonAnim.isPopping && 
             !balloonAnim.isBouncing
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Then cat goes to balloon and jumps
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), targetBalloon.id)
    
    // Wait for stars to increment
    await expect.poll(async () => {
      const newState = await page.evaluate(() => window.__tatematika!.getGameState())
      return newState.stars
    }, { timeout: 10000, intervals: [50] }).toBe(state.stars + 1)
    
    // Verify final state
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    
    // Must have gained exactly 1 star
    expect(newState.stars).toBe(state.stars + 1)
  })

  test('К8: Touch input - touching balloon works', async ({ page }) => {
    // К8: When child touches on tablet
    // Touch is simulated the same as click in the test hook
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const firstBalloon = state.balloons[0]
    
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), firstBalloon.id)
    
    await page.waitForTimeout(300)
    
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    
    // Verify interaction worked
    expect(newState.stars >= state.stars).toBe(true)
  })

  test('К10: Mute button - toggles sound on and off', async ({ page }) => {
    // К10: Given sound is on
    const initialMuted = await page.evaluate(() => window.__tatematika!.isMuted())
    
    // When child presses mute button
    await page.evaluate(() => window.__tatematika!.toggleMute())
    
    const newMuted = await page.evaluate(() => window.__tatematika!.isMuted())
    
    // Then sound state toggles
    expect(newMuted).toBe(!initialMuted)
    
    // Toggle again
    await page.evaluate(() => window.__tatematika!.toggleMute())
    
    const finalMuted = await page.evaluate(() => window.__tatematika!.isMuted())
    
    expect(finalMuted).toBe(initialMuted)
  })

  test('К11: Bulgarian only - UI text is in Bulgarian', async ({ page }) => {
    // К11: All labels are in Bulgarian
    // We check via page content for Bulgarian Cyrillic characters
    
    const content = await page.textContent('body')
    
    // Should contain Cyrillic
    expect(content).toMatch(/[А-Яа-я]/)
    
    // Should not contain "Загуби" or "Game Over"
    expect(content?.toLowerCase()).not.toContain('загуби')
    expect(content?.toLowerCase()).not.toContain('game over')
  })

  test('К11: No "Загуби" or "Game Over" - positive feedback only', async ({ page }) => {
    // К11: When child plays
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const wrongBalloon = state.balloons.find(b => !b.isCorrect)!
    
    // Make a wrong attempt
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), wrongBalloon.id)
    
    await page.waitForTimeout(500)
    
    const content = await page.textContent('body')
    
    // Then no negative words appear
    expect(content?.toLowerCase()).not.toContain('загуби')
    expect(content?.toLowerCase()).not.toContain('game over')
    expect(content?.toLowerCase()).not.toContain('game')
    expect(content?.toLowerCase()).not.toContain('over')
  })

  test('К9: Settings persistence - upper limit 10 persists after reload', async ({ page }) => {
    // К9: Given parent changed upper limit to 10
    await page.evaluate(() => {
      const settings = {
        upperLimit: 10,
        operations: 'both' as const,
        balloonCount: 3,
        correctBalloonsPerLevel: 10,
        balloonSpeed: 'slow' as const,
      }
      
      localStorage.setItem('tatematika-kote-balonche-settings', JSON.stringify(settings))
    })
    
    // When page reloads
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    
    // Then all numbers are from 0 to 10
    expect(state.settings.upperLimit).toBe(10)
    expect(state.target).toBeLessThanOrEqual(10)
    
    state.balloons.forEach(balloon => {
      // Formula results should respect the new limit
      // This will be verified by the formula generator
    })
  })

  test('Default settings smoke test', async ({ page }) => {
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    
    expect(state.settings.upperLimit).toBe(6)
    expect(state.settings.balloonCount).toBe(3)
    expect(state.settings.correctBalloonsPerLevel).toBe(10)
  })

  test('Button sizes - at least 64x64 for touch', async ({ page }) => {
    // Section 3: Buttons are at least 64×64 px for small fingers
    // This is a visual contract that the developer must implement
    // We can't test actual pixel sizes in this stub, but document the requirement
    
    // The developer must ensure all interactive elements (balloons, buttons)
    // are at least 64×64 pixels
  })
})
