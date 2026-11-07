# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: run-k12-trace.spec.ts >> K12 with frame logging
- Location: tests/e2e/run-k12-trace.spec.ts:8:1

# Error details

```
Error: K12 PRECONDITION: walk phase must be covered

expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]: Котето и балоните - Игра по математика
  - button "⚙️" [ref=e5] [cursor=pointer]
```

# Test source

```ts
  1   | import { test as base, expect } from '@playwright/test'
  2   | import { ACTION_TIMEOUT_MS, INIT_TIMEOUT_MS } from '../../tests/e2e/test-timeouts'
  3   | import * as fs from 'fs'
  4   | import * as path from 'path'
  5   | 
  6   | const test = base.extend({})
  7   | 
  8   | test('K12 with frame logging', async ({ page }, testInfo) => {
  9   |   test.setTimeout(90000)
  10  |   
  11  |   // Read probe script
  12  |   const probeScript = fs.readFileSync('/tmp/artifacts/probe-frame-log.js', 'utf8')
  13  |   
  14  |   // Inject probe before page load
  15  |   await page.addInitScript(probeScript)
  16  |   
  17  |   await page.goto('/')
  18  |   await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  19  |   
  20  |   const hasGetActionPhase = await page.evaluate(() => typeof window.__tatematika!.getActionPhase === 'function')
  21  |   expect(hasGetActionPhase, 'K12 CONTRACT: getActionPhase hook must be implemented').toBe(true)
  22  |   
  23  |   // Wait for cat to be idle
  24  |   await expect.poll(async () => {
  25  |     const phase = await page.evaluate(() => window.__tatematika!.getActionPhase?.())
  26  |     return phase
  27  |   }, { timeout: INIT_TIMEOUT_MS, intervals: [50] }).toBe('idle')
  28  |   
  29  |   const initialStars = await page.evaluate(() => {
  30  |     const state = window.__tatematika!.getGameState()
  31  |     return state.stars
  32  |   })
  33  |   
  34  |   // Click correct balloon ONCE
  35  |   const correctBalloonId = await page.evaluate(() => {
  36  |     const state = window.__tatematika!.getGameState()
  37  |     const correct = state.balloons.find((b: any) => b.isCorrect)!
  38  |     return correct.id
  39  |   })
  40  |   
  41  |   await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correctBalloonId)
  42  |   
  43  |   // Rapid-fire 50 clicks during action
  44  |   let rapidClickCount = 0
  45  |   const rapidClickInterval = setInterval(async () => {
  46  |     try {
  47  |       await page.evaluate((id) => {
  48  |         const result = window.__tatematika!.clickBalloon(id)
  49  |         if (!result) {
  50  |           // Click was ignored
  51  |         }
  52  |       }, correctBalloonId)
  53  |       rapidClickCount++
  54  |     } catch (e) {
  55  |       // Ignore errors during rapid clicking
  56  |     }
  57  |   }, 10)
  58  |   
  59  |   // Wait for action to complete (star increase)
  60  |   await expect.poll(async () => {
  61  |     const s = await page.evaluate(() => window.__tatematika!.getGameState())
  62  |     return s.stars
  63  |   }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(initialStars + 1)
  64  |   
  65  |   clearInterval(rapidClickInterval)
  66  |   
  67  |   // Wait for new round to be ready
  68  |   await expect.poll(async () => {
  69  |     const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
  70  |     const state = await page.evaluate(() => window.__tatematika!.getGameState())
  71  |     const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
  72  |     return !jumpState.isJumping && correctCount === 1
  73  |   }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  74  |   
  75  |   // Check phase observations during action
  76  |   const phaseObservations = await page.evaluate(() => {
  77  |     return (window as any).__phaseObservations || []
  78  |   })
  79  |   
  80  |   const walkCount = phaseObservations.filter((p: string) => p === 'walk').length
  81  |   const jumpCount = phaseObservations.filter((p: string) => p === 'jump').length
  82  |   const landingCount = phaseObservations.filter((p: string) => p === 'landing').length
  83  |   
> 84  |   expect(walkCount, 'K12 PRECONDITION: walk phase must be covered').toBeGreaterThan(0)
      |                                                                     ^ Error: K12 PRECONDITION: walk phase must be covered
  85  |   expect(jumpCount, 'K12 PRECONDITION: jump phase must be covered').toBeGreaterThan(0)
  86  |   expect(landingCount, 'K12 PRECONDITION: landing phase must be covered').toBeGreaterThan(0)
  87  |   
  88  |   const finalState = await page.evaluate(() => window.__tatematika!.getGameState())
  89  |   expect(finalState.stars, 'Stars should increase exactly once').toBe(initialStars + 1)
  90  |   
  91  |   // Extract frame logs
  92  |   const frameLogs = await page.evaluate(() => (window as any).__getFrameLogs())
  93  |   
  94  |   // Save to artifacts
  95  |   const outputDir = '/tmp/artifacts/k12-trace'
  96  |   fs.mkdirSync(outputDir, { recursive: true })
  97  |   fs.writeFileSync(
  98  |     path.join(outputDir, 'frame-log.json'),
  99  |     JSON.stringify(frameLogs, null, 2)
  100 |   )
  101 |   
  102 |   // Convert to CSV
  103 |   const csv = [
  104 |     'wallMs,loopDelta,rawDelta,actionPhase,actionLocked,catIsJumping,catJumpTime,landingFrameTime,popAnimationStartTime,stars,wrongAttempts'
  105 |   ]
  106 |   for (const entry of frameLogs) {
  107 |     csv.push([
  108 |       entry.wallMs,
  109 |       entry.loopDelta,
  110 |       entry.rawDelta,
  111 |       entry.actionPhase,
  112 |       entry.actionLocked,
  113 |       entry.catIsJumping,
  114 |       entry.catJumpTime,
  115 |       entry.landingFrameTime,
  116 |       entry.popAnimationStartTime,
  117 |       entry.stars,
  118 |       entry.wrongAttempts
  119 |     ].join(','))
  120 |   }
  121 |   fs.writeFileSync(
  122 |     path.join(outputDir, 'frame-log.csv'),
  123 |     csv.join('\n')
  124 |   )
  125 |   
  126 |   console.log(`\nK12 frame logs saved to ${outputDir}`)
  127 |   console.log(`Total frames logged: ${frameLogs.length}`)
  128 |   console.log(`Rapid clicks sent: ${rapidClickCount}`)
  129 | })
  130 | 
```