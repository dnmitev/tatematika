import { describe, it, expect } from 'vitest'
import {
  PRAISE_MESSAGES,
  WRONG_ANSWER_MESSAGE,
  LEVEL_COMPLETE_TITLE,
  LEVEL_COMPLETE_MESSAGE,
  BUTTON_PLAY_AGAIN,
  BUTTON_TO_MENU,
  getPraiseMessage,
} from '../../src/game-logic/strings'

describe('Bulgarian Strings', () => {
  describe('К11: Bulgarian only and no "Загуби"/"Game Over"', () => {
    it('should use only Bulgarian text', () => {
      // К11: All labels are in Bulgarian
      expect(PRAISE_MESSAGES).toEqual(['Браво!', 'Супер!', 'Точно така!'])
      expect(WRONG_ANSWER_MESSAGE).toBe('Опа! Опитай пак!')
      expect(LEVEL_COMPLETE_TITLE).toBe('Ти успя!')
      expect(BUTTON_PLAY_AGAIN).toBe('Още веднъж')
      expect(BUTTON_TO_MENU).toBe('Към менюто')
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
    it('should have praise messages that rotate', () => {
      expect(PRAISE_MESSAGES).toHaveLength(3)
      expect(PRAISE_MESSAGES[0]).toBe('Браво!')
      expect(PRAISE_MESSAGES[1]).toBe('Супер!')
      expect(PRAISE_MESSAGES[2]).toBe('Точно така!')
    })

    it('should have wrong answer message', () => {
      expect(WRONG_ANSWER_MESSAGE).toBe('Опа! Опитай пак!')
    })

    it('should have level complete title', () => {
      expect(LEVEL_COMPLETE_TITLE).toBe('Ти успя!')
    })

    it('should have level complete message with star count', () => {
      expect(LEVEL_COMPLETE_MESSAGE(10)).toBe('Събра 10 звездички!')
      expect(LEVEL_COMPLETE_MESSAGE(5)).toBe('Събра 5 звездички!')
      expect(LEVEL_COMPLETE_MESSAGE(15)).toBe('Събра 15 звездички!')
    })

    it('should have play again button text', () => {
      expect(BUTTON_PLAY_AGAIN).toBe('Още веднъж')
    })

    it('should have menu button text', () => {
      expect(BUTTON_TO_MENU).toBe('Към менюто')
    })
  })

  describe('Feedback logic: Praise rotates', () => {
    it('should rotate through praise messages', () => {
      const msg0 = getPraiseMessage(0)
      const msg1 = getPraiseMessage(1)
      const msg2 = getPraiseMessage(2)
      const msg3 = getPraiseMessage(3) // Should wrap around
      
      expect(msg0).toBe('Браво!')
      expect(msg1).toBe('Супер!')
      expect(msg2).toBe('Точно така!')
      expect(msg3).toBe('Браво!') // Back to first
    })

    it('should handle large indices by wrapping', () => {
      const msg100 = getPraiseMessage(100)
      const msg101 = getPraiseMessage(101)
      const msg102 = getPraiseMessage(102)
      
      expect(PRAISE_MESSAGES).toContain(msg100)
      expect(PRAISE_MESSAGES).toContain(msg101)
      expect(PRAISE_MESSAGES).toContain(msg102)
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

    it('should be always encouraging', () => {
      // Even the "wrong" message is mild: "Опа! Опитай пак!"
      expect(WRONG_ANSWER_MESSAGE).toContain('Опа!')
      expect(WRONG_ANSWER_MESSAGE).toContain('Опитай пак!')
    })
  })

  describe('Cyrillic encoding', () => {
    it('should properly encode Bulgarian Cyrillic characters', () => {
      // Check that strings contain Cyrillic characters
      expect(PRAISE_MESSAGES[0]).toMatch(/[А-Яа-я]/)
      expect(WRONG_ANSWER_MESSAGE).toMatch(/[А-Яа-я]/)
      expect(LEVEL_COMPLETE_TITLE).toMatch(/[А-Яа-я]/)
      expect(BUTTON_PLAY_AGAIN).toMatch(/[А-Яа-я]/)
      expect(BUTTON_TO_MENU).toMatch(/[А-Яа-я]/)
    })
  })
})
