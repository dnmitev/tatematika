import { test, expect } from '@playwright/test'
import { ACTION_TIMEOUT_MS, INIT_TIMEOUT_MS, multiRoundTestTimeout } from './test-timeouts'
import { getCatPaintedBounds } from './helpers'

/**
 * Jump Corridor Tests
 * 
 * Verifies that balloon layout guarantees no non-target balloons are ever
 * in the cat's vertical jump path under the target balloon.
 * 
 * The corridor is defined as:
 * - X: targetCenterX ± (catHalfWidth + CORRIDOR_MARGIN_PX)
 * - Y: from target balloon bottom down to cat's top at rest
 * 
 * This ensures the cat can jump straight up from under the target without
 * passing through any non-target balloons during walk and pre-jump phases.
 */

// Small margin around the cat's width to define the safe corridor
const CORRIDOR_MARGIN_PX = 4

function ellipseIntersectsAABB(
  ellipseCenterX: number,
  ellipseCenterY: number,
  ellipseRadiusX: number,
  ellipseRadiusY: number,
  boxLeft: number,
  boxTop: number,
  boxRight: number,
  boxBottom: number
): boolean {
  const closestX = Math.max(boxLeft, Math.min(ellipseCenterX, boxRight))
  const closestY = Math.max(boxTop, Math.min(ellipseCenterY, boxBottom))
  
  const dx = closestX - ellipseCenterX
  const dy = closestY - ellipseCenterY
  
  return (dx * dx) / (ellipseRadiusX * ellipseRadiusX) +
         (dy * dy) / (ellipseRadiusY * ellipseRadiusY) <= 1
}

interface BalloonEllipse {
  id: string
  centerX: number
  centerY: number
  radiusX: number
  radiusY: number
}

interface CorridorFrame {
  time: number
  targetCenterX: number
  targetBottom: number
  balloons: BalloonEllipse[]
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

/**
 * Check jump corridor for a specific balloon ID
 * Structured to support any balloon, but currently tests correct balloon only
 */
async function checkJumpCorridorForBalloon(
  page: any,
  targetBalloonId: string,
  catTopAtRest: number,
  catHalfWidth: number
): Promise<CorridorFrame[]> {
  // Record round-start frame before click
  const roundStartFrame = await page.evaluate((balloonId: string) => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    
    const targetBounds = window.__tatematika!.getBalloonBounds(balloonId)
    if (!targetBounds) return null
    
    const balloons: any[] = []
    const state = window.__tatematika!.getGameState()
    for (const b of state.balloons) {
      const bounds = window.__tatematika!.getBalloonBounds(b.id)
      if (bounds) {
        const sprite = scene.balloonSprites.find((bs: any) => bs.id === b.id)
        if (sprite && sprite.sprite && sprite.sprite.input && sprite.sprite.input.hitArea) {
          const hitArea = sprite.sprite.input.hitArea
          balloons.push({
            id: b.id,
            centerX: bounds.x + bounds.width / 2,
            centerY: bounds.y + bounds.height / 2,
            radiusX: hitArea.width / 2,
            radiusY: hitArea.height / 2
          })
        }
      }
    }
    
    return {
      time: scene.time.now,
      targetCenterX: targetBounds.x + targetBounds.width / 2,
      targetBottom: targetBounds.y + targetBounds.height,
      balloons
    }
  }, targetBalloonId)
  
  const frames: CorridorFrame[] = roundStartFrame ? [roundStartFrame] : []
  
  // Set up recording for walk and pre-jump phases
  await page.evaluate((balloonId: string) => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    
    window.__corridorFrames = []
    
    const recordFrame = () => {
      const jumpState = window.__tatematika!.getCatJumpState()
      if (jumpState.isJumping) {
        scene.events.off('postupdate', recordFrame)
        return
      }
      
      const targetBounds = window.__tatematika!.getBalloonBounds(balloonId)
      if (!targetBounds) return
      
      const balloons: any[] = []
      const state = window.__tatematika!.getGameState()
      for (const b of state.balloons) {
        const bounds = window.__tatematika!.getBalloonBounds(b.id)
        if (bounds) {
          const sprite = scene.balloonSprites.find((bs: any) => bs.id === b.id)
          if (sprite && sprite.sprite && sprite.sprite.input && sprite.sprite.input.hitArea) {
            const hitArea = sprite.sprite.input.hitArea
            balloons.push({
              id: b.id,
              centerX: bounds.x + bounds.width / 2,
              centerY: bounds.y + bounds.height / 2,
              radiusX: hitArea.width / 2,
              radiusY: hitArea.height / 2
            })
          }
        }
      }
      
      window.__corridorFrames.push({
        time: scene.time.now,
        targetCenterX: targetBounds.x + targetBounds.width / 2,
        targetBottom: targetBounds.y + targetBounds.height,
        balloons
      })
    }
    
    scene.events.on('postupdate', recordFrame)
    window.__stopRecording = () => scene.events.off('postupdate', recordFrame)
  }, targetBalloonId)
  
  // Click to start walk/jump
  await page.evaluate((id: string) => window.__tatematika!.clickBalloon(id), targetBalloonId)
  
  // Wait for jump to start (walk phase complete)
  await expect.poll(async () => {
    const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return jumpState.isJumping
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  
  // Stop recording and retrieve frames
  const recordedFrames = await page.evaluate(() => {
    window.__stopRecording()
    return window.__corridorFrames as CorridorFrame[]
  })
  
  frames.push(...recordedFrames)
  
  // Check precondition
  expect(frames.length, 'Must record at least 1 frame per round').toBeGreaterThanOrEqual(1)
  
  return frames
}

async function checkJumpCorridor(page: any, viewport: string, count: number, rounds: number) {
  // Read cat bounds once while idle
  const cat = await getCatPaintedBounds(page)
  const catHalfWidth = cat.width / 2
  const catTopAtRest = cat.top
  
  for (let round = 0; round < rounds; round++) {
    // Wait for cat to be idle before starting round
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
    
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const correctBalloon = state.balloons.find((b: any) => b.isCorrect)!
    const initialBalloonIds = state.balloons.map((b: any) => b.id).sort()
    
    // Record corridor frames for this round
    const frames = await checkJumpCorridorForBalloon(
      page,
      correctBalloon.id,
      catTopAtRest,
      catHalfWidth
    )
    
    // Collect all violations in this round
    const violations: string[] = []
    
    for (const frame of frames) {
      const corridorLeft = frame.targetCenterX - catHalfWidth - CORRIDOR_MARGIN_PX
      const corridorRight = frame.targetCenterX + catHalfWidth + CORRIDOR_MARGIN_PX
      const corridorTop = frame.targetBottom
      const corridorBottom = catTopAtRest
      
      for (const balloon of frame.balloons) {
        if (balloon.id === correctBalloon.id) continue // Skip target
        
        if (ellipseIntersectsAABB(
          balloon.centerX, balloon.centerY,
          balloon.radiusX, balloon.radiusY,
          corridorLeft, corridorTop, corridorRight, corridorBottom
        )) {
          violations.push(
            `${viewport} count ${count} round ${round} frame t=${frame.time.toFixed(1)}ms: ` +
            `Non-target balloon ${balloon.id.substring(0, 25)}... ` +
            `(centerX=${balloon.centerX.toFixed(1)}, centerY=${balloon.centerY.toFixed(1)}, ` +
            `radiusX=${balloon.radiusX.toFixed(1)}, radiusY=${balloon.radiusY.toFixed(1)}) ` +
            `intersects jump corridor under target ${correctBalloon.id.substring(0, 25)}... ` +
            `(centerX=${frame.targetCenterX.toFixed(1)}). ` +
            `Corridor: x=${corridorLeft.toFixed(1)} to ${corridorRight.toFixed(1)}, ` +
            `y=${corridorTop.toFixed(1)} to ${corridorBottom.toFixed(1)}`
          )
        }
      }
    }
    
    // Wait for jump to complete
    await expect.poll(async () => {
      const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      return !jumpState.isJumping
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
    
    // Wait for new round to start (new balloon ID set or star count increase)
    await expect.poll(async () => {
      const newState = await page.evaluate(() => window.__tatematika!.getGameState())
      const newBalloonIds = newState.balloons.map((b: any) => b.id).sort()
      return newState.stars > state.stars || JSON.stringify(newBalloonIds) !== JSON.stringify(initialBalloonIds)
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
    
    // Assert violations after round completes (red on violations, not timeout)
    expect(violations, violations.join('\n')).toEqual([])
  }
}

const viewports = [
  { width: 320, height: 568, name: '320×568' },
  { width: 375, height: 667, name: '375×667' },
  { width: 1280, height: 800, name: '1280×800' }
]

for (const vp of viewports) {
  const isMobile = vp.width === 320 || vp.width === 375
  test.describe(`Jump Corridor - ${vp.name}${isMobile ? ' @mobile' : ''}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })
    
    test.beforeEach(async ({ page }) => {
      await page.goto('/')
      await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
    })
    
    for (const count of [3, 4, 5]) {
      test(`Count ${count}: No balloons in jump corridor (10 rounds)`, async ({ page }) => {
        const rounds = 10
        test.setTimeout(multiRoundTestTimeout(rounds))
        await setBalloonCount(page, count)
        await checkJumpCorridor(page, vp.name, count, rounds)
      })
    }
  })
}
