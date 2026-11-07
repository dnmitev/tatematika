import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import fs from 'fs'
import path from 'path'

async function captureLayout() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  
  await page.goto('http://localhost:5173')
  await page.waitForTimeout(1000)
  
  const api = await page.evaluateHandle(() => window.__tatematika)
  
  const viewports = [
    { width: 800, height: 600, name: 'desktop-800x600' },
    { width: 375, height: 667, name: 'mobile-375x667' },
    { width: 320, height: 568, name: 'mobile-320x568' }
  ]
  
  const configs = [
    { balloons: 3, upperLimit: 10, name: '3balloons' },
    { balloons: 5, upperLimit: 20, name: '5balloons-upper20' }
  ]
  
  for (const viewport of viewports) {
    for (const config of configs) {
      await page.goto('http://localhost:5173')
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      
      await page.evaluate(({ balloons, upperLimit }) => {
        localStorage.setItem('tatematika-kote-balonche-settings', JSON.stringify({
          upperLimit,
          balloonCount: balloons,
          correctBalloonsPerLevel: 5,
          balloonSpeed: 'slow',
          operations: 'both'
        }))
      }, config)
      
      await page.reload()
      await page.waitForTimeout(2000)
      
      const gameState = await page.evaluate(() => {
        return window.__tatematika?.getGameState()
      })
      
      console.log(`Config: ${config.balloons} balloons, actual: ${gameState?.balloons?.length || 0} balloons`)
      
      const filename = `/opt/cursor/artifacts/responsive-${viewport.name}-${config.name}.png`
      await page.screenshot({ path: filename, fullPage: false })
      console.log(`Captured: ${filename}`)
      
      const balloons = gameState?.balloons || []
      const bounds: Array<{ id: string; bounds: any; formula: string }> = []
      
      for (const balloon of balloons) {
        const balloonBounds = await page.evaluate((id) => {
          return window.__tatematika?.getBalloonBounds(id)
        }, balloon.id)
        
        if (balloonBounds) {
          bounds.push({
            id: balloon.id,
            formula: balloon.formula,
            bounds: balloonBounds
          })
        }
      }
      
      console.log(`${viewport.name}-${config.name} balloon bounds:`)
      for (const b of bounds) {
        console.log(`  ${b.id} (${b.formula}): x=${b.bounds.x.toFixed(1)}, y=${b.bounds.y.toFixed(1)}, w=${b.bounds.width.toFixed(1)}, h=${b.bounds.height.toFixed(1)}`)
      }
      
      for (let i = 0; i < bounds.length; i++) {
        for (let j = i + 1; j < bounds.length; j++) {
          const b1 = bounds[i].bounds
          const b2 = bounds[j].bounds
          
          const overlapX = Math.max(0, Math.min(b1.x + b1.width, b2.x + b2.width) - Math.max(b1.x, b2.x))
          const overlapY = Math.max(0, Math.min(b1.y + b1.height, b2.y + b2.height) - Math.max(b1.y, b2.y))
          const overlap = overlapX * overlapY
          
          if (overlap > 0) {
            console.log(`  ⚠️  OVERLAP between ${bounds[i].id} and ${bounds[j].id}: ${overlap.toFixed(1)}px²`)
          }
        }
      }
      
      const gameWidth = 800
      const gameHeight = 600
      
      for (const b of bounds) {
        if (b.bounds.x < 0) {
          console.log(`  ⚠️  CLIPPING: ${b.id} left edge at x=${b.bounds.x.toFixed(1)} (< 0)`)
        }
        if (b.bounds.x + b.bounds.width > gameWidth) {
          console.log(`  ⚠️  CLIPPING: ${b.id} right edge at x=${(b.bounds.x + b.bounds.width).toFixed(1)} (> ${gameWidth})`)
        }
        if (b.bounds.y < 0) {
          console.log(`  ⚠️  CLIPPING: ${b.id} top edge at y=${b.bounds.y.toFixed(1)} (< 0)`)
        }
        if (b.bounds.y + b.bounds.height > gameHeight) {
          console.log(`  ⚠️  CLIPPING: ${b.id} bottom edge at y=${(b.bounds.y + b.bounds.height).toFixed(1)} (> ${gameHeight})`)
        }
      }
      
      console.log('')
    }
  }
  
  await browser.close()
  console.log('All screenshots captured!')
}

captureLayout().catch(console.error)
