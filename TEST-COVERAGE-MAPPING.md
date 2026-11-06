# Test Coverage Mapping - Котето и балоните

## Acceptance Criteria К1-К11

| Criterion | Test File | Test Name |
|-----------|-----------|-----------|
| **К1: Round start** | `tests/unit/round.test.ts` | `Round Management > К1: Round start > should start round with correct number of balloons and valid target` |
| **К1: Round start** | `tests/unit/round.test.ts` | `Round Management > К1: Round start > should initialize wrong attempts to 0` |
| **К1: Round start** | `tests/unit/round.test.ts` | `Round Management > К1: Round start > should not show hints initially` |
| **К1: Round start** | `tests/e2e/game-flow.spec.ts` | `Котето и балоните - E2E > К1: Round start - has 3 balloons with target 0-6 and exactly one correct` |
| **К2: No negative results** | `tests/unit/formula-generator.test.ts` | `Formula Generator > К2: No negative results > should generate 1000 formulas without negative results or exceeding upper limit` |
| **К3: Correct balloon** | `tests/unit/round.test.ts` | `Round Management > К3: Correct balloon > should identify correct balloon when popped` |
| **К3: Correct balloon** | `tests/unit/round.test.ts` | `Round Management > К3: Correct balloon > should start new round after correct pop` |
| **К3: Correct balloon** | `tests/e2e/game-flow.spec.ts` | `Котето и балоните - E2E > К3: Correct balloon - pops, sound plays, star added, new round` |
| **К4: Wrong balloon** | `tests/unit/round.test.ts` | `Round Management > К4: Wrong balloon > should identify wrong balloon when attempted` |
| **К4: Wrong balloon** | `tests/unit/round.test.ts` | `Round Management > К4: Wrong balloon > should keep same balloons after wrong attempt` |
| **К4: Wrong balloon** | `tests/unit/round.test.ts` | `Round Management > К4: Wrong balloon > should increment wrong attempts without decreasing stars` |
| **К4: Wrong balloon** | `tests/unit/round.test.ts` | `Round Management > К4: Wrong balloon > should track multiple wrong attempts` |
| **К4: Wrong balloon** | `tests/e2e/game-flow.spec.ts` | `Котето и балоните - E2E > К4: Wrong balloon - bounces, no star loss, same balloons` |
| **К5: Hint after 2 wrong tries** | `tests/unit/round.test.ts` | `Round Management > К5: Hint after 2 wrong tries > should not show hint after 0 wrong attempts` |
| **К5: Hint after 2 wrong tries** | `tests/unit/round.test.ts` | `Round Management > К5: Hint after 2 wrong tries > should not show hint after 1 wrong attempt` |
| **К5: Hint after 2 wrong tries** | `tests/unit/round.test.ts` | `Round Management > К5: Hint after 2 wrong tries > should show hint after exactly 2 wrong attempts` |
| **К5: Hint after 2 wrong tries** | `tests/unit/round.test.ts` | `Round Management > К5: Hint after 2 wrong tries > should keep showing hint after more than 2 attempts` |
| **К5: Hint after 2 wrong tries** | `tests/e2e/game-flow.spec.ts` | `Котето и балоните - E2E > К5: Hint after 2 wrong attempts - correct balloon glows` |
| **К6: Balloons reach bottom** | `tests/unit/round.test.ts` | `Round Management > К6: Balloons reach bottom > should reset balloons to top when they reach bottom` |
| **К6: Balloons reach bottom** | `tests/unit/round.test.ts` | `Round Management > К6: Balloons reach bottom > should preserve hint state when balloons reset` |
| **К7: Level end** | `tests/unit/scoring.test.ts` | `Scoring > К7: Level end > should not complete level with 9 stars (default is 10)` |
| **К7: Level end** | `tests/unit/scoring.test.ts` | `Scoring > К7: Level end > should complete level after reaching configured star count` |
| **К7: Level end** | `tests/unit/scoring.test.ts` | `Scoring > К7: Level end > should respect custom correctBalloonsPerLevel setting` |
| **К7: Level end** | `tests/e2e/game-flow.spec.ts` | `Котето и балоните - E2E > К7: Level end - shows "Ти успя!" and buttons after 10 stars` |
| **К8: Keyboard control** | `tests/e2e/game-flow.spec.ts` | `Котето и балоните - E2E > К8: Keyboard control - arrows and space work` |
| **К8: Mouse click** | `tests/e2e/game-flow.spec.ts` | `Котето и балоните - E2E > К8: Mouse click - clicking balloon works` |
| **К8: Touch input** | `tests/e2e/game-flow.spec.ts` | `Котето и балоните - E2E > К8: Touch input - touching balloon works` |
| **К9: Settings persistence** | `tests/unit/settings.test.ts` | `Settings > К9: Settings persistence > should save upper limit 10 and persist after reload` |
| **К9: Settings persistence** | `tests/unit/settings.test.ts` | `Settings > К9: Settings persistence > should persist all settings across reload` |
| **К9: Settings persistence** | `tests/unit/settings.test.ts` | `Settings > К9: Settings persistence > should load defaults when no saved settings exist` |
| **К9: Settings persistence** | `tests/unit/settings.test.ts` | `Settings > К9: Settings persistence > should update single setting and persist` |
| **К9: Settings persistence** | `tests/e2e/game-flow.spec.ts` | `Котето и балоните - E2E > К9: Settings persistence - upper limit 10 persists after reload` |
| **К10: Mute button** | `tests/e2e/game-flow.spec.ts` | `Котето и балоните - E2E > К10: Mute button - toggles sound on and off` |
| **К11: Bulgarian only** | `tests/unit/strings.test.ts` | `Bulgarian Strings > К11: Bulgarian only and no "Загуби"/"Game Over" > should use only Bulgarian text` |
| **К11: No "Загуби"** | `tests/unit/strings.test.ts` | `Bulgarian Strings > К11: Bulgarian only and no "Загуби"/"Game Over" > should not contain "Загуби" or "Game Over"` |
| **К11: Bulgarian UI** | `tests/e2e/game-flow.spec.ts` | `Котето и балоните - E2E > К11: Bulgarian only - UI text is in Bulgarian` |
| **К11: No negative feedback** | `tests/e2e/game-flow.spec.ts` | `Котето и балоните - E2E > К11: No "Загуби" or "Game Over" - positive feedback only` |

## Math Rules Coverage

| Math Rule | Test File | Test Name |
|-----------|-----------|-----------|
| **Integers 0..limit for operands** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Math rules: Integer operands 0..limit > should generate formulas with integers from 0 to upperLimit` |
| **No negative results** | `tests/unit/formula-generator.test.ts` | `Formula Generator > К2: No negative results > should generate 1000 formulas without negative results or exceeding upper limit` |
| **No negative results** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Math rules: No negative results > should ensure minuend >= subtrahend for subtraction` |
| **Results within 0..limit** | `tests/unit/formula-generator.test.ts` | `Formula Generator > К2: No negative results > should generate 1000 formulas without negative results or exceeding upper limit` |
| **Sums never exceed limit** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Math rules: Sums never exceed limit > should ensure addition results stay within upper limit` |
| **Only two-operand formulas** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Math rules: Only two-operand formulas > should generate formulas with exactly two operands` |
| **U+2212 minus, not hyphen** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Math rules: Correct operator display > should use U+2212 minus sign, not hyphen` |
| **Exactly one correct balloon** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Round formulas > should generate exactly one correct balloon per round` |
| **Wrong balloons differ from target** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Round formulas > should generate wrong balloons with different results from target` |
| **Wrong balloons differ from each other** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Round formulas > should generate wrong balloons with different results from each other` |
| **No duplicate formulas in round** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Round formulas > should not generate exact duplicate formulas within a round` |
| **Operations: addition only** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Math rules: Operations setting respected > should generate only addition when operations = "addition"` |
| **Operations: subtraction only** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Math rules: Operations setting respected > should generate only subtraction when operations = "subtraction"` |
| **Operations: both** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Math rules: Operations setting respected > should generate both operations when operations = "both"` |
| **Default: limit 6, 3 balloons** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Default settings > should work with default limit 6, 3 balloons` |
| **Limit range 5-20** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Setting ranges validation > should handle limit range 5-20` |
| **Balloon count 2-5** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Setting ranges validation > should handle balloon count range 2-5` |
| **Target generation 0..limit** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Target generation > should generate targets within upper limit` |
| **Formula validation** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Formula validation > should validate formulas according to game rules` |
| **Reject exceeding limit** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Formula validation > should reject formulas exceeding upper limit` |
| **Reject negative results** | `tests/unit/formula-generator.test.ts` | `Formula Generator > Formula validation > should reject negative results` |

## Feedback Logic Coverage

| Feedback Rule | Test File | Test Name |
|---------------|-----------|-----------|
| **Correct pop adds exactly 1 star** | `tests/unit/scoring.test.ts` | `Scoring > Feedback logic: Correct pop adds exactly 1 star > should add exactly one star on correct pop` |
| **Stars accumulate** | `tests/unit/scoring.test.ts` | `Scoring > Feedback logic: Correct pop adds exactly 1 star > should accumulate stars correctly` |
| **Correct pop starts new round** | `tests/unit/round.test.ts` | `Round Management > К3: Correct balloon > should start new round after correct pop` |
| **Wrong balloon bounces** | `tests/unit/round.test.ts` | `Round Management > К4: Wrong balloon > should keep same balloons after wrong attempt` |
| **Stars never decrease** | `tests/unit/round.test.ts` | `Round Management > Feedback logic: Stars never decrease > should not decrease stars on wrong balloon attempt` |
| **Same balloons stay after wrong** | `tests/unit/round.test.ts` | `Round Management > Feedback logic: Same balloons stay after wrong attempt > should keep exact same balloon instances after wrong try` |
| **Hint after 2 wrong tries** | `tests/unit/round.test.ts` | `Round Management > К5: Hint after 2 wrong tries > should show hint after exactly 2 wrong attempts` |
| **Balloons reset at bottom** | `tests/unit/round.test.ts` | `Round Management > К6: Balloons reach bottom > should reset balloons to top when they reach bottom` |
| **Nothing lost on reset** | `tests/unit/round.test.ts` | `Round Management > К6: Balloons reach bottom > should preserve hint state when balloons reset` |
| **Level ends at configured stars** | `tests/unit/scoring.test.ts` | `Scoring > Feedback logic: Level ends at configured number of stars > should end level at exactly the configured star count` |
| **Praise rotates** | `tests/unit/strings.test.ts` | `Bulgarian Strings > Feedback logic: Praise rotates > should rotate through praise messages` |
| **Praise rotation wraps** | `tests/unit/strings.test.ts` | `Bulgarian Strings > Feedback logic: Praise rotates > should handle large indices by wrapping` |
| **Wrong feedback message** | `tests/unit/strings.test.ts` | `Bulgarian Strings > Feedback strings from spec > should have wrong answer message` |
| **Level complete message** | `tests/unit/strings.test.ts` | `Bulgarian Strings > Feedback strings from spec > should have level complete message with star count` |

## Settings Validation Coverage

| Setting Validation | Test File | Test Name |
|-------------------|-----------|-----------|
| **upperLimit clamped 5-20** | `tests/unit/settings.test.ts` | `Settings > Setting validation and clamping > should clamp upperLimit to range 5-20` |
| **balloonCount clamped 2-5** | `tests/unit/settings.test.ts` | `Settings > Setting validation and clamping > should clamp balloonCount to range 2-5` |
| **correctBalloonsPerLevel 5-20** | `tests/unit/settings.test.ts` | `Settings > Setting validation and clamping > should clamp correctBalloonsPerLevel to range 5-20` |
| **operations validation** | `tests/unit/settings.test.ts` | `Settings > Setting validation and clamping > should validate operations setting` |
| **balloonSpeed validation** | `tests/unit/settings.test.ts` | `Settings > Setting validation and clamping > should validate balloonSpeed setting` |
| **partial settings merge** | `tests/unit/settings.test.ts` | `Settings > Setting validation and clamping > should merge partial settings with defaults` |
| **localStorage integration** | `tests/unit/settings.test.ts` | `Settings > localStorage integration > should use localStorage key correctly` |
| **corrupted data handling** | `tests/unit/settings.test.ts` | `Settings > localStorage integration > should handle corrupted localStorage gracefully` |
| **min correctBalloonsPerLevel** | `tests/unit/scoring.test.ts` | `Scoring > Setting ranges: correctBalloonsPerLevel 5-20 > should handle minimum correctBalloonsPerLevel of 5` |
| **max correctBalloonsPerLevel** | `tests/unit/scoring.test.ts` | `Scoring > Setting ranges: correctBalloonsPerLevel 5-20 > should handle maximum correctBalloonsPerLevel of 20` |

## Test Statistics

### Unit Tests
- **Total test files:** 5
- **Total tests:** 74
  - **Failing:** 62 (all with "not implemented" - correct)
  - **Passing:** 12 (Bulgarian string constants)

### E2E Tests
- **Total tests:** 14
  - All timeout waiting for `window.__tatematika` (unimplemented test hook API)

### Sample Failure Reasons

**Unit test failure (expected):**
```
Error: not implemented
 ❯ Module.generateFormula src/game-logic/formula-generator.ts:10:9
```

**E2E test failure (expected):**
```
Error: page.waitForFunction: Test timeout of 30000ms exceeded.
await page.waitForFunction(() => window.__tatematika !== undefined)
```

All failures are correct - tests fail on not-implemented stubs, not on syntax, imports, or type errors.
