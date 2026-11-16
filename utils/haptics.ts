import * as Haptics from 'expo-haptics';

export type HapticOutcome = 'success' | 'warning' | 'error';

const FEEDBACK: Record<HapticOutcome, Haptics.NotificationFeedbackType> = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
};

/**
 * The app's only haptic, and only for something that actually happened:
 *   success  a sale was recorded, a scan's packs went into the cart, a void was undone
 *   warning  a sale was voided
 *   error    an action was blocked or didn't stick (no stock, wrong PIN, a save
 *            Coop rejected)
 * Never on an ordinary tap: buttons already give visual feedback on touch-down.
 *
 * Best-effort and fire-and-forget. On the PWA, expo-haptics uses
 * navigator.vibrate, so Android Chrome vibrates and iOS Safari (no vibration
 * API) does nothing.
 */
export function hapticOutcome(outcome: HapticOutcome): void {
  Haptics.notificationAsync(FEEDBACK[outcome]).catch(() => {});
}
