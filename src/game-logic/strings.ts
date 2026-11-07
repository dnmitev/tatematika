/**
 * Bulgarian strings used in the game.
 * All text must be in Bulgarian - no "Загуби" or "Game Over".
 */

/**
 * Visible praise after a correct answer. The spec replaced praise text with one cup icon.
 */
export const PRAISE_MESSAGES: readonly string[] = []

/**
 * Accessible name of the cup icon after a correct answer (never shown as text)
 */
export const CORRECT_ANSWER_LABEL = 'Вярно'

/**
 * Accessible name of the red X icon after a wrong answer (never shown as text)
 */
export const WRONG_ANSWER_MESSAGE = 'Грешно'

/**
 * Top panel instruction shown next to the target number
 */
export const TARGET_INSTRUCTION = 'Намери сметката за'

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
