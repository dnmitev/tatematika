import Phaser from 'phaser'
import type { GameState, Balloon } from '../game-logic/types'
import { createInitialState, addStar, isLevelComplete, startNewLevel } from '../game-logic/scoring'
import { checkBalloon, handleCorrectPop, handleWrongAttempt, shouldShowHint, resetBalloons } from '../game-logic/round'
import { loadSettings } from '../game-logic/settings'
import { getPraiseMessage, WRONG_ANSWER_MESSAGE } from '../game-logic/strings'

interface BalloonSprite {
  id: string
  sprite: Phaser.GameObjects.Graphics
  text: Phaser.GameObjects.Text
  y: number
  x: number
  isCorrect: boolean
}

export class GameScene extends Phaser.Scene {
  private gameState!: GameState
  private cat!: Phaser.GameObjects.Graphics
  private catX: number = 400
  private balloonSprites: BalloonSprite[] = []
  private targetText!: Phaser.GameObjects.Text
  private starsText!: Phaser.GameObjects.Text
  private wrongAttemptsText!: Phaser.GameObjects.Text
  private feedbackText!: Phaser.GameObjects.Text
  private muteButton!: Phaser.GameObjects.Text
  private isMuted: boolean = false
  private balloonSpeed: number = 30
  private praiseIndex: number = 0
  private levelEndText: string | null = null

  constructor() {
    super({ key: 'GameScene' })
  }

  create() {
    const settings = loadSettings()
    this.gameState = createInitialState(settings)
    this.balloonSpeed = settings.balloonSpeed === 'medium' ? 50 : 30

    this.add.rectangle(400, 300, 800, 600, 0x87CEEB)

    this.createCat()
    this.createUI()
    this.createBalloons()

    this.input.keyboard?.on('keydown', this.handleKeyDown, this)

    this.cursors = this.input.keyboard?.createCursorKeys()
  }

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys

  private createCat() {
    this.cat = this.add.graphics()
    this.drawCat(this.cat, this.catX, 460)
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
    this.add.text(400, 20, 'Котето и балоните', {
      fontSize: '24px',
      color: '#FF1493',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.add.text(15, 530, 'Цел:', {
      fontSize: '20px',
      color: '#000000',
      fontStyle: 'bold'
    })

    this.targetText = this.add.text(75, 525, '', {
      fontSize: '32px',
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

    this.wrongAttemptsText = this.add.text(600, 530, '', {
      fontSize: '18px',
      color: '#555555'
    })

    this.feedbackText = this.add.text(400, 300, '', {
      fontSize: '32px',
      color: '#FF1493',
      fontStyle: 'bold',
      backgroundColor: '#FFFFFF',
      padding: { x: 12, y: 6 }
    }).setOrigin(0.5).setVisible(false)

    this.muteButton = this.add.text(760, 15, '🔊', {
      fontSize: '28px'
    }).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.toggleMute())

    this.updateUI()
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
    const availableWidth = 800 - (2 * safeMargin)
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
        fontSize: '24px',
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
        isCorrect: balloon.isCorrect
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
    const isCorrect = checkBalloon(this.gameState.round, balloonId)
    
    if (isCorrect) {
      this.handleCorrectBalloon()
    } else {
      this.handleWrongBalloon()
    }
  }

  private handleCorrectBalloon() {
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

  private handleWrongBalloon() {
    this.showFeedback(WRONG_ANSWER_MESSAGE)
    this.gameState.round = handleWrongAttempt(this.gameState.round)
    this.updateUI()
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
    this.levelEndText = `Ти успя! Събра ${stars} звездички!`
    this.scene.start('LevelCompleteScene', { 
      stars,
      gameState: this.gameState 
    })
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      this.moveCat(-1)
    } else if (event.key === 'ArrowRight') {
      this.moveCat(1)
    } else if (event.key === ' ' || event.key === 'ArrowUp') {
      this.jump()
    }
  }

  private moveCat(direction: number) {
    this.catX += direction * 100
    this.catX = Phaser.Math.Clamp(this.catX, 60, 740)
    this.drawCat(this.cat, this.catX, 460)
  }

  private jump() {
    const nearestBalloon = this.findNearestBalloon()
    if (nearestBalloon) {
      this.handleBalloonClick(nearestBalloon.id)
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

    return minDist < 100 ? nearest : null
  }

  update() {
    this.balloonSprites.forEach(bs => {
      bs.y += this.balloonSpeed * 0.016
      bs.sprite.setPosition(bs.x, bs.y)
      bs.text.setPosition(bs.x, bs.y)

      if (shouldShowHint(this.gameState.round) && bs.isCorrect) {
        bs.sprite.alpha = 0.7 + Math.sin(Date.now() * 0.005) * 0.3
      } else {
        bs.sprite.alpha = 1
      }

      if (bs.y > 400) {
        this.gameState.round = resetBalloons(this.gameState.round)
        this.createBalloons()
      }
    })
  }

  private toggleMute() {
    this.isMuted = !this.isMuted
    this.muteButton.setText(this.isMuted ? '🔇' : '🔊')
  }

  getGameState() {
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

  clickBalloon(balloonId: string) {
    this.handleBalloonClick(balloonId)
  }

  pressKey(key: 'left' | 'right' | 'space' | 'up') {
    if (key === 'left') {
      this.moveCat(-1)
    } else if (key === 'right') {
      this.moveCat(1)
    } else if (key === 'space' || key === 'up') {
      this.jump()
    }
  }

  toggleMutePublic() {
    this.toggleMute()
  }

  isMutedPublic() {
    return this.isMuted
  }

  getLevelEndText() {
    return this.levelEndText
  }
}
