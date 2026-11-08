import { test, expect } from '@playwright/test'
import { ACTION_TIMEOUT_MS, INIT_TIMEOUT_MS, multiRoundTestTimeout } from './test-timeouts'

/**
 * Spec outcomes that a resize must not cancel:
 * docs/games/kote-balonche.md §4.5, §4.6, §4.8, К3, К4, К15.
 * Settings that must reach the live round: §4.1 and §5.
 * Confetti and the level-end dance: §4.5 and §6.
 */

async function waitIdle(page: any) {
  await expect.poll(async () => {
    return page.evaluate(() => window.__tatematika!.getActionPhase())
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe('idle')
}

async function clickBalloon(page: any, balloonId: string) {
  const point = await page.evaluate((id: string) => {
    const api = window.__tatematika!
    const bounds = api.getBalloonBounds(id)
    const game = api.getGame()
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const scale = rect.width / game.scale.width
    return {
      x: rect.left + (bounds!.x + bounds!.width / 2) * scale,
      y: rect.top + (bounds!.y + bounds!.height / 2) * scale
    }
  }, balloonId)
  await page.mouse.click(point.x, point.y)
}

async function readHudStars(page: any): Promise<{ text: string; count: number | null; visible: boolean }> {
  return page.evaluate(() => {
    const scene = window.__tatematika!.getGame().scene.getScene('GameScene') as any
    const label = scene.children.list.find((child: any) =>
      child.type === 'Text' && typeof child.text === 'string' && child.text.includes('⭐'))
    if (!label) return { text: '', count: null, visible: false }
    const match = String(label.text).match(/(\d+)/)
    return {
      text: String(label.text),
      count: match ? Number(match[1]) : null,
      visible: label.visible !== false && label.alpha > 0
    }
  })
}

async function holdWhen(page: any, kind: 'pop' | 'bounce') {
  await page.evaluate((which: 'pop' | 'bounce') => {
    const scene = window.__tatematika!.getGame().scene.getScene('GameScene') as any
    ;(window as any).__heldPhase = null
    const onFrame = () => {
      const hit = scene.balloonSprites.some((balloon: any) =>
        which === 'pop' ? balloon.isPopping : balloon.isBouncing)
      if (!hit) return
      scene.events.off('postupdate', onFrame)
      scene.scene.pause()
      ;(window as any).__heldPhase = which
    }
    scene.events.on('postupdate', onFrame)
  }, kind)
}

async function resizeDuringHold(page: any, kind: 'pop' | 'bounce') {
  await expect.poll(async () => {
    return page.evaluate(() => (window as any).__heldPhase)
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [10] }).toBe(kind)

  const widthBefore = await page.evaluate(() => window.__tatematika!.getGame().scale.width)
  await page.setViewportSize({ width: 1000, height: 760 })
  await page.evaluate(() => {
    const scene = window.__tatematika!.getGame().scene.getScene('GameScene') as any
    if (scene.scene.isPaused()) scene.scene.resume()
  })
  const widthAfter = await page.evaluate(() => window.__tatematika!.getGame().scale.width)
  expect(widthAfter, 'viewport resize must reach the running game').not.toBe(widthBefore)
}

test('resize during a correct pop still awards one star and accepts the next tap', async ({ page }) => {
  test.setTimeout(multiRoundTestTimeout(2))
  await page.goto('/')
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  await waitIdle(page)

  const before = await page.evaluate(() => {
    const state = window.__tatematika!.getGameState()
    return {
      stars: state.stars,
      ids: state.balloons.map((balloon: any) => balloon.id).join('|'),
      correctId: state.balloons.find((balloon: any) => balloon.isCorrect).id
    }
  })

  await holdWhen(page, 'pop')
  await clickBalloon(page, before.correctId)
  await resizeDuringHold(page, 'pop')

  await expect.poll(async () => {
    const snap = await page.evaluate(() => {
      const state = window.__tatematika!.getGameState()
      return {
        phase: window.__tatematika!.getActionPhase(),
        stars: state.stars,
        ids: state.balloons.map((balloon: any) => balloon.id).join('|')
      }
    })
    const roundChanged = snap.ids !== before.ids
    if (snap.phase === 'idle' && snap.stars === before.stars + 1 && roundChanged) return 'completed'
    return `action never completed after resize during pop (phase=${snap.phase}, stars=${snap.stars}, roundChanged=${roundChanged})`
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe('completed')

  const next = await page.evaluate(() => {
    const state = window.__tatematika!.getGameState()
    return {
      stars: state.stars,
      correctId: state.balloons.find((balloon: any) => balloon.isCorrect).id
    }
  })
  await clickBalloon(page, next.correctId)

  await expect.poll(async () => {
    const snap = await page.evaluate(() => ({
      phase: window.__tatematika!.getActionPhase(),
      stars: window.__tatematika!.getGameState().stars
    }))
    if (snap.stars === before.stars + 2) return 'accepted'
    return `next correct tap was not accepted after resize during pop (phase=${snap.phase}, stars=${snap.stars})`
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe('accepted')
})

test('resize during a wrong-balloon bounce still accepts the next tap', async ({ page }) => {
  test.setTimeout(multiRoundTestTimeout(2))
  await page.goto('/')
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  await waitIdle(page)

  const before = await page.evaluate(() => {
    const state = window.__tatematika!.getGameState()
    return {
      stars: state.stars,
      wrong: state.wrongAttempts,
      target: state.target,
      wrongId: state.balloons.find((balloon: any) => !balloon.isCorrect).id
    }
  })

  await holdWhen(page, 'bounce')
  await clickBalloon(page, before.wrongId)
  await resizeDuringHold(page, 'bounce')

  await expect.poll(async () => {
    const snap = await page.evaluate(() => {
      const state = window.__tatematika!.getGameState()
      return {
        phase: window.__tatematika!.getActionPhase(),
        wrong: state.wrongAttempts,
        stars: state.stars,
        target: state.target
      }
    })
    if (snap.phase === 'idle' && snap.wrong === before.wrong + 1 && snap.stars === before.stars && snap.target === before.target) {
      return 'completed'
    }
    return `action never completed after resize during bounce (phase=${snap.phase}, wrongAttempts=${snap.wrong}, stars=${snap.stars}, target=${snap.target})`
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe('completed')

  const correctId = await page.evaluate(() => {
    return window.__tatematika!.getGameState().balloons.find((balloon: any) => balloon.isCorrect).id
  })
  await clickBalloon(page, correctId)

  await expect.poll(async () => {
    const snap = await page.evaluate(() => ({
      phase: window.__tatematika!.getActionPhase(),
      stars: window.__tatematika!.getGameState().stars
    }))
    if (snap.stars === before.stars + 1) return 'accepted'
    return `next input was not accepted after resize during bounce (phase=${snap.phase}, stars=${snap.stars})`
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe('accepted')
})

test('resize while settings are open still applies balloon count and speed', async ({ page }) => {
  test.setTimeout(multiRoundTestTimeout(1))
  await page.goto('/')
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  await waitIdle(page)

  await page.locator('[data-testid="button-settings"]').click()
  const panel = page.locator('[data-testid="settings-panel"]')
  await expect(panel).toBeVisible()

  await page.setViewportSize({ width: 1100, height: 760 })
  await expect(panel).toBeVisible()

  await panel.locator('[data-testid="setting-balloon-count"]').fill('4')
  await panel.locator('[data-testid="setting-speed"]').selectOption('medium')
  await panel.getByRole('button', { name: 'Затвори' }).click()
  await expect(panel).toBeHidden()

  const observed = await page.evaluate(() => {
    const api = window.__tatematika!
    const scene = api.getGame().scene.getScene('GameScene') as any
    const state = api.getGameState()
    const saved = JSON.parse(localStorage.getItem('tatematika-kote-balonche-settings') || '{}')
    return {
      renderedBalloons: scene.balloonSprites.length as number,
      stateBalloons: state.balloons.length,
      stateCount: state.settings.balloonCount,
      savedSpeed: saved.balloonSpeed as string,
      liveSpeed: scene.balloonSpeed as number
    }
  })

  expect({
    renderedBalloons: observed.renderedBalloons,
    stateBalloons: observed.stateBalloons,
    stateCount: observed.stateCount,
    savedSpeed: observed.savedSpeed,
    liveSpeed: observed.liveSpeed
  }, 'closing settings after a resize must apply the balloon count and the medium balloon speed to the live round').toEqual({
    renderedBalloons: 4,
    stateBalloons: 4,
    stateCount: 4,
    savedSpeed: 'medium',
    liveSpeed: 50
  })
})

test('a correct pop shows confetti in the active scene', async ({ page }) => {
  test.setTimeout(multiRoundTestTimeout(1))
  await page.goto('/')
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  await waitIdle(page)

  await page.evaluate(() => {
    const scene = window.__tatematika!.getGame().scene.getScene('GameScene') as any
    const probe = () => {
      const game = window.__tatematika!.getGame()
      const active = game.scene.getScenes(true).map((entry: any) => entry.scene.key as string)
      let pieces = 0
      let emitters = 0
      for (const entry of game.scene.getScenes(true)) {
        for (const child of entry.children.list) {
          if (!child.visible || child.alpha < 0.05) continue
          const type = child.type || ''
          if (type === 'ParticleEmitter' || type === 'Particle') {
            emitters++
            continue
          }
          const w = child.displayWidth || child.width || 0
          const h = child.displayHeight || child.height || 0
          if (w >= 2 && h >= 2 && w <= 20 && h <= 20 && type !== 'Text') pieces++
        }
      }
      const dom = document.querySelectorAll('[data-testid*="confetti"], [data-confetti], .confetti').length
      return { pieces, emitters, dom, active }
    }
    ;(window as any).__confettiPeak = probe()
    scene.events.on('postupdate', () => {
      const sample = probe()
      const peak = (window as any).__confettiPeak
      if (sample.pieces + sample.emitters + sample.dom >= peak.pieces + peak.emitters + peak.dom) {
        ;(window as any).__confettiPeak = sample
      }
    })
  })

  const correctId = await page.evaluate(() => {
    return window.__tatematika!.getGameState().balloons.find((balloon: any) => balloon.isCorrect).id
  })
  const stars = await page.evaluate(() => window.__tatematika!.getGameState().stars)
  await clickBalloon(page, correctId)

  await expect.poll(async () => {
    const snap = await page.evaluate(() => ({
      phase: window.__tatematika!.getActionPhase(),
      stars: window.__tatematika!.getGameState().stars
    }))
    if (snap.phase === 'idle' && snap.stars === stars + 1) return 'popped'
    return `correct pop never finished (phase=${snap.phase}, stars=${snap.stars})`
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe('popped')

  const peak = await page.evaluate(() => (window as any).__confettiPeak)
  const seen = peak.emitters > 0 || peak.pieces >= 5 || peak.dom >= 5
  expect(
    seen,
    `a correct pop must show visible confetti in the active scene (pieces=${peak.pieces}, emitters=${peak.emitters}, dom=${peak.dom}, active=${peak.active.join(',')})`
  ).toBe(true)
})

// §4 rule 7 and the §5 table allow 5–20 correct balloons per level. Five pops here
// is that setting, not the default of 10 quoted in §6.
test('level end shows confetti and a dancing cat in the active scene', async ({ page }) => {
  test.setTimeout(multiRoundTestTimeout(6))
  await page.goto('/')
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  await waitIdle(page)

  await page.locator('[data-testid="button-settings"]').click()
  const panel = page.locator('[data-testid="settings-panel"]')
  await panel.locator('[data-testid="setting-correct-per-level"]').fill('5')
  await panel.getByRole('button', { name: 'Затвори' }).click()
  await expect(panel).toBeHidden()
  await waitIdle(page)

  await page.evaluate(() => {
    const scene = window.__tatematika!.getGame().scene.getScene('GameScene') as any
    ;(window as any).__celebration = []
    const onFrame = () => {
      const message = document.querySelector('[data-testid="level-complete-message"]') as HTMLElement | null
      if (!message || message.getClientRects().length === 0) return
      const now = scene.time.now as number
      const samples = (window as any).__celebration as Array<{ t: number }>
      const last = samples[samples.length - 1]
      if (last && now - last.t < 40) return
      const game = window.__tatematika!.getGame()
      const active = game.scene.getScenes(true).map((entry: any) => entry.scene.key)
      let pieces = 0
      let emitters = 0
      for (const entry of game.scene.getScenes(true)) {
        for (const child of entry.children.list) {
          if (!child.visible || child.alpha < 0.05) continue
          const type = child.type || ''
          if (type === 'ParticleEmitter' || type === 'Particle') {
            emitters++
            continue
          }
          const w = child.displayWidth || child.width || 0
          const h = child.displayHeight || child.height || 0
          if (w >= 2 && h >= 2 && w <= 20 && h <= 20 && type !== 'Text') pieces++
        }
      }
      const overlay = message.closest('div')?.parentElement
      let dom = document.querySelectorAll('[data-testid*="confetti"], [data-confetti], .confetti').length
      if (overlay) {
        for (const node of overlay.querySelectorAll('div, span, i')) {
          const box = (node as HTMLElement).getBoundingClientRect()
          if (box.width >= 2 && box.height >= 2 && box.width <= 20 && box.height <= 20) dom++
        }
      }
      samples.push({
        t: now,
        x: scene.catX,
        y: scene.catY,
        angle: scene.cat?.angle ?? 0,
        scaleY: scene.cat?.scaleY ?? 1,
        pieces,
        emitters,
        dom,
        active
      })
    }
    scene.events.on('postupdate', onFrame)
  })

  for (let round = 0; round < 5; round++) {
    await waitIdle(page)
    const correctId = await page.evaluate(() => {
      return window.__tatematika!.getGameState().balloons.find((balloon: any) => balloon.isCorrect).id
    })
    const stars = await page.evaluate(() => window.__tatematika!.getGameState().stars)
    await clickBalloon(page, correctId)
    if (round < 4) {
      await expect.poll(async () => {
        return page.evaluate(() => window.__tatematika!.getGameState().stars)
      }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(stars + 1)
    }
  }

  await expect.poll(async () => {
    const shown = await page.locator('[data-testid="level-complete-message"]').isVisible()
    if (shown) return 'shown'
    const stars = await page.evaluate(() => window.__tatematika!.getGameState().stars)
    return `level end never appeared (stars=${stars})`
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe('shown')

  await expect.poll(async () => {
    const span = await page.evaluate(() => {
      const samples = (window as any).__celebration as Array<{ t: number }>
      if (samples.length < 2) return 0
      return samples[samples.length - 1].t - samples[0].t
    })
    return span
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBeGreaterThan(400)

  const summary = await page.evaluate(() => {
    const samples = (window as any).__celebration as Array<{
      x: number
      y: number
      angle: number
      scaleY: number
      pieces: number
      emitters: number
      dom: number
      active: string[]
    }>
    const span = (pick: (sample: typeof samples[number]) => number) => {
      const values = samples.map(pick)
      return Math.max(...values) - Math.min(...values)
    }
    return {
      frames: samples.length,
      xRange: span(sample => sample.x),
      yRange: span(sample => sample.y),
      angleRange: span(sample => sample.angle),
      scaleRange: span(sample => sample.scaleY),
      pieces: Math.max(...samples.map(sample => sample.pieces)),
      emitters: Math.max(...samples.map(sample => sample.emitters)),
      dom: Math.max(...samples.map(sample => sample.dom)),
      active: samples[samples.length - 1].active
    }
  })

  const dancing = summary.yRange > 12 || summary.xRange > 12 || summary.angleRange > 0.15 || summary.scaleRange > 0.05
  const confetti = summary.emitters > 0 || summary.pieces >= 5 || summary.dom >= 5
  expect({
    activeScene: summary.active.includes('GameScene'),
    dancingCat: dancing,
    confetti
  }, `level end must show a dancing cat and visible confetti in the active scene (x=${summary.xRange.toFixed(1)}, y=${summary.yRange.toFixed(1)}, angle=${summary.angleRange.toFixed(2)}, scale=${summary.scaleRange.toFixed(2)}, pieces=${summary.pieces}, emitters=${summary.emitters}, dom=${summary.dom}, active=${summary.active.join(',')}, frames=${summary.frames})`).toEqual({
    activeScene: true,
    dancingCat: true,
    confetti: true
  })
})

test('default level end shows the same star count on the HUD, in state, and on the overlay', async ({ page }) => {
  // docs/games/kote-balonche.md §4 rule 7 and §6: a level is 10 correct balloons
  // by default, and the celebration says how many stars were collected.
  test.setTimeout(multiRoundTestTimeout(10))
  await page.goto('/')
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
  await waitIdle(page)

  const levelLength = await page.evaluate(() => window.__tatematika!.getGameState().settings.correctBalloonsPerLevel)
  expect(levelLength, 'a fresh game uses the spec default of 10 correct balloons per level').toBe(10)

  await page.evaluate((length: number) => {
    const scene = window.__tatematika!.getGame().scene.getScene('GameScene') as any
    ;(window as any).__hudAfterLastPop = null
    const read = () => {
      const label = scene.children.list.find((child: any) =>
        child.type === 'Text' && typeof child.text === 'string' && child.text.includes('⭐'))
      const match = label ? String(label.text).match(/(\d+)/) : null
      return {
        text: label ? String(label.text) : '',
        count: match ? Number(match[1]) : null
      }
    }
    scene.events.on('postupdate', () => {
      if ((window as any).__hudAfterLastPop) return
      if (scene.gameState.stars < length) return
      ;(window as any).__hudAfterLastPop = read()
    })
  }, levelLength)

  for (let pop = 1; pop < levelLength; pop++) {
    await waitIdle(page)
    const correctId = await page.evaluate(() => {
      return window.__tatematika!.getGameState().balloons.find((balloon: any) => balloon.isCorrect).id
    })
    await clickBalloon(page, correctId)
    await expect.poll(async () => {
      const stars = await page.evaluate(() => window.__tatematika!.getGameState().stars)
      const hud = await readHudStars(page)
      if (stars === pop && hud.visible && hud.count === pop) return 'counted'
      return `correct pop ${pop} must add exactly one star (state=${stars}, hud=${hud.text || 'missing'})`
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe('counted')
  }

  await waitIdle(page)
  const lastId = await page.evaluate(() => {
    return window.__tatematika!.getGameState().balloons.find((balloon: any) => balloon.isCorrect).id
  })
  await clickBalloon(page, lastId)

  await expect.poll(async () => {
    const shown = await page.locator('[data-testid="level-complete-message"]').isVisible()
    if (shown) return 'shown'
    const stars = await page.evaluate(() => window.__tatematika!.getGameState().stars)
    return `level end never appeared (stars=${stars})`
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe('shown')

  const hudAtEnd = await readHudStars(page)
  const hudAfterLastPop = await page.evaluate(() => (window as any).__hudAfterLastPop as { text: string; count: number | null })
  const stateStars = await page.evaluate(() => window.__tatematika!.getGameState().stars)
  const overlayText = (await page.locator('[data-testid="level-complete-message"]').innerText()).trim()
  const overlayCount = Number(overlayText.match(/(\d+)/)?.[1])

  expect(
    hudAtEnd.count,
    `HUD at level end (${hudAtEnd.text || 'missing'}) must equal the HUD right after the last pop (${hudAfterLastPop?.text || 'missing'})`
  ).toBe(hudAfterLastPop?.count)
  expect({
    hud: hudAtEnd.count,
    hudVisible: hudAtEnd.visible,
    state: stateStars,
    overlay: overlayCount
  }, `HUD "${hudAtEnd.text}", state ${stateStars}, and overlay "${overlayText}" must all equal the ${levelLength} accepted correct pops`).toEqual({
    hud: levelLength,
    hudVisible: true,
    state: levelLength,
    overlay: levelLength
  })
})
