import { Platform } from 'react-native';
import { saveTrainingSample } from '../../../utils/photo-scan/save-training-sample';
import * as photos from '../../../utils/photos';
import * as samples from '../../../db/scan-samples';
import { product } from '../../../__fixtures__/photo-scan';

jest.mock('../../../utils/photos', () => ({
  copyToDocumentDir: jest.fn().mockResolvedValue('file:///mock/documents/scan-sample.jpg'),
}));
jest.mock('../../../db/scan-samples', () => ({ insertScanSample: jest.fn().mockResolvedValue(undefined) }));

const mockCopy = photos.copyToDocumentDir as jest.Mock;
const mockInsert = samples.insertScanSample as jest.Mock;

const salmon = product({ id: 1, name: 'Salmon', sku: 'FD-SAL' });
const photo = { uri: 'file:///cache/scan.jpg', width: 1500, height: 1125, base64: 'BASE64' };
const scan = { items: [{ sku: 'FD-SAL', quantity: 1 }], unsure: [], model: 'claude-haiku-5-5' };
const label = {
  matched: [{ product: salmon, quantity: 1 }],
  unsurePacks: [],
  bundles: [],
  singles: [{ product: salmon, quantity: 1 }],
  unsureAnswers: [],
  catalog: [salmon],
};

describe('saveTrainingSample', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps the photo as a file on native', async () => {
    const clientUuid = await saveTrainingSample(photo, scan, 0, label);

    expect(mockCopy).toHaveBeenCalledWith('file:///cache/scan.jpg', `scan-sample-${clientUuid}.jpg`);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      clientUuid,
      photoUri: 'file:///mock/documents/scan-sample.jpg',
      photoBase64: null,
      model: 'claude-haiku-5-5',
      prediction: { items: scan.items, unsure: [], unmatched_count: 0 },
      label: expect.objectContaining({ counts: { 'FD-SAL': 1 }, edited: false }),
      labelVersion: 1,
    }));
  });

  it('keeps the photo inline on web, where the blob URL dies on reload', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');

    await saveTrainingSample(photo, scan, 0, label);

    expect(mockCopy).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ photoUri: null, photoBase64: 'BASE64' }));
  });
});
