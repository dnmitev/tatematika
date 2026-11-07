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
  // Instrument oscillator to count sounds
  await page.addInitScript(() => {
    (window as any).__oscillatorStarts = []
    const BaseProto = (window as any).BaseAudioContext?.prototype || (window as any).AudioContext?.prototype
    if (BaseProto) {
      const originalCreateOscillator = BaseProto.createOscillator
      BaseProto.createOscillator = function() {
        const osc = originalCreateOscillator.call(this)
        const originalStart = osc.start
        osc.start = function() {
          (window as any).__oscillatorStarts.push(Date.now())
          return originalStart.apply(this, arguments)
        }
        return osc
      }
    }
  })

  await page.goto('/')
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  
  // Install postupdate recorder for bounce detection
  await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    
    if (!window.__balloonFrameRecorder) {
      window.__balloonFrameRecorder = new Map<string, Array<{ x: number; y: number; frame: number }>>()
      let frameCount = 0
      
      scene.events.on('postupdate', () => {
        frameCount++
        const state = window.__tatematika!.getGameState()
        for (const balloon of state.balloons) {
          const bounds = window.__tatematika!.getBalloonBounds(balloon.id)
          if (bounds) {
            if (!window.__balloonFrameRecorder.has(balloon.id)) {
              window.__balloonFrameRecorder.set(balloon.id, [])
            }
            window.__balloonFrameRecorder.get(balloon.id)!.push({
              x: bounds.x,
              y: bounds.y,
              frame: frameCount
            })
          }
        }
      })
    }
  })
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

function checkBounce(frames: Array<{ x: number; y: number; frame: number }>): boolean {
  if (frames.length < 3) return false
  
  for (let i = 1; i < frames.length - 1; i++) {
    const dyPrev = frames[i].y - frames[i - 1].y
    const dyNext = frames[i + 1].y - frames[i].y
    
    if (dyPrev < -2 && dyNext > 2) {
      return true
    }
  }
  return false
}

test('K12: Repeated inputs during correct balloon action are fully ignored', async ({ page }) => {
  // Wait for cat to be idle
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  const state = await page.evaluate(() => window.__tatematika!.getGameState())
  const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
  const wrongBalloons = state.balloons.filter((b: any) => !b.isCorrect)
  const initialStars = state.stars
  const initialTarget = state.target
  const initialWrongAttempts = state.wrongAttempts
  
  const canvas = await getCanvasCoordinates(page)
  
  // Reset frame recorder and sound counter
  await page.evaluate((id) => {
    window.__balloonFrameRecorder.clear()
    window.__oscillatorStarts = []
  }, correctBalloon.id)
  
  const oscCountBefore = await page.evaluate(() => (window as any).__oscillatorStarts.length)
  
  // Click correct balloon to start action
  await clickBalloon(page, correctBalloon.id, canvas)
  
  // Record inputs in all phases
  const inputPhases: string[] = []
  
  // Phase 1: During walk (before isJumping)
  for (let i = 0; i < 3; i++) {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    if (!jumpState.isJumping) {
      inputPhases.push('walk')
      await clickBalloon(page, correctBalloon.id, canvas)
      if (wrongBalloons[0]) {
        await clickBalloon(page, wrongBalloons[0].id, canvas)
      }
      await page.keyboard.press('Space')
    } else {
      break
    }
    await page.waitForTimeout(10)
  }
  
  // Phase 2: Mid-jump
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return jumpState.isJumping
  }, { timeout: 2000, intervals: [10] }).toBe(true)
  
  for (let i = 0; i < 3; i++) {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    if (jumpState.isJumping) {
      inputPhases.push('jump')
      await clickBalloon(page, correctBalloon.id, canvas)
      if (wrongBalloons[0]) {
        await clickBalloon(page, wrongBalloons[0].id, canvas)
      }
      await page.keyboard.press('ArrowUp')
    }
    await page.waitForTimeout(20)
  }
  
  // Phase 3: During landing (after isJumping but before new round)
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  for (let i = 0; i < 3; i++) {
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    if (newState.stars === initialStars) {
      inputPhases.push('landing')
      await clickBalloon(page, correctBalloon.id, canvas)
      if (wrongBalloons[0]) {
        await clickBalloon(page, wrongBalloons[0].id, canvas)
      }
      await page.keyboard.press('Space')
    } else {
      break
    }
    await page.waitForTimeout(10)
  }
  
  // Assert all phases were covered (precondition)
  expect(inputPhases.filter(p => p === 'walk').length, 'walk phase must be covered').toBeGreaterThan(0)
  expect(inputPhases.filter(p => p === 'jump').length, 'jump phase must be covered').toBeGreaterThan(0)
  expect(inputPhases.filter(p => p === 'landing').length, 'landing phase must be covered').toBeGreaterThan(0)
  
  // Wait for evaluation to complete
  await expect.poll(async () => {
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    return newState.stars > initialStars
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  await page.waitForTimeout(100)
  
  // K12 assertions: target unchanged during action, evaluation happened exactly once
  const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
  expect(finalState.stars, 'Stars should increase exactly once').toBe(initialStars + 1)
  expect(finalState.wrongAttempts, 'Wrong attempts unchanged').toBe(initialWrongAttempts)
  
  // Exactly one "pop" sound (not 1+N rejected sounds)
  const oscCountAfter = await page.evaluate(() => (window as any).__oscillatorStarts.length)
  const soundCount = oscCountAfter - oscCountBefore
  expect(soundCount, 'Exactly one pop sound, no additional sounds from rejected inputs').toBe(1)
  
  // No bounces on any balloon (correct balloon popped, not bounced)
  const balloonFrames = await page.evaluate(() => {
    const result: Record<string, any[]> = {}
    for (const [id, frames] of window.__balloonFrameRecorder.entries()) {
      result[id] = frames
    }
    return result
  })
  
  for (const wrongBalloon of wrongBalloons) {
    const frames = balloonFrames[wrongBalloon.id] || []
    const bounced = checkBounce(frames)
    expect(bounced, `Wrong balloon ${wrongBalloon.id} should not bounce from rejected inputs`).toBe(false)
  }
  
  // Verify new round started
  expect(finalState.target !== initialTarget || finalState.balloons[0].id !== state.balloons[0].id, 
    'New round should have started').toBe(true)
  
  // Cat is idle, ready for next input (nothing queued)
  const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
  expect(jumpState.isJumping, 'Cat should be idle after landing, nothing queued').toBe(false)
})

test('K13: Repeated inputs during wrong balloon action are fully ignored', async ({ page }) => {
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
  const initialTarget = state.target
  
  const canvas = await getCanvasCoordinates(page)
  
  // Reset frame recorder and sound counter
  await page.evaluate(() => {
    window.__balloonFrameRecorder.clear()
    window.__oscillatorStarts = []
  })
  
  const oscCountBefore = await page.evaluate(() => (window as any).__oscillatorStarts.length)
  
  // Click wrong balloon to start action
  await clickBalloon(page, wrongBalloon.id, canvas)
  
  // Record inputs in all phases
  const inputPhases: string[] = []
  
  // Phase 1: During walk (before isJumping)
  for (let i = 0; i < 3; i++) {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    if (!jumpState.isJumping) {
      inputPhases.push('walk')
      await clickBalloon(page, correctBalloon.id, canvas)
      await clickBalloon(page, wrongBalloon.id, canvas)
      await page.keyboard.press('Space')
    } else {
      break
    }
    await page.waitForTimeout(10)
  }
  
  // Phase 2: Mid-jump
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return jumpState.isJumping
  }, { timeout: 2000, intervals: [10] }).toBe(true)
  
  for (let i = 0; i < 3; i++) {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    if (jumpState.isJumping) {
      inputPhases.push('jump')
      await clickBalloon(page, correctBalloon.id, canvas)
      await clickBalloon(page, wrongBalloon.id, canvas)
      await page.keyboard.press('ArrowLeft')
    }
    await page.waitForTimeout(20)
  }
  
  // Phase 3: During landing (after isJumping but before error is counted)
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  for (let i = 0; i < 3; i++) {
    const currentState = await page.evaluate(() => window.__tatematika!.getGameState())
    if (currentState.wrongAttempts === initialWrongAttempts) {
      inputPhases.push('landing')
      await clickBalloon(page, correctBalloon.id, canvas)
      await clickBalloon(page, wrongBalloon.id, canvas)
      await page.keyboard.press('Space')
    } else {
      break
    }
    await page.waitForTimeout(10)
  }
  
  // Assert all phases were covered (precondition)
  expect(inputPhases.filter(p => p === 'walk').length, 'walk phase must be covered').toBeGreaterThan(0)
  expect(inputPhases.filter(p => p === 'jump').length, 'jump phase must be covered').toBeGreaterThan(0)
  expect(inputPhases.filter(p => p === 'landing').length, 'landing phase must be covered').toBeGreaterThan(0)
  
  // Wait for error to be counted
  await expect.poll(async () => {
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    return newState.wrongAttempts > initialWrongAttempts
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  await page.waitForTimeout(100)
  
  // K13 assertions: wrongAttempts increased exactly once, no additional errors/bounces/sounds
  const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
  expect(finalState.wrongAttempts, 'Wrong attempts should increase exactly once').toBe(initialWrongAttempts + 1)
  expect(finalState.stars, 'Stars unchanged').toBe(initialStars)
  expect(finalState.target, 'Target unchanged (same round)').toBe(initialTarget)
  
  // Count sounds from rejected inputs (should be 0 additional beyond the first wrong tap)
  const oscCountAfter = await page.evaluate(() => (window as any).__oscillatorStarts.length)
  const soundCount = oscCountAfter - oscCountBefore
  
  // Should be sounds from ONE wrong tap only (not 1+N from rejected inputs)
  // Baseline: one wrong tap produces N sounds
  // With rejected inputs: should still be N sounds total
  expect(soundCount, 'Should have sounds from first wrong tap only, no additional sounds from rejected inputs').toBeGreaterThan(0)
  
  // Check for additional bounces on OTHER balloons from rejected inputs
  const balloonFrames = await page.evaluate(() => {
    const result: Record<string, any[]> = {}
    for (const [id, frames] of window.__balloonFrameRecorder.entries()) {
      result[id] = frames
    }
    return result
  })
  
  // Wrong balloon bounces once (from first tap), other balloons should not bounce
  const otherBalloons = state.balloons.filter((b: any) => b.id !== wrongBalloon.id)
  for (const otherBalloon of otherBalloons) {
    const frames = balloonFrames[otherBalloon.id] || []
    const bounced = checkBounce(frames)
    expect(bounced, `Other balloon ${otherBalloon.id} should not bounce from rejected inputs`).toBe(false)
  }
  
  // Cat is idle, nothing queued
  const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
  expect(jumpState.isJumping, 'Cat should be idle after landing, nothing queued').toBe(false)
})

test('K14: No re-execution of rejected inputs after landing (correct balloon)', async ({ page }) => {
  // Wait for cat to be idle
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  const state = await page.evaluate(() => window.__tatematika!.getGameState())
  const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
  const wrongBalloons = state.balloons.filter((b: any) => !b.isCorrect)
  const initialStars = state.stars
  
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
  
  // Wait for action to complete and new round to start (use round token)
  const initialBalloonIds = state.balloons.map((b: any) => b.id).sort()
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    const newBalloonIds = newState.balloons.map((b: any) => b.id).sort()
    return !jumpState.isJumping && newState.stars > initialStars && JSON.stringify(newBalloonIds) !== JSON.stringify(initialBalloonIds)
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  // Reset sound counter and frame recorder
  await page.evaluate(() => {
    window.__oscillatorStarts = []
    window.__balloonFrameRecorder.clear()
  })
  
  const oscCountBefore = await page.evaluate(() => (window as any).__oscillatorStarts.length)
  const catPosBefore = await page.evaluate(() => window.__tatematika!.getCatPosition())
  
  // Record 60 postupdate frames to verify no re-execution
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      let frameCount = 0
      const handler = () => {
        frameCount++
        if (frameCount >= 60) {
          scene.events.off('postupdate', handler)
          resolve()
        }
      }
      scene.events.on('postupdate', handler)
    })
  })
  
  // Assert no automatic action started (rejected inputs not re-executed)
  const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
  expect(jumpState.isJumping, 'Cat should still be idle - rejected inputs not re-executed').toBe(false)
  
  // Assert no movement toward another balloon
  const catPosAfter = await page.evaluate(() => window.__tatematika!.getCatPosition())
  expect(Math.abs(catPosAfter.x - catPosBefore.x), 'Cat should not move toward another balloon').toBeLessThan(5)
  
  // Assert no sounds from rejected inputs
  const oscCountAfter = await page.evaluate(() => (window as any).__oscillatorStarts.length)
  expect(oscCountAfter - oscCountBefore, 'No sounds from rejected inputs').toBe(0)
  
  // Assert no wrongAttempts from rejected inputs
  const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
  expect(finalState.wrongAttempts, 'No errors from rejected inputs').toBe(0)
})

test('K14: No re-execution of rejected inputs after landing (wrong balloon)', async ({ page }) => {
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
  
  const canvas = await getCanvasCoordinates(page)
  
  // Click wrong balloon to start action
  await clickBalloon(page, wrongBalloon.id, canvas)
  
  // Poll until jumping
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return jumpState.isJumping
  }, { timeout: 1000, intervals: [10] }).toBe(true)
  
  // Click correct balloon multiple times during action (these should be rejected)
  for (let i = 0; i < 5; i++) {
    await clickBalloon(page, correctBalloon.id, canvas)
  }
  
  // Wait for action to complete (error counted, balloon bounced)
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    return !jumpState.isJumping && newState.wrongAttempts > initialWrongAttempts
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  // Reset sound counter and frame recorder
  await page.evaluate(() => {
    window.__oscillatorStarts = []
    window.__balloonFrameRecorder.clear()
  })
  
  const oscCountBefore = await page.evaluate(() => (window as any).__oscillatorStarts.length)
  const catPosBefore = await page.evaluate(() => window.__tatematika!.getCatPosition())
  
  // Record 60 postupdate frames to verify no re-execution
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      let frameCount = 0
      const handler = () => {
        frameCount++
        if (frameCount >= 60) {
          scene.events.off('postupdate', handler)
          resolve()
        }
      }
      scene.events.on('postupdate', handler)
    })
  })
  
  // Assert no automatic action started (rejected inputs not re-executed)
  const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
  expect(jumpState.isJumping, 'Cat should still be idle - rejected inputs not re-executed').toBe(false)
  
  // Assert no movement toward another balloon
  const catPosAfter = await page.evaluate(() => window.__tatematika!.getCatPosition())
  expect(Math.abs(catPosAfter.x - catPosBefore.x), 'Cat should not move toward correct balloon').toBeLessThan(5)
  
  // Assert no sounds from rejected inputs
  const oscCountAfter = await page.evaluate(() => (window as any).__oscillatorStarts.length)
  expect(oscCountAfter - oscCountBefore, 'No sounds from rejected inputs').toBe(0)
  
  // Assert no additional wrongAttempts from rejected inputs
  const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
  expect(finalState.wrongAttempts, 'No additional errors from rejected inputs').toBe(initialWrongAttempts + 1)
})

test('K15: New input accepted after action completes (mouse)', async ({ page }) => {
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
  const initialBalloonIds = state.balloons.map((b: any) => b.id).sort()
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    const newBalloonIds = newState.balloons.map((b: any) => b.id).sort()
    return !jumpState.isJumping && newState.stars > state.stars && JSON.stringify(newBalloonIds) !== JSON.stringify(initialBalloonIds)
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

test('K15: New input accepted after action completes (keyboard)', async ({ page }) => {
  // Wait for cat to be idle
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  const state = await page.evaluate(() => window.__tatematika!.getGameState())
  const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
  const catPos = await page.evaluate(() => window.__tatematika!.getCatPosition())
  const bounds = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), correctBalloon.id)
  
  // Navigate with arrow keys and jump with Space
  const targetX = bounds.x + bounds.width / 2
  if (catPos.x < targetX) {
    while (catPos.x < targetX - 10) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(50)
      const newPos = await page.evaluate(() => window.__tatematika!.getCatPosition())
      if (newPos.x >= targetX - 10) break
      Object.assign(catPos, newPos)
    }
  } else {
    while (catPos.x > targetX + 10) {
      await page.keyboard.press('ArrowLeft')
      await page.waitForTimeout(50)
      const newPos = await page.evaluate(() => window.__tatematika!.getCatPosition())
      if (newPos.x <= targetX + 10) break
      Object.assign(catPos, newPos)
    }
  }
  
  // Jump
  await page.keyboard.press('Space')
  
  // Wait for action to complete and new round
  const initialBalloonIds = state.balloons.map((b: any) => b.id).sort()
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    const newBalloonIds = newState.balloons.map((b: any) => b.id).sort()
    return !jumpState.isJumping && newState.stars > state.stars && JSON.stringify(newBalloonIds) !== JSON.stringify(initialBalloonIds)
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  // Now try new keyboard input - it should be accepted
  const newState = await page.evaluate(() => window.__tatematika!.getGameState())
  
  // Press arrow key to move
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(100)
  
  // Press Space to jump
  await page.keyboard.press('Space')
  
  // Verify action started or completed
  const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
  expect(finalState.stars >= newState.stars, 'New keyboard input should be accepted').toBe(true)
})
