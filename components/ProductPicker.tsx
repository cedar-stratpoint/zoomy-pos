import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from './Sheet';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { PRESS_OPACITY } from '../constants/motion';
import type { Product } from '../db/products';

type Props = {
  visible: boolean;
  products: Product[];
  onPick: (product: Product) => void;
  onClose: () => void;
};

const peso = (n: number) => `₱${n.toFixed(2)}`;

/** Every sellable product with a search box, for a pack the scanner's guesses missed. */
export function ProductPicker({ visible, products, onPick, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState('');

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = products.filter((p) => words.every((w) => p.name.toLowerCase().includes(w)));

  function close() {
    setQuery('');
    onClose();
  }

  return (
    <Sheet visible={visible} onRequestClose={close} onBackdropPress={close} style={styles.sheet}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">Pick the product</Text>
        <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          testID="product-picker-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Duck, salmon, jerky..."
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCorrect={false}
          accessibilityLabel="Search products"
        />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(p) => String(p.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No products match.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`product-picker-${item.id}`}
            style={styles.row}
            onPress={() => {
              setQuery('');
              onPick(item);
            }}
            activeOpacity={PRESS_OPACITY}
          >
            <Text style={styles.emoji}>{item.emoji}</Text>
            <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.price}>{peso(item.price ?? 0)}</Text>
          </TouchableOpacity>
        )}
      />
    </Sheet>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  sheet: {
    backgroundColor: c.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl,
    paddingHorizontal: 16, paddingTop: 16, maxHeight: '85%', height: '85%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: c.textPrimary, fontSize: F.lg, fontWeight: '800' },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 44,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: R.sm,
    paddingHorizontal: 12, marginBottom: 10,
  },
  input: { flex: 1, color: c.textPrimary, fontSize: F.md },
  list: { gap: 6, paddingBottom: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48,
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderDark, borderRadius: R.sm,
  },
  emoji: { fontSize: 20 },
  name: { flex: 1, color: c.textPrimary, fontSize: F.sm + 1, fontWeight: '600' },
  price: { color: c.textSecondary, fontSize: F.sm, fontWeight: '700' },
  empty: { color: c.textSecondary, fontSize: F.sm, textAlign: 'center', marginTop: 24 },
});
