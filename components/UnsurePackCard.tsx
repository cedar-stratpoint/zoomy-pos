import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { PRESS_OPACITY } from '../constants/motion';
import type { Product } from '../db/products';
import type { UnsurePack } from '../utils/photo-scan/match-scan';

type Props = {
  pack: UnsurePack;
  /** Unsure packs still to answer, this one included. */
  remaining: number;
  /** Shown when the pack could not be cut out of the photo. */
  photoUri: string;
  onPick: (product: Product) => void;
  onSomethingElse: () => void;
  onSkip: () => void;
};

const peso = (n: number) => `₱${n.toFixed(2)}`;

/**
 * A pack the scanner could not pin down, asked about at the top of the review so
 * it cannot slip into the sale unchecked. The likeliest guess is outlined.
 */
export function UnsurePackCard({ pack, remaining, photoUri, onPick, onSomethingElse, onSkip }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const question = pack.quantity > 1
    ? `${pack.quantity} packs like this. Which product are they?`
    : 'Which product is this?';

  return (
    <View testID="unsure-card" style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons name="help-circle-outline" size={18} color={colors.amber} />
        <Text style={styles.title} accessibilityRole="header">
          {remaining === 1 ? '1 pack needs a check' : `${remaining} packs need a check`}
        </Text>
      </View>

      <View style={styles.questionRow}>
        <Image
          source={{ uri: pack.cropUri ?? photoUri }}
          style={styles.crop}
          resizeMode={pack.cropUri ? 'contain' : 'cover'}
          accessibilityLabel={pack.cropUri ? 'The pack from your photo' : 'Your photo'}
        />
        <Text style={styles.question}>{question}</Text>
      </View>

      {pack.candidates.length === 0 ? (
        <Text style={styles.noGuess}>The scanner has no guess for this one. Pick it from the list.</Text>
      ) : (
        <View style={styles.options}>
          {pack.candidates.map((product, i) => (
            <TouchableOpacity
              key={product.id}
              testID={`unsure-option-${product.id}`}
              style={[styles.option, i === 0 && styles.optionLikely]}
              onPress={() => onPick(product)}
              activeOpacity={PRESS_OPACITY}
              accessibilityRole="button"
              accessibilityLabel={`${product.name}, ${peso(product.price ?? 0)}${i === 0 ? ', most likely' : ''}`}
            >
              <Text style={styles.optionEmoji}>{product.emoji}</Text>
              <Text style={styles.optionName} numberOfLines={2}>{product.name}</Text>
              <Text style={styles.optionPrice}>{peso(product.price ?? 0)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          testID="unsure-something-else"
          style={[styles.action, pack.candidates.length === 0 && styles.actionPrimary]}
          onPress={onSomethingElse}
          activeOpacity={PRESS_OPACITY}
        >
          <Text style={[styles.actionText, pack.candidates.length === 0 && styles.actionPrimaryText]}>
            {pack.candidates.length === 0 ? 'Pick the product' : 'Something else'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity testID="unsure-skip" style={[styles.action, styles.actionQuiet]} onPress={onSkip} activeOpacity={PRESS_OPACITY}>
          <Text style={styles.actionQuietText}>Not a pack, skip</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  card: {
    backgroundColor: c.amberSubtle, borderWidth: 1, borderColor: c.amberDim,
    borderRadius: R.md, padding: 12, gap: 10, marginBottom: 4,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: c.amber, fontSize: F.md, fontWeight: '800' },
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  crop: { width: 72, height: 72, borderRadius: R.sm, backgroundColor: c.elevated },
  question: { flex: 1, color: c.textPrimary, fontSize: F.sm + 1, fontWeight: '700', lineHeight: 19 },
  noGuess: { color: c.textSecondary, fontSize: F.sm, fontWeight: '600' },
  options: { gap: 6 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48,
    paddingVertical: 6, paddingHorizontal: 12,
    backgroundColor: c.surface, borderRadius: R.sm, borderWidth: 1, borderColor: c.border,
  },
  optionLikely: { borderColor: c.amber, borderWidth: 1.5 },
  optionEmoji: { fontSize: 20 },
  optionName: { flex: 1, color: c.textPrimary, fontSize: F.sm + 1, fontWeight: '700' },
  optionPrice: { color: c.textSecondary, fontSize: F.sm, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.surface, borderRadius: R.sm, borderWidth: 1, borderColor: c.border,
  },
  actionText: { color: c.textPrimary, fontSize: F.sm, fontWeight: '700' },
  actionPrimary: { backgroundColor: c.amber, borderColor: c.amber },
  actionPrimaryText: { color: c.bg },
  actionQuiet: { backgroundColor: 'transparent' },
  actionQuietText: { color: c.textSecondary, fontSize: F.sm, fontWeight: '700' },
});
