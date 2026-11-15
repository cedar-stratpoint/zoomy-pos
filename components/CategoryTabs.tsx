import React, { useMemo } from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { HitArea } from './HitArea';
import { F, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { PRESS_OPACITY } from '../constants/motion';

type Props = {
  categories: string[];
  active: string;
  onSelect: (category: string) => void;
};

/**
 * Horizontally scrollable category pill row for the Option H split-view.
 * The active pill uses the Zoomy brand pink; the rest are quiet surfaces.
 */
export function CategoryTabs({ categories, active, onSelect }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (categories.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {categories.map((cat) => {
        const on = cat === active;
        return (
          <TouchableOpacity
            key={cat}
            testID={`category-tab-${cat}`}
            style={[styles.pill, on && styles.pillActive]}
            onPress={() => onSelect(cat)}
            activeOpacity={PRESS_OPACITY}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.label, on && styles.labelActive]} numberOfLines={1}>
              {cat}
            </Text>
            <HitArea fullWidth />
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  // ~36px pills: 5px of row padding holds each pill's 44px tap box (horizontal
  // scroll clips vertically on web); the negative margin keeps the old footprint.
  // That reaches past the footprint, so a screen with content right below this
  // row must give the row's container zIndex: 1, or the later content takes
  // those taps (react-native-web stacks every View at z-index 0).
  scroll: { marginVertical: -3 },
  row: { gap: 8, paddingHorizontal: 2, paddingVertical: 5 },
  pill: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderDark,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: c.pink,
    borderColor: c.pink,
  },
  label: {
    color: c.textSecondary,
    fontSize: F.sm,
    fontWeight: '700',
  },
  labelActive: { color: '#fff' },
});
