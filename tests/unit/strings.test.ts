import { describe, it, expect } from 'vitest'
import {
  PRAISE_MESSAGES,
  WRONG_ANSWER_MESSAGE,
  LEVEL_COMPLETE_TITLE,
  LEVEL_COMPLETE_MESSAGE,
  BUTTON_PLAY_AGAIN,
  BUTTON_TO_MENU,
} from '../../src/game-logic/strings'

describe('Bulgarian Strings', () => {
  describe('К11: Bulgarian only and no "Загуби"/"Game Over"', () => {
    it('should use only Bulgarian text', () => {
      // К11: level-end copy is still Bulgarian.
      // Visible praise and „Опа! Опитай пак!“ are no longer allowed (К4, К21, К22).
      expect(LEVEL_COMPLETE_TITLE).toBe('Ти успя!')
      expect(BUTTON_PLAY_AGAIN).toBe('Още веднъж')
      expect(BUTTON_TO_MENU).toBe('Към менюто')
      expect(LEVEL_COMPLETE_TITLE).toMatch(/[А-Яа-я]/)
      expect(BUTTON_PLAY_AGAIN).toMatch(/[А-Яа-я]/)
      expect(BUTTON_TO_MENU).toMatch(/[А-Яа-я]/)
    })

    it('should not contain "Загуби" or "Game Over"', () => {
      // К11: No words like "Загуби" or "Game Over"
      const allStrings = [
        ...PRAISE_MESSAGES,
        WRONG_ANSWER_MESSAGE,
        LEVEL_COMPLETE_TITLE,
        BUTTON_PLAY_AGAIN,
        BUTTON_TO_MENU,
      ]
      
      allStrings.forEach(str => {
        expect(str.toLowerCase()).not.toContain('загуби')
        expect(str.toLowerCase()).not.toContain('game over')
        expect(str.toLowerCase()).not.toContain('game')
        expect(str.toLowerCase()).not.toContain('over')
      })
    })
  })

  describe('Feedback strings from spec', () => {
    it('should not export visible praise („Браво!“, „Супер!“, „Точно така!“)', () => {
      // Spec §6: no visible praise text after a correct balloon.
      for (const praise of ['Браво!', 'Супер!', 'Точно така!']) {
        expect(PRAISE_MESSAGES, `visible feedback must not include „${praise}“`).not.toContain(praise)
      }
    })

    it('should not export the visible wrong-answer sentence „Опа! Опитай пак!“', () => {
      // Spec К4/К22: that sentence is not visible feedback.
      expect(
        WRONG_ANSWER_MESSAGE,
        'visible wrong-answer copy must not be „Опа! Опитай пак!“'
      ).not.toBe('Опа! Опитай пак!')
    })

    it('should have level complete title', () => {
      expect(LEVEL_COMPLETE_TITLE).toBe('Ти успя!')
    })

    it('should have level complete message with star count', () => {
      // Spec §6: end-of-level text is unchanged. The standard goal is 10.
      expect(LEVEL_COMPLETE_MESSAGE(10)).toBe('Събра 10 звездички!')
      expect(LEVEL_COMPLETE_MESSAGE(5)).toBe('Събра 5 звездички!')
      expect(LEVEL_COMPLETE_MESSAGE(15)).toBe('Събра 15 звездички!')
      expect(`${LEVEL_COMPLETE_TITLE} ${LEVEL_COMPLETE_MESSAGE(10)}`).toBe('Ти успя! Събра 10 звездички!')
    })

    it('should have play again button text', () => {
      expect(BUTTON_PLAY_AGAIN).toBe('Още веднъж')
    })

    it('should have menu button text', () => {
      expect(BUTTON_TO_MENU).toBe('Към менюто')
    })
  })

  describe('К21: no rotating visible praise', () => {
    it('should not keep a rotating visible praise list', () => {
      // Spec §6 replaced rotating „Браво!“ / „Супер!“ / „Точно така!“ with one cup.
      expect(
        [...PRAISE_MESSAGES],
        'visible praise list must be empty'
      ).toEqual([])
    })
  })

  describe('No negative or harsh feedback', () => {
    it('should not contain harsh words in any string', () => {
      const harshWords = ['загуби', 'грешка', 'fail', 'error', 'wrong', 'bad']
      const allStrings = [
        ...PRAISE_MESSAGES,
        WRONG_ANSWER_MESSAGE,
        LEVEL_COMPLETE_TITLE,
        BUTTON_PLAY_AGAIN,
        BUTTON_TO_MENU,
      ]
      
      allStrings.forEach(str => {
        harshWords.forEach(word => {
          expect(str.toLowerCase()).not.toContain(word)
        })
      })
    })

    it('should not show the old visible wrong-answer sentence', () => {
      // Spec К22: no visible „Опа! Опитай пак!“; the accessible name is „Грешно“.
      expect(WRONG_ANSWER_MESSAGE).not.toContain('Опитай пак')
    })
  })

  describe('Cyrillic encoding', () => {
    it('should properly encode Bulgarian Cyrillic characters', () => {
      // Every exported praise string must be Cyrillic. An empty list
      // satisfies this, which is what §6 requires (no visible praise).
      for (const message of PRAISE_MESSAGES) {
        expect(message).toMatch(/[А-Яа-я]/)
      }
      expect(WRONG_ANSWER_MESSAGE).toMatch(/[А-Яа-я]/)
      expect(LEVEL_COMPLETE_TITLE).toMatch(/[А-Яа-я]/)
      expect(BUTTON_PLAY_AGAIN).toMatch(/[А-Яа-я]/)
      expect(BUTTON_TO_MENU).toMatch(/[А-Яа-я]/)
    })
  })
})
