import { test as base, expect } from '@playwright/test'
import { ACTION_TIMEOUT_MS, INIT_TIMEOUT_MS } from '../../tests/e2e/test-timeouts'
import * as fs from 'fs'
import * as path from 'path'

const test = base.extend({})

test('K12 with frame logging', async ({ page }, testInfo) => {
  test.setTimeout(90000)
  
  // Read probe script
  const probeScript = fs.readFileSync('/tmp/artifacts/probe-frame-log.js', 'utf8')
  
  // Inject probe before page load
  await page.addInitScript(probeScript)
  
  await page.goto('/')
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  
  const hasGetActionPhase = await page.evaluate(() => typeof window.__tatematika!.getActionPhase === 'function')
  expect(hasGetActionPhase, 'K12 CONTRACT: getActionPhase hook must be implemented').toBe(true)
  
  // Wait for cat to be idle
  await expect.poll(async () => {
    const phase = await page.evaluate(() => window.__tatematika!.getActionPhase?.())
    return phase
  }, { timeout: INIT_TIMEOUT_MS, intervals: [50] }).toBe('idle')
  
  const initialStars = await page.evaluate(() => {
    const state = window.__tatematika!.getGameState()
    return state.stars
  })
  
  // Click correct balloon ONCE
  const correctBalloonId = await page.evaluate(() => {
    const state = window.__tatematika!.getGameState()
    const correct = state.balloons.find((b: any) => b.isCorrect)!
    return correct.id
  })
  
  await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correctBalloonId)
  
  // Rapid-fire 50 clicks during action
  let rapidClickCount = 0
  const rapidClickInterval = setInterval(async () => {
    try {
      await page.evaluate((id) => {
        const result = window.__tatematika!.clickBalloon(id)
        if (!result) {
          // Click was ignored
        }
      }, correctBalloonId)
      rapidClickCount++
    } catch (e) {
      // Ignore errors during rapid clicking
    }
  }, 10)
  
  // Wait for action to complete (star increase)
  await expect.poll(async () => {
    const s = await page.evaluate(() => window.__tatematika!.getGameState())
    return s.stars
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(initialStars + 1)
  
  clearInterval(rapidClickInterval)
  
  // Wait for new round to be ready
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
    return !jumpState.isJumping && correctCount === 1
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  // Check phase observations during action
  const phaseObservations = await page.evaluate(() => {
    return (window as any).__phaseObservations || []
  })
  
  const walkCount = phaseObservations.filter((p: string) => p === 'walk').length
  const jumpCount = phaseObservations.filter((p: string) => p === 'jump').length
  const landingCount = phaseObservations.filter((p: string) => p === 'landing').length
  
  expect(walkCount, 'K12 PRECONDITION: walk phase must be covered').toBeGreaterThan(0)
  expect(jumpCount, 'K12 PRECONDITION: jump phase must be covered').toBeGreaterThan(0)
  expect(landingCount, 'K12 PRECONDITION: landing phase must be covered').toBeGreaterThan(0)
  
  const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
  expect(finalState.stars, 'Stars should increase exactly once').toBe(initialStars + 1)
  
  // Extract frame logs
  const frameLogs = await page.evaluate(() => (window as any).__getFrameLogs())
  
  // Save to artifacts
  const outputDir = '/tmp/artifacts/k12-trace'
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(
    path.join(outputDir, 'frame-log.json'),
    JSON.stringify(frameLogs, null, 2)
  )
  
  // Convert to CSV
  const csv = [
    'wallMs,loopDelta,rawDelta,actionPhase,actionLocked,catIsJumping,catJumpTime,landingFrameTime,popAnimationStartTime,stars,wrongAttempts'
  ]
  for (const entry of frameLogs) {
    csv.push([
      entry.wallMs,
      entry.loopDelta,
      entry.rawDelta,
      entry.actionPhase,
      entry.actionLocked,
      entry.catIsJumping,
      entry.catJumpTime,
      entry.landingFrameTime,
      entry.popAnimationStartTime,
      entry.stars,
      entry.wrongAttempts
    ].join(','))
  }
  fs.writeFileSync(
    path.join(outputDir, 'frame-log.csv'),
    csv.join('\n')
  )
  
  console.log(`\nK12 frame logs saved to ${outputDir}`)
  console.log(`Total frames logged: ${frameLogs.length}`)
  console.log(`Rapid clicks sent: ${rapidClickCount}`)
})
