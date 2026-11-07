# Котето и балоните - Test-First Implementation

This is a test-first (TDD) setup for "Котето и балоните", a Bulgarian math game for 7-year-olds.

## Status

✅ **Tests written and failing** - Ready for implementation  
❌ **Game implementation** - Not started (intentional)

This branch contains ONLY:
- Failing tests covering all acceptance criteria К1-К11
- Minimal type stubs that compile but throw `new Error('not implemented')`
- Project tooling (TypeScript, Vite, Phaser 3, Vitest, Playwright)

## Getting Started

```bash
npm install
npm run build    # TypeScript type-checking and Vite build
npm test         # Run unit tests (62 failing, 12 passing constants)
npm run e2e      # Run end-to-end tests (14 tests, all timeout on unimplemented hooks)
npm run dev      # Start development server
```

## Module Structure

The game logic is separated from Phaser rendering for testability:

```
src/game-logic/
├── types.ts              # TypeScript types and interfaces
├── strings.ts            # Bulgarian strings (К11)
├── settings.ts           # Settings with localStorage persistence (К9)
├── formula-generator.ts  # Math formula generation (К2, math rules)
├── round.ts              # Round state management (К1, К3-К6)
└── scoring.ts            # Star counting and level progression (К7)

src/main.ts               # Phaser entry point and test hook API
```

## Test Hook Contract for E2E

The developer must expose `window.__tatematika` with this API for Playwright tests:

```typescript
interface TatematikaTestHook {
  // Get current game state
  getGameState(): {
    target: number
    balloons: Array<{ id: string; formula: string; isCorrect: boolean }>
    stars: number
    wrongAttempts: number
    settings: {
      upperLimit: number
      balloonCount: number
      correctBalloonsPerLevel: number
    }
  }
  
  // Simulate clicking a balloon
  clickBalloon(balloonId: string): void
  
  // Simulate keyboard input
  pressKey(key: 'left' | 'right' | 'space' | 'up'): void
  
  // Toggle sound on/off
  toggleMute(): void
  
  // Check if sound is muted
  isMuted(): boolean
  
  // Get level completion text (null if not shown)
  getLevelEndText(): string | null
  
  // === Regression test hooks (added for review findings) ===
  
  // Get last played sound key (e.g., 'pop', 'bounce', 'meow')
  // Returns null if no sound played or sound is muted
  // Used for К3 (sound on correct pop) and К10 (mute verification)
  getLastPlayedSound(): string | null
  
  // Get total number of sounds actually played since game start
  // Must NOT increase while muted (К10 mute verification)
  // Used to verify mute blocks sound playback rather than just silencing
  getSoundPlayCount(): number
  
  // Get formula font size in Phaser game-space pixels
  // Must be ≥32px for spec §7 compliance (multiply by canvas scale for CSS px)
  getFormulaFontSize(): number
  
  // Get target number font size in Phaser game-space pixels
  // Must be ≥32px for spec §7 compliance (multiply by canvas scale for CSS px)
  getTargetFontSize(): number
  
  // Get mute button interactive bounds in game-space pixels
  // Must be ≥64×64 for spec §3 compliance (multiply by canvas scale for CSS px)
  getMuteButtonBounds(): { width: number; height: number }
  
  // Get cat's current position in game space
  // Returns CENTER coordinates of the cat (x: horizontal center, y: vertical center)
  // Used to verify К8: cat moves under balloon on click/touch
  getCatPosition(): { x: number; y: number }
  
  // Get cat jump state for К8 verification
  // isJumping: true when cat is currently jumping
  // restingY: the y position where cat sits (to detect when it jumps above)
  getCatJumpState(): { isJumping: boolean; restingY: number }
  
  // Get balloon bounds in game-space pixels (includes formula text)
  // Returns TOP-LEFT coordinates (x: left edge, y: top edge) plus width/height
  // Returns null if balloon not found
  // Used for К8 (cat moves under balloon) and responsive size tests
  // Note: To get balloon center, use bounds.x + bounds.width/2, bounds.y + bounds.height/2
  getBalloonBounds(balloonId: string): { 
    x: number
    y: number
    width: number
    height: number
  } | null
  
  // Get balloon animation state for К4 verification
  // isBouncing: true when balloon bounces on wrong answer
  // isPopping: true when balloon pops on correct answer
  getBalloonAnimationState(balloonId: string): { 
    isBouncing: boolean
    isPopping: boolean 
  }
  
  // === Settings UI test hooks (К9, spec §5) ===
  
  // Open the parent settings UI
  // Settings UI must be accessible per spec §5 "Настройки (за родителя)"
  openSettings(): void
  
  // Close the settings UI
  closeSettings(): void
  
  // Check if settings UI is currently open
  isSettingsOpen(): boolean
  
  // Get the Phaser.Game instance for direct scene/object inspection
  // Used by real-geometry.spec.ts to measure actual rendered sizes
  // Returns: Phaser.Game instance with access to scenes, scale, and all game objects
  getGame(): Phaser.Game
}
```

### CSS Pixel Sizing Convention

The game uses dynamic viewport-sized canvas dimensions (e.g., 320×568 portrait on mobile, 1280×800 on desktop). To convert game-space measurements to CSS pixels (actual on-screen size):

```typescript
const canvas = document.querySelector('canvas')!
const rect = canvas.getBoundingClientRect()
const game = window.__tatematika!.getGame()

// ALWAYS use live game.scale dimensions, never hardcoded values:
const scale = rect.width / game.scale.width  // or rect.height / game.scale.height

// Convert any game-space measurement to CSS pixels:
const cssPx = gamePx * scale
```

**Important**: All tests MUST use `game.scale.width` and `game.scale.height` (the actual live game dimensions) rather than hardcoded constants like 800 or 600. The game adapts to viewport size, so these values change per device. A shared helper `getGameScaleAndRect(page)` is provided in `tests/e2e/helpers.ts`.

**Spec minimums in CSS pixels:**
- Text (formulas, target number): ≥32 CSS px (spec §7)
- Tap targets (buttons, balloons): ≥64×64 CSS px (spec §3)

### Required DOM test IDs for E2E tests

The implementation must include these `data-testid` attributes:

- `button-settings` - Opens parent settings UI (spec §5, К9)
- `button-play-again` - "Още веднъж" button on level complete (К7)
- `button-to-menu` - "Към менюто" button on level complete
- `settings-panel` - The settings UI container
- `setting-upper-limit` - Upper limit input (range 5-20)
- `setting-operations` - Operations select (addition/subtraction/both)
- `setting-balloon-count` - Balloon count input (range 2-5)
- `setting-correct-per-level` - Correct balloons per level input (range 5-20)
- `setting-speed` - Speed select (slow/medium)

## Test Coverage

### Acceptance Criteria Mapping

| Criterion | Test File | Test Name / Description |
|-----------|-----------|-------------------------|
| **К1** | `tests/unit/round.test.ts` | Round start with 3 balloons, target 0-6, exactly one correct |
| **К1** | `tests/e2e/game-flow.spec.ts` | E2E verification of round start |
| **К2** | `tests/unit/formula-generator.test.ts` | 1000 formulas without negative results |
| **К3** | `tests/unit/round.test.ts` | Correct balloon identification and new round start |
| **К3** | `tests/e2e/game-flow.spec.ts` | E2E correct balloon pop with star increment |
| **К4** | `tests/unit/round.test.ts` | Wrong balloon bounce, stars unchanged, balloons stay |
| **К4** | `tests/e2e/game-flow.spec.ts` | E2E wrong balloon attempt |
| **К5** | `tests/unit/round.test.ts` | Hint after 2 wrong attempts |
| **К5** | `tests/e2e/game-flow.spec.ts` | E2E hint verification |
| **К6** | `tests/unit/round.test.ts` | Balloons reset to top when reaching bottom |
| **К7** | `tests/unit/scoring.test.ts` | Level completion at configured star count |
| **К7** | `tests/e2e/game-flow.spec.ts` | E2E level end screen with "Ти успя!" |
| **К8** | `tests/e2e/game-flow.spec.ts` | Keyboard (←/→ + Space/↑), mouse click, touch |
| **К9** | `tests/unit/settings.test.ts` | Upper limit 10 persists via localStorage |
| **К9** | `tests/e2e/game-flow.spec.ts` | E2E settings persistence after reload |
| **К10** | `tests/e2e/game-flow.spec.ts` | Mute button toggles sound |
| **К11** | `tests/unit/strings.test.ts` | Bulgarian strings, no "Загуби"/"Game Over" |
| **К11** | `tests/e2e/game-flow.spec.ts` | E2E Bulgarian UI verification |

### Math Rules Coverage

All tested with property-style tests over ≥1000 generated rounds:

- ✅ Integer operands 0..limit
- ✅ No negative results (minuend ≥ subtrahend)
- ✅ Sums never exceed limit
- ✅ Only two-operand `a + b` / `a − b`
- ✅ Minus displayed as U+2212 `−` not hyphen
- ✅ Exactly one correct balloon per round
- ✅ Wrong balloons give different results from target and each other
- ✅ No exact duplicate formula within a round
- ✅ Operations setting (addition/subtraction/both) respected
- ✅ Default: limit 6, 3 balloons, 10 correct per level, slow speed
- ✅ Setting ranges validated/clamped

### Feedback Logic Coverage

- ✅ Correct pop adds exactly 1 star and starts new round
- ✅ Wrong balloon bounces, stars never decrease, same balloons stay
- ✅ After 2 wrong tries, correct balloon hinted
- ✅ Balloons reaching bottom reset with nothing lost
- ✅ Level ends at configured star count
- ✅ Praise rotates: "Браво!", "Супер!", "Точно така!"
- ✅ Wrong feedback: "Опа! Опитай пак!"

## Current Test Results

### Unit Tests
```
Test Files  5 total
Tests       74 total
  - 62 failing (all with "not implemented")
  - 12 passing (string constants)
```

Sample failure reason:
```
Error: not implemented
 ❯ Module.generateFormula src/game-logic/formula-generator.ts:10:9
```

### E2E Tests
```
Tests  14 total
  - All timeout waiting for window.__tatematika (unimplemented)
```

Sample failure reason:
```
Error: page.waitForFunction: Test timeout of 30000ms exceeded.
await page.waitForFunction(() => window.__tatematika !== undefined)
```

## Default Settings

As specified in the requirements:

```typescript
{
  upperLimit: 6,                    // Range: 5-20
  operations: 'both',               // 'addition' | 'subtraction' | 'both'
  balloonCount: 3,                  // Range: 2-5
  correctBalloonsPerLevel: 10,      // Range: 5-20
  balloonSpeed: 'slow'              // 'slow' | 'medium'
}
```

## Bulgarian Strings

All UI text is in Bulgarian. From the spec:

- Praise (rotating): `"Браво!"`, `"Супер!"`, `"Точно така!"`
- Wrong answer: `"Опа! Опитай пак!"`
- Level complete: `"Ти успя!"`, `"Събра N звездички!"`
- Buttons: `"Още веднъж"`, `"Към менюто"`

No negative feedback like "Загуби" or "Game Over".

## Stack

- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Phaser 3** - Game rendering
- **Vitest** - Unit testing
- **Playwright** - E2E testing
- **localStorage** - Settings persistence

## Spec Ambiguities & Design Decisions

1. **Formula uniqueness within round**: Interpreted as exact string matches (e.g., "2 + 3" ≠ "3 + 2")
2. **Hint timing**: Activates after 2nd wrong attempt, persists through balloon resets
3. **Balloon reset**: When reaching bottom, they return to top with the same target and formulas
4. **Star counting**: Starts at 0, increments by exactly 1 per correct answer
5. **Level numbering**: Starts at 1, increments after each completion
6. **Test hook scope**: Minimal API for e2e tests, doesn't expose internal Phaser state
7. **Button size requirement**: Spec requires ≥64×64px for touch; documented but not enforced in tests

## Next Steps for Developer

1. Implement each stub function to make tests pass
2. Expose the test hook API at `window.__tatematika`
3. Build Phaser scenes for rendering
4. Add sound effects
5. Ensure buttons and balloons are ≥64×64px
6. Run tests to verify implementation

Do NOT open a pull request until implementation is complete.
