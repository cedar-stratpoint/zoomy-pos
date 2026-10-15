import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { PRESS_OPACITY_PRIMARY } from '../constants/motion';

type Props = { onPress: () => void };

/**
 * Full-width entry to photo scan, pinned above the category pills so it is the
 * first thing a cashier sees. The subtitle explains the feature while it is new.
 */
export function ScanProductsBar({ onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <TouchableOpacity
      testID="scan-products-bar"
      style={styles.bar}
      onPress={onPress}
      activeOpacity={PRESS_OPACITY_PRIMARY}
      accessibilityRole="button"
      accessibilityLabel="Scan products"
      accessibilityHint="Take or upload a photo of the packs to add them to the sale"
    >
      <View style={styles.iconBox}>
        <Ionicons name="camera-outline" size={22} color="#fff" />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>Scan products</Text>
        <Text style={styles.subtitle} numberOfLines={1}>Snap the packs and they go straight into the sale</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.pink} />
    </TouchableOpacity>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: c.pinkSubtle,
    borderWidth: 1,
    borderColor: c.pinkDim,
    borderRadius: R.md,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 14,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: c.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  title: { color: c.textPrimary, fontSize: F.md, fontWeight: '800' },
  subtitle: { color: c.textSecondary, fontSize: F.xs, fontWeight: '600' },
});
