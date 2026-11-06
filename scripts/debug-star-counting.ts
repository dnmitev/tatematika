import { chromium } from 'playwright'
import path from 'path'

async function debugStarCounting() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()
  
  await page.setViewportSize({ width: 800, height: 600 })
  const htmlPath = `file://${path.resolve('dist/index.html')}`
  await page.goto(htmlPath)
  
  await page.waitForFunction(() => window.__tatematika?.getGameState, { timeout: 5000 })
  await page.waitForTimeout(1000)
  
  console.log('=== Initial State ===')
  let state = await page.evaluate(() => {
    const s = window.__tatematika!.getGameState()
    return {
      stars: s.stars,
      target: s.target,
      balloons: s.balloons.map(b => ({ id: b.id, formula: b.formula, isCorrect: b.isCorrect }))
    }
  })
  console.log(JSON.stringify(state, null, 2))
  
  const correctBalloon = state.balloons.find(b => b.isCorrect)
  if (!correctBalloon) {
    console.error('No correct balloon found!')
    await browser.close()
    return
  }
  
  console.log(`\n=== Clicking correct balloon: ${correctBalloon.formula} (${correctBalloon.id}) ===`)
  
  await page.evaluate((id) => {
    console.log('About to click balloon:', id)
    window.__tatematika!.clickBalloon(id)
  }, correctBalloon.id)
  
  console.log('\n=== State after 100ms ===')
  await page.waitForTimeout(100)
  state = await page.evaluate(() => window.__tatematika!.getGameState())
  console.log('Stars:', state.stars)
  
  console.log('\n=== State after 500ms ===')
  await page.waitForTimeout(400)
  state = await page.evaluate(() => window.__tatematika!.getGameState())
  console.log('Stars:', state.stars)
  
  console.log('\n=== State after 1000ms ===')
  await page.waitForTimeout(500)
  state = await page.evaluate(() => window.__tatematika!.getGameState())
  console.log('Stars:', state.stars)
  
  console.log('\n=== State after 2000ms ===')
  await page.waitForTimeout(1000)
  state = await page.evaluate(() => window.__tatematika!.getGameState())
  console.log('Stars:', state.stars)
  
  console.log('\n=== Cat position and jump state ===')
  const catInfo = await page.evaluate(() => {
    const pos = window.__tatematika!.getCatPosition()
    const jump = window.__tatematika!.getCatJumpState()
    return { position: pos, jumpState: jump }
  })
  console.log(JSON.stringify(catInfo, null, 2))
  
  await page.waitForTimeout(2000)
  await browser.close()
}

debugStarCounting().catch(console.error)
