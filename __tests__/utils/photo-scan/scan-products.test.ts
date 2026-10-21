import { scanProducts, ScanError } from '../../../utils/photo-scan/scan-products';
import { getSupabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({ getSupabase: jest.fn() }));

const mockGetSupabase = getSupabase as jest.Mock;

function supabaseReturning(result: { data: unknown; error: unknown }) {
  const invoke = jest.fn().mockResolvedValue(result);
  mockGetSupabase.mockReturnValue({ functions: { invoke } });
  return invoke;
}

describe('scanProducts', () => {
  beforeEach(() => jest.resetAllMocks());

  it('sends the photo to the scan-products function and returns its items', async () => {
    const invoke = supabaseReturning({
      data: { ok: true, items: [{ sku: 'FD-SAL', quantity: 2 }] },
      error: null,
    });

    const result = await scanProducts('BASE64');

    expect(invoke).toHaveBeenCalledWith('scan-products', { body: { image: 'BASE64' } });
    expect(result).toEqual({ items: [{ sku: 'FD-SAL', quantity: 2 }], unsure: [] });
  });

  it('returns unsure packs with their box as fractions of the photo', async () => {
    supabaseReturning({
      data: {
        ok: true,
        items: [],
        unsure: [{ candidates: ['A', 'B'], quantity: 1, box: { x0: 100, y0: 200, x1: 400, y1: 600 } }],
      },
      error: null,
    });

    const { unsure } = await scanProducts('BASE64');

    expect(unsure).toEqual([{ candidates: ['A', 'B'], quantity: 1, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }]);
  });

  it.each([
    ['missing', undefined],
    ['inverted', { x0: 500, y0: 200, x1: 100, y1: 600 }],
    ['not numbers', { x0: 'a', y0: 0, x1: 10, y1: 10 }],
  ])('drops a %s box but keeps the pack', async (_label, box) => {
    supabaseReturning({ data: { ok: true, items: [], unsure: [{ candidates: ['A'], quantity: 1, box }] }, error: null });

    const { unsure } = await scanProducts('BASE64');

    expect(unsure).toEqual([{ candidates: ['A'], quantity: 1, box: null }]);
  });

  it('clamps a box that runs past the photo edge', async () => {
    supabaseReturning({
      data: { ok: true, items: [], unsure: [{ candidates: ['A'], quantity: 1, box: { x0: -50, y0: 900, x1: 300, y1: 1200 } }] },
      error: null,
    });

    const { unsure } = await scanProducts('BASE64');

    expect(unsure[0].box).toEqual({ x: 0, y: 0.9, width: 0.3, height: 0.1 });
  });

  it('fails fast when Supabase is not configured', async () => {
    mockGetSupabase.mockReturnValue(null);

    await expect(scanProducts('BASE64')).rejects.toBeInstanceOf(ScanError);
  });

  it('throws a ScanError when the function cannot be reached', async () => {
    supabaseReturning({ data: null, error: new Error('Failed to fetch') });

    await expect(scanProducts('BASE64')).rejects.toBeInstanceOf(ScanError);
  });

  it('throws a ScanError when the function could not read the photo', async () => {
    supabaseReturning({ data: { ok: false, error: 'could not read photo' }, error: null });

    await expect(scanProducts('BASE64')).rejects.toBeInstanceOf(ScanError);
  });

  it('throws a ScanError when the response has no item list', async () => {
    supabaseReturning({ data: { ok: true }, error: null });

    await expect(scanProducts('BASE64')).rejects.toBeInstanceOf(ScanError);
  });
});
