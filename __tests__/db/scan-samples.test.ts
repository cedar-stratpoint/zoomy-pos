import {
  getPendingScanSamples,
  insertScanSample,
  linkScanSamplesToTransaction,
  markScanSampleSynced,
} from '../../db/scan-samples';
import { mockDb } from '../../__mocks__/expo-sqlite';

beforeEach(() => jest.clearAllMocks());

describe('insertScanSample', () => {
  it('stores the prediction and label as JSON, pending both upload steps', async () => {
    await insertScanSample({
      clientUuid: 'uuid-1',
      photoUri: 'file:///mock/documents/scan-uuid-1.jpg',
      photoBase64: null,
      width: 1500,
      height: 1125,
      model: 'claude-haiku-5-5',
      prediction: { items: [], unsure: [] },
      label: { counts: {}, edited: false },
      labelVersion: 1,
    });

    const [sql, params] = mockDb.runAsync.mock.calls[0];
    expect(sql).toMatch(/^INSERT INTO scan_samples/);
    expect(sql).toMatch(/NULL, \?, NULL, NULL\)$/);
    expect(params.slice(0, 9)).toEqual([
      'uuid-1', 'file:///mock/documents/scan-uuid-1.jpg', null, 1500, 1125, 'claude-haiku-5-5',
      '{"items":[],"unsure":[]}', '{"counts":{},"edited":false}', 1,
    ]);
  });
});

describe('markScanSampleSynced', () => {
  it('drops the local photo reference, freeing an inline web photo', async () => {
    await markScanSampleSynced('uuid-1');

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE scan_samples SET synced_at = ?, photo_uri = NULL, photo_base64 = NULL WHERE client_uuid = ?',
      [expect.any(String), 'uuid-1']
    );
  });
});

describe('linkScanSamplesToTransaction', () => {
  it('links each sample to the sale and queues it to push again', async () => {
    await linkScanSamplesToTransaction(['a', 'b'], 'sale-1');

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE scan_samples SET transaction_client_uuid = ?, synced_at = NULL WHERE client_uuid IN (?, ?)',
      ['sale-1', 'a', 'b']
    );
  });

  it('does nothing for a sale with no scans', async () => {
    await linkScanSamplesToTransaction([], 'sale-1');

    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });
});

describe('getPendingScanSamples', () => {
  it('reads unsynced rows oldest first', async () => {
    await getPendingScanSamples();

    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      'SELECT * FROM scan_samples WHERE synced_at IS NULL ORDER BY created_at ASC'
    );
  });
});
