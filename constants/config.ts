/**
 * App configuration constants
 * Source: ux-design-specification.md#Gesture-Timings
 */

export const CONFIG = {
  // Gesture timings (ms)
  LONG_PRESS_DURATION: 250,
  SUBMENU_DELAY: 300,
  ANIMATION_OPEN: 100,
  ANIMATION_CLOSE: 50,

  // Haptic timings (ms)
  HAPTIC_LIGHT: 10,
  HAPTIC_MEDIUM: 20,
  HAPTIC_SUCCESS: 30,

  // Menu dimensions (px)
  MENU_RADIUS: 120,
  MENU_CENTER_RADIUS: 40,
  STUDENT_CARD_MIN_WIDTH: 60,
  STUDENT_CARD_MIN_HEIGHT: 50,
  TOUCH_TARGET_MIN: 44,

  // Performance thresholds
  TARGET_FPS: 60,
  MAX_MENU_LATENCY: 100,
  MAX_HAPTIC_LATENCY: 50,
  MAX_ACTION_TIME: 2000,
} as const;

export type Config = typeof CONFIG;
