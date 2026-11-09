import { test, expect } from '@playwright/test'
import { ACTION_TIMEOUT_MS, INIT_TIMEOUT_MS, multiRoundTestTimeout } from './test-timeouts'

/**
 * Finding 1 — docs/games/kote-balonche.md §4.5, §4.7, §6, К7.
 * A level is exactly N correct balloons, then the celebration. That screen
 * shows „Събра N звездички!“ and only „Още веднъж“ and „Към менюто“.
 * Gameplay input must not add another star or start another in-round sound.
 *
 * Finding 2 — §7 and К18. On resize the balloon body's width/height ratio
 * stays visually constant instead of stretching on one axis. 3% is the
 * band used here: the reported 387×381 → 301×381 change is about 22%,
 * and a 1px change on a ~380px body is under 1%.
 */

const RATIO_TOLERANCE = 0.03
const SETTLED_SCENE_MS = 4000

type Snapshot = {
  stars: number
  hud: string
  hudCount: number | null
  overlay: string
  sounds: number
  catX: number
  phase: string
}

type Body = {
  id: string
  formula: string
  width: number
  height: number
  aspect: number
}

async function waitReady(page: any) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForFunction(() => window.__tatematika !== undefined, { timeout: INIT_TIMEOUT_MS })
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

async function readSnapshot(page: any): Promise<Snapshot> {
  return page.evaluate(() => {
    const api = window.__tatematika!
    const scene = api.getGame().scene.getScene('GameScene') as any
    const state = api.getGameState()
    const label = scene.children.list.find((child: any) =>
      child.type === 'Text' && typeof child.text === 'string' && child.text.includes('⭐'))
    const hud = label ? String(label.text) : ''
    const match = hud.match(/(\d+)/)
    const message = document.querySelector('[data-testid="level-complete-message"]') as HTMLElement | null
    return {
      stars: state.stars,
      hud,
      hudCount: match ? Number(match[1]) : null,
      overlay: message ? (message.textContent || '').trim() : '',
      sounds: api.getSoundPlayCount(),
      catX: scene.getCatPosition().x,
      phase: api.getActionPhase()
    }
  })
}

async function sceneNow(page: any): Promise<number> {
  return page.evaluate(() => {
    const scene = window.__tatematika!.getGame().scene.getScene('GameScene') as any
    return scene.time.now as number
  })
}

async function playCorrectPops(page: any, pops: number) {
  for (let i = 0; i < pops; i++) {
    const before = await page.evaluate(() => window.__tatematika!.getGameState().stars)
    const correctId = await page.evaluate(() => {
      return window.__tatematika!.getGameState().balloons.find((balloon: any) => balloon.isCorrect).id
    })
    await clickBalloon(page, correctId)
    await expect.poll(async () => {
      return page.evaluate(() => window.__tatematika!.getGameState().stars)
    }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(before + 1)
  }
}

async function expectOverlay(page: any, stars: number) {
  const expected = `Събра ${stars} звездички!`
  await expect.poll(async () => {
    const message = page.locator('[data-testid="level-complete-message"]')
    if (!(await message.isVisible())) return 'hidden'
    return ((await message.innerText()) || '').trim()
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(expected)
}

async function sendGameplayInput(page: any) {
  await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null
    if (active && active !== document.body) active.blur()
  })
  const balloonId = await page.evaluate(() => window.__tatematika!.getGameState().balloons[0].id)
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
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Space')
  await page.mouse.click(point.x, point.y)
}

function describeDrift(before: Snapshot, after: Snapshot) {
  return [
    `stars ${before.stars} → ${after.stars}`,
    `HUD "${before.hud}" → "${after.hud}"`,
    `overlay "${before.overlay}" → "${after.overlay}"`,
    `sounds ${before.sounds} → ${after.sounds}`,
    `catX ${before.catX} → ${after.catX}`,
    `phase ${before.phase} → ${after.phase}`
  ].join('; ')
}

async function assertGameplayIgnored(page: any, stars: number) {
  const before = await readSnapshot(page)
  expect(before.stars, 'level is complete before the ignored input').toBe(stars)
  expect(before.hudCount, `HUD shows ⭐ ${stars} before the ignored input, saw "${before.hud}"`).toBe(stars)
  expect(before.overlay).toBe(`Събра ${stars} звездички!`)
  const started = await sceneNow(page)
  await sendGameplayInput(page)
  let after = before
  await expect.poll(async () => {
    after = await readSnapshot(page)
    if ((await sceneNow(page)) - started >= SETTLED_SCENE_MS) return 'settled'
    return 'waiting'
  }, {
    timeout: ACTION_TIMEOUT_MS,
    intervals: [50],
    message: 'scene time did not advance while the level-complete overlay was open'
  }).toBe('settled')

  const drift = describeDrift(before, after)
  expect(after.stars, `no star is added while „Ти успя!“ is open (${drift})`).toBe(before.stars)
  expect(after.hud, `HUD stays ⭐ ${stars} while the overlay is open (${drift})`).toBe(before.hud)
  expect(after.hudCount, `HUD star count stays ${stars} (${drift})`).toBe(stars)
  expect(after.overlay, `overlay text stays „Събра ${stars} звездички!“ (${drift})`).toBe(before.overlay)
  expect(after.sounds, `no new sound while the overlay is open (${drift})`).toBe(before.sounds)
  expect(after.catX, `cat stays put while the overlay is open (${drift})`).toBe(before.catX)
  expect(after.phase, `no walk, jump, or landing starts under the overlay (${drift})`).toBe('idle')
}

async function installRoundRng(page: any, seed: number) {
  await page.evaluate((s: number) => {
    let state = s
    const roundRng = () => {
      state |= 0
      state = state + 0x6D2B79F5 | 0
      let t = Math.imul(state ^ state >>> 15, 1 | state)
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
      return ((t ^ t >>> 14) >>> 0) / 4294967296
    }
    window.__tatematika!.setRoundRng!(roundRng)
  }, seed)
}

async function setUpperLimit(page: any, upperLimit: number, seed: number) {
  await page.evaluate(() => window.__tatematika!.openSettings())
  await installRoundRng(page, seed)
  await page.locator('[data-testid="setting-upper-limit"]').fill(String(upperLimit))
  await page.getByRole('button', { name: 'Затвори' }).click()
  await expect.poll(async () => {
    const state = await page.evaluate(() => {
      const api = window.__tatematika!
      return {
        phase: api.getActionPhase(),
        upper: api.getGameState().settings.upperLimit,
        count: api.getGameState().balloons.length
      }
    })
    if (state.phase === 'idle' && state.upper === upperLimit && state.count > 0) return 'ready'
    return `phase=${state.phase} upper=${state.upper} balloons=${state.count}`
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe('ready')
}

async function measureBodies(page: any): Promise<Body[]> {
  return page.evaluate(() => {
    const scene = window.__tatematika!.getGame().scene.getScene('GameScene') as any
    const balloons = window.__tatematika!.getGameState().balloons as Array<{ id: string; formula: string }>
    return balloons.map(balloon => {
      const bounds = scene.getBalloonBounds(balloon.id)
      return {
        id: balloon.id,
        formula: balloon.formula,
        width: bounds.width,
        height: bounds.height,
        aspect: bounds.width / bounds.height
      }
    })
  })
}

function formatBodies(bodies: Body[]) {
  return bodies.map(body =>
    `${body.formula} ${body.width.toFixed(1)}×${body.height.toFixed(1)} aspect ${body.aspect.toFixed(3)}`
  ).join('; ')
}

function spread(values: number[]) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  return min === 0 ? Infinity : (max - min) / min
}

async function assertBodiesStable(before: Body[], after: Body[], label: string) {
  expect(after.length, `${label}: balloon count ${before.length} → ${after.length}`).toBe(before.length)
  for (const next of after) {
    const prev = before.find(body => body.id === next.id)
    expect(prev, `${label}: balloon ${next.id} (${next.formula}) was replaced`).toBeTruthy()
    const ratioChange = Math.abs(next.aspect - prev!.aspect) / prev!.aspect
    expect.soft(
      ratioChange,
      `${label}: ${next.formula} ${prev!.width.toFixed(1)}×${prev!.height.toFixed(1)} aspect ${prev!.aspect.toFixed(3)} → ${next.width.toFixed(1)}×${next.height.toFixed(1)} aspect ${next.aspect.toFixed(3)} (${(ratioChange * 100).toFixed(1)}% change, limit ${(RATIO_TOLERANCE * 100).toFixed(0)}%). Round before: ${formatBodies(before)}. Round after: ${formatBodies(after)}`
    ).toBeLessThanOrEqual(RATIO_TOLERANCE)
  }
  const widthSpread = spread(after.map(body => body.width))
  const heightSpread = spread(after.map(body => body.height))
  expect.soft(
    widthSpread,
    `${label}: balloon widths differ by ${(widthSpread * 100).toFixed(1)}% (${formatBodies(after)})`
  ).toBeLessThanOrEqual(RATIO_TOLERANCE)
  expect.soft(
    heightSpread,
    `${label}: balloon heights differ by ${(heightSpread * 100).toFixed(1)}% (${formatBodies(after)})`
  ).toBeLessThanOrEqual(RATIO_TOLERANCE)
}

test('level-complete overlay ignores gameplay input, then „Още веднъж“ starts a fresh level', async ({ page }) => {
  test.setTimeout(multiRoundTestTimeout(12))
  await waitReady(page)

  const goal = await page.evaluate(() => window.__tatematika!.getGameState().settings.correctBalloonsPerLevel)
  expect(goal, 'default level length is 10 correct balloons').toBe(10)
  await playCorrectPops(page, goal)
  await expectOverlay(page, goal)
  await assertGameplayIgnored(page, goal)

  await page.locator('[data-testid="button-play-again"]').click()
  await expect.poll(async () => {
    const message = page.locator('[data-testid="level-complete-message"]')
    const visible = await message.isVisible()
    const stars = await page.evaluate(() => window.__tatematika!.getGameState().stars)
    const phase = await page.evaluate(() => window.__tatematika!.getActionPhase())
    if (!visible && stars === 0 && phase === 'idle') return 'fresh'
    return `visible=${visible} stars=${stars} phase=${phase}`
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe('fresh')

  const correctId = await page.evaluate(() => {
    return window.__tatematika!.getGameState().balloons.find((balloon: any) => balloon.isCorrect).id
  })
  await clickBalloon(page, correctId)
  await expect.poll(async () => {
    return page.evaluate(() => window.__tatematika!.getGameState().stars)
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(1)
})

test('short level overlay ignores gameplay input, then „Към менюто“ leaves the celebration', async ({ page }) => {
  test.setTimeout(multiRoundTestTimeout(8))
  await waitReady(page)

  await page.evaluate(() => window.__tatematika!.openSettings())
  await page.locator('[data-testid="setting-correct-per-level"]').fill('5')
  await page.getByRole('button', { name: 'Затвори' }).click()
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.__tatematika!.getGameState())
    return state.settings.correctBalloonsPerLevel === 5 && state.stars === 0 ? 'ready' : 'waiting'
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe('ready')

  await playCorrectPops(page, 5)
  await expectOverlay(page, 5)
  await assertGameplayIgnored(page, 5)

  await page.locator('[data-testid="button-to-menu"]').click()
  await expect.poll(async () => {
    const message = page.locator('[data-testid="level-complete-message"]')
    const visible = await message.isVisible()
    const state = await page.evaluate(() => {
      const api = window.__tatematika!
      return {
        stars: api.getGameState().stars,
        balloons: api.getGameState().balloons.length,
        phase: api.getActionPhase()
      }
    })
    if (!visible && state.stars === 0 && state.balloons > 0 && state.phase === 'idle') return 'playing'
    return `visible=${visible} stars=${state.stars} balloons=${state.balloons} phase=${state.phase}`
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe('playing')

  const correctId = await page.evaluate(() => {
    return window.__tatematika!.getGameState().balloons.find((balloon: any) => balloon.isCorrect).id
  })
  await clickBalloon(page, correctId)
  await expect.poll(async () => {
    return page.evaluate(() => window.__tatematika!.getGameState().stars)
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(1)
})

test('K18 balloon proportions stay constant across a shrink and a grow at upper bounds 10 and 20', async ({ page }) => {
  test.setTimeout(multiRoundTestTimeout(6))
  await waitReady(page)

  const viewports = [
    { width: 1280, height: 800, label: '1280×800' },
    { width: 1024, height: 768, label: '1024×768 shrink' },
    { width: 1600, height: 900, label: '1600×900 grow' }
  ]

  for (const upperLimit of [10, 20]) {
    let bodies: Body[] = []
    let found = false
    for (let seed = 1; seed <= 20; seed++) {
      await setUpperLimit(page, upperLimit, seed * 1000 + upperLimit)
      await page.setViewportSize(viewports[0])
      await expect.poll(async () => {
        return page.evaluate(() => window.__tatematika!.getGame().scale.width)
      }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(viewports[0].width)
      bodies = await measureBodies(page)
      const needsTwoDigits = upperLimit === 20
      if (!needsTwoDigits || bodies.some(body => /\d{2}/.test(body.formula))) {
        found = true
        break
      }
    }
    expect(
      found,
      `upper bound ${upperLimit} produced a round to measure (${formatBodies(bodies)})`
    ).toBe(true)
    if (upperLimit === 20) {
      expect(
        bodies.some(body => /\d{2}/.test(body.formula)),
        `upper bound 20 includes a two-digit operand (${formatBodies(bodies)})`
      ).toBe(true)
    }

    let previous = bodies
    for (const viewport of viewports.slice(1)) {
      const widthBefore = await page.evaluate(() => window.__tatematika!.getGame().scale.width)
      await page.setViewportSize(viewport)
      await expect.poll(async () => {
        return page.evaluate(() => window.__tatematika!.getGame().scale.width)
      }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(viewport.width)
      const widthAfter = await page.evaluate(() => window.__tatematika!.getGame().scale.width)
      expect(widthAfter, `${viewport.label} must resize the running game`).not.toBe(widthBefore)
      const next = await measureBodies(page)
      await assertBodiesStable(previous, next, `upper ${upperLimit} after ${viewport.label}`)
      previous = next
    }
  }
})
