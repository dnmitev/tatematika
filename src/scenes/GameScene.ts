import Phaser from 'phaser'
import type { GameState, Balloon } from '../game-logic/types'
import { createInitialState, addStar, isLevelComplete, startNewLevel } from '../game-logic/scoring'
import { checkBalloon, handleCorrectPop, handleWrongAttempt, shouldShowHint, resetBalloons, createRound } from '../game-logic/round'
import { loadSettings, saveSettings, updateSetting, DEFAULT_SETTINGS } from '../game-logic/settings'
import { CORRECT_ANSWER_LABEL, WRONG_ANSWER_MESSAGE, TARGET_INSTRUCTION, LEVEL_COMPLETE_TITLE, LEVEL_COMPLETE_MESSAGE } from '../game-logic/strings'
import { SettingsUI } from '../settings-ui'
import { LevelCompleteUI } from '../level-complete-ui'

// Must cover drawCat's ear tips at x ± 30
const CAT_HALF_WIDTH = 30
// Matches the approved jump-corridor spec: cat half-width plus 4px on each side
const JUMP_CORRIDOR_MARGIN = 4
const BALLOON_COLORS = [0xFF6B6B, 0xFFD93D, 0x4D96FF, 0x6BCB77, 0xA78BFA]
const HINT_OUTLINE_COLOR = 0xFF8C00
const CUP_SVG = '<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" focusable="false"><path d="M18 8h28v14c0 9-6 16-14 16s-14-7-14-16z" fill="#FFC107" stroke="#B8860B" stroke-width="2"/><path d="M18 12H9c0 9 4 14 10 15M46 12h9c0 9-4 14-10 15" fill="none" stroke="#B8860B" stroke-width="4" stroke-linecap="round"/><rect x="28" y="38" width="8" height="10" fill="#FFC107" stroke="#B8860B" stroke-width="2"/><rect x="18" y="48" width="28" height="8" rx="2" fill="#FFC107" stroke="#B8860B" stroke-width="2"/></svg>'
const RED_X_SVG = '<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" focusable="false"><path d="M14 14L50 50M50 14L14 50" stroke="#E53935" stroke-width="12" stroke-linecap="round"/></svg>'

type CatPose = 'idle' | 'walk' | 'jump' | 'landing' | 'happy'

interface BalloonSprite {
  id: string
  sprite: Phaser.GameObjects.Graphics
  text: Phaser.GameObjects.Text
  y: number
  x: number
  spawnY: number
  color: number
  width: number
  height: number
  hasHintOutline: boolean
  isCorrect: boolean
  isBouncing: boolean
  isPopping: boolean
  bounceStartTime?: number
  popStartTime?: number
}

export class GameScene extends Phaser.Scene {
  private gameState!: GameState
  private cat!: Phaser.GameObjects.Graphics
  private catX: number = 0
  private catY: number = 0
  private catTargetX: number = 0
  private catIsJumping: boolean = false
  private catJumpStartY: number = 0
  private catJumpTime: number = 0
  private balloonSprites: BalloonSprite[] = []
  private targetText!: Phaser.GameObjects.Text
  private starsText!: Phaser.GameObjects.Text
  private wrongAttemptsText!: Phaser.GameObjects.Text
  private feedbackIcon: HTMLDivElement | null = null
  private muteButton!: Phaser.GameObjects.Text
  private settingsButton!: HTMLButtonElement
  private isMuted: boolean = false
  private balloonSpeed: number = 30
  private roundColorOffset: number = 0
  private colorRoundKey: string = ''
  private landingStartTime: number = 0
  private happyUntil: number = 0
  private levelEndText: string | null = null
  private lastPlayedSound: string | null = null
  private soundPlayCount: number = 0
  private pendingJumpBalloonId: string | null = null
  private jumpTargetBalloonId: string | null = null
  private jumpContactMade: boolean = false
  private popAnimationStartTime: number = 0
  private popAnimationCompleted: boolean = false
  private actionLocked: boolean = false
  private actionTargetBalloonId: string | null = null
  private landingFrameTime: number = 0
  private activeAudioContexts: AudioContext[] = []
  private activeOscillators: { oscillator: OscillatorNode, gainNode: GainNode, context: AudioContext }[] = []
  
  private settingsUI!: SettingsUI
  private levelCompleteUI!: LevelCompleteUI
  
  private formulaFontSize: number = 32
  private targetFontSize: number = 32
  private currentJumpHeight: number = 80

  constructor() {
    super({ key: 'GameScene' })
  }

  shutdown() {
    // Stop and clean up all active audio
    for (const { oscillator, gainNode, context } of this.activeOscillators) {
      try {
        oscillator.stop(0)
        oscillator.disconnect()
        gainNode.disconnect()
        context.close()
      } catch (e) {
        // Already stopped/disconnected
      }
    }
    this.activeOscillators = []
    this.activeAudioContexts = []
    this.clearFeedbackIcon()
    
    if (this.settingsButton && this.settingsButton.parentElement) {
      this.settingsButton.removeEventListener('click', () => this.openSettings())
      this.settingsButton.remove()
    }
    
    if (this.settingsUI) {
      this.settingsUI.destroy()
    }
    
    if (this.levelCompleteUI) {
      this.levelCompleteUI.destroy()
    }
    
    this.events.off('shutdown', this.shutdown, this)
  }

  create() {
    const settings = loadSettings()
    this.gameState = createInitialState(settings)
    this.balloonSpeed = settings.balloonSpeed === 'medium' ? 50 : 30

    this.scale.on('resize', this.handleResize, this)
    
    this.calculateFontSizes()
    
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x87CEEB)

    this.createCat()
    this.createUI()
    this.createBalloons()

    this.input.keyboard?.on('keydown', this.handleKeyDown, this)
    this.input.on('pointerdown', this.handlePointerDown, this)
    
    this.events.once('shutdown', this.shutdown, this)
  }
  
  private calculateFontSizes() {
    const minCSSPixels = 32
    this.formulaFontSize = Math.max(minCSSPixels, Math.min(this.scale.width / 12, 60))
    this.targetFontSize = Math.max(minCSSPixels, Math.min(this.scale.width / 10, 72))
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    this.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height)
    
    const settingsWasOpen = this.settingsUI?.isOpen() ?? false
    const levelCompleteWasVisible = this.levelCompleteUI?.isVisible() ?? false
    const levelCompleteStars = this.gameState?.stars ?? 0
    
    if (this.settingsButton && this.settingsButton.parentElement) {
      this.settingsButton.remove()
    }
    
    if (this.settingsUI) {
      this.settingsUI.destroy()
    }
    
    if (this.levelCompleteUI) {
      this.levelCompleteUI.destroy()
    }
    
    this.clearFeedbackIcon()
    this.calculateFontSizes()
    this.children.removeAll(true)
    
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x87CEEB)
    this.createCat()
    this.createUI()
    this.createBalloons()
    
    if (settingsWasOpen) {
      this.settingsUI.open()
    }
    
    if (levelCompleteWasVisible) {
      this.showLevelComplete()
    }
  }

  private createCat() {
    this.catX = this.scale.width / 2
    this.catTargetX = this.catX
    const hudBottomMargin = Math.max(80, this.targetFontSize + 40)
    this.catY = this.scale.height - hudBottomMargin - 40
    this.catJumpStartY = this.catY
    this.cat = this.add.graphics()
    this.drawCat(this.cat, this.catX, this.catY)
  }

  private calculateJumpHeight(): number {
    if (!this.balloonSprites || this.balloonSprites.length === 0) {
      return 80
    }
    
    const catEarsTop = this.catJumpStartY - 40
    
    const targetBalloon = this.balloonSprites.find(bs => 
      this.gameState.round.balloons.find(b => b.id === bs.id && b.isCorrect)
    )
    
    let minClearance = 80
    
    for (const bs of this.balloonSprites) {
      if (!bs.sprite || !bs.sprite.input) continue
      if (targetBalloon && bs.id === targetBalloon.id) continue
      
      const hitArea = bs.sprite.input.hitArea as Phaser.Geom.Ellipse
      const balloonRadius = hitArea ? hitArea.height / 2 : 32
      const balloonBottom = bs.y + balloonRadius
      const clearance = catEarsTop - balloonBottom
      
      if (clearance > 0 && clearance < minClearance) {
        minClearance = clearance
      }
    }
    
    const safetyMargin = 15
    const minVisibleJump = 20
    const maxJumpForNonTargets = 80
    let calculatedJump = Math.max(minVisibleJump, minClearance - safetyMargin)
    
    // Cap at max for non-target avoidance
    calculatedJump = Math.min(calculatedJump, maxJumpForNonTargets)
    
    // Ensure cat actually reaches the target balloon (can exceed maxJumpForNonTargets if needed)
    if (targetBalloon && targetBalloon.sprite && targetBalloon.sprite.input) {
      const hitArea = targetBalloon.sprite.input.hitArea as Phaser.Geom.Ellipse
      const targetRadius = hitArea ? hitArea.height / 2 : 32
      const targetBottom = targetBalloon.y + targetRadius
      const heightToReachTarget = catEarsTop - targetBottom
      
      // Cat needs to jump at least this high to reach target bottom
      // Allow exceeding maxJumpForNonTargets to reach the actual target
      calculatedJump = Math.max(calculatedJump, heightToReachTarget)
    }
    
    return calculatedJump
  }

  private getCatPose(): CatPose {
    const now = this.time.now
    if (this.catIsJumping) return 'jump'
    if (this.landingStartTime > 0 && now - this.landingStartTime < 250) return 'landing'
    if (Math.abs(this.catX - this.catTargetX) > 2) return 'walk'
    if (now < this.happyUntil) return 'happy'
    return 'idle'
  }

  // Everything stays inside x ± CAT_HALF_WIDTH and below the ear tips at y - 40,
  // so the painted bounds used for the jump corridor do not change with the pose.
  private drawCat(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
    const pose = this.getCatPose()
    const t = (this.time?.now ?? 0) / 1000
    graphics.clear()

    const tailPeriod = pose === 'walk' ? 0.5 : pose === 'happy' ? 0.4 : 1.2
    const sway = Math.sin((t * Math.PI * 2) / tailPeriod) * 6
    graphics.lineStyle(5, 0xE69500, 1)
    graphics.beginPath()
    graphics.moveTo(x + 16, y + 12)
    graphics.lineTo(x + 25, y + 2)
    graphics.lineTo(x + 23 + sway * 0.4, y - 14 + sway)
    graphics.strokePath()

    let bodyWidth = 50
    let bodyHeight = 45 + Math.sin(t * Math.PI * 1.25) * 1.5
    if (pose === 'jump') {
      bodyWidth = 46
      bodyHeight = 49
    } else if (pose === 'landing') {
      bodyWidth = 56
      bodyHeight = 39
    }
    graphics.fillStyle(0xFFA500, 1)
    graphics.fillEllipse(x, y, bodyWidth, bodyHeight)

    graphics.fillTriangle(x - 25, y - 20, x - 30, y - 40, x - 18, y - 25)
    graphics.fillTriangle(x + 25, y - 20, x + 30, y - 40, x + 18, y - 25)

    const step = pose === 'walk' ? Math.sin(t * Math.PI * 5) * 3 : 0
    const pawY = pose === 'jump' ? y + 16 : y + 17
    graphics.fillStyle(0xFFE0B2, 1)
    graphics.fillEllipse(x - 12, pawY - Math.max(0, step), 12, 8)
    graphics.fillEllipse(x + 12, pawY - Math.max(0, -step), 12, 8)

    const lookX = pose === 'walk'
      ? Math.sign(this.catTargetX - this.catX) * 2
      : Math.round(Math.sin(t * 0.9) * 2)
    const lookY = pose === 'happy' || pose === 'jump' ? -2 : 0
    graphics.fillStyle(0xFFFFFF, 1)
    graphics.fillCircle(x - 12, y - 8, 6)
    graphics.fillCircle(x + 12, y - 8, 6)
    graphics.fillStyle(0x000000, 1)
    graphics.fillCircle(x - 12 + lookX, y - 8 + lookY, 4)
    graphics.fillCircle(x + 12 + lookX, y - 8 + lookY, 4)

    graphics.lineStyle(2, 0x000000, 1)
    graphics.beginPath()
    graphics.arc(x, y + 6, pose === 'happy' ? 12 : 10, 0, Math.PI, false)
    graphics.strokePath()
  }

  private createUI() {
    const centerX = this.scale.width / 2
    const titleSize = Math.max(18, Math.min(28, this.scale.width / 18))
    const hudSize = Math.max(16, Math.min(24, this.scale.width / 20))
    const muteSize = Math.max(64, Math.min(80, this.scale.width / 6))
    
    const controlRowHeight = Math.max(muteSize + 20, 84)
    const titleRowMargin = 10
    const titleY = controlRowHeight + titleRowMargin + titleSize / 2
    
    this.add.text(centerX, titleY, 'Котето и балоните', {
      fontSize: `${titleSize}px`,
      color: '#FF1493',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    const hudBottomMargin = Math.max(80, this.targetFontSize + 40)
    const targetY = this.scale.height - hudBottomMargin + 15

    this.createTopPanel(controlRowHeight, muteSize)

    this.starsText = this.add.text(10, titleY + titleSize / 2 + 10, '', {
      fontSize: `${hudSize}px`,
      color: '#FFD700',
      fontStyle: 'bold'
    })

    this.wrongAttemptsText = this.add.text(this.scale.width - 10, targetY, '', {
      fontSize: `${Math.max(14, hudSize - 2)}px`,
      color: '#555555'
    }).setOrigin(1, 0)

    this.muteButton = this.add.text(this.scale.width - muteSize - 10, 10, '🔊', {
      fontSize: `${muteSize * 0.8}px`
    }).setInteractive(
      new Phaser.Geom.Rectangle(0, 0, muteSize, muteSize),
      Phaser.Geom.Rectangle.Contains
    )
    this.muteButton.input!.cursor = 'pointer'
    this.muteButton.on('pointerdown', () => this.toggleMute())

    this.createSettingsButton()
    this.settingsUI = new SettingsUI()
    this.levelCompleteUI = new LevelCompleteUI()

    this.updateUI()
  }

  private createTopPanel(controlRowHeight: number, muteSize: number) {
    const settingsSize = Math.max(64, Math.min(72, window.innerWidth / 6))
    const freeRight = this.scale.width - (muteSize + 20 + settingsSize) - 10
    const instructionSize = Math.max(24, Math.min(36, this.scale.width / 32))
    const panelFontSize = Math.min(this.targetFontSize, controlRowHeight - 28)
    const centerY = controlRowHeight / 2
    const padding = 16
    const gap = 14

    const instruction = this.add.text(0, centerY, TARGET_INSTRUCTION, {
      fontSize: `${instructionSize}px`,
      color: '#000000',
      fontStyle: 'bold'
    }).setOrigin(0, 0.5)

    this.targetText = this.add.text(0, centerY, '', {
      fontSize: `${panelFontSize}px`,
      color: '#000000',
      fontStyle: 'bold',
      backgroundColor: '#FFEB3B',
      padding: { x: 8, y: 4 }
    }).setOrigin(0, 0.5)

    // Reserve room for the widest possible target so the panel does not resize between rounds
    this.targetText.setText('20')
    const targetSlotWidth = this.targetText.width
    const panelWidth = padding + instruction.width + gap + targetSlotWidth + padding
    const panelHeight = Math.min(controlRowHeight - 8, Math.max(instruction.height, this.targetText.height) + 8)
    const panelCenterX = Math.max(panelWidth / 2 + 10, Math.min(this.scale.width / 2, freeRight - panelWidth / 2))
    const panelLeft = panelCenterX - panelWidth / 2

    const background = this.add.graphics()
    background.fillStyle(0xFFFFFF, 0.9)
    background.fillRoundedRect(panelLeft, centerY - panelHeight / 2, panelWidth, panelHeight, 16)
    background.lineStyle(3, 0xFF1493, 1)
    background.strokeRoundedRect(panelLeft, centerY - panelHeight / 2, panelWidth, panelHeight, 16)
    // Above balloons, the cat and effects so nothing can cover the panel
    background.setDepth(10)

    instruction.setX(panelLeft + padding).setDepth(11)
    this.targetText.setX(panelLeft + padding + instruction.width + gap).setDepth(11)
  }

  private createSettingsButton() {
    this.settingsButton = document.createElement('button')
    this.settingsButton.textContent = '⚙️'
    this.settingsButton.setAttribute('data-testid', 'button-settings')
    const buttonSize = Math.max(64, Math.min(72, window.innerWidth / 6))
    const muteSize = Math.max(64, Math.min(80, window.innerWidth / 6))
    const rightOffset = muteSize + 20
    this.settingsButton.style.cssText = `
      position: fixed;
      top: 10px;
      right: ${rightOffset}px;
      width: ${buttonSize}px;
      height: ${buttonSize}px;
      font-size: ${buttonSize / 2}px;
      background: rgba(255,255,255,0.8);
      border: 2px solid #4CAF50;
      border-radius: 8px;
      cursor: pointer;
      z-index: 9000;
    `
    this.settingsButton.addEventListener('click', () => this.openSettings())
    document.body.appendChild(this.settingsButton)
  }


  private updateUI() {
    this.targetText.setText(`${this.gameState.round.target}`)
    this.starsText.setText(`⭐ ${this.gameState.stars}`)
    this.wrongAttemptsText.setText(`Грешки: ${this.gameState.round.wrongAttempts}`)
  }

  private createBalloons() {
    this.balloonSprites.forEach(bs => {
      bs.sprite.destroy()
      bs.text.destroy()
    })
    this.balloonSprites = []

    const count = this.gameState.round.balloons.length
    
    const titleSize = Math.max(18, Math.min(28, this.scale.width / 18))
    const muteSize = Math.max(64, Math.min(80, this.scale.width / 6))
    const controlRowHeight = Math.max(muteSize + 20, 84)
    const titleRowMargin = 10
    const titleRowHeight = titleRowMargin + titleSize + 15
    const hudTopSpace = controlRowHeight + titleRowHeight + 10
    
    const hudBottomMargin = Math.max(80, this.targetFontSize + 40)
    const catHeight = 80
    const catTopMargin = 30
    const catBottomMargin = 20
    const hudBottomSpace = hudBottomMargin + catHeight + catTopMargin + catBottomMargin
    
    const availableHeight = this.scale.height - hudTopSpace - hudBottomSpace
    const availableWidth = this.scale.width
    const margin = Math.max(15, Math.min(this.scale.width * 0.04, 30))
    
    const minTarget = 64
    
    const tempTexts = this.gameState.round.balloons.map(balloon => 
      this.add.text(0, 0, balloon.formula.display, {
        fontSize: `${this.formulaFontSize}px`,
        color: '#000000',
        fontStyle: 'bold'
      })
    )
    
    const maxFormulaWidth = Math.max(...tempTexts.map(t => t.width))
    const maxFormulaHeight = Math.max(...tempTexts.map(t => t.height))
    tempTexts.forEach(t => t.destroy())
    
    const targetTextFitRatio = 0.8
    const formulaBasedMinWidth = maxFormulaWidth / Math.sqrt(targetTextFitRatio / 2)
    const formulaBasedMinHeight = maxFormulaHeight / Math.sqrt(targetTextFitRatio / 2)
    let balloonWidth = Math.max(minTarget, formulaBasedMinWidth)
    let balloonHeight = Math.max(minTarget, formulaBasedMinHeight)
    
    if (count >= 4) {
      const maxWidthForTwoCols = (availableWidth - 3 * margin) / 2
      const rows = count === 4 ? 2 : 3
      const maxHeight = (availableHeight - (rows + 1) * margin) / rows
      
      if (balloonWidth > maxWidthForTwoCols) {
        balloonWidth = Math.max(minTarget, maxWidthForTwoCols)
      }
      
      const neededHeight = rows * balloonHeight + (rows + 1) * margin
      if (neededHeight > availableHeight) {
        balloonHeight = Math.max(minTarget, maxHeight)
      }
      
      let textFitRatio = Math.pow(maxFormulaWidth / balloonWidth, 2) + Math.pow(maxFormulaHeight / balloonHeight, 2)
      
      if (textFitRatio > targetTextFitRatio) {
        if (balloonHeight < maxHeight) {
          const heightIncrease = Math.min(
            maxHeight - balloonHeight,
            balloonHeight * (Math.sqrt(textFitRatio / targetTextFitRatio) - 1)
          )
          balloonHeight += heightIncrease
          textFitRatio = Math.pow(maxFormulaWidth / balloonWidth, 2) + Math.pow(maxFormulaHeight / balloonHeight, 2)
        }
        
        if (textFitRatio > targetTextFitRatio && balloonWidth < maxWidthForTwoCols) {
          const widthIncrease = Math.min(
            maxWidthForTwoCols - balloonWidth,
            balloonWidth * (Math.sqrt(textFitRatio / targetTextFitRatio) - 1)
          )
          balloonWidth += widthIncrease
        }
      }
    }
    
    // Ensure desktop proportions: aspect ratio should be in [0.75, 1.05] for desktop
    // Desktop viewports: >= 1024px width
    if (this.scale.width >= 1024) {
      const currentAspect = balloonWidth / balloonHeight
      if (currentAspect < 0.75) {
        // Too tall, increase width
        balloonWidth = balloonHeight * 0.75
      } else if (currentAspect > 1.05) {
        // Too wide, increase height
        balloonHeight = balloonWidth / 1.05
      }
    }
    
    // Find the correct balloon index to ensure clear vertical corridor
    const correctBalloonIndex = this.gameState.round.balloons.findIndex(b => b.isCorrect)
    
    let positions: Array<{ x: number; y: number }> = []
    
    if (count <= 3) {
      const totalWidth = count * balloonWidth + (count - 1) * margin
      const canFitInRow = totalWidth <= availableWidth - 2 * margin
      
      if (canFitInRow) {
        const startX = (availableWidth - totalWidth) / 2 + balloonWidth / 2
        const y = hudTopSpace + availableHeight / 2
        positions = Array.from({ length: count }, (_, i) => ({
          x: startX + i * (balloonWidth + margin),
          y
        }))
      } else {
        // Narrow viewport - shrink to fit in one row
        // Single row = same Y for all, so no corridor conflicts
        const maxWidthForRow = (availableWidth - (count + 1) * margin) / count
        if (balloonWidth > maxWidthForRow) {
          balloonWidth = Math.max(minTarget, maxWidthForRow)
        }
        
        const totalWidth = count * balloonWidth + (count - 1) * margin
        const startX = (availableWidth - totalWidth) / 2 + balloonWidth / 2
        const y = hudTopSpace + availableHeight / 2
        
        positions = Array.from({ length: count }, (_, i) => ({
          x: startX + i * (balloonWidth + margin),
          y
        }))
      }
    } else if (count === 4) {
      // Count 4: 2×2 grid for both desktop and mobile
      // Array positions [0,1,2,3] map to cells (0,0), (0,1), (1,0), (1,1)
      
      // Ensure minimum top margin for safe zones
      const minTopMargin = 20
      const maxHeightWithMinMargin = availableHeight - 2 * minTopMargin
      const maxBalloonHeight = (maxHeightWithMinMargin - margin) / 2
      if (balloonHeight > maxBalloonHeight) {
        balloonHeight = Math.max(minTarget, maxBalloonHeight)
        // Re-apply desktop proportions after height adjustment
        if (this.scale.width >= 1024) {
          const currentAspect = balloonWidth / balloonHeight
          if (currentAspect < 0.75) {
            balloonWidth = balloonHeight * 0.75
          } else if (currentAspect > 1.05) {
            // Increase height to fix aspect ratio, but re-check safe zone constraint
            const desiredHeight = balloonWidth / 1.05
            if (desiredHeight <= maxBalloonHeight) {
              balloonHeight = desiredHeight
            } else {
              // Safe zone constraint takes priority; shrink width instead
              balloonWidth = balloonHeight * 1.05
            }
          }
        }
      }
      
      const leftMargin = (availableWidth - (2 * balloonWidth + margin)) / 2
      const col1 = leftMargin + balloonWidth / 2
      const col2 = col1 + balloonWidth + margin
      
      const finalTotalHeight = 2 * balloonHeight + margin
      const topMargin = Math.max(minTopMargin, (availableHeight - finalTotalHeight) / 2)
      const y1 = hudTopSpace + topMargin + balloonHeight / 2
      const y2 = y1 + balloonHeight + margin
      
      positions = [
        { x: col1, y: y1 },
        { x: col2, y: y1 },
        { x: col1, y: y2 },
        { x: col2, y: y2 }
      ]
    } else {
      // Count 5: 4+1 layout (4 on top row, 1 on bottom row)
      // Array positions [0,1,2,3,4] map to cells (0,0), (0,1), (0,2), (0,3), (1,0)
      
      // Ensure minimum top margin for safe zones
      const minTopMargin = 20
      const maxHeightWithMinMargin = availableHeight - 2 * minTopMargin
      const rows = 2
      const maxBalloonHeight = (maxHeightWithMinMargin - margin) / rows
      if (balloonHeight > maxBalloonHeight) {
        balloonHeight = Math.max(minTarget, maxBalloonHeight)
        // Re-apply desktop proportions after height adjustment
        if (this.scale.width >= 1024) {
          const currentAspect = balloonWidth / balloonHeight
          if (currentAspect < 0.75) {
            balloonWidth = balloonHeight * 0.75
          } else if (currentAspect > 1.05) {
            // Increase height to fix aspect ratio, but re-check safe zone constraint
            const desiredHeight = balloonWidth / 1.05
            if (desiredHeight <= maxBalloonHeight) {
              balloonHeight = desiredHeight
            } else {
              // Safe zone constraint takes priority; shrink width instead
              balloonWidth = balloonHeight * 1.05
            }
          }
        }
      }
      
      const maxWidthForTopRow = (availableWidth - 5 * margin) / 4
      if (balloonWidth > maxWidthForTopRow) {
        balloonWidth = Math.max(minTarget, maxWidthForTopRow)
      }
      
      const finalTotalHeight = rows * balloonHeight + margin
      const topMargin = Math.max(minTopMargin, (availableHeight - finalTotalHeight) / 2)
      const y1 = hudTopSpace + topMargin + balloonHeight / 2
      const y2 = y1 + balloonHeight + margin
      
      const topRowWidth = 4 * balloonWidth + 3 * margin
      const topRowStartX = (availableWidth - topRowWidth) / 2 + balloonWidth / 2
      
      const bottomRowX = availableWidth / 2
      
      positions = [
        { x: topRowStartX, y: y1 },
        { x: topRowStartX + balloonWidth + margin, y: y1 },
        { x: topRowStartX + 2 * (balloonWidth + margin), y: y1 },
        { x: topRowStartX + 3 * (balloonWidth + margin), y: y1 },
        { x: bottomRowX, y: y2 }
      ]
    }
    
    if (count >= 4) {
      this.clearTargetJumpCorridor(positions, correctBalloonIndex, balloonWidth, margin, availableWidth)
    }

    const fontSize = this.fitFormulaFontSize(balloonWidth, balloonHeight)
    
    const roundKey = this.gameState.round.balloons.map(b => b.id).join(',')
    if (roundKey !== this.colorRoundKey) {
      this.colorRoundKey = roundKey
      this.roundColorOffset = (this.roundColorOffset + 1) % BALLOON_COLORS.length
    }
    const showHint = shouldShowHint(this.gameState.round)

    this.gameState.round.balloons.forEach((balloon, index) => {
      const { x, y } = positions[index]
      const color = BALLOON_COLORS[(index + this.roundColorOffset) % BALLOON_COLORS.length]
      const hasHintOutline = showHint && balloon.isCorrect

      const sprite = this.add.graphics()
      this.drawBalloon(sprite, color, balloonWidth, balloonHeight, hasHintOutline)
      sprite.setPosition(x, y)
      sprite.setInteractive(
        new Phaser.Geom.Ellipse(0, 0, balloonWidth, balloonHeight),
        Phaser.Geom.Ellipse.Contains
      )
      sprite.on('pointerdown', () => this.handleBalloonClick(balloon.id))

      const text = this.add.text(0, 0, balloon.formula.display, {
        fontSize: `${fontSize}px`,
        color: '#000000',
        fontStyle: 'bold'
      }).setOrigin(0.5)
      text.setPosition(x, y)

      this.balloonSprites.push({
        id: balloon.id,
        sprite,
        text,
        x,
        y,
        spawnY: y,
        color,
        width: balloonWidth,
        height: balloonHeight,
        hasHintOutline,
        isCorrect: balloon.isCorrect,
        isBouncing: false,
        isPopping: false
      })
    })
    
    this.currentJumpHeight = this.calculateJumpHeight()
  }

  /**
   * Largest formula font (up to formulaFontSize) whose rendered text box keeps all four
   * corners inside the balloon ellipse, measured on the real Phaser text. Never below
   * 32 CSS px; balloon size and layout are not changed.
   */
  private fitFormulaFontSize(balloonWidth: number, balloonHeight: number): number {
    const canvasWidth = this.game.canvas?.getBoundingClientRect().width || this.scale.width
    const cssScale = canvasWidth / this.scale.width
    const minFontSize = Math.ceil(32 / cssScale)
    const fitLimit = 0.95
    const rx = balloonWidth / 2
    const ry = balloonHeight / 2
    const probe = this.add.text(0, 0, '', { fontSize: `${this.formulaFontSize}px`, fontStyle: 'bold' })

    const cornerRatio = (fontSize: number) => {
      probe.setFontSize(fontSize)
      let worst = 0
      for (const balloon of this.gameState.round.balloons) {
        probe.setText(balloon.formula.display)
        const ratio = Math.pow(probe.width / 2 / rx, 2) + Math.pow(probe.height / 2 / ry, 2)
        worst = Math.max(worst, ratio)
      }
      return worst
    }

    let fontSize = Math.floor(this.formulaFontSize)
    while (fontSize > minFontSize && cornerRatio(fontSize) > fitLimit) {
      fontSize--
    }
    probe.destroy()
    return Math.max(fontSize, minFontSize)
  }

  /**
   * The cat jumps straight up from under the target, so balloons in rows below
   * the target must stay out of the vertical strip the cat sweeps.
   * Lower-row balloons keep their row and left-to-right order; among the
   * arrangements that keep them on screen, the one closest to the default
   * layout is used. If none fits (very narrow viewports), layout is unchanged.
   */
  private clearTargetJumpCorridor(
    positions: Array<{ x: number; y: number }>,
    targetIndex: number,
    balloonWidth: number,
    margin: number,
    availableWidth: number
  ) {
    const target = positions[targetIndex]
    if (!target) return
    
    const lower = positions
      .map((p, index) => ({ index, x: p.x, y: p.y }))
      .filter(p => p.y > target.y)
      .sort((a, b) => a.x - b.x)
    if (lower.length === 0) return
    
    const radiusX = balloonWidth / 2
    // Keep a normal inter-balloon margin between a balloon's edge and the corridor edge
    const minCenterOffset = CAT_HALF_WIDTH + JUMP_CORRIDOR_MARGIN + radiusX + margin
    if (lower.every(p => Math.abs(p.x - target.x) >= minCenterOffset)) return
    
    const minX = margin + radiusX
    const maxX = availableWidth - margin - radiusX
    const step = balloonWidth + margin
    const k = lower.length
    
    let best: number[] | null = null
    let bestCost = Infinity
    for (let leftCount = 0; leftCount <= k; leftCount++) {
      const xs: number[] = []
      for (let i = 0; i < leftCount; i++) {
        xs.push(target.x - minCenterOffset - (leftCount - 1 - i) * step)
      }
      for (let i = 0; i < k - leftCount; i++) {
        xs.push(target.x + minCenterOffset + i * step)
      }
      if (xs.some(x => x < minX || x > maxX)) continue
      
      const cost = xs.reduce((sum, x, i) => sum + Math.abs(x - lower[i].x), 0)
      if (cost < bestCost) {
        bestCost = cost
        best = xs
      }
    }
    
    if (!best) return
    best.forEach((x, i) => {
      positions[lower[i].index] = { x, y: lower[i].y }
    })
  }

  private drawBalloon(graphics: Phaser.GameObjects.Graphics, color: number, width: number, height: number, hintOutline: boolean) {
    const x = 0
    const y = 0
    graphics.clear()
    graphics.fillStyle(color, 0.9)
    graphics.fillEllipse(x, y, width, height)
    if (hintOutline) {
      // Constant hint contour on the balloon edge, outside the formula text
      graphics.lineStyle(6, HINT_OUTLINE_COLOR, 1)
    } else {
      graphics.lineStyle(3, 0x000000, 0.4)
    }
    graphics.strokeEllipse(x, y, width, height)
    
    graphics.fillStyle(0xFFFFFF, 0.3)
    graphics.fillEllipse(x - width/4, y - height/4, width/2, height/2)
    
    graphics.lineStyle(2, 0x000000, 0.5)
    graphics.beginPath()
    graphics.moveTo(x, y + height/2)
    graphics.lineTo(x, y + height/2 + 20)
    graphics.strokePath()
  }

  private handleBalloonClick(balloonId: string) {
    this.clickBalloon(balloonId)
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer) {
    if (this.settingsUI && this.settingsUI.isOpen()) return
    
    for (const balloon of this.balloonSprites) {
      if (balloon.sprite && balloon.sprite.input) {
        const hitArea = balloon.sprite.input.hitArea as Phaser.Geom.Ellipse
        const radiusX = hitArea.width / 2
        const radiusY = hitArea.height / 2
        const dx = (pointer.x - balloon.x) / radiusX
        const dy = (pointer.y - balloon.y) / radiusY
        if (dx * dx + dy * dy <= 1) {
          this.handleBalloonClick(balloon.id)
          break
        }
      }
    }
  }

  private jumpToBalloon(balloonId: string) {
    // Balloons keep descending between rounds, so size the jump to where they are now
    this.currentJumpHeight = this.calculateJumpHeight()
    this.catIsJumping = true
    this.catJumpStartY = this.catY
    this.catJumpTime = 0
    this.jumpTargetBalloonId = balloonId
    this.jumpContactMade = false
    this.popAnimationStartTime = 0
    this.popAnimationCompleted = false
    
    const isCorrect = checkBalloon(this.gameState.round, balloonId)
    
    if (!isCorrect) {
      this.handleWrongBalloon(balloonId)
    }
  }

  private handleWrongBalloon(balloonId: string) {
    const balloon = this.balloonSprites.find(b => b.id === balloonId)
    if (balloon) {
      balloon.isBouncing = true
      balloon.bounceStartTime = this.time.now
      this.playSound('boing')
    }
    
    this.playSound('meow')
    this.showFeedbackIcon('wrong')
    this.gameState.round = handleWrongAttempt(this.gameState.round)
    this.applyHintOutline()
    this.updateUI()
  }

  private applyHintOutline() {
    if (!shouldShowHint(this.gameState.round)) return
    for (const bs of this.balloonSprites) {
      if (!bs.isCorrect || bs.hasHintOutline) continue
      bs.hasHintOutline = true
      this.drawBalloon(bs.sprite, bs.color, bs.width, bs.height, true)
    }
  }

  private playSound(soundName: string) {
    if (this.isMuted) return
    
    this.lastPlayedSound = soundName
    this.soundPlayCount++
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    if (soundName === 'pop') {
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.1)
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.1)
      
      // Track for mute functionality
      this.activeOscillators.push({ oscillator, gainNode, context: audioContext })
    } else if (soundName === 'boing') {
      oscillator.frequency.setValueAtTime(200, audioContext.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.2)
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.2)
      
      // Track for mute functionality
      this.activeOscillators.push({ oscillator, gainNode, context: audioContext })
    } else if (soundName === 'meow') {
      oscillator.frequency.setValueAtTime(400, audioContext.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.15)
      oscillator.frequency.exponentialRampToValueAtTime(300, audioContext.currentTime + 0.3)
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)
      
      // Track for mute functionality
      this.activeOscillators.push({ oscillator, gainNode, context: audioContext })
    } else if (soundName === 'level-complete') {
      const notes = [523.25, 587.33, 659.25, 783.99]
      notes.forEach((freq, i) => {
        const osc = audioContext.createOscillator()
        const gain = audioContext.createGain()
        osc.connect(gain)
        gain.connect(audioContext.destination)
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.2, audioContext.currentTime + i * 0.2)
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.2 + 0.3)
        osc.start(audioContext.currentTime + i * 0.2)
        osc.stop(audioContext.currentTime + i * 0.2 + 0.3)
        
        // Track for mute functionality
        this.activeOscillators.push({ oscillator: osc, gainNode: gain, context: audioContext })
      })
    }
  }

  /**
   * Feedback zone: bottom-left strip under the cat, clear of the top panel and of the
   * balloons, which return to the top before reaching the cat. The icon is a DOM element so
   * it carries an accessible name without showing it as text. One icon at a time.
   */
  private showFeedbackIcon(kind: 'correct' | 'wrong') {
    this.clearFeedbackIcon()
    const canvas = this.game.canvas
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scale = rect.width / this.scale.width
    const hudBottomMargin = Math.max(80, this.targetFontSize + 40)
    const size = Math.max(64, Math.min(80, hudBottomMargin - 16))
    const top = this.scale.height - hudBottomMargin + (hudBottomMargin - size) / 2

    const icon = document.createElement('div')
    icon.setAttribute('role', 'img')
    icon.setAttribute('aria-label', kind === 'correct' ? CORRECT_ANSWER_LABEL : WRONG_ANSWER_MESSAGE)
    icon.setAttribute('data-testid', kind === 'correct' ? 'feedback-cup' : 'feedback-red-x')
    icon.innerHTML = kind === 'correct' ? CUP_SVG : RED_X_SVG
    icon.style.cssText = `
      position: fixed;
      left: ${rect.left + 16 * scale}px;
      top: ${rect.top + top * scale}px;
      width: ${size * scale}px;
      height: ${size * scale}px;
      pointer-events: none;
      z-index: 8000;
    `
    document.body.appendChild(icon)
    this.feedbackIcon = icon
  }

  private clearFeedbackIcon() {
    if (this.feedbackIcon) {
      this.feedbackIcon.remove()
      this.feedbackIcon = null
    }
  }

  private showLevelComplete() {
    const stars = this.gameState.stars
    this.clearFeedbackIcon()
    this.levelEndText = `${LEVEL_COMPLETE_TITLE} ${LEVEL_COMPLETE_MESSAGE(stars)}`
    this.playSound('level-complete')
    
    this.levelCompleteUI.show(
      stars,
      () => this.handlePlayAgain(),
      () => this.handleToMenu()
    )
  }

  private handlePlayAgain() {
    this.levelCompleteUI.hide()
    this.catIsJumping = false
    this.catJumpTime = 0
    this.pendingJumpBalloonId = null
    this.jumpTargetBalloonId = null
    this.jumpContactMade = false
    this.popAnimationStartTime = 0
    this.popAnimationCompleted = false
    this.actionLocked = false
    this.actionTargetBalloonId = null
    this.landingFrameTime = 0
    this.catTargetX = this.catX
    this.catY = this.catJumpStartY
    this.drawCat(this.cat, this.catX, this.catY)
    this.gameState = startNewLevel(this.gameState)
    this.createBalloons()
    this.updateUI()
  }

  private handleToMenu() {
    this.levelCompleteUI.hide()
    this.scene.restart()
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (this.settingsUI && this.settingsUI.isOpen()) return
    
    // K12-K16: Full input ignore during action lifecycle
    if (this.actionLocked) return
    
    if (event.key === 'ArrowLeft') {
      this.moveCat(-1)
    } else if (event.key === 'ArrowRight') {
      this.moveCat(1)
    } else if (event.key === ' ' || event.key === 'ArrowUp') {
      this.jump()
    }
  }

  private moveCat(direction: number) {
    this.catTargetX += direction * 100
    this.catTargetX = Phaser.Math.Clamp(this.catTargetX, 60, this.scale.width - 60)
  }

  private jump() {
    if (this.catIsJumping) return
    
    const nearestBalloon = this.findNearestBalloon()
    if (nearestBalloon) {
      // Same action lock as a click: the pop/bounce completion only finishes locked actions
      this.actionLocked = true
      this.actionTargetBalloonId = nearestBalloon.id
      this.clearFeedbackIcon()
      this.catTargetX = nearestBalloon.x
      this.pendingJumpBalloonId = nearestBalloon.id
    }
  }

  private findNearestBalloon(): BalloonSprite | null {
    let nearest: BalloonSprite | null = null
    let minDist = Infinity

    this.balloonSprites.forEach(bs => {
      const dist = Math.abs(bs.x - this.catX)
      if (dist < minDist) {
        minDist = dist
        nearest = bs
      }
    })

    return minDist <= 100 ? nearest : null
  }

  update(time: number, delta: number) {
    if (!this.catIsJumping && Math.abs(this.catX - this.catTargetX) > 2) {
      const distance = this.catTargetX - this.catX
      const moveSpeed = Math.min(Math.abs(distance), 20)
      
      if (this.catX < this.catTargetX) {
        this.catX += moveSpeed
        if (this.catX > this.catTargetX) this.catX = this.catTargetX
      } else {
        this.catX -= moveSpeed
        if (this.catX < this.catTargetX) this.catX = this.catTargetX
      }
      this.drawCat(this.cat, this.catX, this.catY)
      
      if (this.pendingJumpBalloonId && Math.abs(this.catX - this.catTargetX) <= 2) {
        const balloonId = this.pendingJumpBalloonId
        this.pendingJumpBalloonId = null
        this.jumpToBalloon(balloonId)
      }
    } else if (!this.catIsJumping && this.pendingJumpBalloonId) {
      const balloonId = this.pendingJumpBalloonId
      this.pendingJumpBalloonId = null
      this.jumpToBalloon(balloonId)
    }
    
    if (this.catIsJumping) {
      this.catJumpTime += delta / 1000
      const jumpDuration = 0.6
      
      if (this.catJumpTime < jumpDuration) {
        const progress = this.catJumpTime / jumpDuration
        const arc = Math.sin(progress * Math.PI)
        this.catY = this.catJumpStartY - arc * this.currentJumpHeight
        this.drawCat(this.cat, this.catX, this.catY)
        
        if (!this.jumpContactMade && progress >= 0.5 && this.jumpTargetBalloonId) {
          const isCorrect = checkBalloon(this.gameState.round, this.jumpTargetBalloonId)
          if (isCorrect) {
            this.jumpContactMade = true
            const balloon = this.balloonSprites.find(b => b.id === this.jumpTargetBalloonId)
            if (balloon) {
              balloon.isPopping = true
              balloon.popStartTime = time
              this.popAnimationStartTime = time
              this.playSound('pop')
            }
            this.showFeedbackIcon('correct')
            this.happyUntil = time + 1200
          }
        }
      } else {
        this.catIsJumping = false
        this.catY = this.catJumpStartY
        this.landingStartTime = time
        this.drawCat(this.cat, this.catX, this.catY)
        // Record landing frame time if we're in an action
        if (this.actionLocked && this.landingFrameTime === 0) {
          this.landingFrameTime = time
        }
      }
    }
    
    // Track if popping balloon finished rendering during balloon loop
    let poppingBalloonFinishedRendering = false
    let balloonsReachedBottom = false
    
    this.balloonSprites.forEach(bs => {
      if (bs.isBouncing && bs.bounceStartTime) {
        const elapsed = time - bs.bounceStartTime
        if (elapsed < 300) {
          const bounce = Math.sin((elapsed / 300) * Math.PI * 2) * 10
          bs.sprite.setY(bs.y + bounce)
          bs.text.setY(bs.y + bounce)
        } else {
          bs.isBouncing = false
          bs.sprite.setY(bs.y)
          bs.text.setY(bs.y)
        }
      } else if (bs.isPopping && bs.popStartTime) {
        const elapsed = time - bs.popStartTime
        if (elapsed < 400) {
          const scale = 1 + (elapsed / 400) * 0.5
          bs.sprite.setScale(scale)
          bs.sprite.setAlpha(1 - elapsed / 400)
          bs.text.setScale(scale)
          bs.text.setAlpha(1 - elapsed / 400)
        } else {
          bs.sprite.setVisible(false)
          bs.text.setVisible(false)
          // Check if this is the target balloon that triggered the pop
          if (bs.id === this.jumpTargetBalloonId && !this.popAnimationCompleted) {
            poppingBalloonFinishedRendering = true
          }
        }
      } else if (!bs.isPopping) {
        if (!this.catIsJumping) {
          bs.y += this.balloonSpeed * (delta / 1000)
          bs.sprite.setPosition(bs.x, bs.y)
          bs.text.setPosition(bs.x, bs.y)
        }

        if (!this.catIsJumping && this.popAnimationStartTime === 0 && !this.pendingJumpBalloonId) {
          // Bottom of the play field: the cat's ear tips at rest, independent of jump height
          const catEarsTop = this.catJumpStartY - 40
          const resetMargin = 20
          if (bs.y + bs.height / 2 > catEarsTop - resetMargin) {
            balloonsReachedBottom = true
          }
        }
      }
    })

    if (balloonsReachedBottom) {
      this.gameState.round = resetBalloons(this.gameState.round)
      this.returnBalloonsToTop()
    }
    
    // After balloon rendering, check if popping balloon finished and proceed with new round atomically
    // Only process if landing has been active for at least one frame (time > landingFrameTime)
    if (poppingBalloonFinishedRendering && !this.catIsJumping && this.popAnimationStartTime > 0 && this.landingFrameTime > 0 && time > this.landingFrameTime) {
      this.popAnimationCompleted = true
      this.popAnimationStartTime = 0
      this.jumpTargetBalloonId = null
      this.jumpContactMade = false
      
      this.gameState = addStar(this.gameState)

      if (isLevelComplete(this.gameState)) {
        this.showLevelComplete()
      } else {
        this.gameState.round = handleCorrectPop(this.gameState.round, this.gameState.settings)
        this.createBalloons()
        this.updateUI()
      }
      
      // Unlock action after correct balloon evaluation (landing phase complete)
      this.actionLocked = false
      this.actionTargetBalloonId = null
      this.landingFrameTime = 0
    }
    
    // Check for wrong balloon unlock when bounce completed before jump (bounce 300ms < jump 600ms)
    // This handles the case where bouncing finished while still jumping, so landing phase check is deferred
    if (this.actionLocked && !this.catIsJumping && this.landingFrameTime > 0 && time > this.landingFrameTime && 
        this.popAnimationStartTime === 0 && this.jumpTargetBalloonId) {
      const targetBalloon = this.balloonSprites.find(bs => bs.id === this.jumpTargetBalloonId)
      if (targetBalloon && !targetBalloon.isBouncing && !targetBalloon.isPopping) {
        // Wrong balloon bounce completed, landing phase complete, unlock
        this.actionLocked = false
        this.actionTargetBalloonId = null
        this.jumpTargetBalloonId = null
        this.jumpContactMade = false
        this.landingFrameTime = 0
      }
    }

    this.drawCat(this.cat, this.catX, this.catY)
  }

  /** К6: same balloons, sprites and colours move back up to where the round started */
  private returnBalloonsToTop() {
    for (const bs of this.balloonSprites) {
      bs.y = bs.spawnY
      bs.sprite.setPosition(bs.x, bs.y)
      bs.text.setPosition(bs.x, bs.y)
    }
  }

  private toggleMute() {
    this.isMuted = !this.isMuted
    this.muteButton.setText(this.isMuted ? '🔇' : '🔊')
    
    if (this.isMuted) {
      // Stop all currently playing or scheduled sounds
      for (const { oscillator, gainNode, context } of this.activeOscillators) {
        try {
          // Immediately set gain to 0 to silence
          gainNode.gain.cancelScheduledValues(context.currentTime)
          gainNode.gain.setValueAtTime(0, context.currentTime)
          
          // Stop the oscillator immediately
          try {
            oscillator.stop(context.currentTime)
          } catch (e) {
            // Oscillator may already be stopped
          }
          
          // Disconnect to ensure silence
          try {
            oscillator.disconnect()
            gainNode.disconnect()
          } catch (e) {
            // Already disconnected
          }
        } catch (e) {
          // Ignore errors from already-stopped oscillators
        }
      }
      
      // Clear tracking arrays
      this.activeOscillators = []
    }
  }

  public openSettings() {
    if (this.settingsUI) {
      this.settingsUI.open(() => this.onSettingsClosed())
    }
  }

  public closeSettings() {
    if (this.settingsUI) {
      this.settingsUI.close()
    }
  }

  public isSettingsOpen(): boolean {
    return this.settingsUI ? this.settingsUI.isOpen() : false
  }

  private onSettingsClosed() {
    const settings = loadSettings()
    this.gameState.settings = settings
    this.balloonSpeed = settings.balloonSpeed === 'medium' ? 50 : 30
    
    // Reset cat animation state when starting new round via settings
    this.catIsJumping = false
    this.catJumpTime = 0
    this.pendingJumpBalloonId = null
    this.jumpTargetBalloonId = null
    this.jumpContactMade = false
    this.popAnimationStartTime = 0
    this.popAnimationCompleted = false
    this.actionLocked = false
    this.actionTargetBalloonId = null
    this.landingFrameTime = 0
    this.catY = this.catJumpStartY
    
    this.gameState.round = createRound(settings)
    this.createBalloons()
    this.updateUI()
    
    // Redraw cat after new balloons are created
    this.drawCat(this.cat, this.catX, this.catY)
  }

  public getGameState() {
    return {
      target: this.gameState.round.target,
      balloons: this.gameState.round.balloons.map(b => ({
        id: b.id,
        formula: b.formula.display,
        isCorrect: b.isCorrect
      })),
      stars: this.gameState.stars,
      wrongAttempts: this.gameState.round.wrongAttempts,
      settings: {
        upperLimit: this.gameState.settings.upperLimit,
        balloonCount: this.gameState.settings.balloonCount,
        correctBalloonsPerLevel: this.gameState.settings.correctBalloonsPerLevel
      }
    }
  }

  public clickBalloon(balloonId: string) {
    const balloon = this.balloonSprites.find(b => b.id === balloonId)
    if (!balloon) return
    
    // K12-K16: Full input ignore during action lifecycle
    if (this.actionLocked) {
      return
    }
    
    // Lock action and start movement
    this.actionLocked = true
    this.actionTargetBalloonId = balloonId
    this.clearFeedbackIcon()
    
    const balloonCenterX = balloon.x
    this.catTargetX = balloonCenterX
    this.pendingJumpBalloonId = balloonId
  }

  public pressKey(key: 'left' | 'right' | 'space' | 'up') {
    // K12-K16: Full input ignore during action lifecycle
    if (this.actionLocked) return
    
    if (key === 'left') {
      this.moveCat(-1)
    } else if (key === 'right') {
      this.moveCat(1)
    } else if (key === 'space' || key === 'up') {
      this.jump()
    }
  }

  public toggleMutePublic() {
    this.toggleMute()
  }

  public isMutedPublic() {
    return this.isMuted
  }

  public getLevelEndText() {
    if (this.levelEndText) {
      return this.levelEndText
    }
    return null
  }

  public getLastPlayedSound() {
    return this.lastPlayedSound
  }

  public getSoundPlayCount() {
    return this.soundPlayCount
  }

  public getFormulaFontSize() {
    if (this.balloonSprites.length > 0 && this.balloonSprites[0].text) {
      const bounds = this.balloonSprites[0].text.getBounds()
      return bounds.height
    }
    return this.formulaFontSize
  }

  public getTargetFontSize() {
    if (this.targetText) {
      const bounds = this.targetText.getBounds()
      return bounds.height
    }
    return this.targetFontSize
  }

  public getMuteButtonBounds() {
    if (this.muteButton && this.muteButton.input) {
      const hitArea = this.muteButton.input.hitArea as Phaser.Geom.Rectangle
      return { width: hitArea.width, height: hitArea.height }
    }
    return { width: 160, height: 160 }
  }

  public getCatPosition() {
    return { x: this.catX, y: this.catY }
  }

  public getCatJumpState() {
    return { isJumping: this.catIsJumping, restingY: this.catJumpStartY }
  }

  public getBalloonBounds(balloonId: string) {
    const balloon = this.balloonSprites.find(b => b.id === balloonId)
    if (!balloon) return null
    
    if (balloon.sprite && balloon.sprite.input) {
      const hitArea = balloon.sprite.input.hitArea as Phaser.Geom.Ellipse
      return {
        x: balloon.x - hitArea.width / 2,
        y: balloon.y - hitArea.height / 2,
        width: hitArea.width,
        height: hitArea.height
      }
    }
    
    const radiusX = 90 * 1.5
    const radiusY = 90
    return {
      x: balloon.x - radiusX,
      y: balloon.y - radiusY,
      width: radiusX * 2,
      height: radiusY * 2
    }
  }

  public getBalloonAnimationState(balloonId: string) {
    const balloon = this.balloonSprites.find(b => b.id === balloonId)
    if (!balloon) return { isBouncing: false, isPopping: false }
    
    return {
      isBouncing: balloon.isBouncing,
      isPopping: balloon.isPopping
    }
  }

  public setGameState(newState: GameState) {
    this.gameState = newState
    this.createBalloons()
    this.updateUI()
  }

  public getActionPhase(): 'idle' | 'walk' | 'jump' | 'landing' {
    if (!this.actionLocked) {
      return 'idle'
    }
    
    if (this.catIsJumping) {
      return 'jump'
    }
    
    if (this.pendingJumpBalloonId) {
      return 'walk'
    }
    
    return 'landing'
  }
}
