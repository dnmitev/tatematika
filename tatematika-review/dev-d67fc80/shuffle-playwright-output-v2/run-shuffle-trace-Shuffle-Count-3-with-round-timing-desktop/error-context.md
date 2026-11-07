# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: run-shuffle-trace.spec.ts >> Shuffle Count 3 with round timing
- Location: tests/e2e/run-shuffle-trace.spec.ts:52:1

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 30
Received: 29

Call Log:
- Test timeout of 120000ms exceeded
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]: Котето и балоните - Игра по математика
  - button "⚙️" [ref=e5] [cursor=pointer]
  - generic [ref=e7]:
    - heading "Ти успя!" [level=1] [ref=e8]
    - paragraph [ref=e9]: Събра 30 звездички!
    - button "Още веднъж" [ref=e10] [cursor=pointer]
    - button "Към менюто" [ref=e11] [cursor=pointer]
```

# Test source

```ts
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
  38  |   await correctPerLevelInput.fill('100')
  39  |   
  40  |   await page.evaluate(() => window.__tatematika!.closeSettings())
  41  |   
  42  |   await expect.poll(async () => {
  43  |     const actualCount = await page.evaluate(() => {
  44  |       const game = window.__tatematika!.getGame()
  45  |       const scene = game.scene.getScene('GameScene') as any
  46  |       return scene.balloonSprites ? scene.balloonSprites.length : 0
  47  |     })
  48  |     return actualCount
  49  |   }, { timeout: 5000, intervals: [50] }).toBe(count)
  50  | }
  51  | 
  52  | test('Shuffle Count 3 with round timing', async ({ page }, testInfo) => {
  53  |   test.setTimeout(120000)
  54  |   
  55  |   const probeScript = fs.readFileSync('/tmp/artifacts/probe-frame-log.js', 'utf8')
  56  |   await page.addInitScript(probeScript)
  57  |   await page.addInitScript(getMulberry32Code(SEED_A))
  58  |   
  59  |   await page.goto('/')
  60  |   await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  61  |   
  62  |   const hasSetRoundRng = await page.evaluate(() => typeof window.__tatematika!.setRoundRng === 'function')
  63  |   expect(hasSetRoundRng, 'K17 CONTRACT: setRoundRng').toBe(true)
  64  |   
  65  |   await setBalloonCount(page, 3)
  66  |   
  67  |   const rounds = 30
  68  |   const count = 3
  69  |   const roundTimings: any[] = []
  70  |   const testStartWall = Date.now()
  71  |   
  72  |   for (let i = 0; i < rounds; i++) {
  73  |     const roundStartWall = Date.now()
  74  |     
  75  |     try {
  76  |       // Get current state
  77  |       const stateBefore = await page.evaluate(() => {
  78  |         const s = window.__tatematika!.getGameState()
  79  |         const jumpState = window.__tatematika!.getCatJumpState()
  80  |         return {
  81  |           stars: s.stars,
  82  |           roundToken: s.roundToken,
  83  |           isJumping: jumpState.isJumping
  84  |         }
  85  |       })
  86  |       
  87  |       // Find and click correct balloon
  88  |       const correctBalloonId = await page.evaluate(() => {
  89  |         const state = window.__tatematika!.getGameState()
  90  |         const correct = state.balloons.find((b: any) => b.isCorrect)
  91  |         if (!correct) throw new Error('No correct balloon found')
  92  |         return correct.id
  93  |       })
  94  |       
  95  |       await page.evaluate((id) => window.__tatematika!.clickBalloon(id), correctBalloonId)
  96  |       
  97  |       // Wait for star increase
  98  |       const pollStartLine = 'wait for star increase'
  99  |       await expect.poll(async () => {
  100 |         const s = await page.evaluate(() => window.__tatematika!.getGameState())
  101 |         return s.stars
> 102 |       }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(stateBefore.stars + 1)
      |                                                           ^ Error: expect(received).toBe(expected) // Object.is equality
  103 |       
  104 |       // Wait for new round ready
  105 |       const pollReadyLine = 'wait for new round ready'
  106 |       await expect.poll(async () => {
  107 |         const jumpState = await page.evaluate(() => window.__tatematika!.getCatJumpState())
  108 |         const state = await page.evaluate(() => window.__tatematika!.getGameState())
  109 |         const correctCount = state.balloons.filter((b: any) => b.isCorrect).length
  110 |         return !jumpState.isJumping && correctCount === 1
  111 |       }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
  112 |       
  113 |       const roundEndWall = Date.now()
  114 |       const roundDuration = roundEndWall - roundStartWall
  115 |       
  116 |       roundTimings.push({
  117 |         round: i + 1,
  118 |         startWall: roundStartWall - testStartWall,
  119 |         endWall: roundEndWall - testStartWall,
  120 |         duration: roundDuration,
  121 |         starsBefore: stateBefore.stars,
  122 |         roundToken: stateBefore.roundToken,
  123 |         success: true
  124 |       })
  125 |       
  126 |       console.log(`Round ${i + 1}/30 completed in ${roundDuration}ms`)
  127 |       
  128 |     } catch (error: any) {
  129 |       const roundEndWall = Date.now()
  130 |       roundTimings.push({
  131 |         round: i + 1,
  132 |         startWall: roundStartWall - testStartWall,
  133 |         endWall: roundEndWall - testStartWall,
  134 |         duration: roundEndWall - roundStartWall,
  135 |         success: false,
  136 |         error: error.message,
  137 |         stack: error.stack
  138 |       })
  139 |       
  140 |       // Capture state at failure
  141 |       const failureState = await page.evaluate(() => {
  142 |         const game = window.__tatematika!.getGame()
  143 |         const scene = game.scene.getScene('GameScene') as any
  144 |         const state = window.__tatematika!.getGameState()
  145 |         const jumpState = window.__tatematika!.getCatJumpState()
  146 |         const phase = window.__tatematika!.getActionPhase?.()
  147 |         
  148 |         return {
  149 |           phase,
  150 |           actionLocked: scene.actionLocked,
  151 |           catIsJumping: jumpState.isJumping,
  152 |           catJumpTime: scene.catJumpTime,
  153 |           landingFrameTime: scene.landingFrameTime,
  154 |           popAnimationStartTime: scene.popAnimationStartTime,
  155 |           stars: state.stars,
  156 |           wrongAttempts: state.wrongAttempts,
  157 |           roundToken: state.roundToken
  158 |         }
  159 |       })
  160 |       
  161 |       console.log(`\nRound ${i + 1} FAILED after ${roundEndWall - roundStartWall}ms`)
  162 |       console.log('Failure state:', JSON.stringify(failureState, null, 2))
  163 |       
  164 |       // Save failure data and round timings before rethrowing
  165 |       const outputDir = '/tmp/artifacts/shuffle-trace'
  166 |       fs.mkdirSync(outputDir, { recursive: true })
  167 |       
  168 |       // Save round timings collected so far
  169 |       fs.writeFileSync(
  170 |         path.join(outputDir, 'round-timings.json'),
  171 |         JSON.stringify(roundTimings, null, 2)
  172 |       )
  173 |       
  174 |       const csv = ['round,startWall,endWall,duration,starsBefore,roundToken,success,error']
  175 |       for (const r of roundTimings) {
  176 |         csv.push([
  177 |           r.round,
  178 |           r.startWall || '',
  179 |           r.endWall || '',
  180 |           r.duration || '',
  181 |           r.starsBefore || '',
  182 |           r.roundToken || '',
  183 |           r.success,
  184 |           r.error || ''
  185 |         ].join(','))
  186 |       }
  187 |       fs.writeFileSync(
  188 |         path.join(outputDir, 'round-timings.csv'),
  189 |         csv.join('\n')
  190 |       )
  191 |       
  192 |       fs.writeFileSync(
  193 |         path.join(outputDir, 'failure-state.json'),
  194 |         JSON.stringify({
  195 |           round: i + 1,
  196 |           failureState,
  197 |           error: error.message,
  198 |           stack: error.stack
  199 |         }, null, 2)
  200 |       )
  201 |       
  202 |       throw error
```