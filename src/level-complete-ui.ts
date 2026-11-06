export class LevelCompleteUI {
  private container: HTMLElement | null = null
  private onPlayAgain: (() => void) | null = null
  private onToMenu: (() => void) | null = null

  constructor() {
    this.createUI()
  }

  private createUI() {
    const container = document.createElement('div')
    container.style.cssText = `
      position: fixed;
      inset: 0;
      display: none;
      justify-content: center;
      align-items: center;
      flex-direction: column;
      background: rgba(255, 215, 0, 0.3);
      z-index: 10001;
      pointer-events: none;
    `

    const contentBox = document.createElement('div')
    contentBox.style.cssText = `
      text-align: center;
      pointer-events: auto;
    `

    const title = document.createElement('h1')
    title.textContent = 'Ти успя!'
    title.style.cssText = `
      font-size: 48px;
      color: #FF1493;
      margin: 0 0 20px 0;
      font-weight: bold;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    `
    contentBox.appendChild(title)

    const message = document.createElement('p')
    message.setAttribute('data-testid', 'level-complete-message')
    message.style.cssText = `
      font-size: 28px;
      color: #000;
      margin: 0 0 40px 0;
      font-weight: bold;
    `
    contentBox.appendChild(message)

    const playAgainButton = document.createElement('button')
    playAgainButton.textContent = 'Още веднъж'
    playAgainButton.setAttribute('data-testid', 'button-play-again')
    playAgainButton.style.cssText = `
      display: block;
      width: 200px;
      height: 64px;
      margin: 0 auto 20px auto;
      font-size: 20px;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: bold;
    `
    playAgainButton.addEventListener('click', () => {
      if (this.onPlayAgain) this.onPlayAgain()
    })
    playAgainButton.addEventListener('mouseenter', () => {
      playAgainButton.style.transform = 'scale(1.1)'
    })
    playAgainButton.addEventListener('mouseleave', () => {
      playAgainButton.style.transform = 'scale(1)'
    })
    contentBox.appendChild(playAgainButton)

    const menuButton = document.createElement('button')
    menuButton.textContent = 'Към менюто'
    menuButton.setAttribute('data-testid', 'button-to-menu')
    menuButton.style.cssText = `
      display: block;
      width: 200px;
      height: 64px;
      margin: 0 auto;
      font-size: 20px;
      background: #2196F3;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: bold;
    `
    menuButton.addEventListener('click', () => {
      if (this.onToMenu) this.onToMenu()
    })
    menuButton.addEventListener('mouseenter', () => {
      menuButton.style.transform = 'scale(1.1)'
    })
    menuButton.addEventListener('mouseleave', () => {
      menuButton.style.transform = 'scale(1)'
    })
    contentBox.appendChild(menuButton)

    container.appendChild(contentBox)
    document.body.appendChild(container)
    this.container = container
  }

  public show(stars: number, onPlayAgain: () => void, onToMenu: () => void) {
    this.onPlayAgain = onPlayAgain
    this.onToMenu = onToMenu

    if (this.container) {
      const message = this.container.querySelector('[data-testid="level-complete-message"]') as HTMLElement
      if (message) {
        message.textContent = `Събра ${stars} звездички!`
      }
      this.container.style.display = 'flex'
    }
  }

  public hide() {
    if (this.container) {
      this.container.style.display = 'none'
    }
  }
}
