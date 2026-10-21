import * as FileSystem from 'expo-file-system/legacy';
import { getSupabase } from '../lib/supabase';
import {
  getPendingScanSamples,
  markScanSamplePhotoSynced,
  markScanSampleSynced,
  type ScanSample,
} from '../db/scan-samples';

/** Private bucket: the POS may add photos but never read, replace or delete them. */
export const SCAN_SAMPLES_BUCKET = 'pos-scan-samples';

/** Grouped by month so the bucket stays browsable, e.g. `2026-10/<uuid>.jpg`. */
export function scanSamplePhotoPath(sample: Pick<ScanSample, 'client_uuid' | 'created_at'>): string {
  return `${sample.created_at.slice(0, 7)}/${sample.client_uuid}.jpg`;
}

/** The photo as base64: inline on web, read from its file on native. */
async function photoBase64(sample: ScanSample): Promise<string | null> {
  if (sample.photo_base64) return sample.photo_base64;
  if (!sample.photo_uri) return null;
  return FileSystem.readAsStringAsync(sample.photo_uri, { encoding: FileSystem.EncodingType.Base64 });
}

function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** True when a retry finds the photo already uploaded (the POS cannot overwrite it). */
function isAlreadyUploaded(error: { statusCode?: string; code?: string }): boolean {
  return error.code === 'ResourceAlreadyExists' || error.statusCode === '409';
}

/**
 * Pushes one sample to Coop: the photo to the bucket, then the row via
 * record_pos_scan_sample. Each step is idempotent on client_uuid, so a retry
 * after a partial push is safe. The local photo is dropped once both are done.
 */
export async function pushScanSample(sample: ScanSample): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured' };
  const path = scanSamplePhotoPath(sample);

  try {
    if (!sample.photo_synced_at) {
      const base64 = await photoBase64(sample);
      if (!base64) return { ok: false, error: 'Photo missing' };
      const { error } = await sb.storage
        .from(SCAN_SAMPLES_BUCKET)
        .upload(path, base64ToBytes(base64), { contentType: 'image/jpeg', upsert: false });
      if (error && !isAlreadyUploaded(error as { statusCode?: string; code?: string })) {
        return { ok: false, error: error.message };
      }
      await markScanSamplePhotoSynced(sample.client_uuid);
    }

    const { error } = await sb.rpc('record_pos_scan_sample', {
      p_sample: {
        client_uuid: sample.client_uuid,
        photo_path: path,
        width: sample.width,
        height: sample.height,
        model: sample.model,
        prediction: JSON.parse(sample.prediction_json),
        label: JSON.parse(sample.label_json),
        label_version: sample.label_version,
        transaction_client_uuid: sample.transaction_client_uuid,
        created_at: sample.created_at,
      },
    });
    if (error) return { ok: false, error: error.message };
    // The bucket has the photo, so free the device. This also clears an inline web
    // photo; a re-push after linking skips the upload.
    await markScanSampleSynced(sample.client_uuid);
    if (sample.photo_uri) await FileSystem.deleteAsync(sample.photo_uri, { idempotent: true }).catch(() => {});
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

let draining = false;

/**
 * Uploads pending samples, oldest first. Runs after the sales outbox and stays
 * out of its pending count: a training photo is never as urgent as a sale.
 * Single-flight, and a failed sample stays pending for the next drain.
 */
export async function drainScanSamples(): Promise<{ pushed: number; failed: number }> {
  if (draining) return { pushed: 0, failed: 0 };
  draining = true;
  let pushed = 0;
  let failed = 0;
  try {
    for (const sample of await getPendingScanSamples()) {
      const res = await pushScanSample(sample);
      if (res.ok) pushed += 1;
      else failed += 1;
    }
    return { pushed, failed };
  } finally {
    draining = false;
  }
}
