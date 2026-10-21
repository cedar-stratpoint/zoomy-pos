import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet, ScrollView, Modal, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { PRESS_OPACITY_PRIMARY } from '../constants/motion';
import type { SavedBundle } from '../db/saved-bundles';
import type { MatchedItem } from '../utils/photo-scan/match-scan';
import {
  planBundles, suggestBundleCounts, usableBundles,
  type BundleCounts, type BundlePlan, type PlannedBundle,
} from '../utils/photo-scan/apply-bundles';

export type PhotoScanConfirmation = { bundles: PlannedBundle[]; singles: MatchedItem[] };

type Props = {
  photoUri: string;
  initialItems: MatchedItem[];
  unmatchedCount: number;
  pickBundles: SavedBundle[];
  onConfirm: (confirmation: PhotoScanConfirmation) => void;
  onScanAgain: () => void;
  onClose: () => void;
};

const peso = (n: number) => `₱${n.toFixed(2)}`;

function savingsLabel(savings: number): string {
  if (savings > 0) return `Bundles save ${peso(savings)}`;
  if (savings < 0) return `Bundles cost ${peso(-savings)} more`;
  return 'Bundles cost the same as singles';
}

export function PhotoScanResultsSheet({
  photoUri, initialItems, unmatchedCount, pickBundles, onConfirm, onScanAgain, onClose,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Quantity per product id. 0 keeps the row visible as removed, so it can be undone.
  const [quantities, setQuantities] = useState<Record<number, number>>(
    () => Object.fromEntries(initialItems.map((i) => [i.product.id, i.quantity])),
  );
  const [scannedQuantities] = useState(quantities);
  // null until the cashier changes a bundle count: the cheapest saving mix is used.
  const [counts, setCounts] = useState<BundleCounts | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);

  const items = initialItems
    .map(({ product }) => ({ product, quantity: quantities[product.id] ?? 0 }))
    .filter((i) => i.quantity > 0);
  // Re-planned on every edit: baskets are a handful of packs, so this is cheap.
  // Only bundles these packs could fill on their own, so the list matches the basket.
  // Judged per bundle, not against the current mix, so rows never jump while tapping.
  const bundles = usableBundles(pickBundles).filter((b) => planBundles(items, pickBundles, { [b.id]: 1 }) !== null);
  const suggested = suggestBundleCounts(items, bundles);
  // Counts the edited basket can no longer fill fall back to the suggestion.
  const chosenPlan = counts ? planBundles(items, bundles, counts) : null;
  const activeCounts = chosenPlan && counts ? counts : suggested;
  // The suggestion was built from these packs, so it always fills.
  const plan = chosenPlan ?? (planBundles(items, bundles, suggested) as BundlePlan);
  const packCount = items.reduce((sum, i) => sum + i.quantity, 0);

  function countOf(bundleId: number): number {
    return activeCounts[bundleId] ?? 0;
  }

  function canAdd(bundleId: number): boolean {
    return planBundles(items, bundles, { ...activeCounts, [bundleId]: countOf(bundleId) + 1 }) !== null;
  }

  function setBundleCount(bundleId: number, count: number) {
    setCounts({ ...activeCounts, [bundleId]: Math.max(0, count) });
  }

  function setQty(productId: number, quantity: number) {
    setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, quantity) }));
  }

  function handleConfirm() {
    if (packCount === 0) return;
    onConfirm({ bundles: plan.bundles, singles: plan.singles });
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Check the scan</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        <TouchableOpacity
          testID="photo-preview"
          onPress={() => setPhotoOpen(true)}
          activeOpacity={PRESS_OPACITY_PRIMARY}
          accessibilityRole="imagebutton"
          accessibilityLabel="View the whole photo"
        >
          <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
          <View style={styles.photoExpand} pointerEvents="none">
            <Ionicons name="expand-outline" size={14} color="#fff" />
            <Text style={styles.photoExpandText}>View photo</Text>
          </View>
        </TouchableOpacity>

        {unmatchedCount > 0 && (
          <View style={styles.note}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.noteText}>
              {unmatchedCount === 1
                ? '1 item could not be matched. Add it manually.'
                : `${unmatchedCount} items could not be matched. Add them manually.`}
            </Text>
          </View>
        )}

        {initialItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No products found</Text>
            <Text style={styles.emptySubtext}>
              Lay the packs flat with the labels facing up, then scan again.
            </Text>
          </View>
        ) : (
          initialItems.map(({ product }) => {
            const qty = quantities[product.id] ?? 0;
            const removed = qty === 0;
            return (
              <View key={product.id} style={[styles.row, removed && styles.rowRemoved]}>
                <Text style={styles.emoji}>{product.emoji}</Text>
                <View style={styles.rowInfo}>
                  <Text style={[styles.name, removed && styles.nameRemoved]} numberOfLines={2}>{product.name}</Text>
                  <Text style={styles.price}>{peso(product.price ?? 0)}</Text>
                </View>
                {removed ? (
                  <TouchableOpacity
                    onPress={() => setQty(product.id, scannedQuantities[product.id] ?? 1)}
                    style={styles.undoBtn}
                  >
                    <Text style={styles.undoText}>Undo</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.stepper}>
                    <TouchableOpacity
                      testID="qty-decrement"
                      style={styles.stepBtn}
                      onPress={() => setQty(product.id, qty - 1)}
                      accessibilityLabel={`Remove one ${product.name}`}
                    >
                      <Ionicons name="remove" size={16} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text testID="qty-value" style={styles.qty}>{qty}</Text>
                    <TouchableOpacity
                      testID="qty-increment"
                      style={styles.stepBtn}
                      onPress={() => setQty(product.id, qty + 1)}
                      accessibilityLabel={`Add one ${product.name}`}
                    >
                      <Ionicons name="add" size={16} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}

        {bundles.length > 0 && (
          <View style={styles.bundleBox}>
            <Text style={styles.bundleTitle}>Bundles</Text>
            {bundles.map((bundle) => (
              <BundleRow
                key={bundle.id}
                bundle={bundle}
                count={countOf(bundle.id)}
                canAdd={canAdd(bundle.id)}
                contents={plan.bundles.filter((b) => b.bundle.id === bundle.id)}
                onChange={(n) => setBundleCount(bundle.id, n)}
                styles={styles}
                colors={colors}
              />
            ))}
            {plan.bundles.length > 0 && (
              <Text testID="bundle-savings" style={plan.savings > 0 ? styles.bundleSave : styles.bundleMuted}>
                {savingsLabel(plan.savings)}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={photoOpen} animationType="fade" onRequestClose={() => setPhotoOpen(false)}>
        <SafeAreaView style={styles.viewer}>
          <TouchableOpacity
            testID="photo-viewer-close"
            style={styles.viewerClose}
            onPress={() => setPhotoOpen(false)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Close photo"
          >
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Image
            testID="photo-viewer-image"
            source={{ uri: photoUri }}
            style={styles.viewerImage}
            resizeMode="contain"
            accessibilityLabel="Scanned photo"
          />
        </SafeAreaView>
      </Modal>

      <View style={styles.footer}>
        <View style={styles.footerInfo}>
          <Text style={styles.footerCount}>{packCount} {packCount === 1 ? 'pack' : 'packs'}</Text>
          <Text style={styles.footerTotal}>{peso(plan.total)}</Text>
        </View>
        <TouchableOpacity style={styles.scanAgainBtn} onPress={onScanAgain}>
          <Text style={styles.scanAgainText}>Scan again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.addBtn, packCount === 0 && styles.addBtnDisabled]}
          onPress={handleConfirm}
          disabled={packCount === 0}
          activeOpacity={PRESS_OPACITY_PRIMARY}
        >
          <Text style={[styles.addText, packCount === 0 && styles.addTextDisabled]}>Add to sale</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

type BundleRowProps = {
  bundle: SavedBundle;
  count: number;
  canAdd: boolean;
  /** This bundle's filled copies, so the cashier sees which packs go in. */
  contents: PlannedBundle[];
  onChange: (count: number) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
};

function BundleRow({ bundle, count, canAdd, contents, onChange, styles, colors }: BundleRowProps) {
  return (
    <View testID={`bundle-${bundle.id}`} style={[styles.bundleRow, count > 0 && styles.bundleRowSelected]}>
      <View style={styles.rowInfo}>
        <Text style={styles.bundleName}>{bundle.name}</Text>
        <Text style={styles.bundleMuted}>{peso(bundle.price)} for any {bundle.pick_count}</Text>
        {contents.map((planned, i) => (
          <Text key={i} style={styles.bundleFlavors}>
            {planned.items.map((it) => `${it.quantity}x ${it.name}`).join(', ')}
          </Text>
        ))}
      </View>
      <View style={styles.stepper}>
        <TouchableOpacity
          testID={`bundle-${bundle.id}-decrement`}
          style={[styles.stepBtn, count === 0 && styles.stepBtnDisabled]}
          onPress={() => onChange(count - 1)}
          disabled={count === 0}
          accessibilityLabel={`One less ${bundle.name}`}
          accessibilityState={{ disabled: count === 0 }}
        >
          <Ionicons name="remove" size={16} color={count === 0 ? colors.textMuted : colors.textPrimary} />
        </TouchableOpacity>
        <Text testID={`bundle-${bundle.id}-count`} style={styles.qty}>{count}</Text>
        <TouchableOpacity
          testID={`bundle-${bundle.id}-increment`}
          style={[styles.stepBtn, !canAdd && styles.stepBtnDisabled]}
          onPress={() => onChange(count + 1)}
          disabled={!canAdd}
          accessibilityLabel={`One more ${bundle.name}`}
          accessibilityState={{ disabled: !canAdd }}
        >
          <Ionicons name="add" size={16} color={canAdd ? colors.textPrimary : colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },

  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10,
  },
  title: { color: c.textPrimary, fontSize: F.lg, fontWeight: '800' },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 6 },

  photo: {
    width: '100%', height: 180, borderRadius: R.md,
    backgroundColor: c.elevated, marginBottom: 10,
  },
  photoExpand: {
    position: 'absolute', right: 8, bottom: 18,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  photoExpandText: { color: '#fff', fontSize: F.xs, fontWeight: '700' },

  viewer: { flex: 1, backgroundColor: '#000' },
  viewerClose: {
    alignSelf: 'flex-end', margin: 12, padding: 8,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
  },
  viewerImage: { flex: 1, width: '100%' },

  note: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.surface, borderRadius: R.sm,
    borderWidth: 1, borderColor: c.borderDark,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4,
  },
  noteText: { flex: 1, color: c.textSecondary, fontSize: F.sm, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 6 },
  emptyText: { color: c.textSecondary, fontSize: F.md, fontWeight: '700' },
  emptySubtext: { color: c.textMuted, fontSize: F.sm, textAlign: 'center', lineHeight: 18 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: c.surface, borderRadius: R.sm,
    borderWidth: 1, borderColor: c.borderDark,
  },
  rowRemoved: { opacity: 0.45 },
  emoji: { fontSize: 22, marginRight: 12 },
  rowInfo: { flex: 1 },
  name: { color: c.textPrimary, fontSize: F.md, fontWeight: '600' },
  nameRemoved: { color: c.textMuted, textDecorationLine: 'line-through' },
  price: { color: c.textMuted, fontSize: F.xs, fontWeight: '600', marginTop: 2 },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stepBtn: {
    width: 36, height: 36, borderRadius: R.sm,
    backgroundColor: c.elevated, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.4 },
  qty: { width: 32, textAlign: 'center', color: c.pink, fontSize: F.md, fontWeight: '700' },
  undoBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  undoText: { color: c.pink, fontSize: F.sm, fontWeight: '700' },

  bundleBox: { marginTop: 10, gap: 6 },
  bundleTitle: { color: c.textPrimary, fontSize: F.md, fontWeight: '800', marginBottom: 2 },
  bundleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: R.sm,
    borderWidth: 1, borderColor: c.borderDark,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  bundleRowSelected: { borderColor: c.pinkDim, backgroundColor: c.pinkSubtle },
  bundleName: { color: c.textPrimary, fontSize: F.sm, fontWeight: '800' },
  bundleSave: { color: c.pink, fontSize: F.sm, fontWeight: '800' },
  bundleMuted: { color: c.textSecondary, fontSize: F.sm, fontWeight: '700' },
  bundleFlavors: { color: c.textSecondary, fontSize: F.xs, fontWeight: '600', lineHeight: 16, marginTop: 4 },

  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 16, borderTopWidth: 1, borderTopColor: c.borderDark,
    backgroundColor: c.surface,
  },
  footerInfo: { flex: 1 },
  footerCount: { color: c.textMuted, fontSize: F.xs, fontWeight: '700' },
  footerTotal: { color: c.textPrimary, fontSize: F.xl, fontWeight: '800' },
  scanAgainBtn: {
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: R.sm,
    backgroundColor: c.elevated, borderWidth: 1, borderColor: c.border,
  },
  scanAgainText: { color: c.textSecondary, fontSize: F.sm, fontWeight: '700' },
  addBtn: {
    backgroundColor: c.pink, paddingVertical: 14, paddingHorizontal: 18,
    borderRadius: R.sm, alignItems: 'center',
  },
  addBtnDisabled: { backgroundColor: c.elevated, borderWidth: 1, borderColor: c.border },
  addText: { color: '#fff', fontSize: F.md, fontWeight: '800' },
  addTextDisabled: { color: c.textMuted },
});
