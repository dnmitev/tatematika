import { chromium } from 'playwright'
import path from 'path'

async function measureDOMLifecycle() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  
  const htmlPath = `file://${path.resolve('dist/index.html')}`
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto(htmlPath, { waitUntil: 'networkidle0' })
  
  await page.waitForFunction(() => {
    return window.__tatematika && window.__tatematika.scene
  }, { timeout: 5000 })
  await page.waitForTimeout(500)
  
  console.log('=== Initial State (375x667) ===')
  
  let counts = await page.evaluate(() => {
    return {
      settingsPanels: document.querySelectorAll('[data-testid="settings-panel"]').length,
      playAgainButtons: document.querySelectorAll('[data-testid="button-play-again"]').length,
      settingsButtons: document.querySelectorAll('[data-testid="button-settings"]').length
    }
  })
  console.log('Element counts:', counts)
  
  console.log('\n=== After First Resize (320x568) ===')
  await page.setViewportSize({ width: 320, height: 568 })
  await page.waitForTimeout(500)
  
  counts = await page.evaluate(() => {
    return {
      settingsPanels: document.querySelectorAll('[data-testid="settings-panel"]').length,
      playAgainButtons: document.querySelectorAll('[data-testid="button-play-again"]').length,
      settingsButtons: document.querySelectorAll('[data-testid="button-settings"]').length
    }
  })
  console.log('Element counts:', counts)
  
  console.log('\n=== After Second Resize (800x600) ===')
  await page.setViewportSize({ width: 800, height: 600 })
  await page.waitForTimeout(500)
  
  counts = await page.evaluate(() => {
    return {
      settingsPanels: document.querySelectorAll('[data-testid="settings-panel"]').length,
      playAgainButtons: document.querySelectorAll('[data-testid="button-play-again"]').length,
      settingsButtons: document.querySelectorAll('[data-testid="button-settings"]').length
    }
  })
  console.log('Element counts:', counts)
  
  console.log('\n=== After Third Resize (1280x800) ===')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(500)
  
  counts = await page.evaluate(() => {
    return {
      settingsPanels: document.querySelectorAll('[data-testid="settings-panel"]').length,
      playAgainButtons: document.querySelectorAll('[data-testid="button-play-again"]').length,
      settingsButtons: document.querySelectorAll('[data-testid="button-settings"]').length
    }
  })
  console.log('Element counts:', counts)
  
  console.log('\n=== After Opening Level Complete (10 stars) ===')
  await page.evaluate(() => {
    const tatematika = (window as any).__tatematika
    if (tatematika && tatematika.scene) {
      const scene = tatematika.scene
      if (scene.gameState) {
        scene.gameState.stars = 10
        scene.showLevelComplete()
      }
    }
  })
  await page.waitForTimeout(1000)
  
  counts = await page.evaluate(() => {
    return {
      settingsPanels: document.querySelectorAll('[data-testid="settings-panel"]').length,
      playAgainButtons: document.querySelectorAll('[data-testid="button-play-again"]').length,
      settingsButtons: document.querySelectorAll('[data-testid="button-settings"]').length
    }
  })
  console.log('Element counts:', counts)
  
  const visiblePlayAgain = await page.evaluate(() => {
    const buttons = document.querySelectorAll('[data-testid="button-play-again"]')
    return Array.from(buttons).map((btn) => {
      const el = btn as HTMLElement
      return {
        display: el.style.display,
        visibility: el.style.visibility,
        opacity: el.style.opacity,
        parent: el.parentElement?.style.display
      }
    })
  })
  console.log('Play Again button visibility:', JSON.stringify(visiblePlayAgain, null, 2))
  
  await browser.close()
  
  if (counts.settingsPanels > 1 || counts.playAgainButtons > 1) {
    console.error('\n❌ LIFECYCLE BUG: Duplicate elements detected!')
    process.exit(1)
  } else {
    console.log('\n✅ LIFECYCLE OK: No duplicate elements')
  }
}

measureDOMLifecycle().catch(console.error)
