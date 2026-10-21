import * as FileSystem from 'expo-file-system/legacy';
import { drainScanSamples, pushScanSample, scanSamplePhotoPath } from '../../utils/scan-samples-sync';
import * as supa from '../../lib/supabase';
import * as samples from '../../db/scan-samples';
import type { ScanSample } from '../../db/scan-samples';

jest.mock('../../lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('../../db/scan-samples', () => ({
  getPendingScanSamples: jest.fn(),
  markScanSamplePhotoSynced: jest.fn().mockResolvedValue(undefined),
  markScanSampleSynced: jest.fn().mockResolvedValue(undefined),
}));

const mockedGetSupabase = supa.getSupabase as jest.Mock;
const mockSamples = samples as jest.Mocked<typeof samples>;
const mockFs = FileSystem as jest.Mocked<typeof FileSystem>;

function sample(over: Partial<ScanSample> = {}): ScanSample {
  return {
    client_uuid: 'uuid-1',
    photo_uri: 'file:///mock/documents/scan-uuid-1.jpg',
    photo_base64: null,
    width: 1500,
    height: 1125,
    model: 'claude-haiku-5-5',
    prediction_json: '{"items":[{"sku":"FD-SAL","quantity":2}],"unsure":[]}',
    label_json: '{"counts":{"FD-SAL":2},"bundles":[],"unsure":[],"edited":false}',
    label_version: 1,
    transaction_client_uuid: 'sale-1',
    created_at: '2026-10-21T03:00:00.000Z',
    photo_synced_at: null,
    synced_at: null,
    ...over,
  };
}

// A client whose upload and rpc resolve to the given results.
function sbWith({ upload = { error: null }, rpc = { error: null } }: {
  upload?: { error: unknown };
  rpc?: { error: unknown };
} = {}) {
  const uploadFn = jest.fn().mockResolvedValue(upload);
  const from = jest.fn().mockReturnValue({ upload: uploadFn });
  const rpcFn = jest.fn().mockResolvedValue(rpc);
  mockedGetSupabase.mockReturnValue({ storage: { from }, rpc: rpcFn });
  return { from, upload: uploadFn, rpc: rpcFn };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFs.readAsStringAsync.mockResolvedValue(btoa('jpeg-bytes'));
});

describe('scanSamplePhotoPath', () => {
  it('groups photos by month', () => {
    expect(scanSamplePhotoPath(sample())).toBe('2026-10/uuid-1.jpg');
  });
});

describe('pushScanSample', () => {
  it('uploads the photo without overwrite, then records the row and frees the device', async () => {
    const sb = sbWith();

    const res = await pushScanSample(sample());

    expect(res).toEqual({ ok: true });
    expect(sb.from).toHaveBeenCalledWith('pos-scan-samples');
    const [path, bytes, options] = sb.upload.mock.calls[0];
    expect(path).toBe('2026-10/uuid-1.jpg');
    expect(new TextDecoder().decode(bytes)).toBe('jpeg-bytes');
    expect(options).toEqual({ contentType: 'image/jpeg', upsert: false });
    expect(sb.rpc).toHaveBeenCalledWith('record_pos_scan_sample', {
      p_sample: expect.objectContaining({
        client_uuid: 'uuid-1',
        photo_path: '2026-10/uuid-1.jpg',
        prediction: { items: [{ sku: 'FD-SAL', quantity: 2 }], unsure: [] },
        label: { counts: { 'FD-SAL': 2 }, bundles: [], unsure: [], edited: false },
        transaction_client_uuid: 'sale-1',
      }),
    });
    expect(mockSamples.markScanSamplePhotoSynced).toHaveBeenCalledWith('uuid-1');
    expect(mockSamples.markScanSampleSynced).toHaveBeenCalledWith('uuid-1');
    expect(mockFs.deleteAsync).toHaveBeenCalledWith(sample().photo_uri, { idempotent: true });
  });

  it('uploads an inline web photo without touching the file system', async () => {
    const sb = sbWith();

    const res = await pushScanSample(sample({ photo_uri: null, photo_base64: btoa('web-jpeg') }));

    expect(res.ok).toBe(true);
    expect(new TextDecoder().decode(sb.upload.mock.calls[0][1])).toBe('web-jpeg');
    expect(mockFs.readAsStringAsync).not.toHaveBeenCalled();
    expect(mockFs.deleteAsync).not.toHaveBeenCalled();
    expect(mockSamples.markScanSampleSynced).toHaveBeenCalledWith('uuid-1');
  });

  it('keeps a sample pending when its photo is missing', async () => {
    const sb = sbWith();

    const res = await pushScanSample(sample({ photo_uri: null }));

    expect(res).toEqual({ ok: false, error: 'Photo missing' });
    expect(sb.upload).not.toHaveBeenCalled();
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('treats a photo already in the bucket as uploaded', async () => {
    const sb = sbWith({ upload: { error: { message: 'exists', statusCode: '409', code: 'ResourceAlreadyExists' } } });

    const res = await pushScanSample(sample());

    expect(res.ok).toBe(true);
    expect(mockSamples.markScanSamplePhotoSynced).toHaveBeenCalledWith('uuid-1');
    expect(sb.rpc).toHaveBeenCalled();
  });

  it('skips the upload once the photo is synced', async () => {
    const sb = sbWith();

    // As after linking: the photo was uploaded and its local copy dropped.
    await pushScanSample(sample({ photo_uri: null, photo_synced_at: '2026-10-21T03:01:00.000Z' }));

    expect(sb.upload).not.toHaveBeenCalled();
    expect(mockFs.deleteAsync).not.toHaveBeenCalled();
    expect(mockFs.readAsStringAsync).not.toHaveBeenCalled();
    expect(sb.rpc).toHaveBeenCalled();
  });

  it('keeps the sample pending when the upload fails', async () => {
    const sb = sbWith({ upload: { error: { message: 'denied', statusCode: '403' } } });

    const res = await pushScanSample(sample());

    expect(res).toEqual({ ok: false, error: 'denied' });
    expect(mockSamples.markScanSamplePhotoSynced).not.toHaveBeenCalled();
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('keeps the row pending and the photo on the device when the rpc fails', async () => {
    sbWith({ rpc: { error: { message: 'boom' } } });

    const res = await pushScanSample(sample());

    expect(res).toEqual({ ok: false, error: 'boom' });
    expect(mockSamples.markScanSamplePhotoSynced).toHaveBeenCalled();
    expect(mockSamples.markScanSampleSynced).not.toHaveBeenCalled();
    expect(mockFs.deleteAsync).not.toHaveBeenCalled();
  });

  it('is a no-op when Supabase is unconfigured', async () => {
    mockedGetSupabase.mockReturnValue(null);

    expect((await pushScanSample(sample())).ok).toBe(false);
  });
});

describe('drainScanSamples', () => {
  it('pushes every pending sample and counts the outcome', async () => {
    mockSamples.getPendingScanSamples.mockResolvedValue([sample(), sample({ client_uuid: 'uuid-2' })]);
    const sb = sbWith();
    sb.rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'boom' } });

    expect(await drainScanSamples()).toEqual({ pushed: 1, failed: 1 });
  });
});
