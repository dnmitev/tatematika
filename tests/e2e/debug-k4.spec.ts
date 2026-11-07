import { test, expect } from '@playwright/test'

test('Debug K4', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  
  const initialState = await page.evaluate(() => window.__tatematika!.getGameState())
  console.log('Initial state:', JSON.stringify(initialState, null, 2))
  
  const wrongBalloon = initialState.balloons.find(b => !b.isCorrect)
  console.log('Wrong balloon:', wrongBalloon)
  
  if (!wrongBalloon) {
    throw new Error('No wrong balloon found')
  }
  
  // Click wrong balloon
  console.log('Clicking wrong balloon...')
  await page.evaluate((id) => window.__tatematika!.clickBalloon(id), wrongBalloon.id)
  
  // Check state immediately
  await page.waitForTimeout(100)
  const state100 = await page.evaluate(() => window.__tatematika!.getGameState())
  console.log('State after 100ms:', {
    wrongAttempts: state100.wrongAttempts,
    stars: state100.stars,
    balloons: state100.balloons.map(b => b.id)
  })
  
  // Check state after 500ms
  await page.waitForTimeout(400)
  const state500 = await page.evaluate(() => window.__tatematika!.getGameState())
  console.log('State after 500ms:', {
    wrongAttempts: state500.wrongAttempts,
    stars: state500.stars,
    balloons: state500.balloons.map(b => b.id)
  })
  
  // Check cat jump state
  const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
  console.log('Cat jump state:', jumpState)
  
  // Check action phase
  const phase = await page.evaluate(() => window.__tatematika!.getActionPhase!())
  console.log('Action phase:', phase)
  
  expect(state500.wrongAttempts).toBe(1)
})
