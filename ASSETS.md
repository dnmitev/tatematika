# Assets Documentation - Котето и балоните

## Visual Assets

All visual assets in this game are created programmatically using Phaser 3's Graphics API. No external image files are used.

### Cat (Котето)

**Source**: Programmatically drawn using Phaser.GameObjects.Graphics  
**License**: CC0 / Public Domain (created specifically for this project)  
**Location**: `src/scenes/GameScene.ts`, method `drawCat()`  
**Description**: Simple geometric representation of a smiling cat:
- Orange ellipse body
- Two triangular ears
- White circles with black pupils for eyes
- Curved line for smiling mouth
- Swaying tail and paws

**Animation (К23)**: Native Phaser animation, redrawn every frame from code in `drawCat()` (pose chosen by `getCatPose()`). Nothing is loaded from a file or another site.
- Rest: tail sway, gentle breathing, slowly looking around
- Walk: faster tail, alternating paws, eyes look in the walking direction
- Jump: stretched body, eyes up
- Landing: short squash (250 ms) with no extra input lock
- Correct answer: wider smile and quick tail wag; after a wrong answer the cat keeps its normal smile
- The whole drawing stays inside the cat's ear-to-ear width, and alpha and visibility never change (no blinking)

### Feedback icons (К21, К22)

**Source**: Inline SVG markup written for this project in `src/scenes/GameScene.ts` (`CUP_SVG`, `RED_X_SVG`)  
**License**: CC0 / Public Domain (created specifically for this project)  
**Description**: A gold cup with the accessible name „Вярно“ and a red X with the accessible name „Грешно“. The shapes differ so meaning does not rely on colour alone, and the names are not shown as text.

### Balloons (Балоните)

**Source**: Programmatically drawn using Phaser.GameObjects.Graphics  
**License**: CC0 / Public Domain (created specifically for this project)  
**Location**: `src/scenes/GameScene.ts`, method `drawBalloon()`  
**Description**: Simple circular balloons in various colors:
- Colors: Red (#FF6B6B), Yellow (#FFD93D), Blue (#4D96FF), Green (#6BCB77), Purple (#A78BFA)
- Each balloon keeps one colour while on screen (picked from its position and the round, not at random per draw)
- Each balloon is a filled circle with a thin string line
- Hint: a constant orange outline on the correct balloon after two wrong attempts
- Math formulas are rendered as text overlays using Phaser.GameObjects.Text

### Background

**Source**: CSS solid color  
**License**: CC0 / Public Domain  
**Location**: `index.html` and scene background  
**Description**: Sky blue (#87CEEB) background representing a clear sky

### Confetti (correct pop and level end)

**Source**: Programmatically created using Phaser.GameObjects.Rectangle  
**License**: CC0 / Public Domain (created specifically for this project)  
**Location**: `src/scenes/GameScene.ts`, methods `spawnConfetti()` and `updateConfetti()`  
**Description**: Small 8×12 px rectangles in the balloon palette plus pink (#FF8FCF):
- Correct pop: one burst of 24 pieces from the popped balloon
- Level end: small showers from below the title every 350 ms while „Ти успя!“ is shown
- Pieces fall and turn smoothly with constant colour and opacity (no blinking), start below the top panel and title, never move up into the panel, and are drawn under the panel

### Level-end dance

**Source**: Native Phaser animation in `src/scenes/GameScene.ts`, method `updateCelebration()`  
**License**: CC0 / Public Domain (created specifically for this project)  
**Description**: While „Ти успя!“ is shown, the cat hops in place (22 px, one hop every 350 ms) with its happy smile and tail wag from `drawCat()`

## Fonts

**Source**: System default Arial font  
**License**: Included with operating systems  
**Usage**: All text rendering in the game uses Arial for Bulgarian Cyrillic characters

## Emojis

**Star**: ⭐ (U+2B50)  
**Sound On**: 🔊 (U+1F50A)  
**Sound Off**: 🔇 (U+1F507)  
**Source**: Unicode emoji characters  
**License**: Unicode standard, freely usable

## Text Content

All text strings are in Bulgarian Cyrillic and are defined in `src/game-logic/strings.ts`. These are original text created for this game and are CC0 / Public Domain.

## Attribution

All visual and audio assets are either:
1. Programmatically generated specifically for this project (CC0 / Public Domain)
2. Standard Unicode characters and system fonts
3. No external images, sounds, or third-party assets are used

This ensures full compliance with the requirement to use only self-made or CC0 assets.

## Sound Effects

All sound effects are generated programmatically using the Web Audio API. No external audio files are used.

### Programmatically Generated Sounds

**Pop Sound (Correct Balloon)**
- **Source**: Web Audio API OscillatorNode
- **License**: CC0 / Public Domain (generated code)
- **Location**: `src/scenes/GameScene.ts`, method `playSound('pop')`
- **Description**: 800Hz to 100Hz frequency sweep over 0.1s, exponential decay

**Boing Sound (Wrong Balloon Bounce)**
- **Source**: Web Audio API OscillatorNode
- **License**: CC0 / Public Domain (generated code)
- **Location**: `src/scenes/GameScene.ts`, method `playSound('boing')`
- **Description**: 200Hz to 600Hz frequency sweep over 0.2s, spring-like bounce

**Meow Sound (Wrong Attempt)**
- **Source**: Web Audio API OscillatorNode
- **License**: CC0 / Public Domain (generated code)
- **Location**: `src/scenes/GameScene.ts`, method `playSound('meow')`
- **Description**: 400Hz → 600Hz → 300Hz frequency modulation over 0.3s, cat-like vocalization

**Level Complete Melody**
- **Source**: Web Audio API OscillatorNode
- **License**: CC0 / Public Domain (generated code)
- **Location**: `src/scenes/GameScene.ts`, method `playSound('level-complete')`
- **Description**: Four-note ascending melody (C, D, E, G) using frequencies 523.25Hz, 587.33Hz, 659.25Hz, 783.99Hz

All sounds respect the mute button state and are only played when audio is enabled.
