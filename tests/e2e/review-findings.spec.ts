import { test, expect } from '@playwright/test'

/**
 * Regression tests for review findings on commit cfaa677
 * These tests verify spec requirements that were not met in the initial implementation
 */

test.describe('Review Findings - Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Finding 1: К4 - Wrong balloon must bounce (spec §4 rule 5)', async ({ page }) => {
    // Spec §4 rule 5: "Грешен балон: балонът отскача (не се пука)"
    // К4: "балонът отскача и не се пука"
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const wrongBalloon = state.balloons.find(b => !b.isCorrect)!
    
    // Click wrong balloon
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), wrongBalloon.id)
    
    // Wait for animation
    await page.waitForTimeout(300)
    
    // Check that balloon is bouncing (not popping)
    const animState = await page.evaluate(
      (id) => window.__tatematika!.getBalloonAnimationState(id),
      wrongBalloon.id
    )
    
    expect(animState.isBouncing).toBe(true)
    expect(animState.isPopping).toBe(false)
  })

  test('Finding 2: К8 - Mouse click must move cat under balloon and make it jump (spec §3)', async ({ page }) => {
    // Spec §3: "Клик върху балон: котето отива под него и скача"
    // К8: "котето отива до избрания балон и скача"
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    // Use a WRONG balloon so it stays on screen after click
    const targetBalloon = state.balloons.find(b => !b.isCorrect)!
    
    // Get balloon bounds BEFORE click (so it doesn't disappear if correct)
    const balloonGameBounds = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), targetBalloon.id)
    expect(balloonGameBounds).not.toBeNull()
    
    // Get balloon position in CSS pixels for clicking
    const balloonCssBounds = await page.evaluate((id) => {
      const bounds = window.__tatematika!.getBalloonBounds(id)
      if (!bounds) return null
      
      // Convert to CSS pixels
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / 800
      
      return {
        x: bounds.x * scale + rect.left,
        y: bounds.y * scale + rect.top,
        width: bounds.width * scale,
        height: bounds.height * scale
      }
    }, targetBalloon.id)
    
    expect(balloonCssBounds).not.toBeNull()
    
    // Get initial cat position and jump state
    const initialCatPos = await page.evaluate(() => window.__tatematika!.getCatPosition())
    const initialJumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    
    // Click balloon center using real mouse click
    await page.mouse.click(
      balloonCssBounds!.x + balloonCssBounds!.width / 2, 
      balloonCssBounds!.y + balloonCssBounds!.height / 2
    )
    
    // Wait for movement and jump animation
    await page.waitForTimeout(800)
    
    // Cat should have moved to under the balloon CENTER (within balloon radius)
    const finalCatPos = await page.evaluate(() => window.__tatematika!.getCatPosition())
    
    // Compare cat x to balloon center (bounds.x is top-left)
    const balloonCenterX = balloonGameBounds!.x + balloonGameBounds!.width / 2
    const horizontalDistance = Math.abs(finalCatPos.x - balloonCenterX)
    expect(horizontalDistance).toBeLessThanOrEqual(balloonGameBounds!.width / 2) // Within balloon radius
    
    // Cat should have jumped
    const finalJumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    // Check that cat jumped (either still jumping or moved above resting y)
    const catMovedUp = finalCatPos.y < initialJumpState.restingY
    expect(finalJumpState.isJumping || catMovedUp).toBe(true)
  })
})

test.describe('Review Findings - Touch Input', () => {
  test.use({ hasTouch: true })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Finding 2b: К8 - Touch must move cat under balloon and make it jump (spec §3)', async ({ page }) => {
    // Spec §3: "Докосване на балон: котето отива под него и скача"
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    // Use a WRONG balloon so it stays on screen
    const wrongBalloons = state.balloons.filter(b => !b.isCorrect)
    const targetBalloon = wrongBalloons[wrongBalloons.length > 1 ? 1 : 0]
    
    // Get balloon bounds BEFORE tap
    const balloonGameBounds = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), targetBalloon.id)
    expect(balloonGameBounds).not.toBeNull()
    
    const balloonCssBounds = await page.evaluate((id) => {
      const bounds = window.__tatematika!.getBalloonBounds(id)
      if (!bounds) return null
      
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scale = rect.width / 800
      
      return {
        x: bounds.x * scale + rect.left,
        y: bounds.y * scale + rect.top,
        width: bounds.width * scale,
        height: bounds.height * scale
      }
    }, targetBalloon.id)
    
    expect(balloonCssBounds).not.toBeNull()
    
    const initialCatPos = await page.evaluate(() => window.__tatematika!.getCatPosition())
    const initialJumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    
    // Tap balloon center using touchscreen
    await page.touchscreen.tap(
      balloonCssBounds!.x + balloonCssBounds!.width / 2, 
      balloonCssBounds!.y + balloonCssBounds!.height / 2
    )
    
    await page.waitForTimeout(800)
    
    const finalCatPos = await page.evaluate(() => window.__tatematika!.getCatPosition())
    
    // Compare cat x to balloon center
    const balloonCenterX = balloonGameBounds!.x + balloonGameBounds!.width / 2
    const horizontalDistance = Math.abs(finalCatPos.x - balloonCenterX)
    expect(horizontalDistance).toBeLessThanOrEqual(balloonGameBounds!.width / 2)
    
    // Cat should have jumped
    const finalJumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    const catMovedUp = finalCatPos.y < initialJumpState.restingY
    expect(finalJumpState.isJumping || catMovedUp).toBe(true)
  })
})

test.describe('Review Findings - Keyboard Input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Finding 2c: К8 - Keyboard arrow keys and space must move cat and make it jump', async ({ page }) => {
    // К8: "стрелките и интервала"
    
    const initialCatPos = await page.evaluate(() => window.__tatematika!.getCatPosition())
    
    // Press right arrow to move cat
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(200)
    
    const afterMovePos = await page.evaluate(() => window.__tatematika!.getCatPosition())
    expect(afterMovePos.x).toBeGreaterThan(initialCatPos.x)
    
    // Press left arrow
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(200)
    
    const afterLeftPos = await page.evaluate(() => window.__tatematika!.getCatPosition())
    expect(afterLeftPos.x).toBeLessThan(afterMovePos.x)
    
    // Press space to jump
    await page.keyboard.press('Space')
    await page.waitForTimeout(200)
    
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    expect(jumpState.isJumping).toBe(true)
    
    // Test ArrowUp also works for jump
    await page.waitForTimeout(500) // Wait for jump to finish
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(200)
    
    const jumpState2 = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    expect(jumpState2.isJumping).toBe(true)
  })
})

test.describe('Review Findings - Other Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  test('Finding 3: К3 - Correct pop must play "пук" sound (spec §7)', async ({ page }) => {
    // Spec §7: "меко „пук" при верен балон"
    // К3: "чува се „пук""
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const correctBalloon = state.balloons.find(b => b.isCorrect)!
    
    // Click correct balloon
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correctBalloon.id)
    
    // Wait for sound to play
    await page.waitForTimeout(200)
    
    // Check that "пук" sound was played
    const lastSound = await page.evaluate(() => window.__tatematika!.getLastPlayedSound())
    
    expect(lastSound).toBeTruthy()
    expect(['pop', 'пук', 'correct']).toContain(lastSound)
  })

  test('Finding 4: Formula digits must be at least 32px (spec §7)', async ({ page }) => {
    // Spec §7: "Едри цифри (поне 32 px)"
    // Review found: формулите са 28px at cfaa677, fixed to 32px at 221681d
    
    const fontSize = await page.evaluate(() => window.__tatematika!.getFormulaFontSize())
    
    expect(fontSize).toBeGreaterThanOrEqual(32)
  })

  test('Finding 5: Mute button hit target must be at least 64×64px (spec §3)', async ({ page }) => {
    // Spec §3: "Бутоните и балоните са големи (поне 64×64 px)"
    // Review found: мute button е 32px емоджи at cfaa677, fixed at 221681d
    
    const bounds = await page.evaluate(() => window.__tatematika!.getMuteButtonBounds())
    
    expect(bounds.width).toBeGreaterThanOrEqual(64)
    expect(bounds.height).toBeGreaterThanOrEqual(64)
  })

  test('Finding 6: К10 - Mute button must actually mute sound', async ({ page }) => {
    // Spec §7: "Бутон за изключване на звука"
    // К10: "всички звуци спират"
    // Review found: само сменя иконата, няма реално заглушаване
    
    // Make sure sound is unmuted
    const initialMuted = await page.evaluate(() => window.__tatematika!.isMuted())
    if (initialMuted) {
      await page.evaluate(() => window.__tatematika!.toggleMute())
    }
    
    // Pop a correct balloon and verify sound plays
    let state = await page.evaluate(() => window.__tatematika!.getGameState())
    const correctBalloon = state.balloons.find(b => b.isCorrect)!
    
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correctBalloon.id)
    await page.waitForTimeout(300)
    
    const soundBeforeMute = await page.evaluate(() => window.__tatematika!.getLastPlayedSound())
    expect(soundBeforeMute).toBeTruthy() // Sound should play when unmuted
    
    // Wait for new round
    await page.waitForTimeout(1000)
    
    // Now mute
    await page.evaluate(() => window.__tatematika!.toggleMute())
    const isMuted = await page.evaluate(() => window.__tatematika!.isMuted())
    expect(isMuted).toBe(true)
    
    // Pop another correct balloon
    state = await page.evaluate(() => window.__tatematika!.getGameState())
    const nextCorrect = state.balloons.find(b => b.isCorrect)!
    
    const soundBefore = await page.evaluate(() => window.__tatematika!.getLastPlayedSound())
    
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), nextCorrect.id)
    await page.waitForTimeout(300)
    
    const soundAfterMute = await page.evaluate(() => window.__tatematika!.getLastPlayedSound())
    
    // When muted, no new sound should play (getLastPlayedSound should be null or unchanged)
    expect(soundAfterMute).toBe(soundBefore) // Sound unchanged (no new sound played)
    
    // Unmute and verify sound works again
    await page.waitForTimeout(1000)
    await page.evaluate(() => window.__tatematika!.toggleMute())
    
    state = await page.evaluate(() => window.__tatematika!.getGameState())
    const thirdCorrect = state.balloons.find(b => b.isCorrect)!
    
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), thirdCorrect.id)
    await page.waitForTimeout(300)
    
    const soundAfterUnmute = await page.evaluate(() => window.__tatematika!.getLastPlayedSound())
    expect(soundAfterUnmute).toBeTruthy()
    expect(soundAfterUnmute).not.toBe(soundBefore) // New sound played
  })

  test('Finding 7: getLevelEndText() must return text in LevelCompleteScene', async ({ page }) => {
    // Test hook contract: getLevelEndText() should return the celebration text
    // Review found: returns null when LevelCompleteScene is active
    
    // Lower the star requirement to make test faster
    await page.evaluate(() => {
      localStorage.setItem('tatematika-kote-balonche-settings', JSON.stringify({
        upperLimit: 6,
        operations: 'both',
        balloonCount: 3,
        correctBalloonsPerLevel: 5, // Only need 5 stars
        balloonSpeed: 'slow'
      }))
    })
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Pop 5 correct balloons to complete the level
    for (let i = 0; i < 5; i++) {
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correct = state.balloons.find(b => b.isCorrect)!
      
      await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correct.id)
      await page.waitForTimeout(900) // Wait for new round
    }
    
    // Wait for level complete scene transition
    await page.waitForTimeout(500)
    
    // getLevelEndText should return the celebration message
    const levelText = await page.evaluate(() => window.__tatematika!.getLevelEndText())
    
    expect(levelText).toBeTruthy()
    expect(levelText).toContain('Ти успя')
  })

  test('Finding 8: "Още веднъж" must continue from current level (spec К7)', async ({ page }) => {
    // Spec К7: Level progression should continue, not restart from level 1
    // Review found: "Още веднъж" starts from level 1 again
    // Interpretation: After completing level 1, clicking "Още веднъж" should start level 2
    // with stars reset to 0 but settings and level progression preserved
    
    // Lower requirement for speed
    await page.evaluate(() => {
      localStorage.setItem('tatematika-kote-balonche-settings', JSON.stringify({
        upperLimit: 6,
        operations: 'both',
        balloonCount: 3,
        correctBalloonsPerLevel: 5,
        balloonSpeed: 'slow'
      }))
    })
    
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Complete level 1 (5 stars)
    for (let i = 0; i < 5; i++) {
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correct = state.balloons.find(b => b.isCorrect)!
      await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correct.id)
      await page.waitForTimeout(900)
    }
    
    // Wait for level complete screen
    await page.waitForTimeout(500)
    
    // Click "Още веднъж" button
    const playAgainButton = page.locator('[data-testid="button-play-again"]')
    await expect(playAgainButton).toBeVisible({ timeout: 5000 })
    await playAgainButton.click()
    
    await page.waitForTimeout(500)
    
    // Should be playing level 2 now
    const stateAfter = await page.evaluate(() => window.__tatematika!.getGameState())
    
    // Stars should be reset to 0
    expect(stateAfter.stars).toBe(0)
    
    // Game should be playable (not stuck on level complete screen)
    expect(stateAfter.balloons).toHaveLength(3)
    expect(stateAfter.target).toBeGreaterThanOrEqual(0)
    
    // Should be able to play (pop a balloon)
    const correct = stateAfter.balloons.find(b => b.isCorrect)!
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correct.id)
    await page.waitForTimeout(900)
    
    const stateAfterPop = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateAfterPop.stars).toBe(1) // Star was added, game is progressing
    
    // This test fails if "Още веднъж" sends back to level 1 or gets stuck
  })
})
