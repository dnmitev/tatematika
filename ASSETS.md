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

### Balloons (Балоните)

**Source**: Programmatically drawn using Phaser.GameObjects.Graphics  
**License**: CC0 / Public Domain (created specifically for this project)  
**Location**: `src/scenes/GameScene.ts`, method `drawBalloon()`  
**Description**: Simple circular balloons in various colors:
- Colors: Red (#FF6B6B), Yellow (#FFD93D), Green (#6BCB77), Blue (#4D96FF), Purple (#A78BFA)
- Each balloon is a filled circle with a thin string line
- Math formulas are rendered as text overlays using Phaser.GameObjects.Text

### Background

**Source**: CSS solid color  
**License**: CC0 / Public Domain  
**Location**: `index.html` and scene background  
**Description**: Sky blue (#87CEEB) background representing a clear sky

### Confetti (Level Complete)

**Source**: Programmatically created using Phaser.GameObjects.Rectangle  
**License**: CC0 / Public Domain (created specifically for this project)  
**Location**: `src/scenes/LevelCompleteScene.ts`, method `createConfetti()`  
**Description**: Small colored rectangles animated to fall from top to bottom

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

## Future Enhancements

If sound effects are added in the future, they should be sourced from CC0 libraries such as:
- Freesound.org (CC0 licensed sounds)
- OpenGameArt.org (CC0 licensed sounds)
- Or created specifically for this project

All such additions must be documented here with proper attribution.
