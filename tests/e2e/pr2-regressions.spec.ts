import { test, expect } from '@playwright/test'
import { popCorrectBalloonAndWait, getGameScaleAndRect } from './helpers'

/**
 * Regression tests for PR #2 review blockers
 * https://github.com/dnmitev/tatematika/pull/2#issuecomment-6701632601
 * 
 * All tests use ONLY existing window.__tatematika API and real runtime objects:
 * - Phaser scene objects via window.__tatematika.getGame()
 * - DOM elements with data-testid attributes
 * - Real pointer clicks on canvas at balloon coordinates
 * - Instrumented AudioContext via page.addInitScript
 */

test.describe('PR #2 Review Regressions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  })

  // ============================================================================
  // TEST BUG FIX: Reload count tests must use real UI settings
  // ============================================================================

  test('FIXED K9: Count 4 after reload persists per spec', async ({ page }) => {
    // Open settings and set balloon count to 4 via REAL UI
    await page.evaluate(() => window.__tatematika!.openSettings())
    await page.waitForTimeout(200)
    
    const balloonCountInput = page.locator('[data-testid="setting-balloon-count"]')
    await balloonCountInput.fill('4')
    
    await page.evaluate(() => window.__tatematika!.closeSettings())
    await page.waitForTimeout(200)
    
    // Assert count is 4 BEFORE reload
    const stateBefore = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateBefore.balloons.length).toBe(4)
    expect(stateBefore.settings.balloonCount).toBe(4)
    
    // Reload
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Wait for game ready
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    // Assert count AFTER reload per spec K9: "настройката се запазва след презареждане"
    const stateAfter = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateAfter.balloons.length).toBe(4)
    expect(stateAfter.settings.balloonCount).toBe(4)
  })

  test('FIXED K9: Count 5 after reload persists per spec', async ({ page }) => {
    // Open settings and set balloon count to 5 via REAL UI
    await page.evaluate(() => window.__tatematika!.openSettings())
    await page.waitForTimeout(200)
    
    const balloonCountInput = page.locator('[data-testid="setting-balloon-count"]')
    await balloonCountInput.fill('5')
    
    await page.evaluate(() => window.__tatematika!.closeSettings())
    await page.waitForTimeout(200)
    
    // Assert count is 5 BEFORE reload
    const stateBefore = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateBefore.balloons.length).toBe(5)
    expect(stateBefore.settings.balloonCount).toBe(5)
    
    // Reload
    await page.reload()
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Wait for game ready
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: 10000, intervals: [50] }).toBe(true)
    
    // Assert count AFTER reload per spec K9
    const stateAfter = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(stateAfter.balloons.length).toBe(5)
    expect(stateAfter.settings.balloonCount).toBe(5)
  })

  // ============================================================================
  // REGRESSION: Balloon pop timing - must stay visible until cat reaches it
  // ============================================================================

  test('K3: Correct balloon stays visible until cat reaches it, then pops with animation', async ({ page }) => {
    // Spec §4 rule 4: "балонът се пуква с конфети"
    // Regression: balloon must NOT be destroyed at jump start
    // It must stay visible during cat's jump until cat reaches it
    // Then pop animation (~400ms per spec constants), then new round
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
    
    // Wait for cat idle
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Click the correct balloon
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correctBalloon.id)
    
    // IMMEDIATELY after click: balloon must still exist and be visible
    const boundsAfterClick = await page.evaluate((id) => 
      window.__tatematika!.getBalloonBounds(id), correctBalloon.id)
    expect(boundsAfterClick, 'balloon must exist immediately after click').not.toBeNull()
    
    // Poll during jump: balloon must stay visible until cat reaches it
    let midJumpBalloonExists = false
    let midJumpIsPopping = false
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      
      if (jumpState.isJumping) {
        // Check balloon still exists mid-jump
        const bounds = await page.evaluate((id) => 
          window.__tatematika!.getBalloonBounds(id), correctBalloon.id)
        const animState = await page.evaluate((id) =>
          window.__tatematika!.getBalloonAnimationState(id), correctBalloon.id)
        
        if (bounds !== null) {
          midJumpBalloonExists = true
        }
        if (animState.isPopping) {
          midJumpIsPopping = true
        }
      }
      
      return !jumpState.isJumping
    }, { timeout: 5000, intervals: [30] }).toBe(true)
    
    // Assert: balloon existed and was visible during at least one mid-jump sample
    expect(midJumpBalloonExists, 'balloon must stay visible mid-jump').toBe(true)
    
    // Now jump is complete. Check that pop animation happened
    // (isPopping should have been true at some point, or balloon should be gone now)
    const boundsAfterJump = await page.evaluate((id) => 
      window.__tatematika!.getBalloonBounds(id), correctBalloon.id)
    
    // Balloon should now be gone OR in popping state
    const animStateAfterJump = await page.evaluate((id) =>
      window.__tatematika!.getBalloonAnimationState(id), correctBalloon.id)
    
    expect(
      boundsAfterJump === null || midJumpIsPopping || animStateAfterJump.isPopping,
      'balloon must pop after cat reaches it'
    ).toBe(true)
    
    // Wait for new round with new balloons
    await expect.poll(async () => {
      const newState = await page.evaluate(() => window.__tatematika!.getGameState())
      return newState.stars === state.stars + 1 && 
             newState.balloons.every((b: any) => b.id !== correctBalloon.id)
    }, { timeout: 5000, intervals: [50] }).toBe(true)
  })

  test('K3: New balloons only appear after pop animation completes (~400ms)', async ({ page }) => {
    // Per spec and existing constants: pop animation is ~400ms
    // New round must NOT start/destroy balloon at jump start
    // It must wait for pop animation to complete
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
    const oldBalloonIds = state.balloons.map((b: any) => b.id).sort()
    
    // Wait for cat idle
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Click correct balloon
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correctBalloon.id)
    
    // Poll: during jump and pop animation, old balloons should still exist
    let oldBalloonsRemovedWhilePopping = false
    
    await expect.poll(async () => {
      const animState = await page.evaluate((id) =>
        window.__tatematika!.getBalloonAnimationState(id), correctBalloon.id)
      
      if (animState.isPopping) {
        // Check if old balloons are already gone
        const currentState = await page.evaluate(() => window.__tatematika!.getGameState())
        const currentIds = currentState.balloons.map((b: any) => b.id).sort()
        const allOldBalloonsGone = oldBalloonIds.every(id => !currentIds.includes(id))
        
        if (allOldBalloonsGone) {
          oldBalloonsRemovedWhilePopping = true
        }
      }
      
      // Wait until animation completes and new balloons appear
      const newState = await page.evaluate(() => window.__tatematika!.getGameState())
      return newState.stars === state.stars + 1
    }, { timeout: 5000, intervals: [30] }).toBe(true)
    
    // Assert: old balloons should NOT be removed while popping animation is active
    expect(oldBalloonsRemovedWhilePopping, 'new balloons must wait until pop animation completes').toBe(false)
  })

  // ============================================================================
  // REGRESSION: Resize after level complete must keep celebration UI visible
  // ============================================================================

  test('K7: Resize after level complete keeps celebration UI visible and working', async ({ page }) => {
    // Spec §6 "Край на ниво": "празничен екран с 'Ти успя!' и бутони 'Още веднъж' и 'Към менюто'"
    // Regression: resize/rotation AFTER level complete must keep celebration UI visible
    // Check at 1280×800 -> 375×667 and back
    
    // Set level to complete quickly (5 correct balloons)
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
    
    // Complete the level
    for (let i = 0; i < 5; i++) {
      await popCorrectBalloonAndWait(page)
    }
    
    // Wait for celebration UI
    const playAgainButton = page.locator('[data-testid="button-play-again"]')
    await expect(playAgainButton).toBeVisible({ timeout: 5000 })
    
    // Assert exactly ONE instance of play-again button exists
    const countBefore = await playAgainButton.count()
    expect(countBefore, 'exactly one play-again button must exist').toBe(1)
    
    // Resize to mobile portrait
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(200)
    
    // Assert celebration UI still visible after resize
    await expect(playAgainButton).toBeVisible({ timeout: 2000 })
    const countAfterResize1 = await playAgainButton.count()
    expect(countAfterResize1, 'exactly one play-again button after resize to 375×667').toBe(1)
    
    // Click button to verify it's working
    const clickable1 = await playAgainButton.isEnabled()
    expect(clickable1, 'play-again button must be clickable after resize').toBe(true)
    
    // Resize back to desktop
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForTimeout(200)
    
    // Assert still visible
    await expect(playAgainButton).toBeVisible({ timeout: 2000 })
    const countAfterResize2 = await playAgainButton.count()
    expect(countAfterResize2, 'exactly one play-again button after resize back to 1280×800').toBe(1)
    
    const clickable2 = await playAgainButton.isEnabled()
    expect(clickable2, 'play-again button must be clickable after resize back').toBe(true)
  })

  test('K7: Resize while settings open keeps settings visible', async ({ page }) => {
    // Additional resize regression: open settings then resize
    // Settings panel must stay open with no duplicates
    
    const settingsButton = page.locator('[data-testid="button-settings"]')
    await settingsButton.click()
    await page.waitForTimeout(200)
    
    const settingsPanel = page.locator('[data-testid="settings-panel"]')
    await expect(settingsPanel).toBeVisible({ timeout: 2000 })
    
    // Assert exactly one settings panel
    const countBefore = await settingsPanel.count()
    expect(countBefore, 'exactly one settings panel must exist').toBe(1)
    
    // Resize to mobile
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(200)
    
    // Assert settings still visible
    await expect(settingsPanel).toBeVisible({ timeout: 2000 })
    const countAfter = await settingsPanel.count()
    expect(countAfter, 'exactly one settings panel after resize').toBe(1)
    
    // Verify settings controls are still functional
    const upperLimitInput = page.locator('[data-testid="setting-upper-limit"]')
    await expect(upperLimitInput).toBeVisible()
    const isEnabled = await upperLimitInput.isEnabled()
    expect(isEnabled, 'settings controls must be functional after resize').toBe(true)
  })

  // ============================================================================
  // REGRESSION: Mute must stop sounds that are ALREADY playing
  // ============================================================================

  test('K10: Mute stops sounds that are already playing or scheduled', async ({ page }) => {
    // Spec K10: "всички звуци спират, докато не го натисне отново"
    // Regression: mute must stop sounds ALREADY playing or scheduled, not just block future calls
    // App creates new AudioContext per sound (GameScene.ts ~574) and schedules stop() in the future
    
    // Instrument to track AudioContext, start/stop when arguments, gain calls, disconnect/close
    await page.addInitScript(() => {
      const oscillators: Array<{
        ctx: any
        startWhen: number
        stopWhen: number
        startCallTime: number
        stopCallTime: number
        disconnectCallTime: number
        gainCalls: Array<{ method: string; value: number; time: number; callTime: number }>
        ctxClosedAt: number
        ctxSuspendedAt: number
      }> = []
      
      const contextData = new Map<any, { closedAt: number; suspendedAt: number }>()
      
      // Patch BaseAudioContext/AudioContext prototype
      const BaseProto = (window as any).BaseAudioContext?.prototype || (window as any).AudioContext?.prototype
      
      if (BaseProto) {
        // Patch close()
        const originalClose = BaseProto.close
        if (originalClose) {
          BaseProto.close = function() {
            const data = contextData.get(this) || { closedAt: 0, suspendedAt: 0 }
            data.closedAt = this.currentTime
            contextData.set(this, data)
            return originalClose.apply(this, arguments)
          }
        }
        
        // Patch suspend()
        const originalSuspend = BaseProto.suspend
        if (originalSuspend) {
          BaseProto.suspend = function() {
            const data = contextData.get(this) || { closedAt: 0, suspendedAt: 0 }
            data.suspendedAt = this.currentTime
            contextData.set(this, data)
            return originalSuspend.apply(this, arguments)
          }
        }
        
        // Patch createOscillator
        const originalCreateOscillator = BaseProto.createOscillator
        if (originalCreateOscillator) {
          BaseProto.createOscillator = function() {
            const osc = originalCreateOscillator.call(this)
            const ctx = this
            const state = {
              ctx,
              startWhen: -1,
              stopWhen: -1,
              startCallTime: 0,
              stopCallTime: 0,
              disconnectCallTime: 0,
              gainCalls: [] as any[],
              ctxClosedAt: 0,
              ctxSuspendedAt: 0
            }
            oscillators.push(state)
            
            const originalStart = osc.start
            const originalStop = osc.stop
            const originalDisconnect = osc.disconnect
            
            osc.start = function(when?: number) {
              state.startWhen = when !== undefined ? when : ctx.currentTime
              state.startCallTime = ctx.currentTime
              return originalStart.apply(this, arguments)
            }
            
            osc.stop = function(when?: number) {
              state.stopWhen = when !== undefined ? when : ctx.currentTime
              state.stopCallTime = ctx.currentTime
              return originalStop.apply(this, arguments)
            }
            
            osc.disconnect = function() {
              state.disconnectCallTime = ctx.currentTime
              return originalDisconnect.apply(this, arguments)
            }
            
            return osc
          }
        }
      }
      
      // Patch AudioParam methods
      if ((window as any).AudioParam) {
        const AudioParamProto = (window as any).AudioParam.prototype
        
        const patchGainMethod = (methodName: string) => {
          const original = AudioParamProto[methodName]
          if (original) {
            AudioParamProto[methodName] = function(value: number, ...args: any[]) {
              // Find oscillator with this gain param
              for (const osc of oscillators) {
                if (osc.gainCalls && this.toString().includes('gain')) {
                  const time = args[0] !== undefined ? args[0] : (osc.ctx?.currentTime || 0)
                  osc.gainCalls.push({
                    method: methodName,
                    value,
                    time,
                    callTime: osc.ctx?.currentTime || 0
                  })
                }
              }
              return original.apply(this, [value, ...args])
            }
          }
        }
        
        patchGainMethod('setValueAtTime')
        patchGainMethod('linearRampToValueAtTime')
        patchGainMethod('exponentialRampToValueAtTime')
        patchGainMethod('setTargetAtTime')
      }
      
      (window as any).__audioInstrumentation = { oscillators, contextData }
    })
    
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // Ensure unmuted initially
    const initialMuted = await page.evaluate(() => window.__tatematika!.isMuted())
    if (initialMuted) {
      await page.evaluate(() => window.__tatematika!.toggleMute())
      await page.waitForTimeout(100)
    }
    
    // Wait for cat idle
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Click a WRONG balloon to get boing (0.2s) + meow (0.3s) sounds that are genuinely still playing
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const wrongBalloon = state.balloons.find((b: any) => !b.isCorrect)!
    
    const balloonBounds = await page.evaluate((id) => 
      window.__tatematika!.getBalloonBounds(id), wrongBalloon.id)
    
    const { canvasRect, scale, muteButtonBounds } = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const scaleVal = rect.width / game.scale.width
      
      const scene = game.scene.getScene('GameScene') as any
      const muteBtn = scene.muteButton
      const muteBounds = muteBtn.getBounds()
      
      return {
        canvasRect: { left: rect.left, top: rect.top },
        scale: scaleVal,
        muteButtonBounds: {
          x: muteBounds.x,
          y: muteBounds.y,
          width: muteBounds.width,
          height: muteBounds.height
        }
      }
    })
    
    // Real click on wrong balloon to trigger boing + meow
    const clickX = canvasRect.left + (balloonBounds.x + balloonBounds.width / 2) * scale
    const clickY = canvasRect.top + (balloonBounds.y + balloonBounds.height / 2) * scale
    
    await page.mouse.click(clickX, clickY)
    
    // Poll until an oscillator is started AND still scheduled to play (stopWhen > currentTime + 0.1)
    await expect.poll(async () => {
      const info = await page.evaluate(() => {
        const oscs = (window as any).__audioInstrumentation?.oscillators || []
        for (const osc of oscs) {
          if (osc.startWhen >= 0 && osc.stopWhen > 0) {
            const stillAudible = osc.stopWhen > (osc.ctx?.currentTime + 0.1)
            if (stillAudible) {
              return {
                audible: true,
                stopWhen: osc.stopWhen,
                ctxTime: osc.ctx?.currentTime
              }
            }
          }
        }
        return { audible: false }
      })
      return info.audible
    }, { timeout: 1000, intervals: [20] }).toBe(true)
    
    // PRECONDITION: at least one oscillator is audible (stopWhen > ctx.currentTime + 0.1)
    const stateBeforeMute = await page.evaluate(() => {
      const oscs = (window as any).__audioInstrumentation?.oscillators || []
      const audibleOscs = oscs.filter((o: any) => 
        o.startWhen >= 0 && o.stopWhen > (o.ctx?.currentTime + 0.1))
      return {
        totalOscillators: oscs.length,
        audibleCount: audibleOscs.length,
        audibleOscillators: audibleOscs.map((o: any) => ({
          startWhen: o.startWhen,
          stopWhen: o.stopWhen,
          ctxTime: o.ctx?.currentTime
        }))
      }
    })
    
    expect(stateBeforeMute.audibleCount, 'precondition: at least one oscillator must be audible before mute').toBeGreaterThan(0)
    
    // NOW MUTE via REAL control (click Phaser mute button)
    const muteBtnClickX = canvasRect.left + (muteButtonBounds.x + muteButtonBounds.width / 2) * scale
    const muteBtnClickY = canvasRect.top + (muteButtonBounds.y + muteButtonBounds.height / 2) * scale
    
    await page.mouse.click(muteBtnClickX, muteBtnClickY)
    await page.waitForTimeout(10)
    
    // Verify mute succeeded
    const isMuted = await page.evaluate(() => window.__tatematika!.isMuted())
    expect(isMuted, 'mute button must have toggled mute on').toBe(true)
    
    // Get ctx.currentTime at mute and check effective end times
    const muteAnalysis = await page.evaluate(() => {
      const oscs = (window as any).__audioInstrumentation?.oscillators || []
      const ctxData = (window as any).__audioInstrumentation?.contextData
      
      const audibleAtMute: any[] = []
      
      for (const osc of oscs) {
        if (osc.startWhen >= 0 && osc.stopWhen > (osc.ctx?.currentTime + 0.1)) {
          // This oscillator was audible at mute time
          const ctxTimeAtMute = osc.ctx?.currentTime || 0
          
          // Find effective end: min of (stop issued after mute, gain->0 after mute, disconnect after mute, close/suspend after mute)
          let effectiveEnd = osc.stopWhen // Original scheduled stop (before mute, doesn't count)
          
          // Check if stop was called AFTER mute (stopCallTime > startCallTime means stop was rescheduled)
          if (osc.stopCallTime > osc.startCallTime + 0.01) {
            effectiveEnd = Math.min(effectiveEnd, osc.stopCallTime)
          }
          
          // Check disconnect after mute
          if (osc.disconnectCallTime > 0) {
            effectiveEnd = Math.min(effectiveEnd, osc.disconnectCallTime)
          }
          
          // Check gain calls after mute
          for (const gain of osc.gainCalls) {
            if (gain.callTime > ctxTimeAtMute && (gain.value === 0 || gain.value < 0.001)) {
              effectiveEnd = Math.min(effectiveEnd, gain.time)
            }
          }
          
          // Check context close/suspend
          const ctxInfo = ctxData?.get(osc.ctx)
          if (ctxInfo) {
            if (ctxInfo.closedAt > ctxTimeAtMute) {
              effectiveEnd = Math.min(effectiveEnd, ctxInfo.closedAt)
            }
            if (ctxInfo.suspendedAt > ctxTimeAtMute) {
              effectiveEnd = Math.min(effectiveEnd, ctxInfo.suspendedAt)
            }
          }
          
          audibleAtMute.push({
            stopWhen: osc.stopWhen,
            ctxTimeAtMute,
            effectiveEnd,
            stopCallTime: osc.stopCallTime,
            startCallTime: osc.startCallTime,
            disconnectCallTime: osc.disconnectCallTime,
            gainCalls: osc.gainCalls.length,
            silencedInTime: effectiveEnd <= ctxTimeAtMute + 0.05
          })
        }
      }
      
      return { audibleAtMute }
    })
    
    // Assert: all audible oscillators must have effectiveEnd <= ctxTimeAtMute + 0.05
    for (const osc of muteAnalysis.audibleAtMute) {
      expect(
        osc.silencedInTime,
        `oscillator still scheduled to play until ctx t=${osc.stopWhen.toFixed(3)} after mute at t=${osc.ctxTimeAtMute.toFixed(3)} (effective end ${osc.effectiveEnd.toFixed(3)})`
      ).toBe(true)
    }
    
    // Verify no NEW sounds start while muted (real click)
    const countBefore = await page.evaluate(() => 
      (window as any).__audioInstrumentation?.oscillators.length || 0)
    
    // Wait for cat idle
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Click another wrong balloon
    const state2 = await page.evaluate(() => window.__tatematika!.getGameState())
    const wrongBalloon2 = state2.balloons.find((b: any) => !b.isCorrect && b.id !== wrongBalloon.id)!
    const bounds2 = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), wrongBalloon2.id)
    
    const clickX2 = canvasRect.left + (bounds2.x + bounds2.width / 2) * scale
    const clickY2 = canvasRect.top + (bounds2.y + bounds2.height / 2) * scale
    await page.mouse.click(clickX2, clickY2)
    await page.waitForTimeout(200)
    
    const countAfter = await page.evaluate(() => 
      (window as any).__audioInstrumentation?.oscillators.length || 0)
    
    expect(countAfter, 'no sounds must start while muted').toBe(countBefore)
  })

  // ============================================================================
  // REGRESSION: Rapid taps during jump behavior consistency
  // ============================================================================

  test('Rapid taps during jump: wrong tap consistency - either fully handled OR fully ignored', async ({ page }) => {
    // SPEC SAYS: Section 3 (Управление) describes click behavior but does NOT specify
    // what happens when you click DURING a jump. Quote: "Клік върху балон: котето отива под него и скача"
    // Section 4 says wrong balloon "отскача" but doesn't say if this applies during a jump.
    // 
    // SPEC IS AMBIGUOUS. Testing for consistency:
    // A wrong tap during a jump must either be:
    // 1. FULLY IGNORED (no wrongAttempts increment, no bounce, no sound), OR
    // 2. FULLY HANDLED (wrongAttempts increments, balloon bounces, sound plays)
    // 
    // Current code path (GameScene ~839-849): clickBalloon during catIsJumping counts error without bounce/sound
    // This test MUST FAIL on current src
    
    // Instrument audio to count oscillator starts
    await page.addInitScript(() => {
      const oscillatorStarts: number[] = []
      const BaseProto = (window as any).BaseAudioContext?.prototype || (window as any).AudioContext?.prototype
      if (BaseProto) {
        const originalCreateOscillator = BaseProto.createOscillator
        BaseProto.createOscillator = function() {
          const osc = originalCreateOscillator.call(this)
          const originalStart = osc.start
          osc.start = function() {
            oscillatorStarts.push(Date.now())
            return originalStart.apply(this, arguments)
          }
          return osc
        }
      }
      (window as any).__oscillatorStarts = oscillatorStarts
    })
    
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    
    // BASELINE: measure one wrong tap alone to establish N oscillator starts and bounce behavior
    const stateBaseline = await page.evaluate(() => window.__tatematika!.getGameState())
    const wrongBalloonsBaseline = stateBaseline.balloons.filter((b: any) => !b.isCorrect)
    const baselineBalloon = wrongBalloonsBaseline[0]
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    const { canvasRect, scale } = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      return {
        canvasRect: { left: rect.left, top: rect.top },
        scale: rect.width / game.scale.width
      }
    })
    
    const baselineBounds = await page.evaluate((id) => 
      window.__tatematika!.getBalloonBounds(id), baselineBalloon.id)
    
    const baselineClickX = canvasRect.left + (baselineBounds.x + baselineBounds.width / 2) * scale
    const baselineClickY = canvasRect.top + (baselineBounds.y + baselineBounds.height / 2) * scale
    
    const baselineOscCountBefore = await page.evaluate(() => (window as any).__oscillatorStarts.length)
    await page.mouse.click(baselineClickX, baselineClickY)
    
    // Wait for bounce animation
    await page.waitForTimeout(100)
    const baselineBounced = await page.evaluate((id) => {
      const anim = window.__tatematika!.getBalloonAnimationState(id)
      return anim.isBouncing
    }, baselineBalloon.id)
    
    await page.waitForTimeout(500)
    const baselineOscCountAfter = await page.evaluate(() => (window as any).__oscillatorStarts.length)
    const N = baselineOscCountAfter - baselineOscCountBefore
    
    expect(N, 'baseline: wrong tap must produce sounds').toBeGreaterThan(0)
    expect(baselineBounced, 'baseline: wrong tap must bounce').toBe(true)
    
    // REAL SCENARIO: wrong tap A, poll isJumping, real tap wrong B
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const wrongBalloons = state.balloons.filter((b: any) => !b.isCorrect)
    const initialWrongAttempts = state.wrongAttempts
    
    // Pick a far wrong balloon for longer jump
    const catPos = await page.evaluate(() => window.__tatematika!.getCatPosition())
    let balloonA = wrongBalloons[0]
    let maxDist = 0
    
    for (const balloon of wrongBalloons) {
      const bounds = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), balloon.id)
      if (bounds) {
        const dist = Math.abs((bounds.x + bounds.width / 2) - catPos.x)
        if (dist > maxDist) {
          maxDist = dist
          balloonA = balloon
        }
      }
    }
    
    const balloonB = wrongBalloons.find((b: any) => b.id !== balloonA.id)!
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    const boundsA = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), balloonA.id)
    const clickXA = canvasRect.left + (boundsA.x + boundsA.width / 2) * scale
    const clickYA = canvasRect.top + (boundsA.y + boundsA.height / 2) * scale
    
    const oscCountBeforeScenario = await page.evaluate(() => (window as any).__oscillatorStarts.length)
    await page.mouse.click(clickXA, clickYA)
    
    // Poll until jump starts
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return jumpState.isJumping
    }, { timeout: 1000, intervals: [10] }).toBe(true)
    
    // NOW click wrong balloon B while jumping
    const boundsB = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), balloonB.id)
    const clickXB = canvasRect.left + (boundsB.x + boundsB.width / 2) * scale
    const clickYB = canvasRect.top + (boundsB.y + boundsB.height / 2) * scale
    
    await page.mouse.click(clickXB, clickYB)
    
    // Immediately verify tap happened WHILE jumping
    const wasJumpingDuringTap = await page.evaluate(() => window.__tatematika!.getCatJumpState().isJumping)
    expect(wasJumpingDuringTap, 'tap on B must have occurred while isJumping was true').toBe(true)
    
    // Poll for B's bounce (right after tap, within ~500ms)
    let balloonBBounced = false
    const bounceCheckStart = Date.now()
    while (Date.now() - bounceCheckStart < 500) {
      const isBouncing = await page.evaluate((id) => {
        const anim = window.__tatematika!.getBalloonAnimationState(id)
        return anim.isBouncing
      }, balloonB.id)
      if (isBouncing) {
        balloonBBounced = true
        break
      }
      await page.waitForTimeout(20)
    }
    
    // Wait for jump to complete
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    await page.waitForTimeout(200)
    
    // Check final state
    const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
    const balloonBErrorIncremented = finalState.wrongAttempts > initialWrongAttempts
    
    const oscCountAfterScenario = await page.evaluate(() => (window as any).__oscillatorStarts.length)
    const totalSoundsInScenario = oscCountAfterScenario - oscCountBeforeScenario
    
    // Fully handled = error +1 AND B bounced AND total sounds == N (baseline) + N (tap on B)
    // Fully ignored = no error AND no B bounce AND total sounds == N (only from first tap A)
    
    const fullyHandled = balloonBErrorIncremented && balloonBBounced && (totalSoundsInScenario >= N + N)
    const fullyIgnored = !balloonBErrorIncremented && !balloonBBounced && (totalSoundsInScenario <= N + 1)
    
    if (!fullyHandled && !fullyIgnored) {
      // Partial handling - this is the failure we expect
      const parts: string[] = []
      if (balloonBErrorIncremented) parts.push('error counted')
      if (balloonBBounced) parts.push('B bounced')
      if (totalSoundsInScenario >= N + N) parts.push(`sound played (${totalSoundsInScenario} >= ${N + N})`)
      
      const missing: string[] = []
      if (!balloonBErrorIncremented) missing.push('no error')
      if (!balloonBBounced) missing.push('no B bounce')
      if (totalSoundsInScenario < N + N) missing.push(`insufficient sound (${totalSoundsInScenario} < ${N + N})`)
      
      expect(false, `wrong tap during jump is HALF-HANDLED: ${parts.join(', ')} but ${missing.join(', ')}`).toBe(true)
    }
    
    // If we get here, behavior is consistent (but may not be tested on current code)
    expect(fullyHandled || fullyIgnored, 'wrong tap during jump must be either fully handled OR fully ignored').toBe(true)
  })
})
