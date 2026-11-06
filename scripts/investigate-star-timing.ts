import { chromium } from 'playwright'
import path from 'path'

async function investigateStarTiming() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()
  
  await page.setViewportSize({ width: 800, height: 600 })
  const htmlPath = `file://${path.resolve('dist/index.html')}`
  await page.goto(htmlPath)
  
  await page.waitForFunction(() => window.__tatematika?.getGameState, { timeout: 5000 })
  await page.waitForTimeout(1000)
  
  console.log('=== Waiting for cat to be idle ===')
  await page.evaluate(async () => {
    while (true) {
      const jumpState = window.__tatematika!.getCatJumpState()
      if (!jumpState.isJumping) break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  })
  
  console.log('\n=== Initial State ===')
  const initialState = await page.evaluate(() => window.__tatematika!.getGameState())
  console.log('Stars:', initialState.stars)
  console.log('Balloons:', initialState.balloons.map(b => ({
    id: b.id,
    formula: b.formula,
    isCorrect: b.isCorrect
  })))
  
  const correctBalloon = initialState.balloons.find(b => b.isCorrect)
  if (!correctBalloon) {
    console.error('No correct balloon found!')
    await browser.close()
    return
  }
  
  console.log(`\n=== Clicking correct balloon: ${correctBalloon.formula} (${correctBalloon.id}) ===`)
  
  const timestamps: Array<{ time: number; event: string; stars: number; isJumping: boolean }> = []
  const startTime = Date.now()
  
  await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correctBalloon.id)
  
  timestamps.push({
    time: Date.now() - startTime,
    event: 'clickBalloon called',
    stars: initialState.stars,
    isJumping: false
  })
  
  // Poll state every 50ms for 2 seconds
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(50)
    const state = await page.evaluate(() => {
      const s = window.__tatematika!.getGameState()
      const j = window.__tatematika!.getCatJumpState()
      return { stars: s.stars, isJumping: j.isJumping }
    })
    
    const elapsed = Date.now() - startTime
    const prevStars = timestamps[timestamps.length - 1]?.stars ?? initialState.stars
    const prevJumping = timestamps[timestamps.length - 1]?.isJumping ?? false
    
    if (state.stars !== prevStars || state.isJumping !== prevJumping) {
      timestamps.push({
        time: elapsed,
        event: state.isJumping !== prevJumping 
          ? (state.isJumping ? 'jump started' : 'jump ended')
          : 'stars changed',
        stars: state.stars,
        isJumping: state.isJumping
      })
    }
  }
  
  console.log('\n=== Timeline ===')
  timestamps.forEach(t => {
    console.log(`${t.time.toString().padStart(5)}ms: ${t.event.padEnd(20)} stars=${t.stars} jumping=${t.isJumping}`)
  })
  
  const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
  console.log('\n=== Final State ===')
  console.log('Stars:', finalState.stars)
  console.log('Expected:', initialState.stars + 1)
  console.log('Match:', finalState.stars === initialState.stars + 1)
  
  await page.waitForTimeout(2000)
  await browser.close()
  
  process.exit(finalState.stars === initialState.stars + 1 ? 0 : 1)
}

investigateStarTiming().catch(console.error)
