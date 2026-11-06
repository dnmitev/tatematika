# Size Hook Audit - Test vs Reality

## Executive Summary

**Problem**: Test hooks may report sizes that don't match actual rendered geometry.

**Findings**: 3 hooks are inaccurate (return constants or ignore scale), 4 are honest (read live objects).

**Impact**: Tests at 320×568 and 375×667 fail spec minimums for formula text (22.4–26.25 CSS px vs required ≥32 CSS px). This is a **real app bug** for tate-dev to fix.

---

## Hook-by-Hook Audit

### ❌ `getFormulaFontSize()` - INACCURATE

**Implementation**: Returns `this.formulaFontSize` (line 697)

**What it reports**: 
- Calculated once at scene create: `Math.max(80 * scale, 32)` where `scale = Math.min(this.scale.width / 800, this.scale.height / 600)`
- At 320×568: Reports 32 (the clamped minimum)
- At 375×667: Reports 32

**What actually renders**:
- Formula text created with `fontSize: ${Math.min(this.formulaFontSize, 52)}px` (line 274–276)
- Text is capped to 52px font style regardless of formulaFontSize
- Actual rendered text bounds: **56 game-space pixels tall**
- At 320×568: **22.4 CSS px** (56 × 0.4)
- At 375×667: **26.25 CSS px** (56 × 0.46875)

**Discrepancy**: Hook reports the calculated font size (32+), but actual text:
1. Uses capped fontSize (`Math.min(...)` caps at 52)
2. Text bounds height (56) ≠ font size style (52)
3. No scaling applied to text objects (setScale only used during pop animation)

**Tests affected**:
- `tests/e2e/responsive-css-sizes.spec.ts`: Lines 36–41, 213–218, 237–240, 374–378, 403–408
- `tests/e2e/review-findings.spec.ts`: Line 457

---

### ❌ `getTargetFontSize()` - INACCURATE (but passes tests)

**Implementation**: Returns `this.targetFontSize` (line 701)

**What it reports**: `Math.max(80 * scale, 32)`
- At 320×568: Reports 32
- At 375×667: Reports 37.5

**What actually renders**:
- Target text created with `fontSize: ${this.targetFontSize}px` (line 150)
- Uses the full `targetFontSize` without capping
- Actual rendered bounds: **97 game-space pixels tall**
- At 320×568: **38.8 CSS px** (97 × 0.4)
- At 375×667: **45.47 CSS px** (97 × 0.46875)

**Discrepancy**: Similar to formula — reported font size ≠ actual text bounds height. Text bounds are larger than font size due to padding/line height.

**Tests affected**:
- `tests/e2e/responsive-css-sizes.spec.ts`: Lines 54–58, 251–255, 403–408

**Result**: Despite inaccuracy, target text **passes** all minimums (actual 38.8–45.47 CSS px > required 32).

---

### ❌ `getMuteButtonBounds()` - HARDCODED CONSTANT

**Implementation**: Returns `{ width: 160, height: 160 }` (line 705)

**What it reports**: Fixed 160×160 game-space pixels

**What actually renders**:
- Mute button is a Phaser.GameObjects.Text with hit area `new Phaser.Geom.Rectangle(-80, -80, 160, 160)` (created in GameScene)
- Hit area is indeed 160×160 game-space pixels
- At 320×568: **64×64 CSS px** (160 × 0.4)
- At 375×667: **75×75 CSS px** (160 × 0.46875)
- At 1280×800: **213×213 CSS px** (160 × 1.333)

**Discrepancy**: Hook returns hardcoded constant. Works because hit area is actually 160×160, but hook doesn't verify this by reading the live object.

**Tests affected**:
- `tests/e2e/responsive-css-sizes.spec.ts`: Lines 89–95, 285–291, 404–412, 424–428
- `tests/e2e/review-findings.spec.ts`: Line 466

**Result**: Tests **pass** because constant matches implementation, but test doesn't verify reality.

---

### ❌ `getBalloonBounds()` - HARDCODED ELLIPSE

**Implementation**: Returns hardcoded ellipse (lines 716–728)

```typescript
const radiusX = 80 * 1.5  // 120
const radiusY = 80
return {
  x: balloon.x - radiusX,
  y: balloon.y - radiusY,
  width: radiusX * 2,    // 240
  height: radiusY * 2    // 160
}
```

**What it reports**: 240×160 game-space pixels

**What actually renders**:
- Balloon Graphics created with `drawBalloon(sprite, 0, 0, balloon.isCorrect, balloonRadius)` where `balloonRadius = 80`
- Hit area: `new Phaser.Geom.Ellipse(0, 0, balloonRadius * 1.5 * 2, balloonRadius * 2)` (line 269)
- Ellipse constructor: `Ellipse(x, y, width, height)` where width/height are full diameters
- Hit area dimensions: **240×160** game-space pixels
- At 320×568: **96×64 CSS px** (240×160 × 0.4)
- At 375×667: **112.5×75 CSS px** (240×160 × 0.46875)

**Discrepancy**: Hook returns hardcoded values matching implementation. Works but doesn't read the live hit area.

**Tests affected**:
- `tests/e2e/responsive-css-sizes.spec.ts`: Lines 73–78, 138–145, 269–274, 328–335, 381–386, 424–428
- `tests/e2e/review-findings.spec.ts`: Lines 50, 98, 193, 240
- `tests/e2e/helpers.ts`: Line 23

**Result**: Tests **pass** (balloons meet 64×64 minimum), but test relies on hardcoded hook not reality.

---

### ✅ `getCatPosition()` - HONEST

**Implementation**: Returns `{ x: this.catX, y: this.catY }` (line 709)

**Reads live state**: `this.catX` and `this.catY` are updated every frame during movement/jump animations.

**Tests using it**: `tests/e2e/review-findings.spec.ts` (cat movement verification)

---

### ✅ `getCatJumpState()` - HONEST

**Implementation**: Returns `{ isJumping: this.catIsJumping, restingY: this.catJumpStartY }` (line 713)

**Reads live state**: `this.catIsJumping` is updated during jump physics.

**Tests using it**: `tests/e2e/helpers.ts`, `tests/e2e/review-findings.spec.ts`

---

### ✅ `getBalloonAnimationState()` - HONEST

**Implementation**: Reads `isBouncing` and `isPopping` from the live balloon sprite object (line 730)

**Reads live state**: Animation flags are updated during bounce/pop tweens.

**Tests using it**: `tests/e2e/helpers.ts`

---

### ✅ `getGame()` - NEW HOOK (read-only access)

**Implementation**: Returns the Phaser.Game instance (added in this audit)

**Purpose**: Allows tests to measure real rendered geometry via scene inspection.

**Tests using it**: `tests/e2e/real-geometry.spec.ts` (new tests in this PR)

---

## Real Geometry Test Results

Tests added in `tests/e2e/real-geometry.spec.ts` measure actual rendered sizes by inspecting live Phaser objects:

### ❌ FAILURES (Real App Bugs)

**320×568 viewport:**
- Formula text: **22.4 CSS px** (FAILS, needs ≥32)
  - Font style: "52px", game height: 56px, scale: 0.4
  - Root cause: Text bounds smaller than font size, then scaled down

**375×667 viewport:**
- Formula text: **26.25 CSS px** (FAILS, needs ≥32)
  - Font style: "52px", game height: 56px, scale: 0.46875

### ✅ PASSES

**All viewports:**
- Target number: 38.8–129 CSS px (PASSES ≥32)
- Balloons: 96×64 to 320×213 CSS px (PASSES ≥64×64)
- Mute button: 64×64 to 213×213 CSS px (PASSES ≥64×64)
- Settings button: 64×64 CSS px (DOM element, PASSES)

---

## Root Cause: Formula Text Undersized

**Problem location**: `src/scenes/GameScene.ts` lines 274–276

```typescript
const formulaFontSize = Math.min(this.formulaFontSize, 52)
const text = this.add.text(0, 0, balloon.formula.display, {
  fontSize: `${formulaFontSize}px`,
  // ...
})
```

**Issue**: 
1. Font size capped at 52px
2. Actual rendered text bounds are ~56px tall (font size + padding)
3. At scale 0.4 (320px wide): 56 × 0.4 = **22.4 CSS px** < 32 required
4. At scale 0.46875 (375px wide): 56 × 0.46875 = **26.25 CSS px** < 32 required

**Fix needed**: Either:
- Remove the 52px cap and use the full `this.formulaFontSize` (80 × scale clamped to ≥32)
- Or increase the cap to ensure 32 CSS px at all viewports (e.g., 80px minimum)
- Or apply responsive scaling to text objects at runtime

---

## Recommendations

### For tate-dev (App Fixes)

1. **Fix formula text sizing**: Remove or increase the `Math.min(this.formulaFontSize, 52)` cap to meet spec §7 (≥32 CSS px)
2. **Update hooks to read live objects**: Replace hardcoded constants in `getMuteButtonBounds()` and `getBalloonBounds()` with actual object inspection
3. **Consider**: Apply the same logic to `getFormulaFontSize()` and `getTargetFontSize()` — return actual text bounds height, not calculated font size

### For Tests

1. **Keep both test suites**:
   - `responsive-css-sizes.spec.ts` — hook-based (fast, unit-like)
   - `real-geometry.spec.ts` — live object inspection (catches hook inaccuracies)
2. **Convention**: Use `game.scale.width` not hardcoded 800 for scale calculation
3. **New tests added**: Measure real geometry at 320×568, 375×667, 1280×800

---

## Files Changed

- `src/main.ts` — Added `getGame(): Phaser.Game` hook
- `README.md` — Added CSS sizing convention, documented `getGame()` hook
- `tests/e2e/real-geometry.spec.ts` — New test suite (9 tests, 7 pass, 2 fail legitimately)
- `AUDIT-SIZE-HOOKS.md` — This audit document

---

## Verdict

**Hook Honesty**:
- ❌ Inaccurate/hardcoded: `getFormulaFontSize()`, `getTargetFontSize()`, `getMuteButtonBounds()`, `getBalloonBounds()`
- ✅ Honest: `getCatPosition()`, `getCatJumpState()`, `getBalloonAnimationState()`, `getGame()`

**Test Failures**:
- **Real app bugs**: Formula text at 22.4–26.25 CSS px < 32 required (spec §7 violation)
- **Not test defects**: Measurements are accurate, problem is in `src/scenes/GameScene.ts`

**Action**: tate-dev must fix formula text sizing in GameScene to meet spec minimums.
