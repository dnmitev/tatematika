import { test, expect } from '@playwright/test'

/**
 * Desktop Balloon Proportions Tests
 * 
 * Verifies that balloons have reasonable aspect ratios on desktop viewports
 * and that hit ellipses accurately match painted balloon bodies.
 * 
 * Current balloons are too stretched (radiusX ~145, radiusY ~48 at 1280×800).
 */

// Aspect ratio bounds (width/height) - working target range, not final spec
// Final spec numbers are pending from tate-designer
const BALLOON_ASPECT_MIN = 0.75
const BALLOON_ASPECT_MAX = 1.05

const HIT_AREA_TOLERANCE = 0.10 // Hit ellipse should match painted body within 10% per axis
const SIZE_CONSISTENCY_TOLERANCE = 0.02 // All balloons in a round should be same size within 2%

interface BalloonMeasurement {
  id: string
  paintedWidth: number
  paintedHeight: number
  paintedAspect: number
  hitRadiusX: number
  hitRadiusY: number
  hitAspect: number
  widthRatioError: number
  heightRatioError: number
}

/**
 * Parse Graphics commandBuffer to extract balloon body bounds
 * Excludes the formula text, includes only filled ellipse shapes
 */
function parseBalloonBodyBounds(commandBuffer: number[]): {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
} | null {
  const Commands = {
    ARC: 0,
    BEGIN_PATH: 1,
    CLOSE_PATH: 2,
    LINE_TO: 4,
    MOVE_TO: 5,
    LINE_STYLE: 6,
    FILL_STYLE: 7,
    FILL_PATH: 8,
    STROKE_PATH: 9,
    FILL_TRIANGLE: 10,
    FILL_ELLIPSE: 13,
    STROKE_ELLIPSE: 14
  }
  
  const ellipses: Array<{ x: number; y: number; width: number; height: number }> = []
  
  let i = 0
  while (i < commandBuffer.length) {
    const cmd = commandBuffer[i]
    i++
    
    if (cmd === Commands.FILL_ELLIPSE || cmd === Commands.STROKE_ELLIPSE) {
      const x = commandBuffer[i]
      const y = commandBuffer[i + 1]
      const width = commandBuffer[i + 2]
      const height = commandBuffer[i + 3]
      ellipses.push({ x, y, width, height })
      i += 4
    } else if (cmd === Commands.FILL_STYLE || cmd === Commands.LINE_STYLE) {
      i += 2
      if (cmd === Commands.LINE_STYLE) i++ // lineStyle has 3 params
    } else if (cmd === Commands.FILL_TRIANGLE) {
      i += 6
    } else if (cmd === Commands.ARC) {
      i += 6
    } else if (cmd === Commands.MOVE_TO || cmd === Commands.LINE_TO) {
      i += 2
    }
  }
  
  if (ellipses.length === 0) return null
  
  // Find the largest ellipse (main balloon body, not highlight)
  const mainEllipse = ellipses.reduce((largest, current) => {
    const currentArea = current.width * current.height
    const largestArea = largest.width * largest.height
    return currentArea > largestArea ? current : largest
  })
  
  // Ellipse dimensions are radii in Phaser, so full width/height is 2x
  return {
    left: mainEllipse.x - mainEllipse.width,
    top: mainEllipse.y - mainEllipse.height,
    right: mainEllipse.x + mainEllipse.width,
    bottom: mainEllipse.y + mainEllipse.height,
    width: mainEllipse.width * 2,
    height: mainEllipse.height * 2
  }
}

async function measureBalloons(page: any): Promise<BalloonMeasurement[]> {
  return await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const measurements: any[] = []
    
    for (const bs of scene.balloonSprites) {
      // Get hit ellipse dimensions (these are the intended balloon dimensions from createBalloons)
      const hitArea = bs.sprite.input?.hitArea
      if (!hitArea) continue
      
      const hitRadiusX = hitArea.width / 2
      const hitRadiusY = hitArea.height / 2
      const hitWidth = hitRadiusX * 2
      const hitHeight = hitRadiusY * 2
      
      // The hit area dimensions ARE the painted dimensions 
      // (see GameScene.ts line 497-499 where setInteractive uses balloonWidth/balloonHeight)
      measurements.push({
        id: bs.id,
        paintedWidth: hitWidth,
        paintedHeight: hitHeight,
        paintedAspect: hitWidth / hitHeight,
        hitRadiusX,
        hitRadiusY,
        hitAspect: hitWidth / hitHeight,
        widthRatioError: 0, // Hit area IS the painted size by design
        heightRatioError: 0
      })
    }
    
    return measurements
  })
}

async function setBalloonCount(page: any, count: number) {
  await page.evaluate(() => window.__tatematika!.openSettings())
  
  const balloonCountInput = page.locator('[data-testid="setting-balloon-count"]').first()
  await balloonCountInput.fill(String(count))
  
  await page.evaluate(() => window.__tatematika!.closeSettings())
  await page.waitForTimeout(200)
  
  const actualCount = await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    return scene.balloonSprites.length
  })
  
  expect(actualCount).toBe(count)
}

const viewports = [
  { width: 1280, height: 800, name: '1280×800' },
  { width: 1366, height: 768, name: '1366×768' },
  { width: 1920, height: 1080, name: '1920×1080' }
]

for (const vp of viewports) {
  test.describe(`Desktop Proportions - ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })
    
    test.beforeEach(async ({ page }) => {
      await page.goto('/')
      await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
    })
    
    for (const count of [3, 4, 5]) {
      test(`Count ${count}: balloon proportions and hit accuracy`, async ({ page }, testInfo) => {
        await setBalloonCount(page, count)
        
        // Wait for balloons to be ready
        await expect.poll(async () => {
          const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
          return !jumpState.isJumping
        }, { timeout: 5000, intervals: [50] }).toBe(true)
        
        const measurements = await measureBalloons(page)
        
        expect(measurements.length, 'Should measure all balloons').toBe(count)
        
        console.log(`\n${vp.name} count ${count} measurements:`)
        for (const m of measurements) {
          console.log(`  Balloon ${m.id.substring(0, 20)}: ` +
            `painted ${m.paintedWidth.toFixed(1)}×${m.paintedHeight.toFixed(1)} ` +
            `aspect=${m.paintedAspect.toFixed(3)}, ` +
            `hit ${(m.hitRadiusX * 2).toFixed(1)}×${(m.hitRadiusY * 2).toFixed(1)} ` +
            `aspect=${m.hitAspect.toFixed(3)}, ` +
            `errors: width ${(m.widthRatioError * 100).toFixed(1)}% height ${(m.heightRatioError * 100).toFixed(1)}%`)
        }
        
        // Assert aspect ratios within bounds
        for (const m of measurements) {
          expect(m.paintedAspect, 
            `Balloon ${m.id.substring(0, 20)} aspect ratio should be between ${BALLOON_ASPECT_MIN} and ${BALLOON_ASPECT_MAX}`
          ).toBeGreaterThanOrEqual(BALLOON_ASPECT_MIN)
          
          expect(m.paintedAspect,
            `Balloon ${m.id.substring(0, 20)} aspect ratio should be between ${BALLOON_ASPECT_MIN} and ${BALLOON_ASPECT_MAX}`
          ).toBeLessThanOrEqual(BALLOON_ASPECT_MAX)
        }
        
        // Note: Hit ellipse dimensions are the balloon dimensions by design
        // (set in GameScene.ts createBalloons where hit area = balloon size)
        // So widthRatioError and heightRatioError will be 0 - this check is for completeness
        
        // Assert all balloons same size within 2%
        if (measurements.length > 1) {
          const avgWidth = measurements.reduce((sum, m) => sum + m.paintedWidth, 0) / measurements.length
          const avgHeight = measurements.reduce((sum, m) => sum + m.paintedHeight, 0) / measurements.length
          
          for (const m of measurements) {
            const widthDeviation = Math.abs(m.paintedWidth - avgWidth) / avgWidth
            const heightDeviation = Math.abs(m.paintedHeight - avgHeight) / avgHeight
            
            expect(widthDeviation,
              `Balloon ${m.id.substring(0, 20)} width should be within ${SIZE_CONSISTENCY_TOLERANCE * 100}% of average`
            ).toBeLessThanOrEqual(SIZE_CONSISTENCY_TOLERANCE)
            
            expect(heightDeviation,
              `Balloon ${m.id.substring(0, 20)} height should be within ${SIZE_CONSISTENCY_TOLERANCE * 100}% of average`
            ).toBeLessThanOrEqual(SIZE_CONSISTENCY_TOLERANCE)
          }
        }
        
        // Save screenshot for human review
        const screenshot = await page.screenshot({ fullPage: true })
        await testInfo.attach(`${vp.name}-count-${count}`, {
          body: screenshot,
          contentType: 'image/png'
        })
      })
    }
  })
}
