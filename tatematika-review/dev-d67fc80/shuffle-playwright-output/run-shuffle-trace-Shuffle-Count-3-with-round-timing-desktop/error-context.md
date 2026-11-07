# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: run-shuffle-trace.spec.ts >> Shuffle Count 3 with round timing
- Location: tests/e2e/run-shuffle-trace.spec.ts:48:1

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: locator.click: Test timeout of 120000ms exceeded.
Call log:
  - waiting for locator('[data-testid="button-close-settings"]')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]: Котето и балоните - Игра по математика
  - button "⚙️" [ref=e5] [cursor=pointer]
  - generic [ref=e6]:
    - heading "Настройки" [level=2] [ref=e7]
    - generic [ref=e8]:
      - generic [ref=e9]: "Горна граница (5-20):"
      - spinbutton [ref=e10]: "6"
    - generic [ref=e11]:
      - generic [ref=e12]: "Действия:"
      - combobox [ref=e13]:
        - option "само събиране"
        - option "само изваждане"
        - option "двете" [selected]
    - generic [ref=e14]:
      - generic [ref=e15]: "Балони (2-5):"
      - spinbutton [ref=e16]: "3"
    - generic [ref=e17]:
      - generic [ref=e18]: "Верни за ниво (5-20):"
      - spinbutton [active] [ref=e19]: "999"
    - generic [ref=e20]:
      - generic [ref=e21]: "Скорост:"
      - combobox [ref=e22]:
        - option "бавна" [selected]
        - option "средна"
    - button "Затвори" [ref=e23] [cursor=pointer]
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
  8   | const SEED_A = 0x12345678
  9   | 
  10  | function getMulberry32Code(seed: number): string {
  11  |   return `
  12  |     (function() {
  13  |       let state = ${seed};
  14  |       Math.random = function() {
  15  |         state |= 0;
  16  |         state = state + 0x6D2B79F5 | 0;
  17  |         let t = Math.imul(state ^ state >>> 15, 1 | state);
  18  |         t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  19  |         return ((t ^ t >>> 14) >>> 0) / 4294967296;
  20  |       };
  21  |     })();
  22  |   `
  23  | }
  24  | 
  25  | async function setBalloonCount(page: any, count: number) {
  26  |   await page.evaluate(() => window.__tatematika!.openSettings())
  27  |   
  28  |   const balloonCountInput = page.locator('[data-testid="setting-balloon-count"]').first()
  29  |   await balloonCountInput.fill(String(count))
  30  |   
  31  |   const correctPerLevelInput = page.locator('[data-testid="setting-correct-per-level"]').first()
  32  |   const inputExists = await correctPerLevelInput.count()
  33  |   
  34  |   if (inputExists === 0) {
  35  |     throw new Error('setting-correct-per-level input does not exist')
  36  |   }
  37  |   
  38  |   await correctPerLevelInput.fill('999')
  39  |   
  40  |   const closeButton = page.locator('[data-testid="button-close-settings"]')
> 41  |   await closeButton.click()
      |                     ^ Error: locator.click: Test timeout of 120000ms exceeded.
  42  |   
  43  |   await expect.poll(async () => {
  44  |     return await page.evaluate(() => !window.__tatematika!.isSettingsOpen())
  45  |   }, { timeout: 5000, intervals: [50] }).toBe(true)
  46  | }
  47  | 
  48  | test('Shuffle Count 3 with round timing', async ({ page }, testInfo) => {
  49  |   test.setTimeout(120000)
  50  |   
  51  |   const probeScript = fs.readFileSync('/tmp/artifacts/probe-frame-log.js', 'utf8')
  52  |   await page.addInitScript(probeScript)
  53  |   await page.addInitScript(getMulberry32Code(SEED_A))
  54  |   
  55  |   await page.goto('/')
  56  |   await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  57  |   
  58  |   const hasSetRoundRng = await page.evaluate(() => typeof window.__tatematika!.setRoundRng === 'function')
  59  |   expect(hasSetRoundRng, 'K17 CONTRACT: setRoundRng').toBe(true)
  60  |   
  61  |   await setBalloonCount(page, 3)
  62  |   
  63  |   const rounds = 30
  64  |   const count = 3
  65  |   const roundTimings: any[] = []
  66  |   const testStartWall = Date.now()
  67  |   
  68  |   for (let i = 0; i < rounds; i++) {
  69  |     const roundStartWall = Date.now()
  70  |     
  71  |     try {
  72  |       // Get current state
  73  |       const stateBefore = await page.evaluate(() => {
  74  |         const s = window.__tatematika!.getGameState()
  75  |         const jumpState = window.__tatematika!.getCatJumpState()
  76  |         return {
  77  |           stars: s.stars,
  78  |           roundToken: s.roundToken,
  79  |           isJumping: jumpState.isJumping
  80  |         }
  81  |       })
  82  |       
  83  |       // Find and click correct balloon
  84  |       const correctBalloonId = await page.evaluate(() => {
  85  |         const state = window.__tatematika!.getGameState()
  86  |         const correct = state.balloons.find((b: any) => b.isCorrect)
  87  |         if (!correct) throw new Error('No correct balloon found')
  88  |         return correct.id
  89  |       })
  90  |       
  91  |       await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correctBalloonId)
  92  |       
  93  |       // Wait for star increase
  94  |       const pollStartLine = 'wait for star increase'
  95  |       await expect.poll(async () => {
  96  |         const s = await page.evaluate(() => window.__tatematika!.getGameState())
  97  |         return s.stars
  98  |       }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(stateBefore.stars + 1)
  99  |       
  100 |       // Wait for new round ready
  101 |       const pollReadyLine = 'wait for new round ready'
  102 |       await expect.poll(async () => {
  103 |         const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
  104 |         const state = await page.evaluate(() => window.__tatematika!.getGameState())
  105 |         const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
  106 |         return !jumpState.isJumping && correctCount === 1
  107 |       }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  108 |       
  109 |       const roundEndWall = Date.now()
  110 |       const roundDuration = roundEndWall - roundStartWall
  111 |       
  112 |       roundTimings.push({
  113 |         round: i + 1,
  114 |         startWall: roundStartWall - testStartWall,
  115 |         endWall: roundEndWall - testStartWall,
  116 |         duration: roundDuration,
  117 |         starsBefore: stateBefore.stars,
  118 |         roundToken: stateBefore.roundToken,
  119 |         success: true
  120 |       })
  121 |       
  122 |       console.log(`Round ${i + 1}/30 completed in ${roundDuration}ms`)
  123 |       
  124 |     } catch (error: any) {
  125 |       const roundEndWall = Date.now()
  126 |       roundTimings.push({
  127 |         round: i + 1,
  128 |         startWall: roundStartWall - testStartWall,
  129 |         endWall: roundEndWall - testStartWall,
  130 |         duration: roundEndWall - roundStartWall,
  131 |         success: false,
  132 |         error: error.message,
  133 |         stack: error.stack
  134 |       })
  135 |       
  136 |       // Capture state at failure
  137 |       const failureState = await page.evaluate(() => {
  138 |         const game = window.__tatematika!.getGame()
  139 |         const scene = game.scene.getScene('GameScene') as any
  140 |         const state = window.__tatematika!.getGameState()
  141 |         const jumpState = window.__tatematika!.getCatJumpState()
```