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
}
```

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
