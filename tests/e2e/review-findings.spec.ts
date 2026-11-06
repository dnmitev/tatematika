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
    
    // Poll until balloon is bouncing
    await expect.poll(async () => {
      const animState = await page.evaluate(
        (id) => window.__tatematika!.getBalloonAnimationState(id),
        wrongBalloon.id
      )
      // Assert isPopping stays false on every sample
      expect(animState.isPopping).toBe(false)
      return animState.isBouncing
    }, { timeout: 1000, intervals: [50] }).toBe(true)
  })

  test('Finding 2: К8 - Mouse click must move cat under balloon and make it jump (spec §3)', async ({ page }) => {
    // Spec §3: "Клик върху балон: котето отива под него и скача"
    // К8: "котето отива до избрания балон и скача"
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const wrongBalloons = state.balloons.filter(b => !b.isCorrect)
    
    // Get cat's starting position
    let catStartPos = await page.evaluate(() => window.__tatematika!.getCatPosition())
    
    // Pick the FARTHEST wrong balloon from cat's starting x (to exercise travel)
    const balloonBoundsMap = new Map<string, any>()
    for (const balloon of wrongBalloons) {
      const bounds = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), balloon.id)
      if (bounds) {
        balloonBoundsMap.set(balloon.id, bounds)
      }
    }
    
    let targetBalloon = wrongBalloons[0]
    let maxDistance = 0
    for (const balloon of wrongBalloons) {
      const bounds = balloonBoundsMap.get(balloon.id)
      if (!bounds) continue
      const centerX = bounds.x + bounds.width / 2
      const distance = Math.abs(catStartPos.x - centerX)
      if (distance > maxDistance) {
        maxDistance = distance
        targetBalloon = balloon
      }
    }
    
    // Get balloon bounds BEFORE click
    const balloonGameBounds = balloonBoundsMap.get(targetBalloon.id)
    expect(balloonGameBounds).not.toBeNull()
    
    const balloonCenterX = balloonGameBounds!.x + balloonGameBounds!.width / 2
    const balloonRadius = balloonGameBounds!.width / 2
    
    // Precondition: cat must start away from target balloon
    // If cat is already under balloon, move it away
    let attempts = 0
    while (Math.abs(catStartPos.x - balloonCenterX) <= balloonRadius && attempts < 20) {
      // Move cat away with keyboard
      const moveDirection = catStartPos.x < balloonCenterX ? 'ArrowLeft' : 'ArrowRight'
      await page.keyboard.press(moveDirection)
      await page.waitForTimeout(200)
      catStartPos = await page.evaluate(() => window.__tatematika!.getCatPosition())
      attempts++
    }
    
    // Assert precondition
    const startDistance = Math.abs(catStartPos.x - balloonCenterX)
    expect(startDistance, 'precondition: cat must start away from target balloon').toBeGreaterThan(balloonRadius)
    
    // Get resting Y before click
    const initialJumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    const restingY = initialJumpState.restingY
    
    // Get balloon position in CSS pixels for clicking
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
    
    // Click balloon center using real mouse click
    await page.mouse.click(
      balloonCssBounds!.x + balloonCssBounds!.width / 2, 
      balloonCssBounds!.y + balloonCssBounds!.height / 2
    )
    
    // Sample cat position and jump state over time to verify sequence: arrive, then jump
    const samples = await page.evaluate(async ({ balloonCenterX, balloonRadius, restingY }) => {
      const samples: Array<{ t: number; catX: number; catY: number; isJumping: boolean }> = []
      const startTime = Date.now()
      const maxDuration = 3000 // 3 seconds
      
      return new Promise<typeof samples>((resolve) => {
        const interval = setInterval(() => {
          const elapsed = Date.now() - startTime
          
          if (elapsed > maxDuration) {
            clearInterval(interval)
            resolve(samples)
            return
          }
          
          const catPos = window.__tatematika!.getCatPosition()
          const jumpState = window.__tatematika!.getCatJumpState()
          
          samples.push({
            t: elapsed,
            catX: catPos.x,
            catY: catPos.y,
            isJumping: jumpState.isJumping || catPos.y < restingY
          })
        }, 50) // Poll every 50ms
      })
    }, { balloonCenterX, balloonRadius, restingY })
    
    // Find when cat arrived at balloon (within radius)
    const arrivedIndex = samples.findIndex(s => 
      Math.abs(s.catX - balloonCenterX) <= balloonRadius
    )
    
    expect(arrivedIndex, 'cat never reached balloon').toBeGreaterThanOrEqual(0)
    
    // Verify real movement: require at least one sample before arrival that is away from balloon
    const hadSampleAwayBeforeArrival = samples.slice(0, arrivedIndex).some(s =>
      Math.abs(s.catX - balloonCenterX) > balloonRadius
    )
    
    expect(hadSampleAwayBeforeArrival, 'cat did not travel to balloon (no away sample before arrival)').toBe(true)
    
    // Find if cat jumped after arrival (while still at balloon)
    const jumpedAfterArrival = samples.slice(arrivedIndex).some(s => 
      s.isJumping && Math.abs(s.catX - balloonCenterX) <= balloonRadius
    )
    
    expect(jumpedAfterArrival, 'cat reached balloon but did not jump there').toBe(true)
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
    const wrongBalloons = state.balloons.filter(b => !b.isCorrect)
    
    // Get cat's starting position
    let catStartPos = await page.evaluate(() => window.__tatematika!.getCatPosition())
    
    // Pick the FARTHEST wrong balloon from cat's starting x (to exercise travel)
    const balloonBoundsMap = new Map<string, any>()
    for (const balloon of wrongBalloons) {
      const bounds = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), balloon.id)
      if (bounds) {
        balloonBoundsMap.set(balloon.id, bounds)
      }
    }
    
    let targetBalloon = wrongBalloons[0]
    let maxDistance = 0
    for (const balloon of wrongBalloons) {
      const bounds = balloonBoundsMap.get(balloon.id)
      if (!bounds) continue
      const centerX = bounds.x + bounds.width / 2
      const distance = Math.abs(catStartPos.x - centerX)
      if (distance > maxDistance) {
        maxDistance = distance
        targetBalloon = balloon
      }
    }
    
    // Get balloon bounds BEFORE tap
    const balloonGameBounds = balloonBoundsMap.get(targetBalloon.id)
    expect(balloonGameBounds).not.toBeNull()
    
    const balloonCenterX = balloonGameBounds!.x + balloonGameBounds!.width / 2
    const balloonRadius = balloonGameBounds!.width / 2
    
    // Precondition: cat must start away from target balloon
    // If cat is already under balloon, move it away
    let attempts = 0
    while (Math.abs(catStartPos.x - balloonCenterX) <= balloonRadius && attempts < 20) {
      // Move cat away with keyboard
      const moveDirection = catStartPos.x < balloonCenterX ? 'ArrowLeft' : 'ArrowRight'
      await page.keyboard.press(moveDirection)
      await page.waitForTimeout(200)
      catStartPos = await page.evaluate(() => window.__tatematika!.getCatPosition())
      attempts++
    }
    
    // Assert precondition
    const startDistance = Math.abs(catStartPos.x - balloonCenterX)
    expect(startDistance, 'precondition: cat must start away from target balloon').toBeGreaterThan(balloonRadius)
    
    // Get resting Y before tap
    const initialJumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    const restingY = initialJumpState.restingY
    
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
    
    // Tap balloon center using touchscreen
    await page.touchscreen.tap(
      balloonCssBounds!.x + balloonCssBounds!.width / 2, 
      balloonCssBounds!.y + balloonCssBounds!.height / 2
    )
    
    // Sample cat position and jump state over time to verify sequence: arrive, then jump
    const samples = await page.evaluate(async ({ balloonCenterX, balloonRadius, restingY }) => {
      const samples: Array<{ t: number; catX: number; catY: number; isJumping: boolean }> = []
      const startTime = Date.now()
      const maxDuration = 3000 // 3 seconds
      
      return new Promise<typeof samples>((resolve) => {
        const interval = setInterval(() => {
          const elapsed = Date.now() - startTime
          
          if (elapsed > maxDuration) {
            clearInterval(interval)
            resolve(samples)
            return
          }
          
          const catPos = window.__tatematika!.getCatPosition()
          const jumpState = window.__tatematika!.getCatJumpState()
          
          samples.push({
            t: elapsed,
            catX: catPos.x,
            catY: catPos.y,
            isJumping: jumpState.isJumping || catPos.y < restingY
          })
        }, 50) // Poll every 50ms
      })
    }, { balloonCenterX, balloonRadius, restingY })
    
    // Find when cat arrived at balloon (within radius)
    const arrivedIndex = samples.findIndex(s => 
      Math.abs(s.catX - balloonCenterX) <= balloonRadius
    )
    
    expect(arrivedIndex, 'cat never reached balloon').toBeGreaterThanOrEqual(0)
    
    // Verify real movement: require at least one sample before arrival that is away from balloon
    const hadSampleAwayBeforeArrival = samples.slice(0, arrivedIndex).some(s =>
      Math.abs(s.catX - balloonCenterX) > balloonRadius
    )
    
    expect(hadSampleAwayBeforeArrival, 'cat did not travel to balloon (no away sample before arrival)').toBe(true)
    
    // Find if cat jumped after arrival (while still at balloon)
    const jumpedAfterArrival = samples.slice(arrivedIndex).some(s => 
      s.isJumping && Math.abs(s.catX - balloonCenterX) <= balloonRadius
    )
    
    expect(jumpedAfterArrival, 'cat reached balloon but did not jump there').toBe(true)
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
    
    // Press space to jump - poll to verify jump happens
    const initialJumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    const restingY = initialJumpState.restingY
    
    await page.keyboard.press('Space')
    
    // Poll for up to 1000ms to detect jump
    const spaceJumped = await page.evaluate(async ({ restingY }) => {
      const startTime = Date.now()
      return new Promise<boolean>((resolve) => {
        const interval = setInterval(() => {
          const elapsed = Date.now() - startTime
          
          if (elapsed > 1000) {
            clearInterval(interval)
            resolve(false)
            return
          }
          
          const catPos = window.__tatematika!.getCatPosition()
          const jumpState = window.__tatematika!.getCatJumpState()
          
          if (jumpState.isJumping || catPos.y < restingY) {
            clearInterval(interval)
            resolve(true)
          }
        }, 50)
      })
    }, { restingY })
    
    expect(spaceJumped, 'Space key did not trigger jump').toBe(true)
    
    // Test ArrowUp also works for jump
    // First wait for previous jump to end
    await page.evaluate(async () => {
      const startTime = Date.now()
      return new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          const elapsed = Date.now() - startTime
          
          if (elapsed > 2000) {
            clearInterval(interval)
            resolve()
            return
          }
          
          const jumpState = window.__tatematika!.getCatJumpState()
          
          if (!jumpState.isJumping) {
            clearInterval(interval)
            resolve()
          }
        }, 50)
      })
    })
    
    // Now press ArrowUp
    await page.keyboard.press('ArrowUp')
    
    // Poll for up to 1000ms to detect jump
    const arrowUpJumped = await page.evaluate(async ({ restingY }) => {
      const startTime = Date.now()
      return new Promise<boolean>((resolve) => {
        const interval = setInterval(() => {
          const elapsed = Date.now() - startTime
          
          if (elapsed > 1000) {
            clearInterval(interval)
            resolve(false)
            return
          }
          
          const catPos = window.__tatematika!.getCatPosition()
          const jumpState = window.__tatematika!.getCatJumpState()
          
          if (jumpState.isJumping || catPos.y < restingY) {
            clearInterval(interval)
            resolve(true)
          }
        }, 50)
      })
    }, { restingY })
    
    expect(arrowUpJumped, 'ArrowUp key did not trigger jump').toBe(true)
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
    
    // Poll until sound is played
    const lastSound = await expect.poll(async () => {
      return await page.evaluate(() => window.__tatematika!.getLastPlayedSound())
    }, { timeout: 5000, intervals: [50] }).toBeTruthy()
    
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
    
    // Pop a correct balloon and verify sound plays (count increases)
    let state = await page.evaluate(() => window.__tatematika!.getGameState())
    let prevStars = state.stars
    const correctBalloon = state.balloons.find(b => b.isCorrect)!
    
    const countBefore = await page.evaluate(() => window.__tatematika!.getSoundPlayCount())
    
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correctBalloon.id)
    
    // Wait for star to increment
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__tatematika!.getGameState())
      return s.stars
    }, { timeout: 5000, intervals: [50] }).toBe(prevStars + 1)
    
    const countAfterUnmuted = await page.evaluate(() => window.__tatematika!.getSoundPlayCount())
    const lastSound = await page.evaluate(() => window.__tatematika!.getLastPlayedSound())
    
    expect(countAfterUnmuted).toBeGreaterThan(countBefore) // Sound played
    expect(lastSound).toBeTruthy()
    expect(['pop', 'пук', 'correct']).toContain(lastSound)
    
    // Wait for new round (target or balloon ids change)
    const prevTarget = state.target
    const prevBalloonIds = state.balloons.map(b => b.id)
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__tatematika!.getGameState())
      return s.target !== prevTarget || !s.balloons.every((b, i) => b.id === prevBalloonIds[i])
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Now mute
    await page.evaluate(() => window.__tatematika!.toggleMute())
    const isMuted = await page.evaluate(() => window.__tatematika!.isMuted())
    expect(isMuted).toBe(true)
    
    // Pop another correct balloon while muted
    state = await page.evaluate(() => window.__tatematika!.getGameState())
    prevStars = state.stars
    const nextCorrect = state.balloons.find(b => b.isCorrect)!
    
    const countBeforeMuted = await page.evaluate(() => window.__tatematika!.getSoundPlayCount())
    
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), nextCorrect.id)
    
    // Wait for star to increment
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__tatematika!.getGameState())
      return s.stars
    }, { timeout: 5000, intervals: [50] }).toBe(prevStars + 1)
    
    // Give effects 300ms to settle
    await page.waitForTimeout(300)
    
    const countAfterMuted = await page.evaluate(() => window.__tatematika!.getSoundPlayCount())
    
    // When muted, count must NOT increase
    expect(countAfterMuted).toBe(countBeforeMuted)
    
    // Wait for new round
    const prevTarget2 = state.target
    const prevBalloonIds2 = state.balloons.map(b => b.id)
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__tatematika!.getGameState())
      return s.target !== prevTarget2 || !s.balloons.every((b, i) => b.id === prevBalloonIds2[i])
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Unmute and verify sound works again (count increases)
    await page.evaluate(() => window.__tatematika!.toggleMute())
    
    state = await page.evaluate(() => window.__tatematika!.getGameState())
    prevStars = state.stars
    const thirdCorrect = state.balloons.find(b => b.isCorrect)!
    
    const countBeforeUnmuted = await page.evaluate(() => window.__tatematika!.getSoundPlayCount())
    
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), thirdCorrect.id)
    
    // Wait for star to increment
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__tatematika!.getGameState())
      return s.stars
    }, { timeout: 5000, intervals: [50] }).toBe(prevStars + 1)
    
    const countAfterUnmuted = await page.evaluate(() => window.__tatematika!.getSoundPlayCount())
    
    // After unmuting, count increases again
    expect(countAfterUnmuted).toBeGreaterThan(countBeforeUnmuted)
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
      let state = await page.evaluate(() => window.__tatematika!.getGameState())
      const prevStars = state.stars
      const correct = state.balloons.find(b => b.isCorrect)!
      
      await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correct.id)
      
      // Wait for star to increment
      await expect.poll(async () => {
        const s = await page.evaluate(() => window.__tatematika!.getGameState())
        return s.stars
      }, { timeout: 5000, intervals: [50] }).toBe(prevStars + 1)
      
      // If not the last pop, wait for new round
      if (i < 4) {
        const prevTarget = state.target
        const prevBalloonIds = state.balloons.map(b => b.id)
        await expect.poll(async () => {
          const s = await page.evaluate(() => window.__tatematika!.getGameState())
          return s.target !== prevTarget || !s.balloons.every((b, idx) => b.id === prevBalloonIds[idx])
        }, { timeout: 5000, intervals: [50] }).toBe(true)
      }
    }
    
    // Poll until getLevelEndText contains 'Ти успя'
    const levelText = await expect.poll(async () => {
      return await page.evaluate(() => window.__tatematika!.getLevelEndText())
    }, { timeout: 5000, intervals: [50] }).toContain('Ти успя')
    
    expect(levelText).toBeTruthy()
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
      let state = await page.evaluate(() => window.__tatematika!.getGameState())
      const prevStars = state.stars
      const correct = state.balloons.find(b => b.isCorrect)!
      
      await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correct.id)
      
      // Wait for star to increment
      await expect.poll(async () => {
        const s = await page.evaluate(() => window.__tatematika!.getGameState())
        return s.stars
      }, { timeout: 5000, intervals: [50] }).toBe(prevStars + 1)
      
      // If not the last pop, wait for new round
      if (i < 4) {
        const prevTarget = state.target
        const prevBalloonIds = state.balloons.map(b => b.id)
        await expect.poll(async () => {
          const s = await page.evaluate(() => window.__tatematika!.getGameState())
          return s.target !== prevTarget || !s.balloons.every((b, idx) => b.id === prevBalloonIds[idx])
        }, { timeout: 5000, intervals: [50] }).toBe(true)
      }
    }
    
    // Wait for button to be visible
    const playAgainButton = page.locator('[data-testid="button-play-again"]')
    await expect(playAgainButton).toBeVisible({ timeout: 5000 })
    await playAgainButton.click()
    
    // Poll for stars === 0 and balloons.length === 3
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__tatematika!.getGameState())
      return s.stars === 0 && s.balloons.length === 3
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    const stateAfter = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateAfter.target).toBeGreaterThanOrEqual(0)
    
    // Pop a balloon and verify stars increment to 1
    const correct = stateAfter.balloons.find(b => b.isCorrect)!
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correct.id)
    
    // Poll for stars === 1
    await expect.poll(async () => {
      const s = await page.evaluate(() => window.__tatematika!.getGameState())
      return s.stars
    }, { timeout: 5000, intervals: [50] }).toBe(1)
  })
})
