import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { F, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { EASE_OUT } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

export type ScanStage = 'preparing' | 'reading' | 'matching';

type StageInfo = {
  label: string;
  detail: string;
  /** Bar fill (0 to 1) this stage eases toward. */
  target: number;
  /** How long the ease takes, in ms. */
  duration: number;
};

// Claude gives no progress while it reads, so that stage eases toward 90% over about
// the slowest typical scan and holds there: the bar never claims to be done early.
export const SCAN_STAGES: Record<ScanStage, StageInfo> = {
  preparing: {
    label: 'Preparing photo',
    detail: 'Shrinking it so it uploads fast.',
    target: 0.15,
    duration: 400,
  },
  reading: {
    label: 'Reading the packs',
    detail: 'Identifying and counting each pack. This usually takes 5 to 10 seconds.',
    target: 0.9,
    duration: 9000,
  },
  matching: {
    label: 'Matching products and bundles',
    detail: 'Checking prices and which bundles fit.',
    target: 1,
    duration: 200,
  },
};

const ORDER: ScanStage[] = ['preparing', 'reading', 'matching'];

export function ScanProgress({ stage }: { stage: ScanStage }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const info = SCAN_STAGES[stage];

  useEffect(() => {
    if (reduced) {
      progress.setValue(info.target);
      return;
    }
    // The long wait decelerates the whole way, so the bar keeps visibly moving.
    const easing = stage === 'reading' ? Easing.out(Easing.cubic) : EASE_OUT;
    const animation = Animated.timing(progress, {
      toValue: info.target,
      duration: info.duration,
      easing,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [stage, reduced, info, progress]);

  return (
    <View style={styles.container}>
      <Text style={styles.step}>Step {ORDER.indexOf(stage) + 1} of {ORDER.length}</Text>
      <View
        testID="scan-progress"
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={info.label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(info.target * 100) }}
      >
        <Animated.View style={[styles.fill, { transform: [{ scaleX: progress }] }]} />
      </View>
      <Text style={styles.label} accessibilityLiveRegion="polite">{info.label}</Text>
      <Text style={styles.detail}>{info.detail}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { width: '100%', maxWidth: 320, gap: 8 },
  step: { color: c.textSecondary, fontSize: F.xs, fontWeight: '700' },
  track: {
    height: 6, borderRadius: 3, overflow: 'hidden',
    backgroundColor: c.elevated,
  },
  // Scaled from the left edge, so only transform animates (GPU, native driver).
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: c.pink, transformOrigin: 'left' },
  label: { color: c.textPrimary, fontSize: F.md, fontWeight: '800', marginTop: 4 },
  detail: { color: c.textSecondary, fontSize: F.sm, lineHeight: 19 },
});
