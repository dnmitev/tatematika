/**
 * Shared timeout constants for e2e tests
 * 
 * In headless Chromium, the game renders at ~8-40 fps (wall time)
 * while Phaser's game.loop.delta stays at ~16.5ms (game time runs faster).
 * A full correct action (walk + jump + landing) can take 5-7 seconds of wall time.
 */

/**
 * Timeout for cat actions and their evaluation to complete:
 * - Walking to balloon
 * - Jumping
 * - Landing
 * - Stars/wrongAttempts counting
 * - Phase transitions (idle → action → idle)
 * - Round completion
 */
export const ACTION_TIMEOUT_MS = 20000

/**
 * Timeout for game initialization (window.__tatematika available)
 */
export const INIT_TIMEOUT_MS = 5000
