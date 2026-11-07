import { test, expect } from '@playwright/test'
import { ACTION_TIMEOUT_MS, INIT_TIMEOUT_MS, multiRoundTestTimeout } from './test-timeouts'
import {
  balloonId,
  describeBalloonStability,
  describeCatFrames,
  externalCatAssets,
  opaSoundPlayed,
  readTopPanel,
  sampleCatPhase,
  sampleIdleBalloons,
  sampleWalkingBalloons,
  textsInclude,
  visiblePraise,
  visibleWrongSentence,
  waitForViewport,
  waitUntilCatIdle,
  watchBalloonAnswer,
} from './feedback-observers'

/**
 * К19–К23 and the extra visual rules from spec PR #8.
 * Sprite identity is the live Phaser object reached through getGame().
 * The optional getBalloonFrame hook is a type stub and is not called.
 */

test.describe('К19–К23 visual feedback', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    const requestUrls: string[] = []
    page.on('request', request => requestUrls.push(request.url()))
    ;(page as any)._catRequests = requestUrls
    await page.goto('/')
    await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
    await waitUntilCatIdle(page)
  })

  test('К19: at rest each balloon keeps one sprite, one colour, stable alpha and visibility', async ({ page }) => {
    const watch = await sampleIdleBalloons(page, 1000)
    const problems = describeBalloonStability(watch.samples, 'at rest')
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('К19: while moving each balloon keeps one sprite, one colour, stable alpha and visibility', async ({ page }) => {
    const watch = await sampleWalkingBalloons(page, 1000)
    const problems = describeBalloonStability(watch.samples, 'while moving')
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('К19: during hint each balloon keeps one sprite, one colour, stable alpha and visibility', async ({ page }) => {
    test.setTimeout(multiRoundTestTimeout(2))
    for (let attempt = 0; attempt < 2; attempt++) {
      await waitUntilCatIdle(page)
      const id = await balloonId(page, 'wrong')
      const before = await page.evaluate(() => window.__tatematika!.getGameState().wrongAttempts)
      await watchBalloonAnswer(page, id)
      await expect.poll(async () => {
        return page.evaluate(() => window.__tatematika!.getGameState().wrongAttempts)
      }).toBeGreaterThan(before)
    }
    await waitUntilCatIdle(page)
    const watch = await sampleIdleBalloons(page, 1000)
    const problems = describeBalloonStability(watch.samples, 'during hint')
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('К19: during feedback each balloon keeps one sprite, one colour, stable alpha and visibility', async ({ page }) => {
    test.setTimeout(multiRoundTestTimeout(2))
    const wrong = await balloonId(page, 'wrong')
    const wrongWatch = await watchBalloonAnswer(page, wrong)
    const correct = await balloonId(page, 'correct')
    const correctWatch = await watchBalloonAnswer(page, correct)
    const problems = [
      ...describeBalloonStability(wrongWatch.samples, 'during wrong feedback'),
      ...describeBalloonStability(correctWatch.samples, 'during correct feedback'),
    ]
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('К20: top panel stays readable and uncovered at 1280×800, 1366×768 and 1920×1080', async ({ page }) => {
    test.setTimeout(60000)
    const viewports = [
      { width: 1280, height: 800 },
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
    ]
    const problems: string[] = []
    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      await waitForViewport(page, viewport.width, viewport.height)
      const state = await page.evaluate(() => window.__tatematika!.getGameState())
      const panel = await readTopPanel(page)
      const label = `${viewport.width}×${viewport.height}`
      if (!panel.instructionFound) {
        problems.push(`${label}: top panel does not show „Намери сметката за“`)
      } else if (panel.targetInPanel !== state.target) {
        problems.push(`${label}: target ${state.target} is not in the top panel (saw ${panel.targetInPanel})`)
      } else if (panel.targetFontCss !== null && panel.targetFontCss < 32) {
        problems.push(`${label}: target digits are ${panel.targetFontCss}px, below 32px`)
      }
      if (!panel.formulasOnBalloons) problems.push(`${label}: formulas are not on the balloons`)
      if (panel.formulaMovedIntoPanel) problems.push(`${label}: a formula was moved into the top panel`)
      if (panel.balloonOverlapsPanel) problems.push(`${label}: a balloon overlaps the top panel`)
      if (panel.catOverlapsPanel) problems.push(`${label}: the cat overlaps the top panel`)
      if (panel.feedbackOverlapsPanel) problems.push(`${label}: feedback overlaps the top panel`)
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('К21: correct answer shows exactly one cup named „Вярно“ and the name is not visible text', async ({ page }) => {
    test.setTimeout(multiRoundTestTimeout(1))
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    expect(state.settings.correctBalloonsPerLevel).toBe(10)
    expect(state.stars).toBeLessThan(state.settings.correctBalloonsPerLevel - 1)
    const id = await balloonId(page, 'correct')
    const watch = await watchBalloonAnswer(page, id)
    const problems: string[] = []
    if (watch.maxCorrectIcons !== 1) {
      problems.push(`expected exactly one accessible name „Вярно“, saw ${watch.maxCorrectIcons}`)
    }
    if (watch.maxIcons > 1) problems.push(`more than one feedback icon was visible (max ${watch.maxIcons})`)
    if (textsInclude(watch.texts, 'Вярно')) problems.push('„Вярно“ is visible as text')
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('К21: correct answer has no visible praise, adds one star, and starts a new round below the goal', async ({ page }) => {
    test.setTimeout(multiRoundTestTimeout(1))
    const id = await balloonId(page, 'correct')
    const watch = await watchBalloonAnswer(page, id)
    const goal = watch.stateBefore.correctBalloonsPerLevel
    const problems: string[] = []
    const praise = visiblePraise(watch.texts)
    if (praise.length > 0) problems.push(`visible praise text: ${praise.join(', ')}`)
    if (watch.stateAfter.stars !== watch.stateBefore.stars + 1) {
      problems.push(`stars ${watch.stateBefore.stars} → ${watch.stateAfter.stars}, expected +1`)
    }
    if (watch.stateAfter.stars >= goal) problems.push('this case must not be the last answer of the level')
    if (watch.stateAfter.levelEndText) problems.push(`level-end screen appeared: ${watch.stateAfter.levelEndText}`)
    const sameBalloons = watch.stateBefore.balloonIds.join(',') === watch.stateAfter.balloonIds.join(',')
    if (sameBalloons) problems.push('a new round did not start')
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('К21: the new round shows its target in the top panel and the cup does not cover it', async ({ page }) => {
    test.setTimeout(multiRoundTestTimeout(1))
    const id = await balloonId(page, 'correct')
    const watch = await watchBalloonAnswer(page, id)
    expect(watch.stateAfter.stars).toBe(watch.stateBefore.stars + 1)
    const panel = await readTopPanel(page)
    const problems: string[] = []
    if (!panel.instructionFound) problems.push('top panel does not show „Намери сметката за“ after the new round')
    if (panel.targetInPanel !== watch.stateAfter.target) {
      problems.push(`new target ${watch.stateAfter.target} is not in the top panel`)
    }
    if (panel.balloonOverlapsPanel || panel.feedbackOverlapsPanel) {
      problems.push('the cup or a balloon covers the top panel or the formulas')
    }
    if (panel.targetFontCss !== null && panel.targetFontCss < 32) {
      problems.push(`target digits are ${panel.targetFontCss}px, below 32px`)
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('К22: wrong answer shows exactly one red X named „Грешно“, plays „Опа!“, and continues the round', async ({ page }) => {
    test.setTimeout(multiRoundTestTimeout(1))
    const id = await balloonId(page, 'wrong')
    const watch = await watchBalloonAnswer(page, id, true)
    const problems: string[] = []
    if (!opaSoundPlayed(watch.sound, watch.muted)) {
      problems.push(`„Опа!“ sound did not play with sound on (last=${watch.sound}, muted=${watch.muted})`)
    }
    if (!watch.sawBounce) problems.push('the balloon did not bounce')
    if (watch.stateAfter.stars !== watch.stateBefore.stars) problems.push('stars changed on a wrong answer')
    if (watch.stateAfter.target !== watch.stateBefore.target) problems.push('target changed on a wrong answer')
    if (watch.stateBefore.balloonIds.join(',') !== watch.stateAfter.balloonIds.join(',')) {
      problems.push('balloons changed on a wrong answer')
    }
    if (watch.stateAfter.levelEndText) problems.push('a loss or level-end screen appeared')
    if (watch.maxWrongIcons !== 1) {
      problems.push(`expected exactly one accessible name „Грешно“, saw ${watch.maxWrongIcons}`)
    }
    if (watch.maxIcons > 1) problems.push(`more than one feedback icon was visible (max ${watch.maxIcons})`)
    if (visibleWrongSentence(watch.texts)) problems.push('visible text still contains „Опа! Опитай пак!“')
    if (textsInclude(watch.texts, 'Грешно')) problems.push('„Грешно“ is visible as text')
    const sad = watch.texts.filter(text => /тъж|плач|срам|загуби|game over/i.test(text))
    if (sad.length > 0) problems.push(`sad or losing text: ${sad.join(', ')}`)
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('feedback: at most one icon, and the next answer replaces it', async ({ page }) => {
    test.setTimeout(multiRoundTestTimeout(2))
    const wrong = await balloonId(page, 'wrong')
    const wrongWatch = await watchBalloonAnswer(page, wrong)
    await waitUntilCatIdle(page)
    const correct = await balloonId(page, 'correct')
    const correctWatch = await watchBalloonAnswer(page, correct)
    const problems: string[] = []
    if (wrongWatch.maxIcons > 1 || correctWatch.maxIcons > 1) {
      problems.push(`more than one feedback icon was visible (wrong max ${wrongWatch.maxIcons}, correct max ${correctWatch.maxIcons})`)
    }
    if (wrongWatch.maxWrongIcons !== 1) {
      problems.push(`wrong answer did not show exactly one „Грешно“ (saw ${wrongWatch.maxWrongIcons})`)
    }
    if (correctWatch.maxCorrectIcons !== 1) {
      problems.push(`correct answer did not replace it with exactly one „Вярно“ (saw ${correctWatch.maxCorrectIcons})`)
    }
    if (correctWatch.maxWrongIcons !== 0) {
      problems.push('the wrong icon was still present after the correct answer')
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('К5: after two mistakes the correct balloon has a constant outline and readable digits', async ({ page }) => {
    test.setTimeout(multiRoundTestTimeout(2))
    for (let attempt = 0; attempt < 2; attempt++) {
      await waitUntilCatIdle(page)
      const id = await balloonId(page, 'wrong')
      await watchBalloonAnswer(page, id)
    }
    await waitUntilCatIdle(page)
    const watch = await sampleIdleBalloons(page, 1000)
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    const font = await page.evaluate(() => window.__tatematika!.getFormulaFontSize())
    const correct = state.balloons.find(b => b.isCorrect)!
    const problems = describeBalloonStability(
      watch.samples.filter(sample => sample.id === correct.id),
      'hint outline'
    )
    if (state.wrongAttempts < 2) problems.push(`hint did not arm (wrongAttempts=${state.wrongAttempts})`)
    if (font < 32) problems.push(`formula digits are ${font}px, below 32px`)
    const correctSamples = watch.samples.filter(sample => sample.id === correct.id)
    const strokes = new Set(correctSamples.map(sample => sample.stroke))
    const instances = new Set(correctSamples.map(sample => sample.instanceId))
    if (instances.size !== 1 || strokes.size !== 1 || correctSamples.some(sample => sample.stroke === null)) {
      problems.push(`outline is not one constant contour (instances=${instances.size}, stroke colours=${[...strokes].join(',')})`)
    }
    if (!watch.texts.includes(correct.formula)) problems.push('the correct formula is not readable')
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('К23: the cat is animated at rest from a local resource', async ({ page }) => {
    const frames = await sampleCatPhase(page, 'idle')
    const problems = [
      ...describeCatFrames(frames, 'at rest'),
      ...(await externalCatAssets(page, (page as any)._catRequests as string[])).map(url => `cat asset is not local: ${url}`),
    ]
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('К23: the cat is animated while walking from a local resource', async ({ page }) => {
    const frames = await sampleCatPhase(page, 'walk')
    const problems = [
      ...describeCatFrames(frames, 'walking'),
      ...(await externalCatAssets(page, (page as any)._catRequests as string[])).map(url => `cat asset is not local: ${url}`),
    ]
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('К23: the cat is animated while jumping from a local resource', async ({ page }) => {
    test.setTimeout(multiRoundTestTimeout(1))
    const frames = await sampleCatPhase(page, 'jump')
    const problems = [
      ...describeCatFrames(frames, 'jumping'),
      ...(await externalCatAssets(page, (page as any)._catRequests as string[])).map(url => `cat asset is not local: ${url}`),
    ]
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('К23: the cat is animated while landing from a local resource', async ({ page }) => {
    test.setTimeout(multiRoundTestTimeout(1))
    const frames = await sampleCatPhase(page, 'landing')
    const problems = [
      ...describeCatFrames(frames, 'landing'),
      ...(await externalCatAssets(page, (page as any)._catRequests as string[])).map(url => `cat asset is not local: ${url}`),
    ]
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('К23: the cat is animated when reacting to a correct answer, with no extra delay', async ({ page }) => {
    test.setTimeout(multiRoundTestTimeout(1))
    const frames = await sampleCatPhase(page, 'correct')
    await waitUntilCatIdle(page)
    const beforeX = await page.evaluate(() => window.__tatematika!.getCatPosition().x)
    const id = await balloonId(page, 'wrong')
    await page.evaluate((balloonId) => window.__tatematika!.clickBalloon(balloonId), id)
    await expect.poll(async () => {
      const jump = await page.evaluate(() => window.__tatematika!.getCatJumpState())
      const pos = await page.evaluate(() => window.__tatematika!.getCatPosition())
      return jump.isJumping || pos.x !== beforeX
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
    const problems = [
      ...describeCatFrames(frames, 'correct reaction'),
      ...(await externalCatAssets(page, (page as any)._catRequests as string[])).map(url => `cat asset is not local: ${url}`),
    ]
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('К23: the cat is animated when reacting to a wrong answer and does not look sad', async ({ page }) => {
    test.setTimeout(multiRoundTestTimeout(1))
    const frames = await sampleCatPhase(page, 'wrong')
    const problems = [
      ...describeCatFrames(frames, 'wrong reaction'),
      ...(await externalCatAssets(page, (page as any)._catRequests as string[])).map(url => `cat asset is not local: ${url}`),
    ]
    expect(problems, problems.join('\n')).toEqual([])
  })
})
