import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MIN_TAP } from '../constants/theme';

const HALF = MIN_TAP / 2;

/**
 * Grows a touchable's tap area to MIN_TAP (44pt) without changing how it looks.
 * Render it as the last child of the touchable. It's a transparent box centered
 * on the touchable, MIN_TAP tall; `fullWidth` spans the touchable's width (wide
 * pills), otherwise it's MIN_TAP wide too (small icon buttons).
 *
 * Why not hitSlop: react-native-web's TouchableOpacity and Pressable ignore it,
 * and the POS ships as a PWA. On web a tap on this box lands on a descendant of
 * the touchable, so the touchable handles it.
 *
 * Constraints: nothing between the touchable and this box may clip it
 * (overflow: 'hidden'), and a ScrollView around it needs enough vertical
 * padding to contain it (horizontal scroll on web clips vertically too). Native
 * ignores taps outside a view's bounds, so a native build would add hitSlop.
 */
export function HitArea({ fullWidth = false }: { fullWidth?: boolean }) {
  return (
    <View
      testID="hit-area"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.box, fullWidth ? styles.fullWidth : styles.square]}
    />
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    top: '50%',
    height: MIN_TAP,
    marginTop: -HALF,
  },
  fullWidth: { left: 0, right: 0 },
  square: { left: '50%', width: MIN_TAP, marginLeft: -HALF },
});
