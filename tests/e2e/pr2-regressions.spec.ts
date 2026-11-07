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
    
    // Install per-frame recorder
    await page.evaluate((targetId) => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const frames: any[] = []
      
      const recordFrame = () => {
        const jumpState = window.__tatematika!.getCatJumpState()
        const bs = scene.balloonSprites.find((b: any) => b.id === targetId)
        
        frames.push({
          time: scene.time.now,
          isJumping: jumpState.isJumping,
          balloonExists: !!bs,
          spriteExists: bs ? !!bs.sprite : false,
          visible: bs?.sprite?.visible,
          alpha: bs?.sprite?.alpha,
          isPopping: bs?.isPopping || false
        })
      }
      
      scene.events.on('postupdate', recordFrame)
      window.__k3Frames = frames
      window.__k3Stop = () => scene.events.off('postupdate', recordFrame)
    }, correctBalloon.id)
    
    // Click the correct balloon
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correctBalloon.id)
    
    // Wait for jump to START (clickBalloon sets pendingJump, game loop triggers it)
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return jumpState.isJumping
    }, { timeout: 2000, intervals: [16] }).toBe(true)
    
    // Wait for jump to COMPLETE and pop to finish
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const newState = await page.evaluate(() => window.__tatematika!.getGameState())
      return !jumpState.isJumping && newState.stars === state.stars + 1
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Stop recording and analyze timeline
    const frames = await page.evaluate(() => {
      window.__k3Stop()
      return window.__k3Frames
    })
    
    // Find jumping frames
    const jumpingFrames = frames.filter((f: any) => f.isJumping)
    
    // Assert: at least 5 jumping frames recorded (precondition check)
    expect(jumpingFrames.length, `only ${jumpingFrames.length} jumping frames recorded, jump too fast or recorder missed start`).toBeGreaterThanOrEqual(5)
    
    // Assert: balloon present and visible on every jumping frame UNTIL it starts popping
    // Once isPopping=true, visible can become false as part of the pop animation
    const jumpingBeforePopFrames = jumpingFrames.filter((f: any) => !f.isPopping)
    const missingFrames = jumpingBeforePopFrames.filter((f: any) => !f.balloonExists || !f.spriteExists || !f.visible)
    expect(
      missingFrames.length,
      `balloon missing or invisible on ${missingFrames.length} jumping-before-pop frames: ${missingFrames.map((f: any) => `t=${f.time} exists=${f.balloonExists} sprite=${f.spriteExists} visible=${f.visible} isPopping=${f.isPopping}`).join(', ')}`
    ).toBe(0)
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
    
    // Install per-frame recorder tracking balloon IDs and pop state
    await page.evaluate(({ targetId, oldIds }) => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const frames: any[] = []
      let prevBalloonIds: string[] = []
      
      const recordFrame = () => {
        const jumpState = window.__tatematika!.getCatJumpState()
        const bs = scene.balloonSprites.find((b: any) => b.id === targetId)
        const currentBalloonIds = scene.balloonSprites.map((b: any) => b.id).sort()
        
        const newBalloonsCreated = currentBalloonIds.filter((id: string) => !prevBalloonIds.includes(id))
        
        frames.push({
          time: scene.time.now,
          isJumping: jumpState.isJumping,
          targetExists: !!bs,
          targetIsPopping: bs?.isPopping || false,
          targetAlpha: bs?.sprite?.alpha,
          targetScale: bs?.sprite?.scaleX,
          balloonIds: currentBalloonIds,
          oldBalloonIds: oldIds.filter((id: string) => currentBalloonIds.includes(id)),
          newBalloonsCreated: newBalloonsCreated.length > 0 ? newBalloonsCreated : null
        })
        
        prevBalloonIds = currentBalloonIds
      }
      
      scene.events.on('postupdate', recordFrame)
      window.__k3Frames = frames
      window.__k3Stop = () => scene.events.off('postupdate', recordFrame)
    }, { targetId: correctBalloon.id, oldIds: oldBalloonIds })
    
    // Click correct balloon
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correctBalloon.id)
    
    // Wait for jump to START
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return jumpState.isJumping
    }, { timeout: 2000, intervals: [16] }).toBe(true)
    
    // Wait 1.5s after pop should have started (600ms jump + 400ms pop + margin)
    await page.waitForTimeout(1500)
    
    // Stop recording and analyze timeline
    const frames = await page.evaluate(() => {
      window.__k3Stop()
      return window.__k3Frames
    })
    
    // Find when pop ends: first frame where target is no longer popping OR no longer exists
    let popEndFrameIndex = -1
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]
      const prevWasPopping = i > 0 && frames[i - 1].targetIsPopping
      if (prevWasPopping && (!f.targetIsPopping || !f.targetExists)) {
        popEndFrameIndex = i
        break
      }
    }
    
    // If pop never ended in recording, find last frame where target was popping
    if (popEndFrameIndex === -1) {
      for (let i = frames.length - 1; i >= 0; i--) {
        if (frames[i].targetIsPopping) {
          popEndFrameIndex = i
          break
        }
      }
    }
    
    expect(popEndFrameIndex, 'pop animation never started in recorded frames').toBeGreaterThan(-1)
    
    const popEndTime = frames[popEndFrameIndex].time
    
    // Find first frame where new balloon IDs appear
    let firstNewBalloonFrameIndex = -1
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].newBalloonsCreated) {
        firstNewBalloonFrameIndex = i
        break
      }
    }
    
    // Assert: old balloons unchanged on every frame until pop ends
    const framesBeforePopEnd = frames.slice(0, popEndFrameIndex + 1)
    const framesWithMissingOldBalloons = framesBeforePopEnd.filter((f: any) => 
      f.oldBalloonIds.length < oldBalloonIds.length
    )
    
    expect(
      framesWithMissingOldBalloons.length,
      `old balloons removed before pop ended: ${framesWithMissingOldBalloons.length} frames had missing balloons before pop end at t=${popEndTime}`
    ).toBe(0)
    
    // Assert: new balloons only appear at or after pop end
    if (firstNewBalloonFrameIndex !== -1) {
      const firstNewBalloonTime = frames[firstNewBalloonFrameIndex].time
      const delta = firstNewBalloonTime - popEndTime
      
      expect(
        firstNewBalloonFrameIndex >= popEndFrameIndex,
        `new balloons appeared at frame ${firstNewBalloonFrameIndex} (t=${firstNewBalloonTime}) BEFORE pop ended at frame ${popEndFrameIndex} (t=${popEndTime}), delta=${delta.toFixed(1)}ms`
      ).toBe(true)
    }
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

  // Shared instrumentation and analysis code (injected into page context)
  const audioInstrumentationCode = `
    function setupAudioInstrumentation() {
      const oscillators = [];
      const liveContexts = new Map();
      let muteSnapshot = null;
      
      // Install capture-phase listener to snapshot mute moment BEFORE Phaser handles click
      window.addEventListener('pointerdown', (e) => {
        muteSnapshot = {
          perfNow: performance.now(),
          contexts: new Map()
        };
        for (const [ctx] of liveContexts) {
          muteSnapshot.contexts.set(ctx, ctx.currentTime);
        }
      }, true);
      
      const BaseProto = window.BaseAudioContext?.prototype || window.AudioContext?.prototype;
      
      // Patch close/suspend on AudioContext.prototype (they live there, not on BaseAudioContext)
      const AudioCtxProto = window.AudioContext?.prototype;
      const WebkitCtxProto = window.webkitAudioContext?.prototype;
      
      if (AudioCtxProto) {
        const originalClose = AudioCtxProto.close;
        if (originalClose) {
          AudioCtxProto.close = function() {
            const perfTime = performance.now();
            const ctxTime = this.currentTime;
            for (const osc of oscillators) {
              if (osc.ctx === this && osc.ctxClosedAt === 0) {
                // Use currentTime if available, otherwise use perfTime difference
                osc.ctxClosedAt = ctxTime || 0;
                osc.ctxClosePerfTime = perfTime;
              }
            }
            const result = originalClose.apply(this, arguments);
            return result;
          };
        }
        
        const originalSuspend = AudioCtxProto.suspend;
        if (originalSuspend) {
          AudioCtxProto.suspend = function() {
            const perfTime = performance.now();
            const ctxTime = this.currentTime;
            for (const osc of oscillators) {
              if (osc.ctx === this && osc.ctxSuspendedAt === 0) {
                osc.ctxSuspendedAt = ctxTime;
                osc.ctxSuspendPerfTime = perfTime;
              }
            }
            const result = originalSuspend.apply(this, arguments);
            return result;
          };
        }
      }
      
      if (WebkitCtxProto) {
        const originalClose = WebkitCtxProto.close;
        if (originalClose) {
          WebkitCtxProto.close = function() {
            const perfTime = performance.now();
            const ctxTime = this.currentTime;
            for (const osc of oscillators) {
              if (osc.ctx === this && osc.ctxClosedAt === 0) {
                osc.ctxClosedAt = ctxTime;
                osc.ctxClosePerfTime = perfTime;
              }
            }
            const result = originalClose.apply(this, arguments);
            return result;
          };
        }
        
        const originalSuspend = WebkitCtxProto.suspend;
        if (originalSuspend) {
          WebkitCtxProto.suspend = function() {
            const perfTime = performance.now();
            const ctxTime = this.currentTime;
            for (const osc of oscillators) {
              if (osc.ctx === this && osc.ctxSuspendedAt === 0) {
                osc.ctxSuspendedAt = ctxTime;
                osc.ctxSuspendPerfTime = perfTime;
              }
            }
            const result = originalSuspend.apply(this, arguments);
            return result;
          };
        }
      }
      
      // Patch createOscillator on BaseAudioContext (or AudioContext fallback)
      if (BaseProto) {
        const originalCreateOscillator = BaseProto.createOscillator;
        if (originalCreateOscillator) {
          BaseProto.createOscillator = function() {
            const osc = originalCreateOscillator.call(this);
            const ctx = this;
            liveContexts.set(ctx, true);
            
            const state = {
              ctx,
              startWhen: -1,
              originalStopWhen: -1,
              stopWhen: -1,
              startCallTime: 0,
              stopCallTime: 0,
              stopCallPerfTime: 0,
              stopCallCtxTime: 0,
              disconnectCallTime: 0,
              disconnectCallPerfTime: 0,
              disconnectCallCtxTime: 0,
              gainCalls: [],
              ctxClosedAt: 0,
              ctxClosePerfTime: 0,
              ctxSuspendedAt: 0,
              ctxSuspendPerfTime: 0
            };
            oscillators.push(state);
            
            const originalStart = osc.start;
            const originalStop = osc.stop;
            const originalConnect = osc.connect;
            const originalDisconnect = osc.disconnect;
            
            osc.start = function(when) {
              state.startWhen = when !== undefined ? when : ctx.currentTime;
              state.startCallTime = ctx.currentTime;
              return originalStart.apply(this, arguments);
            };
            
            osc.stop = function(when) {
              const stopWhen = when !== undefined ? when : ctx.currentTime;
              if (state.originalStopWhen === -1) {
                state.originalStopWhen = stopWhen;
              }
              state.stopWhen = stopWhen;
              state.stopCallTime = ctx.currentTime;
              state.stopCallPerfTime = performance.now();
              state.stopCallCtxTime = ctx.currentTime;
              return originalStop.apply(this, arguments);
            };
            
            osc.connect = function(destination) {
              if (destination && destination.gain !== undefined) {
                const gainParam = destination.gain;
                const originalSetValue = gainParam.setValueAtTime;
                if (originalSetValue && !gainParam.__patched) {
                  gainParam.__patched = true;
                  gainParam.setValueAtTime = function(value, time) {
                    state.gainCalls.push({
                      value,
                      time,
                      callPerfTime: performance.now(),
                      callCtxTime: ctx.currentTime
                    });
                    return originalSetValue.call(this, value, time);
                  };
                }
              }
              return originalConnect.apply(this, arguments);
            };
            
            osc.disconnect = function() {
              state.disconnectCallTime = ctx.currentTime;
              state.disconnectCallPerfTime = performance.now();
              state.disconnectCallCtxTime = ctx.currentTime;
              return originalDisconnect.apply(this, arguments);
            };
            
            return osc;
          };
        }
      }
      
      return { oscillators, liveContexts, getMuteSnapshot: () => muteSnapshot };
    }
    
    function analyzeMuteEffectiveness(oscillators, muteSnapshot) {
      const audibleAtMute = [];
      
      for (const osc of oscillators) {
        const ctxTimeAtMute = muteSnapshot.contexts.get(osc.ctx) || 0;
        
        // Was this oscillator audible at mute?
        if (osc.startWhen >= 0 && osc.startWhen <= ctxTimeAtMute && 
            osc.originalStopWhen > ctxTimeAtMute + 0.05) {
          
          let effectiveEnd = Infinity;
          let silencedBy = 'none';
          
          // Check re-stop (stopWhen differs from originalStopWhen means stop was called again)
          if (osc.stopWhen !== osc.originalStopWhen) {
            const issuedAfterMute = osc.stopCallPerfTime >= muteSnapshot.perfNow ||
                                     osc.stopCallCtxTime >= ctxTimeAtMute;
            if (issuedAfterMute && osc.stopWhen < effectiveEnd) {
              effectiveEnd = osc.stopWhen;
              silencedBy = 'stop';
            }
          }
          
          // Check disconnect
          if (osc.disconnectCallTime > 0) {
            const issuedAfterMute = osc.disconnectCallPerfTime >= muteSnapshot.perfNow ||
                                     osc.disconnectCallCtxTime >= ctxTimeAtMute;
            if (issuedAfterMute && osc.disconnectCallCtxTime < effectiveEnd) {
              effectiveEnd = osc.disconnectCallCtxTime;
              silencedBy = 'disconnect';
            }
          }
          
          // Check gain to zero
          for (const gain of osc.gainCalls) {
            if (gain.value === 0 || gain.value < 0.001) {
              const issuedAfterMute = gain.callPerfTime >= muteSnapshot.perfNow ||
                                       gain.callCtxTime >= ctxTimeAtMute;
              if (issuedAfterMute && gain.time < effectiveEnd) {
                effectiveEnd = gain.time;
                silencedBy = 'gain';
              }
            }
          }
          
          // Check context close/suspend (use perfTime to detect if called, ctxTime might be 0)
          if (osc.ctxClosePerfTime > 0) {
            const issuedAfterMute = osc.ctxClosePerfTime >= muteSnapshot.perfNow ||
                                     osc.ctxClosedAt >= ctxTimeAtMute;
            // Use ctxClosedAt if available, otherwise use ctxTimeAtMute (close makes it immediate)
            const effectiveCloseTime = osc.ctxClosedAt > 0 ? osc.ctxClosedAt : ctxTimeAtMute;
            if (issuedAfterMute && effectiveCloseTime < effectiveEnd) {
              effectiveEnd = effectiveCloseTime;
              silencedBy = 'close';
            }
          }
          
          if (osc.ctxSuspendPerfTime > 0) {
            const issuedAfterMute = osc.ctxSuspendPerfTime >= muteSnapshot.perfNow ||
                                     osc.ctxSuspendedAt >= ctxTimeAtMute;
            const effectiveSuspendTime = osc.ctxSuspendedAt > 0 ? osc.ctxSuspendedAt : ctxTimeAtMute;
            if (issuedAfterMute && effectiveSuspendTime < effectiveEnd) {
              effectiveEnd = effectiveSuspendTime;
              silencedBy = 'suspend';
            }
          }
          
          audibleAtMute.push({
            originalStopWhen: osc.originalStopWhen,
            ctxTimeAtMute,
            effectiveEnd,
            silencedBy,
            silencedInTime: effectiveEnd <= ctxTimeAtMute + 0.05
          });
        }
      }
      
      return audibleAtMute;
    }
  `;

  test('K10 instrumentation self-test: verify silencing detection', async ({ page }) => {
    // Self-test to prove the instrumentation can detect silencing
    // Uses same init script and analysis function as main K10 test
    
    await page.goto('about:blank')
    
    // Inject instrumentation directly
    await page.evaluate(`
      (function() {
        ${audioInstrumentationCode}
        window.__audioInstrumentation = setupAudioInstrumentation();
        window.__analyzeMuteEffectiveness = analyzeMuteEffectiveness;
      })();
    `)
    
    await page.waitForTimeout(10)
    
    // Test case 1: stop() silences
    const result1 = await page.evaluate(() => {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 1)
      
      const muteSnapshot = {
        perfNow: performance.now(),
        contexts: new Map([[ctx, ctx.currentTime]])
      }
      
      osc.stop(ctx.currentTime)
      
      const oscs = (window as any).__audioInstrumentation.oscillators
      const analysis = (window as any).__analyzeMuteEffectiveness(oscs, muteSnapshot)
      
      return { length: analysis.length, silencedInTime: analysis[0]?.silencedInTime }
    })
    
    expect(result1.length, 'self-test 1: one oscillator should be audible').toBe(1)
    expect(result1.silencedInTime, 'self-test 1: stop() should silence').toBe(true)
    
    // Test case 2: close() silences
    const result2 = await page.evaluate(() => {
      ;(window as any).__audioInstrumentation.oscillators.length = 0
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 1)
      
      const muteSnapshot = {
        perfNow: performance.now(),
        contexts: new Map([[ctx, ctx.currentTime]])
      }
      
      ctx.close()
      
      const oscs = (window as any).__audioInstrumentation.oscillators
      const analysis = (window as any).__analyzeMuteEffectiveness(oscs, muteSnapshot)
      
      return {
        length: analysis.length,
        silencedInTime: analysis[0]?.silencedInTime,
        debug: {
          ctxClosedAt: oscs[0]?.ctxClosedAt,
          ctxClosePerfTime: oscs[0]?.ctxClosePerfTime,
          ctxTimeAtMute: muteSnapshot.contexts.get(ctx),
          muteSnapPerfNow: muteSnapshot.perfNow,
          effectiveEnd: analysis[0]?.effectiveEnd,
          silencedBy: analysis[0]?.silencedBy
        }
      }
    })
    
    if (!result2.silencedInTime) {
      console.log('Self-test 2 debug:', result2.debug)
    }
    
    expect(result2.length, 'self-test 2: one oscillator should be audible').toBe(1)
    expect(result2.silencedInTime, 'self-test 2: close() should silence').toBe(true)
    
    // Test case 3: gain->0 silences
    const result3 = await page.evaluate(() => {
      ;(window as any).__audioInstrumentation.oscillators.length = 0
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 1)
      
      const muteSnapshot = {
        perfNow: performance.now(),
        contexts: new Map([[ctx, ctx.currentTime]])
      }
      
      gain.gain.setValueAtTime(0, ctx.currentTime)
      
      const oscs = (window as any).__audioInstrumentation.oscillators
      const analysis = (window as any).__analyzeMuteEffectiveness(oscs, muteSnapshot)
      
      return { length: analysis.length, silencedInTime: analysis[0]?.silencedInTime }
    })
    
    expect(result3.length, 'self-test 3: one oscillator should be audible').toBe(1)
    expect(result3.silencedInTime, 'self-test 3: gain->0 should silence').toBe(true)
    
    // Test case 4: no silencing -> must report false
    const result4 = await page.evaluate(() => {
      ;(window as any).__audioInstrumentation.oscillators.length = 0
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 1)
      
      const muteSnapshot = {
        perfNow: performance.now(),
        contexts: new Map([[ctx, ctx.currentTime]])
      }
      
      // No silencing call
      
      const oscs = (window as any).__audioInstrumentation.oscillators
      const analysis = (window as any).__analyzeMuteEffectiveness(oscs, muteSnapshot)
      
      return { length: analysis.length, silencedInTime: analysis[0]?.silencedInTime }
    })
    
    expect(result4.length, 'self-test 4: one oscillator should be audible').toBe(1)
    expect(result4.silencedInTime, 'self-test 4: no silencing should report false').toBe(false)
  })

  test('K10: Mute stops sounds that are already playing or scheduled', async ({ page }) => {
    // Spec K10: "всички звуци спират, докато не го натисне отново"
    // Regression: mute must stop sounds ALREADY playing or scheduled, not just block future calls
    // App creates new AudioContext per sound (GameScene.ts ~574) and schedules stop() in the future
    
    // Same instrumentation as self-test
    await page.addInitScript(audioInstrumentationCode + `
      window.__audioInstrumentation = setupAudioInstrumentation();
      window.__analyzeMuteEffectiveness = analyzeMuteEffectiveness;
    `)
    
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
    // Snapshot will be captured by pointerdown listener BEFORE Phaser handles it
    const muteBtnClickX = canvasRect.left + (muteButtonBounds.x + muteButtonBounds.width / 2) * scale
    const muteBtnClickY = canvasRect.top + (muteButtonBounds.y + muteButtonBounds.height / 2) * scale
    
    await page.mouse.click(muteBtnClickX, muteBtnClickY)
    await page.waitForTimeout(10)
    
    // Verify mute succeeded
    const isMuted = await page.evaluate(() => window.__tatematika!.isMuted())
    expect(isMuted, 'mute button must have toggled mute on').toBe(true)
    
    // Get mute snapshot and analyze IN PAGE CONTEXT
    const muteAnalysisResult = await page.evaluate(() => {
      const instrumentation = (window as any).__audioInstrumentation
      const muteSnapshot = instrumentation?.getMuteSnapshot()
      const oscs = instrumentation?.oscillators || []
      
      if (!muteSnapshot) {
        return { snapshotMissing: true, audibleAtMute: [] }
      }
      
      const audibleAtMute = (window as any).__analyzeMuteEffectiveness(oscs, muteSnapshot)
      
      return {
        snapshotMissing: false,
        audibleAtMute
      }
    })
    
    expect(muteAnalysisResult.snapshotMissing, 'mute snapshot must have been captured').toBe(false)
    expect(muteAnalysisResult.audibleAtMute.length, 'precondition: at least one oscillator must be audible at mute').toBeGreaterThan(0)
    
    // Assert: all audible oscillators must be silenced
    for (const osc of muteAnalysisResult.audibleAtMute) {
      expect(
        osc.silencedInTime,
        `oscillator still scheduled to play until ctx t=${osc.originalStopWhen.toFixed(3)} after mute at t=${osc.ctxTimeAtMute.toFixed(3)} (effective end ${osc.effectiveEnd === Infinity ? 'never' : osc.effectiveEnd.toFixed(3)}, silenced by ${osc.silencedBy})`
      ).toBe(true)
    }
    
    // Verify no NEW sounds start while muted (real click)
    const countBefore = await page.evaluate(() => 
      (window as any).__audioInstrumentation?.oscillators.length || 0)
    
    // Get current wrong attempts count
    const wrongAttemptsBefore = await page.evaluate(() => window.__tatematika!.getGameState().wrongAttempts)
    
    const wrongBalloon2 = state.balloons.find((b: any) => !b.isCorrect && b.id !== wrongBalloon.id)!
    const balloonBounds2 = await page.evaluate((id) => 
      window.__tatematika!.getBalloonBounds(id), wrongBalloon2.id)
    
    const clickX2 = canvasRect.left + (balloonBounds2.x + balloonBounds2.width / 2) * scale
    const clickY2 = canvasRect.top + (balloonBounds2.y + balloonBounds2.height / 2) * scale
    
    await page.mouse.click(clickX2, clickY2)
    
    // Poll until cat arrives and error is counted (wrongAttempts increments)
    await expect.poll(async () => {
      const currentAttempts = await page.evaluate(() => window.__tatematika!.getGameState().wrongAttempts)
      return currentAttempts > wrongAttemptsBefore
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Wait additional 100ms to ensure sounds would have played
    await page.waitForTimeout(100)
    
    const countAfter = await page.evaluate(() => 
      (window as any).__audioInstrumentation?.oscillators.length || 0)
    
    expect(countAfter, 'mute must block new sounds').toBe(countBefore)
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
    
    const baselineWrongAttemptsBefore = await page.evaluate(() => window.__tatematika!.getGameState().wrongAttempts)
    const baselineOscCountBefore = await page.evaluate(() => (window as any).__oscillatorStarts.length)
    await page.mouse.click(baselineClickX, baselineClickY)
    
    // Poll until cat arrives and error is counted
    await expect.poll(async () => {
      const currentAttempts = await page.evaluate(() => window.__tatematika!.getGameState().wrongAttempts)
      return currentAttempts > baselineWrongAttemptsBefore
    }, { timeout: 5000, intervals: [50] }).toBe(true)
    
    // Check bounce right after cat arrives
    const baselineBounced = await page.evaluate((id) => {
      const anim = window.__tatematika!.getBalloonAnimationState(id)
      return anim.isBouncing
    }, baselineBalloon.id)
    
    // Wait 100ms to ensure all sounds have started
    await page.waitForTimeout(100)
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
    
    // Poll until wrongAttempts stabilizes (no changes for 100ms), indicating all jumps/sounds are done
    let lastWrongAttempts = await page.evaluate(() => window.__tatematika!.getGameState().wrongAttempts)
    let stableCount = 0
    const maxWaitMs = 2000
    const checkIntervalMs = 50
    let totalWaitMs = 0
    
    while (stableCount < 2 && totalWaitMs < maxWaitMs) {
      await page.waitForTimeout(checkIntervalMs)
      totalWaitMs += checkIntervalMs
      const currentWrongAttempts = await page.evaluate(() => window.__tatematika!.getGameState().wrongAttempts)
      if (currentWrongAttempts === lastWrongAttempts) {
        stableCount++
      } else {
        stableCount = 0
        lastWrongAttempts = currentWrongAttempts
      }
    }
    
    // Wait additional 100ms to ensure all sounds have started
    await page.waitForTimeout(100)
    
    // Check final state
    const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
    const balloonBErrorIncremented = finalState.wrongAttempts > initialWrongAttempts
    
    const oscCountAfterScenario = await page.evaluate(() => (window as any).__oscillatorStarts.length)
    const totalSoundsInScenario = oscCountAfterScenario - oscCountBeforeScenario
    
    // Fully handled = error +1 AND B bounced AND total sounds == 2*N (baseline N + tap on B N)
    // Fully ignored = no error AND no B bounce AND total sounds == N (only from first tap A)
    
    const fullyHandled = balloonBErrorIncremented && balloonBBounced && (totalSoundsInScenario === 2 * N)
    const fullyIgnored = !balloonBErrorIncremented && !balloonBBounced && (totalSoundsInScenario === N)
    
    if (!fullyHandled && !fullyIgnored) {
      // Partial handling - this is the failure we expect
      const parts: string[] = []
      if (balloonBErrorIncremented) parts.push('error counted')
      if (balloonBBounced) parts.push('B bounced')
      if (totalSoundsInScenario === 2 * N) parts.push(`sound played (total=${totalSoundsInScenario}, expected 2*${N})`)
      
      const missing: string[] = []
      if (!balloonBErrorIncremented) missing.push('no error')
      if (!balloonBBounced) missing.push('no B bounce')
      if (totalSoundsInScenario !== 2 * N && totalSoundsInScenario !== N) {
        missing.push(`sound count=${totalSoundsInScenario}, expected exactly ${N} (ignored) or ${2 * N} (handled)`)
      } else if (totalSoundsInScenario === N) {
        missing.push(`sound count=${N} (ignored level) but error/bounce detected`)
      }
      
      expect(false, `wrong tap during jump is HALF-HANDLED: ${parts.join(', ')} but ${missing.join(', ')}`).toBe(true)
    }
    
    // If we get here, behavior is consistent (but may not be tested on current code)
    expect(fullyHandled || fullyIgnored, 'wrong tap during jump must be either fully handled OR fully ignored').toBe(true)
  })
})
