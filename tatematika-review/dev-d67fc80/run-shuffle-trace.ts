import { test as base, expect } from '@playwright/test'
import { ACTION_TIMEOUT_MS, INIT_TIMEOUT_MS } from '../../tests/e2e/test-timeouts'
import * as fs from 'fs'
import * as path from 'path'

const test = base.extend({})

const SEED_A = 0x12345678

function getMulberry32Code(seed: number): string {
  return `
    (function() {
      let state = ${seed};
      Math.random = function() {
        state |= 0;
        state = state + 0x6D2B79F5 | 0;
        let t = Math.imul(state ^ state >>> 15, 1 | state);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    })();
  `
}

async function setBalloonCount(page: any, count: number) {
  await page.evaluate(() => window.__tatematika!.openSettings())
  
  const balloonCountInput = page.locator('[data-testid="setting-balloon-count"]').first()
  await balloonCountInput.fill(String(count))
  
  const correctPerLevelInput = page.locator('[data-testid="setting-correct-per-level"]').first()
  const inputExists = await correctPerLevelInput.count()
  
  if (inputExists === 0) {
    throw new Error('setting-correct-per-level input does not exist')
  }
  
  await correctPerLevelInput.fill('999')
  
  const closeButton = page.locator('[data-testid="button-close-settings"]')
  await closeButton.click()
  
  await expect.poll(async () => {
    return await page.evaluate(() => !window.__tatematika!.isSettingsOpen())
  }, { timeout: 5000, intervals: [50] }).toBe(true)
}

test('Shuffle Count 3 with round timing', async ({ page }, testInfo) => {
  test.setTimeout(120000)
  
  const probeScript = fs.readFileSync('/tmp/artifacts/probe-frame-log.js', 'utf8')
  await page.addInitScript(probeScript)
  await page.addInitScript(getMulberry32Code(SEED_A))
  
  await page.goto('/')
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  
  const hasSetRoundRng = await page.evaluate(() => typeof window.__tatematika!.setRoundRng === 'function')
  expect(hasSetRoundRng, 'K17 CONTRACT: setRoundRng').toBe(true)
  
  await setBalloonCount(page, 3)
  
  const rounds = 30
  const count = 3
  const roundTimings: any[] = []
  const testStartWall = Date.now()
  
  for (let i = 0; i < rounds; i++) {
    const roundStartWall = Date.now()
    
    try {
      // Get current state
      const stateBefore = await page.evaluate(() => {
        const s = window.__tatematika!.getGameState()
        const jumpState = window.__tatematika!.getCatJumpState()
        return {
          stars: s.stars,
          roundToken: s.roundToken,
          isJumping: jumpState.isJumping
        }
      })
      
      // Find and click correct balloon
      const correctBalloonId = await page.evaluate(() => {
        const state = window.__tatematika!.getGameState()
        const correct = state.balloons.find((b: any) => b.isCorrect)
        if (!correct) throw new Error('No correct balloon found')
        return correct.id
      })
      
      await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correctBalloonId)
      
      // Wait for star increase
      const pollStartLine = 'wait for star increase'
      await expect.poll(async () => {
        const s = await page.evaluate(() => window.__tatematika!.getGameState())
        return s.stars
      }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(stateBefore.stars + 1)
      
      // Wait for new round ready
      const pollReadyLine = 'wait for new round ready'
      await expect.poll(async () => {
        const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
        const state = await page.evaluate(() => window.__tatematika!.getGameState())
        const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
        return !jumpState.isJumping && correctCount === 1
      }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
      
      const roundEndWall = Date.now()
      const roundDuration = roundEndWall - roundStartWall
      
      roundTimings.push({
        round: i + 1,
        startWall: roundStartWall - testStartWall,
        endWall: roundEndWall - testStartWall,
        duration: roundDuration,
        starsBefore: stateBefore.stars,
        roundToken: stateBefore.roundToken,
        success: true
      })
      
      console.log(`Round ${i + 1}/30 completed in ${roundDuration}ms`)
      
    } catch (error: any) {
      const roundEndWall = Date.now()
      roundTimings.push({
        round: i + 1,
        startWall: roundStartWall - testStartWall,
        endWall: roundEndWall - testStartWall,
        duration: roundEndWall - roundStartWall,
        success: false,
        error: error.message,
        stack: error.stack
      })
      
      // Capture state at failure
      const failureState = await page.evaluate(() => {
        const game = window.__tatematika!.getGame()
        const scene = game.scene.getScene('GameScene') as any
        const state = window.__tatematika!.getGameState()
        const jumpState = window.__tatematika!.getCatJumpState()
        const phase = window.__tatematika!.getActionPhase?.()
        
        return {
          phase,
          actionLocked: scene.actionLocked,
          catIsJumping: jumpState.isJumping,
          catJumpTime: scene.catJumpTime,
          landingFrameTime: scene.landingFrameTime,
          popAnimationStartTime: scene.popAnimationStartTime,
          stars: state.stars,
          wrongAttempts: state.wrongAttempts,
          roundToken: state.roundToken
        }
      })
      
      console.log(`\nRound ${i + 1} FAILED after ${roundEndWall - roundStartWall}ms`)
      console.log('Failure state:', JSON.stringify(failureState, null, 2))
      
      // Save failure data
      const outputDir = '/tmp/artifacts/shuffle-trace'
      fs.mkdirSync(outputDir, { recursive: true })
      fs.writeFileSync(
        path.join(outputDir, 'failure-state.json'),
        JSON.stringify({
          round: i + 1,
          failureState,
          error: error.message,
          stack: error.stack
        }, null, 2)
      )
      
      throw error
    }
  }
  
  // Save round timings
  const outputDir = '/tmp/artifacts/shuffle-trace'
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(
    path.join(outputDir, 'round-timings.json'),
    JSON.stringify(roundTimings, null, 2)
  )
  
  // CSV
  const csv = ['round,startWall,endWall,duration,starsBefore,roundToken,success']
  for (const r of roundTimings) {
    if (r.success) {
      csv.push([
        r.round,
        r.startWall,
        r.endWall,
        r.duration,
        r.starsBefore,
        r.roundToken,
        r.success
      ].join(','))
    }
  }
  fs.writeFileSync(
    path.join(outputDir, 'round-timings.csv'),
    csv.join('\n')
  )
  
  // Extract frame logs
  const frameLogs = await page.evaluate(() => (window as any).__getFrameLogs())
  fs.writeFileSync(
    path.join(outputDir, 'frame-log.json'),
    JSON.stringify(frameLogs, null, 2)
  )
  
  console.log(`\nShuffle test completed. Round timings saved to ${outputDir}`)
  console.log(`Average round duration: ${roundTimings.reduce((a, b) => a + b.duration, 0) / rounds}ms`)
})
