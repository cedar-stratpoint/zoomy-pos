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

    const items = await scanProducts('BASE64');

    expect(invoke).toHaveBeenCalledWith('scan-products', { body: { image: 'BASE64' } });
    expect(items).toEqual([{ sku: 'FD-SAL', quantity: 2 }]);
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
