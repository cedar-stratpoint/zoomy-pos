import { Easing } from 'react-native';

// Motion tokens. One place for the curves and timings so sheets, toasts and
// drawers feel like the same app. Core `Animated.timing` defaults to an
// ease-in-out, which starts slow and makes a dragged or tapped surface lag;
// every animation here decelerates instead.
//
// High-frequency taps (product tiles, cart steppers) stay instant on purpose:
// they only get the press-opacity dip below, never a transition.

/** Strong ease-out for small UI (toasts, fades). */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** iOS sheet curve for surfaces that travel (bottom sheets, drawers). */
export const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

export const DURATION = {
  /** Toast enter. */
  toastIn: 180,
  /** Exits are subtler and quicker than enters: the user has moved on. */
  toastOut: 140,
  /** Opacity-only fades, including every reduced-motion fallback. */
  fade: 150,
  /** Sheets and drawers sliding in. */
  sheetIn: 240,
  sheetOut: 200,
  /** Scan button growing or shrinking its label as the grid scrolls. Seen often: keep it quick. */
  fabMorph: 180,
} as const;

/** `activeOpacity` for TouchableOpacity: the standard press dip. */
export const PRESS_OPACITY = 0.7;
/** Lighter dip for large, solid primary buttons, where 0.7 reads as a flash. */
export const PRESS_OPACITY_PRIMARY = 0.85;
