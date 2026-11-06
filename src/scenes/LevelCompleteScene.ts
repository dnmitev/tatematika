import Phaser from 'phaser'
import { LEVEL_COMPLETE_TITLE, LEVEL_COMPLETE_MESSAGE, BUTTON_PLAY_AGAIN, BUTTON_TO_MENU } from '../game-logic/strings'
import type { GameState } from '../game-logic/types'
import { startNewLevel } from '../game-logic/scoring'

export class LevelCompleteScene extends Phaser.Scene {
  private stars!: number
  private gameState!: GameState

  constructor() {
    super({ key: 'LevelCompleteScene' })
  }

  init(data: { stars: number; gameState: GameState }) {
    this.stars = data.stars
    this.gameState = data.gameState
  }

  create() {
    this.add.rectangle(400, 300, 800, 600, 0xFFD700, 0.3)

    this.add.text(400, 150, LEVEL_COMPLETE_TITLE, {
      fontSize: '64px',
      color: '#FF1493',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.add.text(400, 250, LEVEL_COMPLETE_MESSAGE(this.stars), {
      fontSize: '36px',
      color: '#000000'
    }).setOrigin(0.5)

    const playAgainButton = this.add.text(400, 350, BUTTON_PLAY_AGAIN, {
      fontSize: '32px',
      color: '#FFFFFF',
      backgroundColor: '#4CAF50',
      padding: { x: 30, y: 15 }
    }).setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.playAgain())
      .on('pointerover', () => playAgainButton.setScale(1.1))
      .on('pointerout', () => playAgainButton.setScale(1))

    const menuButton = this.add.text(400, 450, BUTTON_TO_MENU, {
      fontSize: '32px',
      color: '#FFFFFF',
      backgroundColor: '#2196F3',
      padding: { x: 30, y: 15 }
    }).setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.toMenu())
      .on('pointerover', () => menuButton.setScale(1.1))
      .on('pointerout', () => menuButton.setScale(1))

    for (let i = 0; i < 30; i++) {
      this.createConfetti()
    }
  }

  private createConfetti() {
    const x = Phaser.Math.Between(0, 800)
    const y = Phaser.Math.Between(-100, 0)
    const colors = [0xFF6B6B, 0xFFD93D, 0x6BCB77, 0x4D96FF, 0xA78BFA]
    const color = Phaser.Utils.Array.GetRandom(colors)

    const confetti = this.add.rectangle(x, y, 10, 10, color)
    
    this.tweens.add({
      targets: confetti,
      y: 650,
      x: x + Phaser.Math.Between(-100, 100),
      rotation: Phaser.Math.Between(0, 360),
      duration: Phaser.Math.Between(2000, 4000),
      ease: 'Linear',
      onComplete: () => confetti.destroy()
    })
  }

  private playAgain() {
    this.gameState = startNewLevel(this.gameState)
    this.scene.start('GameScene')
  }

  private toMenu() {
    this.scene.start('GameScene')
  }
}
