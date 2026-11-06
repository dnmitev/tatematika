import Phaser from 'phaser'
import type { GameState, Balloon } from '../game-logic/types'
import { createInitialState, addStar, isLevelComplete, startNewLevel } from '../game-logic/scoring'
import { checkBalloon, handleCorrectPop, handleWrongAttempt, shouldShowHint, resetBalloons, createRound } from '../game-logic/round'
import { loadSettings, saveSettings, updateSetting, DEFAULT_SETTINGS } from '../game-logic/settings'
import { getPraiseMessage, WRONG_ANSWER_MESSAGE, LEVEL_COMPLETE_TITLE, LEVEL_COMPLETE_MESSAGE } from '../game-logic/strings'
import { SettingsUI } from '../settings-ui'
import { LevelCompleteUI } from '../level-complete-ui'

interface BalloonSprite {
  id: string
  sprite: Phaser.GameObjects.Graphics
  text: Phaser.GameObjects.Text
  y: number
  x: number
  isCorrect: boolean
  isBouncing: boolean
  isPopping: boolean
  bounceStartTime?: number
  popStartTime?: number
}

export class GameScene extends Phaser.Scene {
  private gameState!: GameState
  private cat!: Phaser.GameObjects.Graphics
  private catX: number = 400
  private catY: number = 460
  private catTargetX: number = 400
  private catIsJumping: boolean = false
  private catJumpStartY: number = 460
  private catJumpTime: number = 0
  private balloonSprites: BalloonSprite[] = []
  private targetText!: Phaser.GameObjects.Text
  private starsText!: Phaser.GameObjects.Text
  private wrongAttemptsText!: Phaser.GameObjects.Text
  private feedbackText!: Phaser.GameObjects.Text
  private muteButton!: Phaser.GameObjects.Text
  private settingsButton!: HTMLButtonElement
  private isMuted: boolean = false
  private balloonSpeed: number = 30
  private praiseIndex: number = 0
  private levelEndText: string | null = null
  private lastPlayedSound: string | null = null
  private pendingJumpBalloonId: string | null = null
  
  private settingsUI!: SettingsUI
  private levelCompleteUI!: LevelCompleteUI
  
  private formulaFontSize: number = 32
  private targetFontSize: number = 32

  constructor() {
    super({ key: 'GameScene' })
  }

  shutdown() {
    if (this.settingsButton && this.settingsButton.parentElement) {
      this.settingsButton.removeEventListener('click', () => this.openSettings())
      this.settingsButton.remove()
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
    const minCssPx = 32
    const referenceWidth = 800
    const actualWidth = this.scale.width
    this.formulaFontSize = Math.ceil(minCssPx * referenceWidth / actualWidth)
    this.targetFontSize = Math.ceil(minCssPx * referenceWidth / actualWidth)
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    this.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height)
  }

  private createCat() {
    this.catY = Math.min(460, this.scale.height - 140)
    this.cat = this.add.graphics()
    this.drawCat(this.cat, this.catX, this.catY)
  }

  private drawCat(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
    graphics.clear()
    
    graphics.fillStyle(0xFFA500, 1)
    graphics.fillEllipse(x, y, 50, 45)
    
    graphics.fillStyle(0xFFA500, 1)
    graphics.fillTriangle(x - 25, y - 20, x - 30, y - 40, x - 18, y - 25)
    graphics.fillTriangle(x + 25, y - 20, x + 30, y - 40, x + 18, y - 25)
    
    graphics.fillStyle(0xFFFFFF, 1)
    graphics.fillCircle(x - 12, y - 8, 6)
    graphics.fillCircle(x + 12, y - 8, 6)
    graphics.fillStyle(0x000000, 1)
    graphics.fillCircle(x - 12, y - 8, 4)
    graphics.fillCircle(x + 12, y - 8, 4)
    
    graphics.lineStyle(2, 0x000000, 1)
    graphics.beginPath()
    graphics.arc(x, y + 8, 10, 0, Math.PI, false)
    graphics.strokePath()
  }

  private createUI() {
    const centerX = this.scale.width / 2
    
    this.add.text(centerX, 20, 'Котето и балоните', {
      fontSize: '24px',
      color: '#FF1493',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.add.text(15, this.scale.height - 70, 'Цел:', {
      fontSize: '20px',
      color: '#000000',
      fontStyle: 'bold'
    })

    this.targetFontSize = 32
    this.targetText = this.add.text(75, this.scale.height - 75, '', {
      fontSize: `${this.targetFontSize}px`,
      color: '#000000',
      fontStyle: 'bold',
      backgroundColor: '#FFEB3B',
      padding: { x: 12, y: 6 }
    })

    this.starsText = this.add.text(15, 50, '', {
      fontSize: '24px',
      color: '#FFD700',
      fontStyle: 'bold'
    })

    this.wrongAttemptsText = this.add.text(this.scale.width - 200, this.scale.height - 70, '', {
      fontSize: '18px',
      color: '#555555'
    })

    this.feedbackText = this.add.text(centerX, this.scale.height / 2, '', {
      fontSize: '32px',
      color: '#FF1493',
      fontStyle: 'bold',
      backgroundColor: '#FFFFFF',
      padding: { x: 12, y: 6 }
    }).setOrigin(0.5).setVisible(false)

    this.muteButton = this.add.text(this.scale.width - 80, 10, '🔊', {
      fontSize: '32px',
      padding: { x: 16, y: 16 }
    }).setInteractive(
      new Phaser.Geom.Rectangle(0, 0, 64, 64),
      Phaser.Geom.Rectangle.Contains
    )
    this.muteButton.input!.cursor = 'pointer'
    this.muteButton.on('pointerdown', () => this.toggleMute())

    this.createSettingsButton()
    this.settingsUI = new SettingsUI()
    this.levelCompleteUI = new LevelCompleteUI()

    this.updateUI()
  }

  private createSettingsButton() {
    this.settingsButton = document.createElement('button')
    this.settingsButton.textContent = '⚙️'
    this.settingsButton.setAttribute('data-testid', 'button-settings')
    this.settingsButton.style.cssText = `
      position: fixed;
      top: 10px;
      right: 90px;
      width: 64px;
      height: 64px;
      font-size: 32px;
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

    const balloonRadius = 40
    const safeMargin = 60
    const availableWidth = this.scale.width - (2 * safeMargin)
    const count = this.gameState.round.balloons.length
    const spacing = availableWidth / count
    
    this.gameState.round.balloons.forEach((balloon, index) => {
      const x = safeMargin + spacing * (index + 0.5)
      const y = 110 + (index % 3) * 25

      const sprite = this.add.graphics()
      this.drawBalloon(sprite, 0, 0, balloon.isCorrect)
      sprite.setPosition(x, y)
      sprite.setInteractive(
        new Phaser.Geom.Circle(0, 0, balloonRadius),
        Phaser.Geom.Circle.Contains
      )
      sprite.on('pointerdown', () => this.handleBalloonClick(balloon.id))

      const text = this.add.text(0, 0, balloon.formula.display, {
        fontSize: `${this.formulaFontSize}px`,
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
        isCorrect: balloon.isCorrect,
        isBouncing: false,
        isPopping: false
      })
    })
  }

  private drawBalloon(graphics: Phaser.GameObjects.Graphics, x: number, y: number, isCorrect: boolean) {
    const colors = [0xFF6B6B, 0xFFD93D, 0x6BCB77, 0x4D96FF, 0xA78BFA]
    const color = colors[Math.floor(Math.random() * colors.length)]
    const radius = 40
    
    graphics.fillStyle(color, 0.9)
    graphics.fillCircle(x, y, radius)
    graphics.lineStyle(3, 0x000000, 0.4)
    graphics.strokeCircle(x, y, radius)
    
    graphics.fillStyle(0xFFFFFF, 0.3)
    graphics.fillCircle(x - 10, y - 10, 8)
    
    graphics.lineStyle(2, 0x000000, 0.5)
    graphics.beginPath()
    graphics.moveTo(x, y + radius)
    graphics.lineTo(x, y + radius + 20)
    graphics.strokePath()
  }

  private handleBalloonClick(balloonId: string) {
    this.clickBalloon(balloonId)
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer) {
    if (this.settingsUI && this.settingsUI.isOpen()) return
    
    for (const balloon of this.balloonSprites) {
      const radius = 40
      const distance = Phaser.Math.Distance.Between(pointer.x, pointer.y, balloon.x, balloon.y)
      if (distance <= radius) {
        this.handleBalloonClick(balloon.id)
        break
      }
    }
  }

  private jumpToBalloon(balloonId: string) {
    this.catIsJumping = true
    this.catJumpStartY = this.catY
    this.catJumpTime = 0
    
    const isCorrect = checkBalloon(this.gameState.round, balloonId)
    
    if (isCorrect) {
      this.handleCorrectBalloon(balloonId)
    } else {
      this.handleWrongBalloon(balloonId)
    }
  }

  private handleCorrectBalloon(balloonId: string) {
    const balloon = this.balloonSprites.find(b => b.id === balloonId)
    if (balloon) {
      balloon.isPopping = true
      balloon.popStartTime = this.time.now
      this.playSound('pop')
    }
    
    this.showFeedback(getPraiseMessage(this.praiseIndex))
    this.praiseIndex++

    this.gameState = addStar(this.gameState)

    if (isLevelComplete(this.gameState)) {
      this.showLevelComplete()
    } else {
      this.gameState.round = handleCorrectPop(this.gameState.round, this.gameState.settings)
      this.time.delayedCall(800, () => {
        this.createBalloons()
        this.updateUI()
      })
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
    this.showFeedback(WRONG_ANSWER_MESSAGE)
    this.gameState.round = handleWrongAttempt(this.gameState.round)
    this.updateUI()
  }

  private playSound(soundName: string) {
    if (this.isMuted) return
    
    this.lastPlayedSound = soundName
    
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
    } else if (soundName === 'boing') {
      oscillator.frequency.setValueAtTime(200, audioContext.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.2)
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.2)
    } else if (soundName === 'meow') {
      oscillator.frequency.setValueAtTime(400, audioContext.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.15)
      oscillator.frequency.exponentialRampToValueAtTime(300, audioContext.currentTime + 0.3)
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)
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
      })
    }
  }

  private showFeedback(message: string) {
    this.feedbackText.setText(message)
    this.feedbackText.setVisible(true)
    
    this.time.delayedCall(1500, () => {
      this.feedbackText.setVisible(false)
    })
  }

  private showLevelComplete() {
    const stars = this.gameState.stars
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
    if (!this.catIsJumping && this.pendingJumpBalloonId && Math.abs(this.catX - this.catTargetX) > 2) {
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
      
      if (Math.abs(this.catX - this.catTargetX) <= 2) {
        const balloonId = this.pendingJumpBalloonId
        this.pendingJumpBalloonId = null
        this.jumpToBalloon(balloonId)
      }
    }
    
    if (this.catIsJumping) {
      this.catJumpTime += delta / 1000
      const jumpDuration = 0.6
      
      if (this.catJumpTime < jumpDuration) {
        const jumpHeight = 80
        const progress = this.catJumpTime / jumpDuration
        const arc = Math.sin(progress * Math.PI)
        this.catY = this.catJumpStartY - arc * jumpHeight
        this.drawCat(this.cat, this.catX, this.catY)
      } else {
        this.catIsJumping = false
        this.catY = this.catJumpStartY
        this.drawCat(this.cat, this.catX, this.catY)
      }
    }
    
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
        }
      } else if (!bs.isPopping) {
        bs.y += this.balloonSpeed * (delta / 1000)
        bs.sprite.setPosition(bs.x, bs.y)
        bs.text.setPosition(bs.x, bs.y)

        if (shouldShowHint(this.gameState.round) && bs.isCorrect) {
          bs.sprite.alpha = 0.7 + Math.sin(time * 0.005) * 0.3
        } else {
          bs.sprite.alpha = 1
        }

        if (bs.y > this.scale.height - 150) {
          this.gameState.round = resetBalloons(this.gameState.round)
          this.createBalloons()
        }
      }
    })
  }

  private toggleMute() {
    this.isMuted = !this.isMuted
    this.muteButton.setText(this.isMuted ? '🔇' : '🔊')
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
    this.gameState.round = createRound(settings)
    this.createBalloons()
    this.updateUI()
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
    
    if (this.catIsJumping) {
      const isCorrect = checkBalloon(this.gameState.round, balloonId)
      if (!isCorrect) {
        this.gameState.round = handleWrongAttempt(this.gameState.round)
        this.updateUI()
      }
      return
    }
    
    const balloonCenterX = balloon.x
    this.catTargetX = balloonCenterX
    this.pendingJumpBalloonId = balloonId
  }

  public pressKey(key: 'left' | 'right' | 'space' | 'up') {
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

  public getFormulaFontSize() {
    return this.formulaFontSize
  }

  public getTargetFontSize() {
    return this.targetFontSize
  }

  public getMuteButtonBounds() {
    return { width: 64, height: 64 }
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
    
    const radius = 40
    return {
      x: balloon.x - radius,
      y: balloon.y - radius,
      width: radius * 2,
      height: radius * 2
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
}
