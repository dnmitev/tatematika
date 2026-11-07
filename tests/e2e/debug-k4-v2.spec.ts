import { test, expect } from '@playwright/test'

test('Debug K4 v2', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 })
  
  const initialState = await page.evaluate(() => window.__tatematika!.getGameState())
  console.log('Balloon count:', initialState.balloons.length)
  
  const wrongBalloon = initialState.balloons.find(b => !b.isCorrect)
  console.log('Wrong balloon id:', wrongBalloon?.id)
  
  // Check balloon bounds
  const bounds = await page.evaluate((id) => window.__tatematika!.getBalloonBounds(id), wrongBalloon!.id)
  console.log('Balloon bounds:', bounds)
  
  // Check cat position
  const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
  console.log('Cat initial position:', jumpState)
  
  // Try to get more info about internal state
  const debug = await page.evaluate((id) => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    return {
      balloonSpritesCount: scene.balloonSprites?.length,
      balloonSpritesIds: scene.balloonSprites?.map((b: any) => b.id),
      catX: scene.catX,
      catTargetX: scene.catTargetX,
      actionLocked: scene.actionLocked,
      pendingJumpBalloonId: scene.pendingJumpBalloonId
    }
  }, wrongBalloon!.id)
  console.log('Debug before click:', debug)
  
  // Click wrong balloon
  console.log('\nClicking wrong balloon...')
  await page.evaluate((id) => {
    console.log('About to call clickBalloon with id:', id)
    window.__tatematika!.clickBalloon(id)
  }, wrongBalloon!.id)
  
  // Check debug info immediately after click
  const debugAfterClick = await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    return {
      catX: scene.catX,
      catTargetX: scene.catTargetX,
      actionLocked: scene.actionLocked,
      pendingJumpBalloonId: scene.pendingJumpBalloonId,
      catIsJumping: scene.catIsJumping
    }
  })
  console.log('Debug after click:', debugAfterClick)
  
  // Wait and check again
  await page.waitForTimeout(500)
  const debugAfter500 = await page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    return {
      catX: scene.catX,
      catTargetX: scene.catTargetX,
      actionLocked: scene.actionLocked,
      pendingJumpBalloonId: scene.pendingJumpBalloonId,
      catIsJumping: scene.catIsJumping,
      wrongAttempts: scene.gameState.round.wrongAttempts
    }
  })
  console.log('Debug after 500ms:', debugAfter500)
})
