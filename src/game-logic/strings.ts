/**
 * Bulgarian strings used in the game.
 * All text must be in Bulgarian - no "Загуби" or "Game Over".
 */

/**
 * Praise messages shown after correct answers (rotating)
 */
export const PRAISE_MESSAGES = [
  'Браво!',
  'Супер!',
  'Точно така!',
] as const

/**
 * Feedback message for wrong answer
 */
export const WRONG_ANSWER_MESSAGE = 'Опа! Опитай пак!'

/**
 * Level completion messages
 */
export const LEVEL_COMPLETE_TITLE = 'Ти успя!'
export const LEVEL_COMPLETE_MESSAGE = (stars: number) => `Събра ${stars} звездички!`

/**
 * Button labels
 */
export const BUTTON_PLAY_AGAIN = 'Още веднъж'
export const BUTTON_TO_MENU = 'Към менюто'

/**
 * Get a rotating praise message
 */
export function getPraiseMessage(index: number): string {
  throw new Error('not implemented')
}
