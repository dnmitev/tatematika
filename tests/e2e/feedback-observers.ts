import { expect, Page } from '@playwright/test'
import { ACTION_TIMEOUT_MS } from './test-timeouts'

/**
 * Balloon frames sampled from the live Phaser sprite (via getGame()).
 * instanceId is the sprite object, not the logical balloon id.
 * getBalloonFrame is a type stub only and is not called: a missing hook
 * must not be the failure. Colour is the first body fill, not the tint.
 */
export type BalloonSample = {
  frame: number
  id: string
  instanceId: string
  visible: boolean
  alpha: number
  color: number | null
  tint: number
  stroke: number | null
  popping: boolean
  bouncing: boolean
}

export type AnswerWatch = {
  samples: BalloonSample[]
  frames: number
  texts: string[]
  maxCorrectIcons: number
  maxWrongIcons: number
  maxIcons: number
  sound: string | null
  muted: boolean
  sawBounce: boolean
  stateBefore: GameSnapshot
  stateAfter: GameSnapshot
}

export type GameSnapshot = {
  target: number
  stars: number
  wrongAttempts: number
  balloonIds: string[]
  correctBalloonsPerLevel: number
  levelEndText: string | null
}

export type TopPanelReading = {
  instructionFound: boolean
  targetInPanel: number | null
  targetFontCss: number | null
  formulasOnBalloons: boolean
  formulaMovedIntoPanel: boolean
  balloonOverlapsPanel: boolean
  catOverlapsPanel: boolean
  feedbackOverlapsPanel: boolean
}

const ALPHA_TOLERANCE = 0.02

const PRAISE = ['Браво!', 'Супер!', 'Точно така!']
const WRONG_SENTENCE = 'Опа! Опитай пак!'

export function hexColor(n: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return 'null'
  return '#' + (n >>> 0).toString(16).padStart(6, '0')
}

/** Stability of visibility, alpha, sprite instance, body colour and tint. Position is ignored. */
export function describeBalloonStability(samples: BalloonSample[], label: string): string[] {
  const problems: string[] = []
  const frameCount = new Set(samples.map(s => s.frame)).size
  if (frameCount < 2) {
    problems.push(`${label}: only ${frameCount} frames sampled`)
    return problems
  }

  const byId = new Map<string, BalloonSample[]>()
  for (const sample of samples) {
    const list = byId.get(sample.id) ?? []
    list.push(sample)
    byId.set(sample.id, list)
  }
  if (byId.size === 0) {
    problems.push(`${label}: no balloons were on screen`)
    return problems
  }

  for (const [id, list] of byId) {
    if (list.length < 2) continue
    const bits: string[] = []
    const instances = new Set(list.map(s => s.instanceId))
    if (instances.size !== 1) {
      bits.push(`${instances.size} sprite instances across ${list.length} frames (expected the same object)`)
    }
    const colors = new Set(list.map(s => s.color))
    if (colors.size !== 1) {
      const shown = [...colors].slice(0, 8).map(hexColor).join(', ')
      bits.push(`body colour changed (${colors.size} colours: ${shown})`)
    }
    const tints = new Set(list.map(s => s.tint))
    if (tints.size !== 1) {
      bits.push(`tint changed (${[...tints].map(hexColor).join(', ')})`)
    }
    if (!list.some(s => s.popping)) {
      const alphas = list.map(s => s.alpha)
      const min = Math.min(...alphas)
      const max = Math.max(...alphas)
      if (max - min > ALPHA_TOLERANCE) {
        bits.push(`alpha changed from ${min.toFixed(3)} to ${max.toFixed(3)}`)
      }
      let transitions = 0
      for (let i = 1; i < list.length; i++) {
        if (list[i].visible !== list[i - 1].visible) transitions++
      }
      if (transitions > 1 || (transitions === 1 && !list[0].visible)) {
        bits.push(`visibility flickered (${transitions} changes)`)
      }
    }
    if (bits.length > 0) problems.push(`${label}: ${id}: ${bits.join('; ')}`)
  }
  return problems
}

type SamplerMode = 'idle' | 'walk' | 'answer'

async function runSampler(page: Page, options: {
  mode: SamplerMode
  ms?: number
  balloonId?: string
  spamWhenJumping?: boolean
  extraMsAfter?: number
}): Promise<AnswerWatch> {
  return page.evaluate(async (options) => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const tokens = new WeakMap<object, string>()
    let nextToken = 0
    const samples: BalloonSample[] = []
    const texts = new Set<string>()
    let frame = 0
    let maxCorrectIcons = 0
    let maxWrongIcons = 0
    let maxIcons = 0

    const tokenOf = (obj: object) => {
      let id = tokens.get(obj)
      if (!id) {
        nextToken += 1
        id = `s${nextToken}`
        tokens.set(obj, id)
      }
      return id
    }

    const readPaint = (buffer: ArrayLike<number> | null | undefined) => {
      let color: number | null = null
      let stroke: number | null = null
      if (!buffer) return { color, stroke }
      let i = 0
      while (i < buffer.length) {
        const cmd = buffer[i]
        // Skip the default fill/stroke (alpha 0). The body colour is the first
        // visible fill; it changes when the sprite is rebuilt with Math.random.
        if (cmd === 7 && color === null && buffer[i + 2] > 0) color = buffer[i + 1]
        if (cmd === 6 && stroke === null && buffer[i + 3] > 0) stroke = buffer[i + 2]
        if (cmd === 0) i += 8
        else if (cmd === 3) i += 5
        else if (cmd === 4 || cmd === 5) i += 3
        else if (cmd === 6) i += 4
        else if (cmd === 7) i += 3
        else if (cmd === 10 || cmd === 11) i += 7
        else if (cmd === 16 || cmd === 17) i += 3
        else if (cmd === 18) i += 2
        else if (cmd === 21) i += 9
        else if (cmd === 22) i += 7
        else i += 1
        if (color !== null && stroke !== null) break
      }
      return { color, stroke }
    }

    const norm = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim()

    const elementNamed = (el: Element, name: string) => {
      const aria = norm(el.getAttribute('aria-label'))
      const alt = norm(el.getAttribute('alt'))
      const title = norm(el.getAttribute('title'))
      let own = ''
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) own += node.textContent ?? ''
      }
      own = norm(own)
      return aria === name || alt === name || title === name || own === name
    }

    const countNamed = (name: string) => {
      let count = 0
      for (const el of document.body.querySelectorAll('*')) {
        if (!elementNamed(el, name)) continue
        let ancestor = false
        let parent = el.parentElement
        while (parent && parent !== document.body) {
          if (elementNamed(parent, name)) {
            ancestor = true
            break
          }
          parent = parent.parentElement
        }
        if (!ancestor) count++
      }
      return count
    }

    const shown = (el: Element) => {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
      if (el.classList.contains('screen-reader-only')) return false
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return false
      if (rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth) return false
      return true
    }

    const collectTexts = () => {
      const walk = (list: any[]) => {
        for (const child of list || []) {
          if (child?.type === 'Text' && child.visible && child.alpha > 0.01) {
            const value = norm(String(child.text ?? ''))
            if (value) texts.add(value)
          }
          if (child?.list) walk(child.list)
        }
      }
      walk(scene.children?.list || [])
      for (const el of document.body.querySelectorAll('*')) {
        if (!shown(el)) continue
        let own = ''
        for (const node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) own += node.textContent ?? ''
        }
        own = norm(own)
        if (own) texts.add(own)
      }
    }

    const record = () => {
      frame += 1
      const list = scene.balloonSprites || []
      for (const balloon of list) {
        const sprite = balloon?.sprite
        if (!sprite) continue
        const paint = readPaint(sprite.commandBuffer)
        samples.push({
          frame,
          id: String(balloon.id),
          instanceId: tokenOf(sprite),
          visible: sprite.visible !== false,
          alpha: typeof sprite.alpha === 'number' ? sprite.alpha : 1,
          color: paint.color,
          tint: sprite.tintTopLeft ?? sprite.tint ?? 0xffffff,
          stroke: paint.stroke,
          popping: !!balloon.isPopping,
          bouncing: !!balloon.isBouncing
        })
      }
      collectTexts()
      const correctIcons = countNamed('Вярно')
      const wrongIcons = countNamed('Грешно')
      maxCorrectIcons = Math.max(maxCorrectIcons, correctIcons)
      maxWrongIcons = Math.max(maxWrongIcons, wrongIcons)
      maxIcons = Math.max(maxIcons, correctIcons + wrongIcons)
    }

    const snapshot = (): GameSnapshot => {
      const state = window.__tatematika!.getGameState()
      return {
        target: state.target,
        stars: state.stars,
        wrongAttempts: state.wrongAttempts,
        balloonIds: state.balloons.map(b => b.id),
        correctBalloonsPerLevel: state.settings.correctBalloonsPerLevel,
        levelEndText: window.__tatematika!.getLevelEndText()
      }
    }

    const stateBefore = snapshot()
    const clicked = options.balloonId
      ? window.__tatematika!.getGameState().balloons.find(balloon => balloon.id === options.balloonId)
      : undefined
    // A correct pop awards the star only after the balloon finishes popping.
    // Spam clicks during the jump increment wrongAttempts immediately, so that
    // counter must not end the sample before the star exists.
    const awaitStar = !!clicked?.isCorrect
    const started = performance.now()
    let evaluatedAt = 0
    let spamCount = 0
    let walked = false
    const catStart = window.__tatematika!.getCatPosition().x

    await new Promise<void>((resolve) => {
      const onFrame = () => {
        try {
          record()
          if (options.mode === 'walk' && frame % 3 === 1) {
            window.__tatematika!.pressKey(walked ? 'left' : 'right')
          }
          const catX = window.__tatematika!.getCatPosition().x
          if (catX !== catStart) walked = true
          if (options.mode === 'answer' && options.spamWhenJumping && spamCount < 6) {
            const jumping = window.__tatematika!.getCatJumpState().isJumping
            if (jumping) {
              spamCount += 1
              const state = window.__tatematika!.getGameState()
              for (const balloon of state.balloons) {
                window.__tatematika!.clickBalloon(balloon.id)
              }
            }
          }
        } catch {
          // keep sampling if one frame throws
        }
        const elapsed = performance.now() - started
        if (options.mode === 'answer') {
          const state = window.__tatematika!.getGameState()
          const jumping = window.__tatematika!.getCatJumpState().isJumping
          const evaluated = awaitStar
            ? state.stars !== stateBefore.stars
            : state.stars !== stateBefore.stars || state.wrongAttempts !== stateBefore.wrongAttempts
          if (evaluated && evaluatedAt === 0) evaluatedAt = performance.now()
          // Wrong attempts increment when the jump starts. Keep sampling until
          // the cat is back at rest so the feedback window includes that rest.
          const settled = evaluatedAt > 0
            && !jumping
            && performance.now() - evaluatedAt >= (options.extraMsAfter ?? 1000)
          if (settled || elapsed > 20000) {
            scene.events.off('postupdate', onFrame)
            resolve()
          }
        } else if (elapsed >= (options.ms ?? 1000)) {
          scene.events.off('postupdate', onFrame)
          resolve()
        }
      }
      scene.events.on('postupdate', onFrame)
      if (options.mode === 'answer' && options.balloonId) {
        window.__tatematika!.clickBalloon(options.balloonId)
      }
      if (options.mode === 'walk') {
        window.__tatematika!.pressKey('right')
      }
    })

    const stateAfter = snapshot()
    return {
      samples,
      frames: frame,
      texts: [...texts],
      maxCorrectIcons,
      maxWrongIcons,
      maxIcons,
      sound: window.__tatematika!.getLastPlayedSound(),
      muted: window.__tatematika!.isMuted(),
      sawBounce: samples.some(s => s.bouncing),
      stateBefore,
      stateAfter
    }
  }, options)
}

export async function sampleIdleBalloons(page: Page, ms = 1000): Promise<AnswerWatch> {
  return runSampler(page, { mode: 'idle', ms })
}

export async function sampleWalkingBalloons(page: Page, ms = 1000): Promise<AnswerWatch> {
  return runSampler(page, { mode: 'walk', ms })
}

export async function watchBalloonAnswer(page: Page, balloonId: string, spamWhenJumping = false): Promise<AnswerWatch> {
  return runSampler(page, { mode: 'answer', balloonId, spamWhenJumping, extraMsAfter: 1000 })
}

export async function waitUntilCatIdle(page: Page): Promise<void> {
  await expect.poll(async () => {
    const jump = await page.evaluate(() => window.__tatematika!.getCatJumpState())
    return !jump.isJumping
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
}

export async function balloonId(page: Page, which: 'correct' | 'wrong'): Promise<string> {
  const id = await page.evaluate((which) => {
    const state = window.__tatematika!.getGameState()
    const cat = window.__tatematika!.getCatPosition()
    const choices = state.balloons.filter(b => which === 'correct' ? b.isCorrect : !b.isCorrect)
    let best = choices[0]
    let bestDistance = Infinity
    for (const balloon of choices) {
      const bounds = window.__tatematika!.getBalloonBounds(balloon.id)
      if (!bounds) continue
      const distance = Math.abs(bounds.x + bounds.width / 2 - cat.x)
      if (distance < bestDistance) {
        bestDistance = distance
        best = balloon
      }
    }
    return best?.id ?? null
  }, which)
  expect(id, `a ${which} balloon must exist before the action`).toBeTruthy()
  return id as string
}

export function textsInclude(texts: string[], phrase: string): boolean {
  return texts.some(text => text.includes(phrase))
}

export function visiblePraise(texts: string[]): string[] {
  return PRAISE.filter(praise => textsInclude(texts, praise))
}

export function visibleWrongSentence(texts: string[]): boolean {
  return textsInclude(texts, WRONG_SENTENCE)
}

const OPA_SOUNDS = ['meow', 'опа', 'opa', 'Опа', 'oops']

export function opaSoundPlayed(sound: string | null, muted: boolean): boolean {
  return !muted && !!sound && OPA_SOUNDS.includes(sound)
}

export async function readTopPanel(page: Page): Promise<TopPanelReading> {
  return page.evaluate(() => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const state = window.__tatematika!.getGameState()
    const canvas = document.querySelector('canvas')!
    const canvasRect = canvas.getBoundingClientRect()
    const scale = canvasRect.width / game.scale.width

    const norm = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim()
    const texts: Array<{ text: string, left: number, top: number, right: number, bottom: number, fontCss: number }> = []
    const walk = (list: any[]) => {
      for (const child of list || []) {
        if (child?.type === 'Text' && child.visible && child.alpha > 0.01) {
          const bounds = child.getBounds()
          const fontRaw = child.style?.fontSize
          const fontPx = typeof fontRaw === 'string' ? parseFloat(fontRaw) : Number(fontRaw)
          texts.push({
            text: norm(String(child.text ?? '')),
            left: bounds.x,
            top: bounds.y,
            right: bounds.x + bounds.width,
            bottom: bounds.y + bounds.height,
            fontCss: (Number.isFinite(fontPx) ? fontPx : bounds.height) * scale
          })
        }
        if (child?.list) walk(child.list)
      }
    }
    walk(scene.children?.list || [])

    const shown = (el: Element) => {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
      if (el.classList.contains('screen-reader-only')) return false
      const rect = el.getBoundingClientRect()
      return rect.width >= 2 && rect.height >= 2 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth
    }
    for (const el of document.body.querySelectorAll('*')) {
      if (!shown(el)) continue
      let own = ''
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) own += node.textContent ?? ''
      }
      own = norm(own)
      if (!own.includes('Намери сметката за') && own !== String(state.target)) continue
      const rect = el.getBoundingClientRect()
      const fontPx = parseFloat(getComputedStyle(el).fontSize)
      texts.push({
        text: own,
        left: (rect.left - canvasRect.left) / scale,
        top: (rect.top - canvasRect.top) / scale,
        right: (rect.right - canvasRect.left) / scale,
        bottom: (rect.bottom - canvasRect.top) / scale,
        fontCss: Number.isFinite(fontPx) ? fontPx : rect.height
      })
    }

    const instruction = texts.find(text => text.text.includes('Намери сметката за'))
    let targetInPanel: number | null = null
    let targetFontCss: number | null = null
    if (instruction) {
      if (instruction.text.includes(String(state.target))) {
        targetInPanel = state.target
        targetFontCss = instruction.fontCss
      }
      const nearby = texts.find(text => {
        if (text === instruction) return false
        if (text.text !== String(state.target)) return false
        const vertical = Math.abs(text.top - instruction.top) <= Math.max(instruction.bottom - instruction.top, 48) * 2
        return vertical && text.bottom <= instruction.bottom + 80
      })
      if (nearby) {
        targetInPanel = state.target
        targetFontCss = nearby.fontCss
      }
    }

    const formulas = state.balloons.map(b => b.formula)
    const formulasOnBalloons = (scene.balloonSprites || []).length > 0 && (scene.balloonSprites || []).every((balloon: any) => {
      const value = norm(String(balloon.text?.text ?? ''))
      return balloon.text?.visible !== false && formulas.includes(value)
    })
    const formulaMovedIntoPanel = !!instruction && formulas.some(formula => instruction.text.includes(formula))

    const panel = instruction
      ? {
          left: instruction.left,
          top: instruction.top,
          right: targetInPanel === null ? instruction.right : Math.max(instruction.right, ...texts.filter(t => t.text === String(state.target)).map(t => t.right)),
          bottom: instruction.bottom
        }
      : null
    const overlaps = (bounds: { x: number, y: number, width: number, height: number } | null) => {
      if (!panel || !bounds) return false
      const right = bounds.x + bounds.width
      const bottom = bounds.y + bounds.height
      return bounds.x < panel.right && right > panel.left && bounds.y < panel.bottom && bottom > panel.top
    }

    let balloonOverlapsPanel = false
    for (const balloon of scene.balloonSprites || []) {
      if (balloon?.sprite?.getBounds && overlaps(balloon.sprite.getBounds())) balloonOverlapsPanel = true
    }
    const catBounds = scene.cat?.getBounds ? scene.cat.getBounds() : null
    const catOverlapsPanel = overlaps(catBounds)
    let feedbackOverlapsPanel = false
    for (const text of texts) {
      const feedback = text.text.includes('Опа!') || text.text.includes('Браво') || text.text.includes('Супер') || text.text.includes('Точно така') || text.text === 'Вярно' || text.text === 'Грешно'
      if (!feedback || !panel) continue
      const bounds = { x: text.left, y: text.top, width: text.right - text.left, height: text.bottom - text.top }
      if (overlaps(bounds)) feedbackOverlapsPanel = true
    }

    return {
      instructionFound: !!instruction,
      targetInPanel,
      targetFontCss,
      formulasOnBalloons,
      formulaMovedIntoPanel,
      balloonOverlapsPanel,
      catOverlapsPanel,
      feedbackOverlapsPanel
    }
  })
}

export type CatFrame = { signature: string, alpha: number, visible: boolean }

export function describeCatFrames(frames: CatFrame[], label: string): string[] {
  const problems: string[] = []
  if (frames.length < 2) {
    problems.push(`${label}: only ${frames.length} cat frames sampled`)
    return problems
  }
  const alphas = frames.map(frame => frame.alpha)
  const min = Math.min(...alphas)
  const max = Math.max(...alphas)
  if (max - min > ALPHA_TOLERANCE) {
    problems.push(`${label}: cat alpha changed from ${min.toFixed(3)} to ${max.toFixed(3)}`)
  }
  let transitions = 0
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].visible !== frames[i - 1].visible) transitions++
  }
  if (transitions > 0) {
    problems.push(`${label}: cat visibility flickered (${transitions} changes)`)
  }
  const unique = new Set(frames.map(frame => frame.signature))
  if (unique.size < 2) {
    problems.push(`${label}: cat appearance stayed the same across ${frames.length} frames (expected a smooth GIF, sprite sheet, or native Phaser animation from a local resource)`)
  }
  return problems
}

async function sampleCat(page: Page, mode: 'idle' | 'walk' | 'jump' | 'landing' | 'correct' | 'wrong'): Promise<CatFrame[]> {
  return page.evaluate(async (mode) => {
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const frames: CatFrame[] = []

    const signatureOf = (cat: any, ox: number, oy: number) => {
      const parts: string[] = []
      if (cat.texture?.key && cat.texture.key !== '__DEFAULT' && cat.texture.key !== '__MISSING') {
        parts.push('tex', String(cat.texture.key), String(cat.frame?.name ?? ''))
      }
      if (cat.anims?.currentFrame) {
        parts.push('anim', String(cat.anims.currentAnim?.key ?? ''), String(cat.anims.currentFrame.index))
      }
      const buffer = cat.commandBuffer as ArrayLike<number> | undefined
      if (buffer && buffer.length) {
        let i = 0
        const rel = (x: number, y: number) => {
          parts.push(String(Math.round(x - ox)), String(Math.round(y - oy)))
        }
        while (i < buffer.length) {
          const cmd = buffer[i]
          if (cmd === 0) {
            rel(buffer[i + 1], buffer[i + 2])
            parts.push('r', String(Math.round(buffer[i + 3])))
            i += 8
          } else if (cmd === 4 || cmd === 5) {
            rel(buffer[i + 1], buffer[i + 2])
            i += 3
          } else if (cmd === 6) {
            parts.push('L', String(buffer[i + 1]), String(buffer[i + 2]))
            i += 4
          } else if (cmd === 7) {
            parts.push('F', String(buffer[i + 1]))
            i += 3
          } else if (cmd === 10 || cmd === 11) {
            rel(buffer[i + 1], buffer[i + 2])
            rel(buffer[i + 3], buffer[i + 4])
            rel(buffer[i + 5], buffer[i + 6])
            i += 7
          } else if (cmd === 3) {
            rel(buffer[i + 1], buffer[i + 2])
            parts.push(String(Math.round(buffer[i + 3])), String(Math.round(buffer[i + 4])))
            i += 5
          } else {
            i += 1
          }
        }
      }
      const scaleX = Math.round((cat.scaleX ?? 1) * 100)
      const scaleY = Math.round((cat.scaleY ?? 1) * 100)
      parts.push('s', String(scaleX), String(scaleY))
      return parts.join(',')
    }

    const push = () => {
      const cat = scene.cat
      if (!cat) return
      const pos = window.__tatematika!.getCatPosition()
      frames.push({
        signature: signatureOf(cat, pos.x, pos.y),
        alpha: typeof cat.alpha === 'number' ? cat.alpha : 1,
        visible: cat.visible !== false
      })
    }

    const choose = (which: 'correct' | 'wrong') => {
      const state = window.__tatematika!.getGameState()
      const cat = window.__tatematika!.getCatPosition()
      const choices = state.balloons.filter(b => which === 'correct' ? b.isCorrect : !b.isCorrect)
      let best = choices[0]
      let bestDistance = Infinity
      for (const balloon of choices) {
        const bounds = window.__tatematika!.getBalloonBounds(balloon.id)
        if (!bounds) continue
        const distance = Math.abs(bounds.x + bounds.width / 2 - cat.x)
        if (distance < bestDistance) {
          bestDistance = distance
          best = balloon
        }
      }
      return best?.id
    }

    if (mode === 'jump' || mode === 'landing' || mode === 'correct' || mode === 'wrong') {
      const id = choose(mode === 'correct' ? 'correct' : 'wrong')
      if (id) window.__tatematika!.clickBalloon(id)
    } else if (mode === 'walk') {
      window.__tatematika!.pressKey('right')
    }

    const started = performance.now()
    let sawJump = false
    let sawFeedback = false
    let landings = 0
    await new Promise<void>((resolve) => {
      const onFrame = () => {
        const jumping = window.__tatematika!.getCatJumpState().isJumping
        const pos = window.__tatematika!.getCatPosition()
        if (jumping) sawJump = true
        let feedbackOn = false
        if (mode === 'correct' || mode === 'wrong') {
          for (const child of scene.children?.list || []) {
            if (child?.type === 'Text' && child.visible && child.alpha > 0.01) {
              const value = String(child.text ?? '')
              if (/Браво|Супер|Точно така|Опа/.test(value)) {
                feedbackOn = true
                sawFeedback = true
              }
            }
          }
        }
        const keep =
          mode === 'idle' ||
          mode === 'walk' ||
          (mode === 'jump' && jumping) ||
          (mode === 'landing' && sawJump && !jumping) ||
          ((mode === 'correct' || mode === 'wrong') && feedbackOn)
        if (keep) {
          if (mode === 'landing' && sawJump && !jumping) landings += 1
          if (mode !== 'landing' || landings > 0) push()
        }
        if (mode === 'walk' && Math.floor((performance.now() - started) / 100) % 2 === 0) {
          window.__tatematika!.pressKey(pos.x < game.scale.width / 2 ? 'right' : 'left')
        }
        const elapsed = performance.now() - started
        const done =
          (mode === 'idle' || mode === 'walk') ? elapsed >= 1000 :
          mode === 'landing' ? (landings >= 4 || elapsed >= 8000) :
          mode === 'jump' ? ((sawJump && !jumping && frames.length >= 2) || elapsed >= 8000) :
          ((sawFeedback && !feedbackOn && frames.length >= 2) || elapsed >= 8000)
        if (done) {
          scene.events.off('postupdate', onFrame)
          resolve()
        }
      }
      scene.events.on('postupdate', onFrame)
    })

    if (mode === 'walk') {
      // Appearance during the walk, not a speed threshold.
      return frames
    }
    if (mode === 'landing') return frames.slice(0, 12)
    return frames
  }, mode)
}

export async function sampleCatPhase(page: Page, mode: 'idle' | 'walk' | 'jump' | 'landing' | 'correct' | 'wrong'): Promise<CatFrame[]> {
  return sampleCat(page, mode)
}

export async function externalCatAssets(page: Page, requestUrls: string[]): Promise<string[]> {
  const fromGame = await page.evaluate(() => {
    const urls: string[] = []
    const game = window.__tatematika!.getGame()
    const scene = game.scene.getScene('GameScene') as any
    const cat = scene.cat
    const src = cat?.texture?.getSourceImage?.()?.src || cat?.texture?.source?.[0]?.source?.src
    if (typeof src === 'string') urls.push(src)
    for (const image of document.querySelectorAll('img')) {
      if (image.src) urls.push(image.src)
    }
    return urls
  })
  const pageOrigin = new URL(page.url()).origin
  const bad: string[] = []
  for (const url of [...requestUrls, ...fromGame]) {
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) continue
    let origin = ''
    try {
      origin = new URL(url, page.url()).origin
    } catch {
      continue
    }
    if (origin === pageOrigin) continue
    const catLike = /cat|kitten|kitty|коте|sprite/i.test(url)
    const image = /\.(gif|png|webp|jpe?g|svg)(\?|$)/i.test(url)
    if (catLike || (image && fromGame.includes(url))) bad.push(url)
  }
  return bad
}

export async function waitForViewport(page: Page, width: number, height: number): Promise<void> {
  await expect.poll(async () => {
    return page.evaluate(({ width, height }) => {
      const game = window.__tatematika!.getGame()
      const state = window.__tatematika!.getGameState()
      return Math.abs(game.scale.width - width) < 2 &&
        Math.abs(game.scale.height - height) < 2 &&
        state.balloons.length >= 2
    }, { width, height })
  }, { timeout: ACTION_TIMEOUT_MS, intervals: [50] }).toBe(true)
}
