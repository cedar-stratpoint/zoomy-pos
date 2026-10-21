import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet, SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { getActiveProducts, type Product } from '../../db/products';
import { getActivePickBundles, SavedBundle } from '../../db/saved-bundles';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../components/Toast';
import { useDemoGuard } from '../../components/tour/useDemoGuard';
import { PhotoScanResultsSheet, type PhotoScanConfirmation } from '../../components/PhotoScanResultsSheet';
import { ScanProgress, type ScanStage } from '../../components/ScanProgress';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { PRESS_OPACITY_PRIMARY } from '../../constants/motion';
import { cropPack, resizeForScan, type ScanPhoto } from '../../utils/photo-scan/prepare-photo';
import { scanProducts, ScanError } from '../../utils/photo-scan/scan-products';
import { matchScanItems, matchUnsure, type MatchResult, type UnsurePack } from '../../utils/photo-scan/match-scan';

type Phase = 'choose' | 'camera' | 'scanning' | 'results';
type Photo = { uri: string; width: number; height: number };
type ScanOutcome = {
  match: MatchResult;
  unsure: UnsurePack[];
  /** Every sellable product, for picking an unsure pack by hand. */
  catalog: Product[];
  pickBundles: SavedBundle[];
};

/** Cuts each unsure pack out of the photo; a pack whose crop fails shows the whole photo. */
function withCrops(packs: UnsurePack[], photo: ScanPhoto): Promise<UnsurePack[]> {
  return Promise.all(packs.map(async (pack) => {
    if (!pack.box) return pack;
    try {
      return { ...pack, cropUri: await cropPack(photo, pack.box) };
    } catch (err) {
      console.warn('Pack crop failed:', err);
      return pack;
    }
  }));
}

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };

export default function PhotoScanModal() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { addItem, addBundle } = useCart();
  const { showToast } = useToast();
  const blockedByDemo = useDemoGuard();
  const [phase, setPhase] = useState<Phase>('choose');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);
  const [stage, setStage] = useState<ScanStage>('preparing');

  // A live viewfinder rather than ImagePicker.launchCameraAsync: on desktop browsers that
  // only opens the file picker, since they ignore the file input's capture hint.
  async function openCamera() {
    const granted = permission?.granted || (await requestPermission()).granted;
    if (!granted) {
      showToast({ variant: 'error', title: 'Camera is blocked', message: 'Allow camera access, or upload a photo instead.' });
      return;
    }
    setPhase('camera');
  }

  async function takePhoto() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (photo) await scanPhoto(photo);
    } catch (err) {
      console.warn('Photo capture failed:', err);
      showToast({ variant: 'error', title: 'Could not take photo', message: 'Try again, or upload a photo instead.' });
    } finally {
      setCapturing(false);
    }
  }

  async function uploadPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    if (result.canceled) return;
    await scanPhoto(result.assets[0]);
  }

  async function scanPhoto(asset: Photo) {
    setPhotoUri(asset.uri);
    setStage('preparing');
    setPhase('scanning');
    try {
      const prepared = await resizeForScan({ uri: asset.uri, width: asset.width, height: asset.height });
      setStage('reading');
      const [scan, products, pickBundles] = await Promise.all([
        scanProducts(prepared.base64),
        getActiveProducts(),
        getActivePickBundles(),
      ]);
      setStage('matching');
      setOutcome({
        match: matchScanItems(scan.items, products),
        unsure: await withCrops(matchUnsure(scan.unsure, products), prepared),
        catalog: products.filter((p) => p.price != null),
        pickBundles,
      });
      setPhase('results');
    } catch (err) {
      console.warn('Photo scan failed:', err);
      const message = err instanceof ScanError ? err.message : 'Something went wrong. Try again.';
      showToast({ variant: 'error', title: 'Scan failed', message });
      setPhase('choose');
    }
  }

  function handleConfirm({ bundles, singles }: PhotoScanConfirmation) {
    if (blockedByDemo()) return;
    for (const { bundle, items } of bundles) {
      addBundle({ presetId: bundle.id, name: bundle.name, price: bundle.price, items });
    }
    for (const { product, quantity } of singles) {
      for (let i = 0; i < quantity; i++) {
        addItem({ id: product.id, name: product.name, price: product.price ?? 0 });
      }
    }
    const packs = [...bundles.flatMap((b) => b.items), ...singles].reduce((sum, i) => sum + i.quantity, 0);
    showToast({ variant: 'success', title: 'Added to sale', message: `${packs} ${packs === 1 ? 'pack' : 'packs'}` });
    router.back();
  }

  function scanAgain() {
    setOutcome(null);
    setPhotoUri(null);
    setPhase('choose');
  }

  if (phase === 'results' && outcome && photoUri) {
    return (
      <SafeAreaView style={styles.container}>
        <PhotoScanResultsSheet
          photoUri={photoUri}
          initialItems={outcome.match.matched}
          unmatchedCount={outcome.match.unmatchedCount}
          unsurePacks={outcome.unsure}
          catalog={outcome.catalog}
          pickBundles={outcome.pickBundles}
          onConfirm={handleConfirm}
          onScanAgain={scanAgain}
          onClose={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  if (phase === 'camera') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <SafeAreaView style={styles.cameraOverlay}>
            <TouchableOpacity
              style={styles.cameraCloseBtn}
              onPress={() => setPhase('choose')}
              accessibilityLabel="Back"
            >
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.cameraHint}>Fit all the packs in the frame, labels facing up</Text>
            <TouchableOpacity
              style={styles.shutterBtn}
              onPress={takePhoto}
              disabled={capturing}
              activeOpacity={PRESS_OPACITY_PRIMARY}
              accessibilityLabel="Take photo"
            >
              <View style={styles.shutterInner} />
            </TouchableOpacity>
          </SafeAreaView>
        </CameraView>
      </View>
    );
  }

  if (phase === 'scanning') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          {photoUri && <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />}
          <ScanProgress stage={stage} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      <View style={styles.centered}>
        <Ionicons name="scan-outline" size={44} color={colors.pink} />
        <Text style={styles.title}>Scan products</Text>
        <Text style={styles.body}>
          Lay the packs flat with the labels facing up, then take a photo or upload one.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={openCamera} activeOpacity={PRESS_OPACITY_PRIMARY}>
          <Ionicons name="camera-outline" size={20} color="#fff" />
          <Text style={styles.primaryText}>Take photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={uploadPhoto} activeOpacity={PRESS_OPACITY_PRIMARY}>
          <Ionicons name="images-outline" size={20} color={colors.textPrimary} />
          <Text style={styles.secondaryText}>Upload photo</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  headerRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  title: { color: c.textPrimary, fontSize: F.xl, fontWeight: '800', textAlign: 'center' },
  body: {
    color: c.textSecondary, fontSize: F.sm, textAlign: 'center',
    lineHeight: 20, maxWidth: 320, marginBottom: 12,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.pink, borderRadius: R.sm,
    paddingVertical: 16, width: '100%', maxWidth: 320,
  },
  primaryText: { color: '#fff', fontSize: F.md, fontWeight: '800' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.elevated, borderRadius: R.sm, borderWidth: 1, borderColor: c.border,
    paddingVertical: 16, width: '100%', maxWidth: 320,
  },
  secondaryText: { color: c.textPrimary, fontSize: F.md, fontWeight: '700' },
  preview: {
    width: '100%', maxWidth: 320, height: 240, borderRadius: R.md,
    backgroundColor: c.elevated, marginBottom: 12,
  },

  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraOverlay: {
    flex: 1, alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 24, paddingHorizontal: 20,
  },
  cameraCloseBtn: {
    alignSelf: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20, padding: 8,
  },
  cameraHint: {
    color: '#fff', fontSize: F.sm, fontWeight: '700', textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: R.sm,
    paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden',
  },
  shutterBtn: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
});
