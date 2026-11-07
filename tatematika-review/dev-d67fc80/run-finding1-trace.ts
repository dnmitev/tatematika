import { test as base, expect } from '@playwright/test'
import { ACTION_TIMEOUT_MS, INIT_TIMEOUT_MS } from '../../tests/e2e/test-timeouts'
import * as fs from 'fs'
import * as path from 'path'

const test = base.extend({})

test('Finding 1: Wrong balloon bounce with state capture', async ({ page }, testInfo) => {
  test.setTimeout(60000)
  
  const probeScript = fs.readFileSync('/tmp/artifacts/probe-frame-log.js', 'utf8')
  await page.addInitScript(probeScript)
  
  await page.goto('/')
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  
  // Wait for idle
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jumpState.isJumping
  }, { timeout: INIT_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  const initialState = await page.evaluate(() => {
    const state = window.__tatematika!.getGameState()
    return {
      stars: state.stars,
      wrongAttempts: state.wrongAttempts
    }
  })
  
  // Find wrong balloon
  const wrongBalloonId = await page.evaluate(() => {
    const state = window.__tatematika!.getGameState()
    const wrong = state.balloons.find((b: any) => !b.isCorrect)
    if (!wrong) throw new Error('No wrong balloon found')
    return wrong.id
  })
  
  console.log('Clicking wrong balloon:', wrongBalloonId)
  
  // Click wrong balloon
  await page.evaluate((id) => window.__tatematika!.clickBalloon(id), wrongBalloonId)
  
  // Wait a bit for bounce to start
  await page.waitForTimeout(100)
  
  const outputDir = '/tmp/artifacts/finding1-trace'
  fs.mkdirSync(outputDir, { recursive: true })
  
  try {
    // Poll for bounce completion - expect it to fail if bounce doesn't work
    const bounceCheckStart = Date.now()
    
    await expect.poll(async () => {
      const state = await page.evaluate(() => {
        const game = window.__tatematika!.getGame()
        const scene = game.scene.getScene('GameScene') as any
        const s = window.__tatematika!.getGameState()
        const phase = window.__tatematika!.getActionPhase?.()
        
        // Sample bounce state
        const balloonSprite = scene.balloonSprites.find((bs: any) => bs.id === '${wrongBalloonId}')
        
        return {
          phase,
          actionLocked: scene.actionLocked,
          actionTargetBalloonId: scene.actionTargetBalloonId,
          wrongAttempts: s.wrongAttempts,
          isBouncing: balloonSprite ? balloonSprite.isBouncing : undefined,
          balloonExists: !!balloonSprite
        }
      })
      
      // Log state periodically
      const elapsed = Date.now() - bounceCheckStart
      if (elapsed % 500 < 100) {
        console.log(`t=${elapsed}ms: phase=${state.phase} locked=${state.actionLocked} wrongAttempts=${state.wrongAttempts} bouncing=${state.isBouncing}`)
      }
      
      // Bounce should complete and return to idle
      return state.phase === 'idle' && !state.actionLocked
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
    
    const bounceCheckEnd = Date.now()
    console.log(`Bounce completed in ${bounceCheckEnd - bounceCheckStart}ms`)
    
    // Verify wrong attempts increased
    const finalState = await page.evaluate(() => {
      const s = window.__tatematika!.getGameState()
      return {
        stars: s.stars,
        wrongAttempts: s.wrongAttempts
      }
    })
    
    expect(finalState.stars, 'Stars should not increase').toBe(initialState.stars)
    expect(finalState.wrongAttempts, 'Wrong attempts should increase').toBe(initialState.wrongAttempts + 1)
    
    fs.writeFileSync(
      path.join(outputDir, 'success.json'),
      JSON.stringify({
        initialState,
        finalState,
        bounceDuration: bounceCheckEnd - bounceCheckStart
      }, null, 2)
    )
    
  } catch (error: any) {
    // Capture failure state
    const failureWall = Date.now()
    
    const failureState = await page.evaluate(() => {
      const game = window.__tatematika!.getGame()
      const scene = game.scene.getScene('GameScene') as any
      const s = window.__tatematika!.getGameState()
      const phase = window.__tatematika!.getActionPhase?.()
      
      // Find all balloon sprites
      const balloons = scene.balloonSprites.map((bs: any) => ({
        id: bs.id,
        isBouncing: bs.isBouncing,
        isPopping: bs.isPopping,
        isCorrect: bs.isCorrect
      }))
      
      return {
        phase,
        actionLocked: scene.actionLocked,
        actionTargetBalloonId: scene.actionTargetBalloonId,
        catIsJumping: scene.catIsJumping,
        catJumpTime: scene.catJumpTime,
        landingFrameTime: scene.landingFrameTime,
        popAnimationStartTime: scene.popAnimationStartTime,
        pendingJumpBalloonId: scene.pendingJumpBalloonId,
        jumpTargetBalloonId: scene.jumpTargetBalloonId,
        stars: s.stars,
        wrongAttempts: s.wrongAttempts,
        balloons
      }
    })
    
    console.log('\nFinding1 FAILED')
    console.log('Failure state:', JSON.stringify(failureState, null, 2))
    
    fs.writeFileSync(
      path.join(outputDir, 'failure-state.json'),
      JSON.stringify({
        initialState,
        failureState,
        wrongBalloonId,
        error: error.message,
        stack: error.stack
      }, null, 2)
    )
    
    throw error
  } finally {
    // Always save frame logs
    const frameLogs = await page.evaluate(() => (window as any).__getFrameLogs())
    fs.writeFileSync(
      path.join(outputDir, 'frame-log.json'),
      JSON.stringify(frameLogs, null, 2)
    )
    
    console.log(`Finding1 artifacts saved to ${outputDir}`)
  }
})
