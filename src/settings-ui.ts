import { loadSettings, saveSettings } from './game-logic/settings'
import type { GameSettings } from './game-logic/types'

export class SettingsUI {
  private panel: HTMLElement | null = null
  private onClose: (() => void) | null = null

  constructor() {
    this.createPanel()
  }

  private createPanel() {
    const panel = document.createElement('div')
    panel.setAttribute('data-testid', 'settings-panel')
    panel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border: 4px solid #4CAF50;
      border-radius: 12px;
      padding: 30px;
      min-width: 300px;
      max-width: 90vw;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 10000;
      display: none;
    `

    const title = document.createElement('h2')
    title.textContent = 'Настройки'
    title.style.cssText = 'margin: 0 0 20px 0; text-align: center; color: #000;'
    panel.appendChild(title)

    const settings = loadSettings()

    this.addSetting(panel, 'Горна граница (5-20):', 'upper-limit', 'number', settings.upperLimit, 5, 20)
    this.addSetting(panel, 'Действия:', 'operations', 'select', settings.operations, undefined, undefined, [
      { value: 'addition', label: 'само събиране' },
      { value: 'subtraction', label: 'само изваждане' },
      { value: 'both', label: 'двете' }
    ])
    this.addSetting(panel, 'Балони (2-5):', 'balloon-count', 'number', settings.balloonCount, 2, 5)
    this.addSetting(panel, 'Верни за ниво (5-20):', 'correct-per-level', 'number', settings.correctBalloonsPerLevel, 5, 20)
    this.addSetting(panel, 'Скорост:', 'speed', 'select', settings.balloonSpeed, undefined, undefined, [
      { value: 'slow', label: 'бавна' },
      { value: 'medium', label: 'средна' }
    ])

    const closeButton = document.createElement('button')
    closeButton.textContent = 'Затвори'
    closeButton.style.cssText = `
      width: 100%;
      padding: 12px;
      margin-top: 20px;
      font-size: 18px;
      background: #2196F3;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
    `
    closeButton.addEventListener('click', () => this.close())
    panel.appendChild(closeButton)

    document.body.appendChild(panel)
    this.panel = panel
  }

  private addSetting(
    panel: HTMLElement,
    label: string,
    testId: string,
    type: 'number' | 'select',
    value: any,
    min?: number,
    max?: number,
    options?: Array<{ value: string; label: string }>
  ) {
    const row = document.createElement('div')
    row.style.cssText = 'margin-bottom: 15px;'

    const labelEl = document.createElement('label')
    labelEl.textContent = label
    labelEl.style.cssText = 'display: block; margin-bottom: 5px; color: #000; font-size: 16px;'
    row.appendChild(labelEl)

    let input: HTMLInputElement | HTMLSelectElement

    if (type === 'select' && options) {
      input = document.createElement('select')
      options.forEach(opt => {
        const option = document.createElement('option')
        option.value = opt.value
        option.textContent = opt.label
        if (opt.value === value) {
          option.selected = true
        }
        input.appendChild(option)
      })
    } else {
      input = document.createElement('input')
      input.type = type
      input.value = String(value)
      if (min !== undefined) input.min = String(min)
      if (max !== undefined) input.max = String(max)
    }

    input.setAttribute('data-testid', `setting-${testId}`)
    input.style.cssText = `
      width: 100%;
      padding: 8px;
      font-size: 16px;
      border: 2px solid #ccc;
      border-radius: 4px;
      box-sizing: border-box;
    `

    input.addEventListener('change', () => this.handleChange())

    row.appendChild(input)
    panel.appendChild(row)
  }

  private handleChange() {
    if (!this.panel) return

    const settings = loadSettings()

    const upperLimit = this.panel.querySelector<HTMLInputElement>('[data-testid="setting-upper-limit"]')
    const operations = this.panel.querySelector<HTMLSelectElement>('[data-testid="setting-operations"]')
    const balloonCount = this.panel.querySelector<HTMLInputElement>('[data-testid="setting-balloon-count"]')
    const correctPerLevel = this.panel.querySelector<HTMLInputElement>('[data-testid="setting-correct-per-level"]')
    const speed = this.panel.querySelector<HTMLSelectElement>('[data-testid="setting-speed"]')

    if (upperLimit) settings.upperLimit = parseInt(upperLimit.value)
    if (operations) settings.operations = operations.value as any
    if (balloonCount) settings.balloonCount = parseInt(balloonCount.value)
    if (correctPerLevel) settings.correctBalloonsPerLevel = parseInt(correctPerLevel.value)
    if (speed) settings.balloonSpeed = speed.value as any

    saveSettings(settings)
  }

  public open(onClose?: () => void) {
    this.onClose = onClose || null
    if (this.panel) {
      this.panel.style.display = 'block'
    }
  }

  public close() {
    if (this.panel) {
      this.panel.style.display = 'none'
    }
    if (this.onClose) {
      this.onClose()
    }
  }

  public isOpen(): boolean {
    return this.panel ? this.panel.style.display === 'block' : false
  }
}
