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

### ❌ `getBalloonBounds()` - HARDCODED ELLIPSE (reports HIT AREA, not PAINTED size)

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

**What it reports**: 240×160 game-space pixels (the **hit area** dimensions)

**What actually renders**:
- Hit area: `new Phaser.Geom.Ellipse(0, 0, balloonRadius * 1.5 * 2, balloonRadius * 2)` creates 240×160 interactive region
- **Painted ellipse**: `graphics.fillEllipse(x, y, radiusX, radiusY)` where `radiusX = 120, radiusY = 80`
- **BUG**: Phaser 3's `fillEllipse(x, y, width, height)` takes WIDTH and HEIGHT, not radii
- So the painted ellipse is actually **120×80 game-space pixels**, half the intended size
- At 320×568: Painted **44×30 CSS px**, Hit area **96×64 CSS px**
- At 375×667: Painted **91×67 CSS px**, Hit area **112.5×75 CSS px**
- At 1280×800: Painted **153×102 CSS px**, Hit area **320×213 CSS px**

**Discrepancy**: Hook returns hit area (240×160), but painted balloon is only 120×80. The painted size is ~48% of the hit area, creating a large mismatch between what the child sees and what they can tap.

**Tests affected**:
- `tests/e2e/responsive-css-sizes.spec.ts`: Lines 73–78, 138–145, 269–274, 328–335, 381–386, 424–428
- `tests/e2e/review-findings.spec.ts`: Lines 50, 98, 193, 240
- `tests/e2e/helpers.ts`: Line 23
- `tests/e2e/real-geometry.spec.ts`: Measured hit area only, missed the painted bug

**Result**: Tests **passed** by measuring the hit area (96×64 CSS px at 320×568), completely missing that the painted balloon is only 44×30 CSS px. The child sees a small balloon but can tap a much larger invisible region around it.

**Why previous tests passed**: `real-geometry.spec.ts` measured `sprite.input.hitArea` dimensions, not the actual painted pixels. The painted ellipse bug was invisible to hook-based and hit-area-based tests.

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

---

## Follow-Up: Painted Balloon Geometry (b4caf34 → current)

### The Painted vs Hit Area Bug

**Problem reported**: `drawBalloon` in `src/scenes/GameScene.ts` calls `graphics.fillEllipse(x, y, radiusX, radiusY)` where `radiusX = 120` and `radiusY = 80`. Phaser 3's `fillEllipse` signature is `fillEllipse(x, y, width, height)`, NOT radii. So the painted balloon is only **120×80 game px** instead of the intended **240×160 game px**.

**Why `real-geometry.spec.ts` missed it**: Those tests measured `sprite.input.hitArea` dimensions (the Phaser Ellipse object), not the actual painted pixels. The hit area is correctly 240×160, but the visual balloon is half that size.

### Painted Geometry Tests (new suite)

`tests/e2e/painted-geometry.spec.ts` uses pixel measurement to find the actual painted balloon:

**Method**:
1. Screenshot the canvas region around each balloon center
2. Decode PNG with `pngjs`
3. Find the most common non-background color (the balloon fill)
4. Measure its bounding box in CSS pixels
5. Compare to hit area and check spec minimums

**Results** (measured painted balloon in CSS px):

| Viewport | Painted | Hit Area | % of Hit Area | Spec ≥64 |
|----------|---------|----------|---------------|----------|
| 320×568  | 44×30   | 96×64    | 46%×47%       | ❌ FAIL  |
| 375×667  | 91×67   | 112.5×75 | 81%×89%       | ❌ FAIL (ratio) |
| 1280×800 | 153×102 | 320×213  | 48%×48%       | ✅ PASS (but ratio FAILS) |

**Findings**:
- Painted balloon is consistently **~48%** of the hit area (exactly half in width, as expected from the width/radius bug)
- At 320×568: Painted **44×30 CSS px** violates spec §3 (≥64×64 required)
- At 375×667: Painted **91×67 CSS px** marginally meets width but fails ratio test
- At 1280×800: Painted **153×102 CSS px** meets ≥64 minimum but is still half the hit area

**Formula text overflow**:
- Formula text is **157×56 game px**
- Painted ellipse is **120×80 game px**
- Text width (157) > ellipse width (120), so formula overflows the visible balloon
- All 4 corners of the text bounds fail the ellipse containment test

**Root cause**: `drawBalloon` at `src/scenes/GameScene.ts` line ~295–305:
```typescript
const radiusX = radius * 1.5  // 120
const radiusY = radius         // 80
// ...
graphics.fillEllipse(x, y, radiusX, radiusY)  // BUG: should be width, height
```

Should be:
```typescript
graphics.fillEllipse(x, y, radiusX * 2, radiusY * 2)  // width, height = 240, 160
```

Or better, use correct Phaser API:
```typescript
graphics.fillEllipse(x, y, radiusX * 2, radiusY * 2)
graphics.strokeEllipse(x, y, radiusX * 2, radiusY * 2)
```

**Impact**:
- Children see a small balloon (44–153 CSS px) but can tap a much larger invisible region (96–320 CSS px)
- Confusing UX: tap targets don't match visual size
- Formula text overflows the visible balloon
- Spec §3 violation at small viewports (320×568)

**Tests added**:
- `tests/e2e/painted-geometry.spec.ts` — 4 tests measuring actual painted pixels
- All 4 tests currently **FAIL**, correctly detecting the bug

---

## Updated Recommendations

### For tate-dev (App Fixes) — PRIORITY ORDER

1. **CRITICAL: Fix `fillEllipse` parameters** in `drawBalloon()`:
   - Change `fillEllipse(x, y, radiusX, radiusY)` to `fillEllipse(x, y, radiusX * 2, radiusY * 2)`
   - Same for `strokeEllipse` if present
   - This will make painted balloon match hit area (240×160 game px)

2. **HIGH: Fix formula text sizing** (original finding):
   - Remove or increase the `Math.min(this.formulaFontSize, 52)` cap
   - Or ensure formula always fits inside the 240×160 painted ellipse after fix #1

3. **MEDIUM: Update hooks to read live objects**:
   - Replace hardcoded constants in `getMuteButtonBounds()` and `getBalloonBounds()`
   - `getFormulaFontSize()` and `getTargetFontSize()` should return actual text bounds height

### Why Pixel Measurement Was Necessary

**Hook-based tests** (`responsive-css-sizes.spec.ts`):
- Measured self-reported values from hooks
- Hooks returned calculated or hardcoded dimensions
- Completely missed the painted vs hit area gap

**Hit-area-based tests** (`real-geometry.spec.ts` original):
- Measured Phaser object dimensions (hit areas, text bounds)
- Hit areas are correct (240×160), so tests passed
- Never looked at actual painted pixels

**Pixel-based tests** (`painted-geometry.spec.ts` new):
- Screenshot and decode PNG to measure real rendered pixels
- Found painted balloon is half the hit area size
- Detected the fillEllipse width/height vs radius bug

**Conclusion**: All three test types are needed:
- Hooks: Fast unit-like checks for basic size policies
- Object inspection: Verify Phaser objects are configured correctly
- Pixel measurement: Catch rendering bugs where configured ≠ painted

---

## Audit of painted-geometry.spec.ts Methodology (aff2a08 → current)

### Problems in Original Implementation (aff2a08)

**1. Fixed crop size clipped balloons at large viewports**
- Used fixed 200×200 or 400×400 CSS px screenshots
- At 1280×800 with hit area 320×213 CSS px, 400px crop was marginal
- Balloon could be partially clipped, losing pixels in measurement

**2. "Most common color" segmentation was unreliable**
- Sampled all non-background, non-black pixels in entire screenshot
- Multiple balloons of same color would merge
- Lost pixels to stroke outline, anti-aliased edges, white highlight
- Text in center was excluded but surrounding balloon pixels were fragmented

**3. Formula containment test used hardcoded 120×80 game px**
- Line 231-232: `const paintedRadiusX = 120 / 2; const paintedRadiusY = 80 / 2`
- Never measured actual painted pixels for this test
- Inconsistent with the pixel measurement test (which measured ~115×80)

**4. Inconsistent measurements reported by tate-dev**
- 320×568: painted 104×79 CSS (260×197 game) — 260 game px?
- 375×667: painted 122×92 CSS vs hit 140.6×93.8 — wrong hit area?
- 1280×800: painted 346×262 CSS (216×164 game) — impossible conversion
- Width ratios ~87% but should be 48% based on fillEllipse bug

**Root cause of tate-dev's numbers**: Test defects, not app behavior.

### Fixed Methodology (current)

**1. Dynamic crop based on sprite bounds**
```typescript
const margin = 1.5
const cropWidthCss = balloonInfo.hitArea.widthCss * margin
const cropHeightCss = balloonInfo.hitArea.heightCss * margin
```
Never clips balloon; adapts to viewport and balloon size.

**2. Flood fill from validated balloon pixel**
- Try multiple sample points radiating from center (right, left, up, down, diagonals)
- Skip background (within 20 tolerance) and text (R+G+B < 100)
- Find first balloon-colored pixel
- Flood fill from that point with generous 80 tolerance for anti-aliasing
- Creates segmentation mask for visual verification (saved as PNG artifact)

**3. Single source of truth for painted size**
- Measure painted pixels once
- Use that measurement for both size assertions AND containment test
- No hardcoded dimensions

**4. Units explicit in all failure messages**
```typescript
expect(paintedWidthCss, `Painted width ${paintedWidthCss} CSS px must be ≥64 CSS px`)
expect(widthRatio, `Painted width must be 90-110% of hit area (got ${widthRatio*100}%)`)
```
Every assertion states the unit (CSS px or game px) and the measured value.

**5. Saves PNG artifacts for inspection**
```
/tmp/painted-geometry-artifacts/320x568-screenshot.png
/tmp/painted-geometry-artifacts/320x568-mask.png
/tmp/painted-geometry-artifacts/375x667-screenshot.png
/tmp/painted-geometry-artifacts/375x667-mask.png
/tmp/painted-geometry-artifacts/1280x800-screenshot.png
/tmp/painted-geometry-artifacts/1280x800-mask.png
```
Screenshots show what was captured; masks show what was segmented.

### Validated Measurements (current head, aff2a08)

| Viewport | Painted (CSS px) | Painted (game px) | Hit Area (CSS px) | Hit Area (game px) | Painted/Hit Ratio |
|----------|------------------|-------------------|-------------------|--------------------|--------------------|
| 320×568  | 46×33           | 115.0×82.5        | 96×64            | 240×160            | 48%×52%            |
| 375×667  | 54×39           | 115.2×83.2        | 112.5×75         | 240×160            | 48%×52%            |
| 1280×800 | 155×104         | 116.3×78.0        | 320×213.3        | 240×160            | 48%×49%            |

**Consistency check**: Painted size is consistent across viewports in game-space (115×80 game px ±2 px), confirming measurement accuracy.

**Validation against code**: `drawBalloon` calls `fillEllipse(x, y, 120, 80)`. Phaser 3 interprets these as width×height, so painted ellipse is 120×80 game px. Measured 115×80 is within ±5 px (accounts for anti-aliasing, stroke width, and bounding box vs ellipse geometry). ✓ Accurate.

**Root cause of 86.7% width mystery**: Original test had segmentation defects. With corrected methodology, width ratio is consistently **48%** (painted 115 / hit 240), exactly matching the fillEllipse bug (width parameter used as width, not diameter).

**Root cause of 120×80 inconsistency**: Formula containment test used hardcoded constant, not measured pixels. Now both tests use the same measurement (115×80 game px from flood fill).

### Remaining Test Failures (All Real App Bugs)

**1. Painted balloon < 64×64 CSS px at small viewports** (spec §3 violation)
- 320×568: 46×33 CSS px (needs ≥64×64)
- 375×667: 54×39 CSS px (needs ≥64×64)
- Root cause: `fillEllipse(x, y, 120, 80)` creates 120×80 game px balloon, scales down to 46-54 CSS px

**2. Painted size 48% of hit area** (violates ±10% match requirement)
- All viewports show painted is ~half the hit area
- Root cause: Hit area correctly uses `new Ellipse(0, 0, 240, 160)` but painted uses `fillEllipse(x, y, 120, 80)`

**3. Formula text doesn't fit inside painted ellipse**
- Text: 157×56 game px
- Painted: 115×80 game px  
- Text width 157 > painted width 115
- Root cause: Text sized for 240-wide balloon, but painted is only 115 wide

**Fix for tate-dev**: Change `drawBalloon`:
```typescript
// From:
graphics.fillEllipse(x, y, radiusX, radiusY)  // 120, 80
// To:
graphics.fillEllipse(x, y, radiusX * 2, radiusY * 2)  // 240, 160
```

All test failures will resolve when tate-dev fixes the fillEllipse parameters.
