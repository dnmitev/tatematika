import { test, expect } from '@playwright/test'
import { ACTION_TIMEOUT_MS, INIT_TIMEOUT_MS, multiRoundTestTimeout } from './test-timeouts'
import { balloonId, watchBalloonAnswer } from './feedback-observers'

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

async function installBounceLatch(page: any) {
  // timing: spec sets no duration (docs/games/kote-balonche.md); see tate-dev k22 evidence
  await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    if ((window as any).__stopBounceLatch) (window as any).__stopBounceLatch()

    const tracks: Record<string, {
      rest: number
      away: boolean
      touched: boolean
      settle: number
      count: number
      minY: number
      maxY: number
      samples: number
    }> = {}

    const onFrame = () => {
      const balloons = window.__tatematika!.getGameState().balloons
      for (const balloon of balloons) {
        // Rendered position comes from getBalloonBounds. Do not read sprite.y here.
        const bounds = window.__tatematika!.getBalloonBounds(balloon.id)
        if (!bounds) continue
        const y = bounds.y
        let track = tracks[balloon.id]
        if (!track) {
          track = tracks[balloon.id] = {
            rest: y, away: false, touched: false, settle: 0, count: 0,
            minY: y, maxY: y, samples: 0
          }
        }
        track.samples++
        track.minY = Math.min(track.minY, y)
        track.maxY = Math.max(track.maxY, y)
        const dist = Math.abs(y - track.rest)
        if (!track.away && !track.touched) {
          if (dist >= 2) track.away = true
          else track.rest = y
        } else if (dist <= 2) {
          track.settle++
          if (track.settle >= 2) {
            track.count++
            track.away = false
            track.touched = false
            track.settle = 0
            track.rest = y
          } else {
            track.touched = true
            track.away = false
          }
        } else {
          track.settle = 0
          track.away = true
        }
      }
    }

    game.events.on('postrender', onFrame)
    ;(window as any).__stopBounceLatch = () => game.events.off('postrender', onFrame)
    ;(window as any).__resetBounceLatch = () => {
      for (const id of Object.keys(tracks)) delete tracks[id]
    }
    ;(window as any).__bounceLatchCount = (id: string) => {
      const track = tracks[id]
      if (!track) return 0
      const openReturn = track.touched && track.settle < 2 ? 1 : 0
      return track.count + openReturn
    }
    ;(window as any).__bounceLatchDiagnostic = (id: string) => {
      const track = tracks[id]
      if (!track) return 'No frames recorded'
      const count = (window as any).__bounceLatchCount(id)
      return `${track.samples} frames, ${count} bounces, y range [${track.minY.toFixed(1)}, ${track.maxY.toFixed(1)}]`
    }
  })
}

async function readBounce(page: any, id: string): Promise<{ count: number; diagnostic: string }> {
  return page.evaluate((balloonId: string) => ({
    count: (window as any).__bounceLatchCount(balloonId),
    diagnostic: (window as any).__bounceLatchDiagnostic(balloonId)
  }), id)
}

async function farthestWrongBalloon(page: any, balloons: Array<{ id: string }>) {
  // timing: spec sets no duration (docs/games/kote-balonche.md); see tate-dev k22 evidence
  const catX = await page.evaluate(() => window.__tatematika!.getCatPosition().x)
  const walkDxPx = 2
  let farthest = balloons[0]
  let farthestDx = -1
  let chosen = balloons[0]
  let chosenDx = -1
  for (const balloon of balloons) {
    const bounds = await page.evaluate((id: string) => window.__tatematika!.getBalloonBounds(id), balloon.id)
    if (!bounds) continue
    const dx = Math.abs(bounds.x + bounds.width / 2 - catX)
    if (dx > farthestDx) {
      farthestDx = dx
      farthest = balloon
    }
    if (dx > walkDxPx && dx > chosenDx) {
      chosenDx = dx
      chosen = balloon
    }
  }
  return chosenDx > walkDxPx ? chosen : farthest
}

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
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  
  // Install postrender latch for bounce detection
  await installBounceLatch(page)
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

test('K12: Repeated inputs during correct balloon action are fully ignored', async ({ page }) => {
  test.setTimeout(90000) // Multiple actions
  
  // Check that getActionPhase hook exists
  const hasGetActionPhase = await page.evaluate(() => typeof window.__tatematika!.getActionPhase === 'function')
  expect(hasGetActionPhase, 'K12 CONTRACT: getActionPhase hook must be implemented').toBe(true)
  
  // Wait for cat to be idle
  await expect.poll(async () => {
    const phase = await page.evaluate(() => window.__tatematika!.getActionPhase!())
    return phase === 'idle'
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  const state = await page.evaluate(() => window.__tatematika!.getGameState())
  const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
  const wrongBalloons = state.balloons.filter((b: any) => !b.isCorrect)
  const initialStars = state.stars
  const initialTarget = state.target
  const initialWrongAttempts = state.wrongAttempts
  
  const canvas = await getCanvasCoordinates(page)
  
  // Reset bounce latch and sound counter
  await page.evaluate(() => {
    ;(window as any).__resetBounceLatch()
    window.__oscillatorStarts = []
  })
  
  const oscCountBefore = await page.evaluate(() => (window as any).__oscillatorStarts.length)
  
  // Install phase-based input injector
  await page.evaluate(({ correctId, wrongId }) => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const canvas = document.querySelector('canvas')!
    const rect = canvas.getBoundingClientRect()
    const scale = rect.width / game.scale.width
    
    window.__phaseInputs = []
    let lastPhase = 'idle'
    
    const injectInput = () => {
      const currentPhase = window.__tatematika!.getActionPhase!()
      
      // On first frame of each phase, dispatch real DOM input
      if (currentPhase !== lastPhase && currentPhase !== 'idle') {
        window.__phaseInputs.push(currentPhase)
        
        // Dispatch real pointer events on correct balloon
        const correctBounds = window.__tatematika!.getBalloonBounds(correctId)
        if (correctBounds) {
          const gameX = correctBounds.x + correctBounds.width / 2
          const gameY = correctBounds.y + correctBounds.height / 2
          const clientX = rect.left + gameX * scale
          const clientY = rect.top + gameY * scale
          
          canvas.dispatchEvent(new PointerEvent('pointerdown', { 
            bubbles: true, clientX, clientY, isPrimary: true, button: 0 
          }))
          canvas.dispatchEvent(new PointerEvent('pointerup', { 
            bubbles: true, clientX, clientY, isPrimary: true, button: 0 
          }))
          canvas.dispatchEvent(new MouseEvent('mousedown', { 
            bubbles: true, clientX, clientY, button: 0 
          }))
          canvas.dispatchEvent(new MouseEvent('mouseup', { 
            bubbles: true, clientX, clientY, button: 0 
          }))
        }
        
        // Dispatch real pointer events on wrong balloon if exists
        if (wrongId) {
          const wrongBounds = window.__tatematika!.getBalloonBounds(wrongId)
          if (wrongBounds) {
            const gameX = wrongBounds.x + wrongBounds.width / 2
            const gameY = wrongBounds.y + wrongBounds.height / 2
            const clientX = rect.left + gameX * scale
            const clientY = rect.top + gameY * scale
            
            canvas.dispatchEvent(new PointerEvent('pointerdown', { 
              bubbles: true, clientX, clientY, isPrimary: true, button: 0 
            }))
            canvas.dispatchEvent(new PointerEvent('pointerup', { 
              bubbles: true, clientX, clientY, isPrimary: true, button: 0 
            }))
            canvas.dispatchEvent(new MouseEvent('mousedown', { 
              bubbles: true, clientX, clientY, button: 0 
            }))
            canvas.dispatchEvent(new MouseEvent('mouseup', { 
              bubbles: true, clientX, clientY, button: 0 
            }))
          }
        }
        
        // Dispatch real keyboard events
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }))
        window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp' }))
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', code: 'ArrowUp' }))
      }
      
      lastPhase = currentPhase
    }
    
    scene.events.on('postupdate', injectInput)
    window.__stopPhaseInjector = () => scene.events.off('postupdate', injectInput)
  }, { correctId: correctBalloon.id, wrongId: wrongBalloons[0]?.id })
  
  // Click correct balloon to start action
  await clickBalloon(page, correctBalloon.id, canvas)
  
  // Wait for action to complete (star increases)
  await expect.poll(async () => {
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    return newState.stars > initialStars
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  // Wait for phase to return to idle
  await expect.poll(async () => {
    const phase = await page.evaluate(() => window.__tatematika!.getActionPhase!())
    return phase === 'idle'
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  // Stop phase injector and get recorded phases
  const inputPhases = await page.evaluate(() => {
    window.__stopPhaseInjector()
    return window.__phaseInputs
  })
  
  // Assert all phases were covered (precondition)
  const walkCount = inputPhases.filter((p: string) => p === 'walk').length
  const jumpCount = inputPhases.filter((p: string) => p === 'jump').length
  const landingCount = inputPhases.filter((p: string) => p === 'landing').length
  
  expect(walkCount, 'K12 PRECONDITION: walk phase must be covered to test input rejection during walk').toBeGreaterThan(0)
  expect(jumpCount, 'K12 PRECONDITION: jump phase must be covered to test input rejection during jump').toBeGreaterThan(0)
  expect(landingCount, 'K12 PRECONDITION: landing phase must be covered to test input rejection during landing').toBeGreaterThan(0)
  
  // K12 assertions: target unchanged during action, evaluation happened exactly once
  const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
  expect(finalState.stars, 'Stars should increase exactly once').toBe(initialStars + 1)
  expect(finalState.wrongAttempts, 'Wrong attempts unchanged').toBe(initialWrongAttempts)
  
  // Exactly one "pop" sound (not 1+N rejected sounds)
  const oscCountAfter = await page.evaluate(() => (window as any).__oscillatorStarts.length)
  const soundCount = oscCountAfter - oscCountBefore
  expect(soundCount, 'Exactly one pop sound, no additional sounds from rejected inputs').toBe(1)
  
  // No bounces on any balloon (correct balloon popped, not bounced)
  for (const wrongBalloon of wrongBalloons) {
    const bounce = await readBounce(page, wrongBalloon.id)
    expect(bounce.count, `Wrong balloon ${wrongBalloon.id} should not bounce from rejected inputs (${bounce.diagnostic})`).toBe(0)
  }
  
  // Verify new round started
  expect(finalState.target !== initialTarget || finalState.balloons[0].id !== state.balloons[0].id, 
    'New round should have started').toBe(true)
  
  // Cat is idle, ready for next input (nothing queued)
  const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
  expect(jumpState.isJumping, 'Cat should be idle after landing, nothing queued').toBe(false)
})

test('K13: Repeated inputs during wrong balloon action are fully ignored', async ({ page }) => {
  test.setTimeout(120000) // Multiple actions including baseline + reload
  
  // Check that getActionPhase hook exists
  const hasGetActionPhase = await page.evaluate(() => typeof window.__tatematika!.getActionPhase === 'function')
  expect(hasGetActionPhase, 'K13 CONTRACT: getActionPhase hook must exist in src/main.ts').toBe(true)
  
  // Wait for cat to be idle
  await expect.poll(async () => {
    const phase = await page.evaluate(() => window.__tatematika!.getActionPhase!())
    return phase === 'idle'
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  const state = await page.evaluate(() => window.__tatematika!.getGameState())
  const wrongBalloons = state.balloons.filter((b: any) => !b.isCorrect)
  const wrongBalloon = wrongBalloons[0]
  const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
  const initialWrongAttempts = state.wrongAttempts
  const initialStars = state.stars
  const initialTarget = state.target
  
  const canvas = await getCanvasCoordinates(page)
  
  // Measure baseline: how many sounds ONE wrong tap makes
  await page.evaluate(() => {
    ;(window as any).__resetBounceLatch()
    window.__oscillatorStarts = []
  })
  
  const baselineCountBefore = await page.evaluate(() => (window as any).__oscillatorStarts.length)
  await clickBalloon(page, wrongBalloon.id, canvas)
  
  await expect.poll(async () => {
    const phase = await page.evaluate(() => window.__tatematika!.getActionPhase!())
    return phase !== 'idle'
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  await expect.poll(async () => {
    const phase = await page.evaluate(() => window.__tatematika!.getActionPhase!())
    return phase === 'idle'
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  await expect.poll(async () => {
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    return newState.wrongAttempts > initialWrongAttempts
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  const baselineCountAfter = await page.evaluate(() => (window as any).__oscillatorStarts.length)
  const baselineSoundCount = baselineCountAfter - baselineCountBefore
  
  const baselineBounce = await readBounce(page, wrongBalloon.id)
  expect(baselineBounce.count, `Baseline: wrong balloon should bounce once (${baselineBounce.diagnostic})`).toBe(1)
  
  // Now start the actual test: reset state and retry with rejected inputs
  await page.reload()
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  await installBounceLatch(page)
  
  await expect.poll(async () => {
    const phase = await page.evaluate(() => window.__tatematika!.getActionPhase!())
    return phase === 'idle'
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  const state2 = await page.evaluate(() => window.__tatematika!.getGameState())
  const wrongBalloons2 = state2.balloons.filter((b: any) => !b.isCorrect)
  const wrongBalloon2 = await farthestWrongBalloon(page, wrongBalloons2)
  const correctBalloon2 = state2.balloons.find((b: any) => b.isCorrect)!
  const initialWrongAttempts2 = state2.wrongAttempts
  const initialStars2 = state2.stars
  const initialTarget2 = state2.target
  
  const canvas2 = await getCanvasCoordinates(page)
  
  // Reset bounce latch and sound counter
  await page.evaluate(() => {
    ;(window as any).__resetBounceLatch()
    window.__oscillatorStarts = []
  })
  
  const oscCountBefore = await page.evaluate(() => (window as any).__oscillatorStarts.length)
  
  // Install phase-based input injector
  await page.evaluate(({ correctId, wrongId }) => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const canvas = document.querySelector('canvas')!
    const rect = canvas.getBoundingClientRect()
    const scale = rect.width / game.scale.width
    
    window.__phaseInputs = []
    let lastPhase = 'idle'
    
    const injectInput = () => {
      const currentPhase = window.__tatematika!.getActionPhase!()
      
      // On first frame of each phase, dispatch real DOM input
      if (currentPhase !== lastPhase && currentPhase !== 'idle') {
        window.__phaseInputs.push(currentPhase)
        
        // Dispatch real pointer events on correct balloon
        const correctBounds = window.__tatematika!.getBalloonBounds(correctId)
        if (correctBounds) {
          const gameX = correctBounds.x + correctBounds.width / 2
          const gameY = correctBounds.y + correctBounds.height / 2
          const clientX = rect.left + gameX * scale
          const clientY = rect.top + gameY * scale
          
          canvas.dispatchEvent(new PointerEvent('pointerdown', { 
            bubbles: true, clientX, clientY, isPrimary: true, button: 0 
          }))
          canvas.dispatchEvent(new PointerEvent('pointerup', { 
            bubbles: true, clientX, clientY, isPrimary: true, button: 0 
          }))
          canvas.dispatchEvent(new MouseEvent('mousedown', { 
            bubbles: true, clientX, clientY, button: 0 
          }))
          canvas.dispatchEvent(new MouseEvent('mouseup', { 
            bubbles: true, clientX, clientY, button: 0 
          }))
        }
        
        // Dispatch real pointer events on wrong balloon
        const wrongBounds = window.__tatematika!.getBalloonBounds(wrongId)
        if (wrongBounds) {
          const gameX = wrongBounds.x + wrongBounds.width / 2
          const gameY = wrongBounds.y + wrongBounds.height / 2
          const clientX = rect.left + gameX * scale
          const clientY = rect.top + gameY * scale
          
          canvas.dispatchEvent(new PointerEvent('pointerdown', { 
            bubbles: true, clientX, clientY, isPrimary: true, button: 0 
          }))
          canvas.dispatchEvent(new PointerEvent('pointerup', { 
            bubbles: true, clientX, clientY, isPrimary: true, button: 0 
          }))
          canvas.dispatchEvent(new MouseEvent('mousedown', { 
            bubbles: true, clientX, clientY, button: 0 
          }))
          canvas.dispatchEvent(new MouseEvent('mouseup', { 
            bubbles: true, clientX, clientY, button: 0 
          }))
        }
        
        // Dispatch real keyboard events
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }))
        window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft' }))
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', code: 'ArrowLeft' }))
      }
      
      lastPhase = currentPhase
    }
    
    scene.events.on('postupdate', injectInput)
    window.__stopPhaseInjector = () => scene.events.off('postupdate', injectInput)
  }, { correctId: correctBalloon2.id, wrongId: wrongBalloon2.id })
  
  // Click wrong balloon to start action
  await clickBalloon(page, wrongBalloon2.id, canvas2)
  
  // Wait for error to be counted
  await expect.poll(async () => {
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    return newState.wrongAttempts > initialWrongAttempts2
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  // Wait for phase to return to idle
  await expect.poll(async () => {
    const phase = await page.evaluate(() => window.__tatematika!.getActionPhase!())
    return phase === 'idle'
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  // Stop phase injector and get recorded phases
  const inputPhases = await page.evaluate(() => {
    window.__stopPhaseInjector()
    return window.__phaseInputs
  })
  
  // Assert all phases were covered (precondition)
  const walkCount2 = inputPhases.filter((p: string) => p === 'walk').length
  const jumpCount2 = inputPhases.filter((p: string) => p === 'jump').length
  const landingCount2 = inputPhases.filter((p: string) => p === 'landing').length
  
  expect(walkCount2, 'K13 PRECONDITION: walk phase must be covered to test input rejection during walk').toBeGreaterThan(0)
  expect(jumpCount2, 'K13 PRECONDITION: jump phase must be covered to test input rejection during jump').toBeGreaterThan(0)
  expect(landingCount2, 'K13 PRECONDITION: landing phase must be covered to test input rejection during landing').toBeGreaterThan(0)
  
  // K13 assertions: wrongAttempts increased exactly once, no additional errors/bounces/sounds
  const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
  expect(finalState.wrongAttempts, 'Wrong attempts should increase exactly once').toBe(initialWrongAttempts2 + 1)
  expect(finalState.stars, 'Stars unchanged').toBe(initialStars2)
  expect(finalState.target, 'Target unchanged (same round)').toBe(initialTarget2)
  
  // Count sounds: should match baseline (ONE wrong tap worth of sounds, no additional from rejected inputs)
  const oscCountAfter = await page.evaluate(() => (window as any).__oscillatorStarts.length)
  const soundCount = oscCountAfter - oscCountBefore
  
  expect(soundCount, `Should have exactly ${baselineSoundCount} sounds (baseline from one wrong tap), no additional from rejected inputs`).toBe(baselineSoundCount)
  
  // Check balloon bounces from the postrender latch
  const wrongBalloonBounce = await readBounce(page, wrongBalloon2.id)
  expect(wrongBalloonBounce.count, `Wrong balloon should bounce exactly once (${wrongBalloonBounce.diagnostic})`).toBe(1)
  
  // Other balloons should not bounce from rejected inputs
  const otherBalloons = state2.balloons.filter((b: any) => b.id !== wrongBalloon2.id)
  for (const otherBalloon of otherBalloons) {
    const bounce = await readBounce(page, otherBalloon.id)
    expect(bounce.count, `Other balloon ${otherBalloon.id} should not bounce from rejected inputs (${bounce.diagnostic})`).toBe(0)
  }
  
  // Cat is idle, nothing queued
  const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
  expect(jumpState.isJumping, 'Cat should be idle after landing, nothing queued').toBe(false)
})

test('К12: repeated input during a correct answer does not add a feedback icon', async ({ page }) => {
  test.setTimeout(multiRoundTestTimeout(1))
  await expect.poll(async () => {
    const jump = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jump.isJumping
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  const id = await balloonId(page, 'correct')
  const watch = await watchBalloonAnswer(page, id, true)
  expect(watch.stateAfter.stars, 'К12 precondition: the accepted answer is evaluated once').toBe(watch.stateBefore.stars + 1)
  expect(
    watch.maxCorrectIcons,
    'К12: exactly one „Вярно“ icon for the single evaluation and no additional icon'
  ).toBe(1)
  expect(watch.maxIcons, 'К12: rejected input must not show an extra icon').toBeLessThanOrEqual(1)
})

test('К13: repeated input during a wrong answer does not add a feedback icon', async ({ page }) => {
  test.setTimeout(multiRoundTestTimeout(1))
  await expect.poll(async () => {
    const jump = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jump.isJumping
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  const id = await balloonId(page, 'wrong')
  const watch = await watchBalloonAnswer(page, id, true)
  expect(watch.stateAfter.wrongAttempts, 'К13 precondition: the accepted answer is evaluated').toBeGreaterThan(watch.stateBefore.wrongAttempts)
  expect(watch.stateAfter.target, 'К13: target stays on the same round').toBe(watch.stateBefore.target)
  expect(
    watch.maxWrongIcons,
    'К13: exactly one „Грешно“ icon for the single evaluation and no additional icon'
  ).toBe(1)
  expect(watch.maxIcons, 'К13: rejected input must not show an extra icon').toBeLessThanOrEqual(1)
})

test('K14: No re-execution of rejected inputs after landing (correct balloon)', async ({ page }) => {
  test.setTimeout(60000) // Two actions (initial + re-click after idle)
  
  // Wait for cat to be idle
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  const state = await page.evaluate(() => window.__tatematika!.getGameState())
  const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
  const wrongBalloons = state.balloons.filter((b: any) => !b.isCorrect)
  const initialStars = state.stars
  
  const canvas = await getCanvasCoordinates(page)
  
  // Click correct balloon to start action
  await clickBalloon(page, correctBalloon.id, canvas)
  
  // timing: spec sets no duration (docs/games/kote-balonche.md); see tate-dev k22 evidence
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return jumpState.isJumping
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [10] }).toBe(true)
  
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
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  // Reset sound counter
  await page.evaluate(() => {
    window.__oscillatorStarts = []
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
  test.setTimeout(60000) // Two actions
  
  // Wait for cat to be idle
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  const state = await page.evaluate(() => window.__tatematika!.getGameState())
  const wrongBalloons = state.balloons.filter((b: any) => !b.isCorrect)
  const wrongBalloon = wrongBalloons[0]
  const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
  const initialWrongAttempts = state.wrongAttempts
  
  const canvas = await getCanvasCoordinates(page)
  
  // Click wrong balloon to start action
  await clickBalloon(page, wrongBalloon.id, canvas)
  
  // timing: spec sets no duration (docs/games/kote-balonche.md); see tate-dev k22 evidence
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return jumpState.isJumping
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [10] }).toBe(true)
  
  // Click correct balloon multiple times during action (these should be rejected)
  for (let i = 0; i < 5; i++) {
    await clickBalloon(page, correctBalloon.id, canvas)
  }
  
  // Wait for action to complete (error counted, balloon bounced)
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    return !jumpState.isJumping && newState.wrongAttempts > initialWrongAttempts
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  // Reset sound counter
  await page.evaluate(() => {
    window.__oscillatorStarts = []
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
  test.setTimeout(60000) // Two actions
  
  // Wait for cat to be idle
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
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
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  // Now try new input - it should be accepted
  const newState = await page.evaluate(() => window.__tatematika!.getGameState())
  const newCorrectBalloon = newState.balloons.find((b: any) => b.isCorrect)!
  
  await clickBalloon(page, newCorrectBalloon.id, canvas)
  
  // timing: spec sets no duration (docs/games/kote-balonche.md); see tate-dev k22 evidence
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return jumpState.isJumping
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [10] }).toBe(true)
  
  // Wait for completion
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  // Verify another star
  const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
  expect(finalState.stars, 'New input should be processed normally').toBe(newState.stars + 1)
})

test('K15: New input accepted after action completes (keyboard)', async ({ page }) => {
  test.setTimeout(90000) // Two actions with keyboard navigation
  
  // Wait for cat to be idle
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
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
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  // Now try new keyboard input - it should be accepted
  const newState = await page.evaluate(() => window.__tatematika!.getGameState())
  const newCorrectBalloon = newState.balloons.find((b: any) => b.isCorrect)!
  const newWrongBalloons = newState.balloons.filter((b: any) => !b.isCorrect)
  const initialStarsAfterFirst = newState.stars
  const initialWrongAttemptsAfterFirst = newState.wrongAttempts
  
  // Get correct balloon position for keyboard navigation
  const newBounds = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), newCorrectBalloon.id)
  const newCatPos = await page.evaluate(() => window.__tatematika!.getCatPosition())
  
  // Navigate to correct balloon with arrow keys
  const newTargetX = newBounds.x + newBounds.width / 2
  if (newCatPos.x < newTargetX) {
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(30)
      const pos = await page.evaluate(() => window.__tatematika!.getCatPosition())
      if (pos.x >= newTargetX - 10) break
    }
  } else {
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowLeft')
      await page.waitForTimeout(30)
      const pos = await page.evaluate(() => window.__tatematika!.getCatPosition())
      if (pos.x <= newTargetX + 10) break
    }
  }
  
  // Press Space to jump - action should start
  await page.keyboard.press('Space')
  
  // Verify action started (cat is jumping or moving toward balloon)
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return jumpState.isJumping
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  // Wait for action to complete
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  // Wait for evaluation to complete
  await expect.poll(async () => {
    const currentState = await page.evaluate(() => window.__tatematika!.getGameState())
    return currentState.stars > initialStarsAfterFirst || currentState.wrongAttempts > initialWrongAttemptsAfterFirst
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  // Verify exactly +1 star (correct balloon)
  const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
  expect(finalState.stars, 'New keyboard input should result in exactly +1 star').toBe(initialStarsAfterFirst + 1)
  expect(finalState.wrongAttempts, 'Wrong attempts should not increase').toBe(initialWrongAttemptsAfterFirst)
})
