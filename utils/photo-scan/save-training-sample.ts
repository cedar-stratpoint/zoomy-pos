import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { copyToDocumentDir } from '../photos';
import { insertScanSample } from '../../db/scan-samples';
import type { PreparedPhoto } from './prepare-photo';
import type { ScanResult } from './scan-products';
import { buildTrainingLabel, TRAINING_LABEL_VERSION, type LabelInput } from './training-sample';

/**
 * Keeps a confirmed scan for training with the scanner's answer and the cashier's
 * label, and returns the sample's client_uuid. On native the photo the scanner read
 * is copied out of the cache (which the OS may clear). On web it is a blob URL that
 * dies on reload, so the base64 JPEG sent to the scanner is stored in the row instead.
 */
export async function saveTrainingSample(
  photo: PreparedPhoto,
  scan: ScanResult,
  unmatchedCount: number,
  label: LabelInput,
): Promise<string> {
  const clientUuid = Crypto.randomUUID();
  const onWeb = Platform.OS === 'web';
  await insertScanSample({
    clientUuid,
    photoUri: onWeb ? null : await copyToDocumentDir(photo.uri, `scan-sample-${clientUuid}.jpg`),
    photoBase64: onWeb ? photo.base64 : null,
    width: photo.width,
    height: photo.height,
    model: scan.model,
    prediction: { items: scan.items, unsure: scan.unsure, unmatched_count: unmatchedCount },
    label: buildTrainingLabel(label),
    labelVersion: TRAINING_LABEL_VERSION,
  });
  return clientUuid;
}
