import { getDatabase } from './database';

/**
 * Photo scan training samples: one per scan the cashier confirmed with "Add to
 * sale". Durable the moment it's written (synced_at null); the outbox uploads the
 * photo, then the row (record_pos_scan_sample), each keyed on client_uuid.
 * See db/schema.ts scan_samples and utils/scan-samples-sync.ts.
 */

export type ScanSample = {
  client_uuid: string;
  /** The photo in the app's document dir (native). Null on web and once on Coop. */
  photo_uri: string | null;
  /** The photo itself as base64 JPEG (web). Null on native and once on Coop. */
  photo_base64: string | null;
  width: number;
  height: number;
  model: string | null;
  prediction_json: string;
  label_json: string;
  label_version: number;
  /** The sale this scan went into; null until checkout (or if the cart was dropped). */
  transaction_client_uuid: string | null;
  created_at: string;
  /** Set once the photo is in the bucket; the row is pushed only after that. */
  photo_synced_at: string | null;
  synced_at: string | null;
};

export async function insertScanSample(data: {
  clientUuid: string;
  /** Set exactly one: a file on native, inline base64 JPEG on web. */
  photoUri: string | null;
  photoBase64: string | null;
  width: number;
  height: number;
  model: string | null;
  prediction: unknown;
  label: unknown;
  labelVersion: number;
}): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO scan_samples (client_uuid, photo_uri, photo_base64, width, height, model, prediction_json, label_json, label_version, transaction_client_uuid, created_at, photo_synced_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL)',
    [
      data.clientUuid,
      data.photoUri,
      data.photoBase64,
      data.width,
      data.height,
      data.model,
      JSON.stringify(data.prediction),
      JSON.stringify(data.label),
      data.labelVersion,
      new Date().toISOString(),
    ]
  );
}

/**
 * Ties scans to the sale they went into. Clears synced_at so a row already on
 * Coop is pushed again with the link (the RPC fills it in idempotently).
 */
export async function linkScanSamplesToTransaction(clientUuids: string[], transactionClientUuid: string): Promise<void> {
  if (clientUuids.length === 0) return;
  const db = await getDatabase();
  const placeholders = clientUuids.map(() => '?').join(', ');
  await db.runAsync(
    `UPDATE scan_samples SET transaction_client_uuid = ?, synced_at = NULL WHERE client_uuid IN (${placeholders})`,
    [transactionClientUuid, ...clientUuids]
  );
}

/** Samples still owing Coop a push, oldest first. */
export async function getPendingScanSamples(): Promise<ScanSample[]> {
  const db = await getDatabase();
  return db.getAllAsync<ScanSample>(
    'SELECT * FROM scan_samples WHERE synced_at IS NULL ORDER BY created_at ASC'
  );
}

export async function markScanSamplePhotoSynced(clientUuid: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE scan_samples SET photo_synced_at = ? WHERE client_uuid = ?',
    [new Date().toISOString(), clientUuid]
  );
}

/**
 * Marks a sample confirmed on Coop and drops its local photo reference: the
 * bucket has it, so a re-push after linking never needs it again. The caller
 * deletes a native file itself; clearing photo_base64 frees browser storage.
 */
export async function markScanSampleSynced(clientUuid: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE scan_samples SET synced_at = ?, photo_uri = NULL, photo_base64 = NULL WHERE client_uuid = ?',
    [new Date().toISOString(), clientUuid]
  );
}
