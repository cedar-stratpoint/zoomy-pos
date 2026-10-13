import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the OS "reduce motion" setting is on (iOS Reduce Motion, Android
 * Remove animations, `prefers-reduced-motion` on web). Tracks live changes, so
 * flipping the setting mid-shift takes effect without a reload. Surfaces that
 * travel should fall back to an opacity-only fade when this is true.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Starts false, so only a true reading needs a re-render.
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted && value) setReduced(true);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub?.remove();
    };
  }, []);

  return reduced;
}
