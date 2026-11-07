import { test, expect } from '@playwright/test'
import { ACTION_TIMEOUT_MS, INIT_TIMEOUT_MS, multiRoundTestTimeout } from './test-timeouts'
import { popCorrectBalloonAndWait, getGameScaleAndRect } from './helpers'

async function expectIdlePhase(page: any) {
  const hasPhase = await page.evaluate(() => typeof window.__tatematika!.getActionPhase === 'function')
  expect(hasPhase, 'getActionPhase hook must be implemented (docs/games/kote-balonche.md §4 rule 8)').toBe(true)
  await expect.poll(async () => {
    return page.evaluate(() => window.__tatematika!.getActionPhase!() === 'idle')
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
}

function startedSoundRecord() {
  const oscs = (window as any).__audioInstrumentation?.oscillators || []
  return oscs.filter((o: any) => {
    const duration = o.scheduledDuration ?? (o.originalStopWhen - o.startWhen)
    const audible = (o.gainCalls || []).some((g: any) => g.value > 0.001)
    return o.startWhen >= 0 && duration > 0.05 && audible
  }).map((o: any) => ({
    startWhen: o.startWhen,
    contextTime: o.startCallTime,
    scheduledDuration: o.scheduledDuration ?? (o.originalStopWhen - o.startWhen),
    peakGain: Math.max(0, ...(o.gainCalls || []).map((g: any) => g.value))
  }))
}

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
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
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
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
    
    // Wait for game ready
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
    
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
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
    
    // Wait for game ready
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
      return !jumpState.isJumping && correctCount === 1
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
    
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
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
    
    // Install per-frame recorder tracking jump progress and geometry
    await page.evaluate((targetId) => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const frames: any[] = []
      
      const recordFrame = () => {
        const jumpState = window.__tatematika!.getCatJumpState()
        const bs = scene.balloonSprites.find((b: any) => b.id === targetId)
        
        // Calculate jump progress manually (same logic as src)
        let progress = null
        if (scene.catIsJumping && scene.catJumpTime !== undefined) {
          const jumpDuration = 0.6
          progress = scene.catJumpTime / jumpDuration
          if (progress > 1) progress = 1
        }
        
        // Get cat top edge: Graphics.getBounds() doesn't exist on this Phaser version,
        // so use drawing coordinates: ears are drawn at catY - 40 (see drawCat in src)
        const catTop = scene.catY !== undefined ? scene.catY - 40 : null
        
        // Get balloon bounds (bottom edge)
        const balloonBounds = window.__tatematika!.getBalloonBounds(targetId)
        const balloonBottom = balloonBounds ? balloonBounds.y + balloonBounds.height : null
        
        frames.push({
          time: scene.time.now,
          isJumping: jumpState.isJumping,
          jumpProgress: progress,
          balloonExists: !!bs,
          spriteExists: bs ? !!bs.sprite : false,
          visible: bs?.sprite?.visible,
          alpha: bs?.sprite?.alpha,
          isPopping: bs?.isPopping || false,
          catTop,
          balloonBottom
        })
      }
      
      scene.events.on('postupdate', recordFrame)
      window.__k3Frames = frames
      window.__k3Stop = () => scene.events.off('postupdate', recordFrame)
    }, correctBalloon.id)
    
    // Click the correct balloon
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correctBalloon.id)
    
    // timing: spec sets no duration (docs/games/kote-balonche.md); see tate-dev k22 evidence
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return jumpState.isJumping
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [16] }).toBe(true)
    
    // Wait for jump to COMPLETE and pop to finish
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const newState = await page.evaluate(() => window.__tatematika!.getGameState())
      return !jumpState.isJumping && newState.stars === state.stars + 1
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
    
    // Stop recording and analyze timeline
    const frames = await page.evaluate(() => {
      window.__k3Stop()
      return window.__k3Frames
    })
    
    // Contact tolerance: spec requires balloon stays visible until cat reaches it
    // "Reaches" means actual geometric contact, not progress-based approximation
    const CONTACT_TOLERANCE_PX = 5  // Cat top within 5px of balloon bottom
    
    // Find jumping frames
    const jumpingFrames = frames.filter((f: any) => f.isJumping)
    
    // Assert: at least 5 jumping frames recorded (precondition check)
    expect(jumpingFrames.length, `only ${jumpingFrames.length} jumping frames recorded, jump too fast or recorder missed start`).toBeGreaterThanOrEqual(5)
    
    // Find geometric contact frame: first frame where cat top reaches balloon bottom
    let geometricContactFrameIndex = -1
    let minGap = Infinity
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]
      if (f.catTop !== null && f.balloonBottom !== null) {
        const gap = f.catTop - f.balloonBottom
        if (gap < minGap) {
          minGap = gap
        }
        if (gap <= CONTACT_TOLERANCE_PX) {
          geometricContactFrameIndex = i
          break
        }
      }
    }
    
    expect(
      geometricContactFrameIndex,
      `cat never reached balloon: closest gap ${minGap.toFixed(1)}px (tolerance ${CONTACT_TOLERANCE_PX}px)`
    ).toBeGreaterThan(-1)
    
    const contactFrameIndex = geometricContactFrameIndex
    const contactFrame = frames[contactFrameIndex]
    const framesBeforeContact = frames.slice(0, contactFrameIndex)
    
    // Assert: at least 3 frames before contact (precondition)
    expect(framesBeforeContact.length, 'jump too fast - less than 3 frames before contact').toBeGreaterThanOrEqual(3)
    
    // Assert: balloon exists and visible on every frame before contact
    const missingBeforeContact = framesBeforeContact.filter((f: any) => !f.balloonExists || !f.spriteExists || !f.visible)
    expect(
      missingBeforeContact.length,
      `balloon missing or invisible on ${missingBeforeContact.length} frames before contact: ${missingBeforeContact.map((f: any) => `t=${f.time} exists=${f.balloonExists} sprite=${f.spriteExists} visible=${f.visible} progress=${f.jumpProgress?.toFixed(2)}`).join(', ')}`
    ).toBe(0)
    
    // Find first frame where pop starts (isPopping=true or balloon gone)
    let popStartFrameIndex = -1
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]
      if (f.isPopping || (!f.balloonExists && i > 0 && frames[i - 1].balloonExists)) {
        popStartFrameIndex = i
        break
      }
    }
    
    // Assert: pop actually started
    expect(popStartFrameIndex, 'pop never started').toBeGreaterThan(-1)
    
    // Assert: pop starts at or after contact
    const popStartFrame = frames[popStartFrameIndex]
    expect(
      popStartFrameIndex >= contactFrameIndex,
      `pop started at frame ${popStartFrameIndex} (t=${popStartFrame.time}, progress=${popStartFrame.jumpProgress?.toFixed(2)}) BEFORE cat reached balloon at frame ${contactFrameIndex} (t=${contactFrame.time}, catTop=${contactFrame.catTop?.toFixed(1)}, balloonBottom=${contactFrame.balloonBottom?.toFixed(1)})`
    ).toBe(true)
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
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
    
    // Install per-frame recorder tracking balloon IDs and pop state
    // timing: spec sets no duration (docs/games/kote-balonche.md); see tate-dev k22 evidence
    // Records until the star is awarded. The spec sets no deadline for the jump.
    await page.evaluate(({ targetId, oldIds, initialStars }) => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const frames: any[] = []
      let prevBalloonIds: string[] = []
      let recordingActive = false
      let startTime: number | null = null
      
      const recordFrame = () => {
        if (!recordingActive) return
        if (startTime === null) {
          startTime = scene.time.now
          // Initialize prevBalloonIds on first frame
          prevBalloonIds = scene.balloonSprites.map((b: any) => b.id).sort()
        }
        
        const elapsed = scene.time.now - startTime
        
        const jumpState = window.__tatematika!.getCatJumpState()
        const bs = scene.balloonSprites.find((b: any) => b.id === targetId)
        const currentBalloonIds = scene.balloonSprites.map((b: any) => b.id).sort()
        const gameState = window.__tatematika!.getGameState()
        // New balloons are those not in prevBalloonIds AND not in oldIds (truly new, not just initial)
        const newBalloonsCreated = currentBalloonIds.filter((id: string) => 
          !prevBalloonIds.includes(id) && !oldIds.includes(id)
        )
        
        frames.push({
          time: elapsed,
          isJumping: jumpState.isJumping,
          targetExists: !!bs,
          targetIsPopping: bs?.isPopping || false,
          targetAlpha: bs?.sprite?.alpha,
          targetScaleX: bs?.sprite?.scaleX,
          targetScaleY: bs?.sprite?.scaleY,
          balloonIds: currentBalloonIds,
          oldBalloonIds: oldIds.filter((id: string) => currentBalloonIds.includes(id)),
          newBalloonsCreated: newBalloonsCreated.length > 0 ? newBalloonsCreated : null,
          stars: gameState.stars
        })
        
        // Stop when new round appears (stars increment)
        if (gameState.stars > initialStars) {
          scene.events.off('postupdate', recordFrame)
          recordingActive = false
        }
        
        prevBalloonIds = currentBalloonIds
      }
      
      scene.events.on('postupdate', recordFrame)
      window.__k3Frames = frames
      window.__k3StartRecording = () => { recordingActive = true }
    }, { targetId: correctBalloon.id, oldIds: oldBalloonIds, initialStars: state.stars })
    
    // Start recording BEFORE click
    await page.evaluate(() => (window as any).__k3StartRecording())
    await page.waitForTimeout(10)
    
    // Click correct balloon
    await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correctBalloon.id)
    
    // timing: spec sets no duration (docs/games/kote-balonche.md); see tate-dev k22 evidence
    await expect.poll(async () => {
      const newState = await page.evaluate(() => window.__tatematika!.getGameState())
      return newState.stars > state.stars
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
    
    // Get recorded frames
    const frames = await page.evaluate(() => window.__k3Frames)
    
    // Find when pop starts: first frame where isPopping=true OR alpha/scale changes (animation begins)
    let popStartFrameIndex = -1
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]
      const prevF = i > 0 ? frames[i - 1] : null
      
      // Check if pop flag set
      if (f.targetIsPopping && (!prevF || !prevF.targetIsPopping)) {
        popStartFrameIndex = i
        break
      }
      
      // Check if alpha/scale animation started (observ able pop)
      if (prevF && f.targetAlpha !== undefined && prevF.targetAlpha !== undefined) {
        const alphaChanged = Math.abs(f.targetAlpha - prevF.targetAlpha) > 0.01
        const scaleChanged = prevF.targetScaleX && f.targetScaleX && 
                            Math.abs(f.targetScaleX - prevF.targetScaleX) > 0.01
        if (alphaChanged || scaleChanged) {
          popStartFrameIndex = i
          break
        }
      }
    }
    
    expect(popStartFrameIndex, 'pop animation never started in recorded frames').toBeGreaterThan(-1)
    
    // Find when pop ends: first frame where target is destroyed OR not visible OR alpha <= 0.05
    const isPopEnded = (f: any) => {
      return !f.targetExists || 
             (f.visible !== undefined && !f.visible) || 
             (f.targetAlpha !== undefined && f.targetAlpha <= 0.05)
    }
    
    let popEndFrameIndex = -1
    for (let i = popStartFrameIndex; i < frames.length; i++) {
      if (isPopEnded(frames[i])) {
        popEndFrameIndex = i
        break
      }
    }
    
    expect(popEndFrameIndex, 'pop animation started but never ended').toBeGreaterThan(-1)
    
    const popStartTime = frames[popStartFrameIndex].time
    const popEndTime = frames[popEndFrameIndex].time
    
    // Find first frame where new balloon IDs appear
    let firstNewBalloonFrameIndex = -1
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].newBalloonsCreated) {
        firstNewBalloonFrameIndex = i
        break
      }
    }
    
    // Assert: old balloons unchanged on every frame before pop ends (not including pop end frame)
    const framesBeforePopEnd = frames.slice(0, popEndFrameIndex)
    const framesWithMissingOldBalloons = framesBeforePopEnd.filter((f: any) => 
      f.oldBalloonIds.length < oldBalloonIds.length
    )
    
    if (framesWithMissingOldBalloons.length > 0) {
      // Log frame table for debugging
      console.log('\n=== FRAME TABLE (pop animation frames) ===')
      const relevantFrames = frames.slice(Math.max(0, popStartFrameIndex - 2), popEndFrameIndex + 5)
      relevantFrames.forEach((f: any, i: number) => {
        const actualIndex = Math.max(0, popStartFrameIndex - 2) + i
        const marker = actualIndex === popStartFrameIndex ? ' <- POP START' : 
                      actualIndex === popEndFrameIndex ? ' <- POP END' : ''
        console.log(`[${actualIndex}] t=${f.time.toFixed(1)}ms isPopping=${f.targetIsPopping} alpha=${f.targetAlpha?.toFixed(3)} scaleX=${f.targetScaleX?.toFixed(3)} oldIds=${f.oldBalloonIds.length}/${oldBalloonIds.length} newIds=${f.newBalloonsCreated ? f.newBalloonsCreated.length : 0} stars=${f.stars}${marker}`)
      })
      console.log('=== END FRAME TABLE ===\n')
    }
    
    expect(
      framesWithMissingOldBalloons.length,
      `old balloons removed before pop ended: ${framesWithMissingOldBalloons.length} frames had missing balloons before pop end at t=${popEndTime.toFixed(1)}ms (pop started at t=${popStartTime.toFixed(1)}ms)`
    ).toBe(0)
    
    // Assert: new balloons only appear at or after pop end
    if (firstNewBalloonFrameIndex !== -1) {
      const firstNewBalloonTime = frames[firstNewBalloonFrameIndex].time
      const delta = firstNewBalloonTime - popEndTime
      
      expect(
        firstNewBalloonFrameIndex >= popEndFrameIndex,
        `new balloons appeared at frame ${firstNewBalloonFrameIndex} (t=${firstNewBalloonTime.toFixed(1)}ms) BEFORE pop ended at frame ${popEndFrameIndex} (t=${popEndTime.toFixed(1)}ms), delta=${delta.toFixed(1)}ms`
      ).toBe(true)
    }
  })

  // ============================================================================
  // REGRESSION: Resize after level complete must keep celebration UI visible
  // ============================================================================

  test('K7: Resize after level complete keeps celebration UI visible and working', async ({ page }) => {
    // timing: spec sets no duration (docs/games/kote-balonche.md); see tate-dev k22 evidence
    test.setTimeout(multiRoundTestTimeout(5))
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
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
    
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
                state.scheduledDuration = stopWhen - (state.startWhen >= 0 ? state.startWhen : ctx.currentTime);
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
      
      const contexts = [];
      const wrapCtor = (name) => {
        const Original = window[name];
        if (typeof Original !== 'function') return;
        const Wrapped = function () {
          const ctx = new Original();
          contexts.push({ currentTime: ctx.currentTime, perfNow: performance.now() });
          liveContexts.set(ctx, true);
          return ctx;
        };
        Wrapped.prototype = Original.prototype;
        window[name] = Wrapped;
      };
      wrapCtor('AudioContext');
      wrapCtor('webkitAudioContext');
      
      return { oscillators, liveContexts, contexts, getMuteSnapshot: () => muteSnapshot };
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
    // Two wrong answers: the sound under test, then a muted click after that action is idle.
    test.setTimeout(multiRoundTestTimeout(2))
    // Spec K10: "всички звуци спират, докато не го натисне отново"
    // Regression: mute must stop sounds ALREADY playing or scheduled, not just block future calls
    // App creates new AudioContext per sound (GameScene.ts ~574) and schedules stop() in the future
    
    // Same instrumentation as self-test
    await page.addInitScript(audioInstrumentationCode + `
      window.__audioInstrumentation = setupAudioInstrumentation();
      window.__analyzeMuteEffectiveness = analyzeMuteEffectiveness;
    `)
    
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
    
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
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
    
    // Click a WRONG balloon to get boing (0.2s) + meow (0.3s) sounds that are genuinely still playing
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const wrongBalloon = state.balloons.find((b: any) => !b.isCorrect)!
    
    const balloonBounds = await page.evaluate((id) => 
      window.__tatematika!.getBalloonBounds(id), wrongBalloon.id)
    
    const { canvasRect, scale } = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      return {
        canvasRect: { left: rect.left, top: rect.top },
        scale: rect.width / game.scale.width
      }
    })
    
    // timing: spec sets no duration (docs/games/kote-balonche.md); see tate-dev k22 evidence
    // Schedule mute in the same turn the sound is scheduled. A later Playwright
    // click arrives after boing (0.2s) and meow (0.3s) have already ended.
    await page.evaluate(() => {
      const BaseProto = (window as any).BaseAudioContext?.prototype || (window as any).AudioContext?.prototype
      const createOscillator = BaseProto.createOscillator
      let armMute = true
      BaseProto.createOscillator = function () {
        const osc = createOscillator.apply(this, arguments)
        const recordStop = osc.stop
        osc.stop = function () {
          const result = recordStop.apply(this, arguments)
          if (!armMute) return result
          const oscs = (window as any).__audioInstrumentation?.oscillators || []
          const ready = oscs.some((o: any) => {
            const duration = o.scheduledDuration ?? (o.originalStopWhen - o.startWhen)
            const audible = (o.gainCalls || []).some((g: any) => g.value > 0.001)
            return o.startWhen >= 0 && duration > 0.05 && audible
          })
          if (!ready) return result
          armMute = false
          queueMicrotask(() => {
            const game = window.__tatematika!.getGame()
            const scene = game.scene.getScene('GameScene') as any
            const button = scene.muteButton
            const bounds = button.getBounds()
            const canvas = document.querySelector('canvas') as HTMLCanvasElement
            const rect = canvas.getBoundingClientRect()
            const scale = rect.width / game.scale.width
            window.dispatchEvent(new PointerEvent('pointerdown', {
              bubbles: true,
              cancelable: true,
              clientX: rect.left + (bounds.x + bounds.width / 2) * scale,
              clientY: rect.top + (bounds.y + bounds.height / 2) * scale,
              pointerId: 1,
              button: 0,
              buttons: 1,
              isPrimary: true
            }))
            if (!scene.isMutedPublic()) button.emit('pointerdown')
          })
          return result
        }
        return osc
      }
    })
    
    // Real click on wrong balloon to trigger boing + meow
    const clickX = canvasRect.left + (balloonBounds.x + balloonBounds.width / 2) * scale
    const clickY = canvasRect.top + (balloonBounds.y + balloonBounds.height / 2) * scale
    
    await page.mouse.click(clickX, clickY)
    
    // The boing/meow start at takeoff, which is after the walk. Poll the recorded
    // schedule instead of reading it in the same turn as the click.
    await expect.poll(async () => {
      const sounds = await page.evaluate(startedSoundRecord)
      return sounds.length
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBeGreaterThan(0)
    
    const startedSounds = await page.evaluate(startedSoundRecord)
    
    expect(
      startedSounds.length,
      `precondition: expected sound must start with audible gain and scheduled duration > 0.05s. details: ${JSON.stringify(startedSounds)}`
    ).toBeGreaterThan(0)
    
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
    
    // The second click is a new choice. It must be sent only after the first action
    // has finished, or §4 rule 8 ignores it and the error never increments.
    await expectIdlePhase(page)
    
    const stillMuted = await page.evaluate(() => window.__tatematika!.isMuted())
    expect(stillMuted, 'second click must happen while muted').toBe(true)
    
    // Verify no NEW sounds start while muted (real click)
    const countBefore = await page.evaluate(() => 
      (window as any).__audioInstrumentation?.oscillators.length || 0)
    
    const wrongAttemptsBefore = await page.evaluate(() => window.__tatematika!.getGameState().wrongAttempts)
    
    const stateAfterIdle = await page.evaluate(() => window.__tatematika!.getGameState())
    const wrongBalloon2 = stateAfterIdle.balloons.find((b: any) => !b.isCorrect && b.id !== wrongBalloon.id)
      || stateAfterIdle.balloons.find((b: any) => !b.isCorrect)!
    const fresh = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      return {
        left: rect.left,
        top: rect.top,
        scale: rect.width / game.scale.width
      }
    })
    const balloonBounds2 = await page.evaluate((id) => 
      window.__tatematika!.getBalloonBounds(id), wrongBalloon2.id)
    
    const clickX2 = fresh.left + (balloonBounds2.x + balloonBounds2.width / 2) * fresh.scale
    const clickY2 = fresh.top + (balloonBounds2.y + balloonBounds2.height / 2) * fresh.scale
    
    await page.mouse.click(clickX2, clickY2)
    
    await expect.poll(async () => {
      return page.evaluate(() => window.__tatematika!.getGameState().wrongAttempts)
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(wrongAttemptsBefore + 1)
    
    await expectIdlePhase(page)
    
    const soundsAfterMute = await page.evaluate((before: number) => {
      const oscs = (window as any).__audioInstrumentation?.oscillators || []
      const createdAfter = oscs.slice(before)
      const audibleAfter = createdAfter.filter((o: any) => {
        const duration = (o.scheduledDuration ?? (o.originalStopWhen - o.startWhen))
        const audible = (o.gainCalls || []).some((g: any) => g.value > 0.001)
        return o.startWhen >= 0 && duration > 0.05 && audible
      })
      return { countAfter: oscs.length, audibleAfter: audibleAfter.length }
    }, countBefore)
    
    expect(soundsAfterMute.countAfter, 'mute must block new sounds').toBe(countBefore)
    expect(soundsAfterMute.audibleAfter, 'mute must produce no new audible oscillator').toBe(0)
  })

  // ============================================================================
  // REGRESSION: Rapid taps during jump behavior consistency
  // ============================================================================

  test('Rapid taps during jump: input during the action is ignored', async ({ page }) => {
    // timing: spec sets no duration (docs/games/kote-balonche.md); see tate-dev k22 evidence
    test.setTimeout(multiRoundTestTimeout(2))
    // docs/games/kote-balonche.md §4 rule 8 / K13: after the cat accepts a balloon and is
    // walking, jumping, or landing, every later choice is ignored. It is not an error,
    // it does not bounce a balloon or play a sound, and it is not run after landing.
    
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
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
    
    // BASELINE: measure one wrong tap alone to establish N oscillator starts and bounce behavior
    const stateBaseline = await page.evaluate(() => window.__tatematika!.getGameState())
    const wrongBalloonsBaseline = stateBaseline.balloons.filter((b: any) => !b.isCorrect)
    const baselineBalloon = wrongBalloonsBaseline[0]
    
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
    
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

    // timing: spec sets no duration (docs/games/kote-balonche.md); see tate-dev k22 evidence
    await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const counts: Record<string, number> = {}
      const onFrame = () => {
        const current = (window as any).__bounceLatchCounts as Record<string, number>
        const scene = game.scene.getScene('GameScene') as any
        const sprites = scene?.balloonSprites || []
        for (const bs of sprites) {
          const anim = window.__tatematika!.getBalloonAnimationState(bs.id)
          const displaced = bs.sprite && Math.abs(bs.sprite.y - bs.y) >= 2
          if (anim.isBouncing || displaced) current[bs.id] = (current[bs.id] || 0) + 1
        }
      }
      game.events.on('postrender', onFrame)
      ;(window as any).__bounceLatchCounts = counts
    })

    await page.mouse.click(baselineClickX, baselineClickY)
    
    // Poll until cat arrives and error is counted
    await expect.poll(async () => {
      const currentAttempts = await page.evaluate(() => window.__tatematika!.getGameState().wrongAttempts)
      return currentAttempts > baselineWrongAttemptsBefore
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
    
    const baselineBounceCount = await page.evaluate((id) => {
      return (window as any).__bounceLatchCounts?.[id] || 0
    }, baselineBalloon.id)
    const baselineBounced = baselineBounceCount > 0
    
    await expect.poll(async () => {
      const after = await page.evaluate(() => (window as any).__oscillatorStarts.length)
      return after - baselineOscCountBefore
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBeGreaterThan(0)
    const baselineOscCountAfter = await page.evaluate(() => (window as any).__oscillatorStarts.length)
    const N = baselineOscCountAfter - baselineOscCountBefore
    
    expect(N, 'baseline: wrong tap must produce sounds').toBeGreaterThan(0)
    expect(baselineBounced, 'baseline: wrong tap must bounce').toBe(true)
    
    // A's click is a new choice, so the cat must be idle and the counter must be read
    // after the baseline tap has already been counted.
    await expectIdlePhase(page)
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const wrongBalloons = state.balloons.filter((b: any) => !b.isCorrect)
    
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
    
    const boundsA = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), balloonA.id)
    const clickXA = canvasRect.left + (boundsA.x + boundsA.width / 2) * scale
    const clickYA = canvasRect.top + (boundsA.y + boundsA.height / 2) * scale
    
    const preA = await page.evaluate(() => window.__tatematika!.getGameState().wrongAttempts)
    const oscCountBeforeA = await page.evaluate(() => (window as any).__oscillatorStarts.length)
    await page.mouse.click(clickXA, clickYA)
    
    // timing: spec sets no duration (docs/games/kote-balonche.md); see tate-dev k22 evidence
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return jumpState.isJumping
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [10] }).toBe(true)
    
    const pointB = await page.evaluate((id) => {
      const latch = { seen: false, phase: null as string | null, isJumping: false }
      const onPointer = () => {
        if (latch.seen) return
        latch.seen = true
        const api = window.__tatematika!
        latch.phase = typeof api.getActionPhase === 'function' ? api.getActionPhase() : null
        latch.isJumping = api.getCatJumpState().isJumping
      }
      window.addEventListener('pointerdown', onPointer, true)
      ;(window as any).__bTapLatch = latch
      ;(window as any).__bounceLatchCounts[id] = 0
      const bounds = window.__tatematika!.getBalloonBounds(id)
      const game = window.__tatematika!.getGame()
      const canvas = document.querySelector('canvas')!
      const rect = canvas.getBoundingClientRect()
      const viewScale = rect.width / game.scale.width
      return {
        x: rect.left + (bounds.x + bounds.width / 2) * viewScale,
        y: rect.top + (bounds.y + bounds.height / 2) * viewScale
      }
    }, balloonB.id)
    await page.mouse.click(pointB.x, pointB.y)
    
    const tapLatch = await page.evaluate(() => (window as any).__bTapLatch)
    expect(tapLatch.seen, 'precondition: B pointer was observed in the page').toBe(true)
    expect(
      tapLatch.isJumping || tapLatch.phase === 'jump',
      `precondition: tap on B must arrive during the jump (phase=${tapLatch.phase}, isJumping=${tapLatch.isJumping})`
    ).toBe(true)
    
    await expectIdlePhase(page)
    
    const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
    const bounceCountB = await page.evaluate((id) => (window as any).__bounceLatchCounts?.[id] || 0, balloonB.id)
    const oscCountAfterA = await page.evaluate(() => (window as any).__oscillatorStarts.length)
    
    expect(finalState.wrongAttempts, 'only the accepted tap A counts as an error').toBe(preA + 1)
    expect(bounceCountB, 'B must not bounce while A is in progress').toBe(0)
    expect(oscCountAfterA - oscCountBeforeA, 'only A plays its sound; B is ignored').toBe(N)
  })

})
