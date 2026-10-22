import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { F, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { DURATION, EASE_OUT, PRESS_OPACITY_PRIMARY } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Props = {
  /** True while the product grid is scrolled: the label tucks away, leaving the camera. */
  collapsed: boolean;
  onPress: () => void;
};

const SIZE = 56;
const LABEL = 'Scan';
// Screen readers get the fuller name, since they hear no camera icon.
const ACCESSIBILITY_LABEL = 'Scan products';

/**
 * Floating entry to photo scan, pinned over the product grid's bottom-right corner.
 * At rest it reads "Scan" next to the camera so cashiers learn it; while they scroll the grid
 * it shrinks to a round camera button so it hides less of the tiles.
 */
export function ScanFab({ collapsed, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reduced = useReducedMotion();
  // 1 = labeled, 0 = round. Drives width, so it runs on the JS thread; it is short.
  const progress = useRef(new Animated.Value(collapsed ? 0 : 1)).current;
  const [labelWidth, setLabelWidth] = useState(0);

  useEffect(() => {
    const toValue = collapsed ? 0 : 1;
    if (reduced) {
      progress.setValue(toValue);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue,
      duration: DURATION.fabMorph,
      easing: EASE_OUT,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [collapsed, reduced, progress]);

  return (
    <View style={styles.anchor} pointerEvents="box-none">
      {/* Measured once off-screen so the label can animate to its natural width. */}
      <Text
        style={[styles.label, styles.measure]}
        numberOfLines={1}
        onLayout={(e) => setLabelWidth(e.nativeEvent.layout.width)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {LABEL}
      </Text>
      <TouchableOpacity
        testID="scan-fab"
        style={styles.button}
        onPress={onPress}
        activeOpacity={PRESS_OPACITY_PRIMARY}
        accessibilityRole="button"
        accessibilityLabel={ACCESSIBILITY_LABEL}
        accessibilityHint="Take or upload a photo of the packs to add them to the sale"
      >
        <Ionicons name="camera-outline" size={24} color="#fff" />
        <Animated.View
          testID="scan-fab-label"
          style={{
            width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, labelWidth] }),
            marginLeft: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }),
            opacity: progress,
            overflow: 'hidden',
          }}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <Text style={styles.label} numberOfLines={1}>{LABEL}</Text>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  anchor: { position: 'absolute', right: 16, bottom: 16 },
  button: {
    height: SIZE,
    minWidth: SIZE,
    borderRadius: SIZE / 2,
    paddingHorizontal: (SIZE - 24) / 2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.pink,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  label: { color: '#fff', fontSize: F.md, fontWeight: '800' },
  measure: { position: 'absolute', opacity: 0, left: -9999 },
});
