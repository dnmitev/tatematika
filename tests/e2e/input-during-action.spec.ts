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

async function installFrameRecorder(page: any) {
  await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    
    // Clear any existing recorder
    window.__balloonFrameRecorder = new Map<string, Array<{ x: number; y: number; frame: number }>>()
    let frameCount = 0
    
    // Remove any previous postupdate listener
    scene.events.off('postupdate')
    
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
  })
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
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  
  // Install postupdate recorder for bounce detection
  await installFrameRecorder(page)
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

function getBounceDiagnostic(frames: Array<{ x: number; y: number; frame: number }>): string {
  if (frames.length === 0) {
    return 'No frames recorded'
  }
  const yValues = frames.map(f => f.y)
  const minY = Math.min(...yValues)
  const maxY = Math.max(...yValues)
  return `${frames.length} frames, y range [${minY.toFixed(1)}, ${maxY.toFixed(1)}]`
}

test('K12: Repeated inputs during correct balloon action are fully ignored', async ({ page }) => {
  // Check that getActionPhase hook exists
  const hasGetActionPhase = await page.evaluate(() => typeof window.__tatematika!.getActionPhase === 'function')
  expect(hasGetActionPhase, 'K12 CONTRACT: getActionPhase hook must be implemented').toBe(true)
  
  // Wait for cat to be idle
  await expect.poll(async () => {
    const phase = await page.evaluate(() => window.__tatematika!.getActionPhase!())
    return phase === 'idle'
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  const state = await page.evaluate(() => window.__tatematika!.getGameState())
  const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
  const wrongBalloons = state.balloons.filter((b: any) => !b.isCorrect)
  const initialStars = state.stars
  const initialTarget = state.target
  const initialWrongAttempts = state.wrongAttempts
  
  const canvas = await getCanvasCoordinates(page)
  
  // Reset frame recorder and sound counter
  await page.evaluate(() => {
    window.__balloonFrameRecorder.clear()
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
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  // Wait for phase to return to idle
  await expect.poll(async () => {
    const phase = await page.evaluate(() => window.__tatematika!.getActionPhase!())
    return phase === 'idle'
  }, { timeout: 2000, intervals: [50] }).toBe(true)
  
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
    const diagnostic = getBounceDiagnostic(frames)
    expect(bounced, `Wrong balloon ${wrongBalloon.id} should not bounce from rejected inputs (${diagnostic})`).toBe(false)
  }
  
  // Verify new round started
  expect(finalState.target !== initialTarget || finalState.balloons[0].id !== state.balloons[0].id, 
    'New round should have started').toBe(true)
  
  // Cat is idle, ready for next input (nothing queued)
  const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
  expect(jumpState.isJumping, 'Cat should be idle after landing, nothing queued').toBe(false)
})

test('K13: Repeated inputs during wrong balloon action are fully ignored', async ({ page }) => {
  // Check that getActionPhase hook exists
  const hasGetActionPhase = await page.evaluate(() => typeof window.__tatematika!.getActionPhase === 'function')
  expect(hasGetActionPhase, 'K13 CONTRACT: getActionPhase hook must exist in src/main.ts').toBe(true)
  
  // Wait for cat to be idle
  await expect.poll(async () => {
    const phase = await page.evaluate(() => window.__tatematika!.getActionPhase!())
    return phase === 'idle'
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
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
    window.__balloonFrameRecorder.clear()
    window.__oscillatorStarts = []
  })
  
  const baselineCountBefore = await page.evaluate(() => (window as any).__oscillatorStarts.length)
  await clickBalloon(page, wrongBalloon.id, canvas)
  
  await expect.poll(async () => {
    const phase = await page.evaluate(() => window.__tatematika!.getActionPhase!())
    return phase !== 'idle'
  }, { timeout: 2000, intervals: [50] }).toBe(true)
  
  await expect.poll(async () => {
    const phase = await page.evaluate(() => window.__tatematika!.getActionPhase!())
    return phase === 'idle'
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  await expect.poll(async () => {
    const newState = await page.evaluate(() => window.__tatematika!.getGameState())
    return newState.wrongAttempts > initialWrongAttempts
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  const baselineCountAfter = await page.evaluate(() => (window as any).__oscillatorStarts.length)
  const baselineSoundCount = baselineCountAfter - baselineCountBefore
  
  const baselineBalloonFrames = await page.evaluate(() => {
    const result: Record<string, any[]> = {}
    for (const [id, frames] of window.__balloonFrameRecorder.entries()) {
      result[id] = frames
    }
    return result
  })
  
  const baselineFrames = baselineBalloonFrames[wrongBalloon.id] || []
  const baselineBounced = checkBounce(baselineFrames)
  const baselineDiagnostic = getBounceDiagnostic(baselineFrames)
  expect(baselineBounced, `Baseline: wrong balloon should bounce once (${baselineDiagnostic})`).toBe(true)
  
  // Now start the actual test: reset state and retry with rejected inputs
  await page.reload()
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  await installFrameRecorder(page)
  
  // Check that getActionPhase hook exists after reload
  const hasGetActionPhase = await page.evaluate(() => typeof window.__tatematika!.getActionPhase === 'function')
  expect(hasGetActionPhase, 'K13 CONTRACT: getActionPhase hook must be implemented').toBe(true)
  
  await expect.poll(async () => {
    const phase = await page.evaluate(() => window.__tatematika!.getActionPhase!())
    return phase === 'idle'
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  const state2 = await page.evaluate(() => window.__tatematika!.getGameState())
  const wrongBalloons2 = state2.balloons.filter((b: any) => !b.isCorrect)
  const wrongBalloon2 = wrongBalloons2[0]
  const correctBalloon2 = state2.balloons.find((b: any) => b.isCorrect)!
  const initialWrongAttempts2 = state2.wrongAttempts
  const initialStars2 = state2.stars
  const initialTarget2 = state2.target
  
  const canvas2 = await getCanvasCoordinates(page)
  
  // Reset frame recorder and sound counter
  await page.evaluate(() => {
    window.__balloonFrameRecorder.clear()
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
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  // Wait for phase to return to idle
  await expect.poll(async () => {
    const phase = await page.evaluate(() => window.__tatematika!.getActionPhase!())
    return phase === 'idle'
  }, { timeout: 2000, intervals: [50] }).toBe(true)
  
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
  
  // Check balloon bounces
  const balloonFrames = await page.evaluate(() => {
    const result: Record<string, any[]> = {}
    for (const [id, frames] of window.__balloonFrameRecorder.entries()) {
      result[id] = frames
    }
    return result
  })
  
  // Wrong balloon should bounce exactly once (from first tap)
  const wrongBalloonFrames = balloonFrames[wrongBalloon2.id] || []
  const wrongBalloonBounced = checkBounce(wrongBalloonFrames)
  const wrongBalloonDiagnostic = getBounceDiagnostic(wrongBalloonFrames)
  expect(wrongBalloonBounced, `Wrong balloon should bounce exactly once (${wrongBalloonDiagnostic})`).toBe(true)
  
  // Other balloons should not bounce from rejected inputs
  const otherBalloons = state2.balloons.filter((b: any) => b.id !== wrongBalloon2.id)
  for (const otherBalloon of otherBalloons) {
    const frames = balloonFrames[otherBalloon.id] || []
    const bounced = checkBounce(frames)
    const diagnostic = getBounceDiagnostic(frames)
    expect(bounced, `Other balloon ${otherBalloon.id} should not bounce from rejected inputs (${diagnostic})`).toBe(false)
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
  }, { timeout: 2000, intervals: [50] }).toBe(true)
  
  // Wait for action to complete
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  // Wait for evaluation to complete
  await expect.poll(async () => {
    const currentState = await page.evaluate(() => window.__tatematika!.getGameState())
    return currentState.stars > initialStarsAfterFirst || currentState.wrongAttempts > initialWrongAttemptsAfterFirst
  }, { timeout: 5000, intervals: [50] }).toBe(true)
  
  // Verify exactly +1 star (correct balloon)
  const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
  expect(finalState.stars, 'New keyboard input should result in exactly +1 star').toBe(initialStarsAfterFirst + 1)
  expect(finalState.wrongAttempts, 'Wrong attempts should not increase').toBe(initialWrongAttemptsAfterFirst)
})
