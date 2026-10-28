import { fetchRemoteOrders } from '../../utils/orders-remote';
import * as supa from '../../lib/supabase';

// Only the Coop client matters here; the DB reads orders-remote imports are never
// touched on the fetch path. getSupabase is the one seam we stub.
jest.mock('../../lib/supabase', () => ({ getSupabase: jest.fn() }));

const mockedGetSupabase = supa.getSupabase as jest.Mock;

type OrderRow = {
  client_uuid: string;
  total: number;
  payment_method: string;
  status: string;
  remarks: string | null;
  event_id: string | null;
  pet_type: string | null;
  created_at: string;
  pos_order_items: unknown[];
  pos_order_prizes: { order_id: string }[];
};

function rows(n: number, startIdx: number): OrderRow[] {
  return Array.from({ length: n }, (_, i) => ({
    client_uuid: `u${startIdx + i}`,
    total: 100,
    payment_method: 'cash',
    status: 'completed',
    remarks: null,
    event_id: null,
    pet_type: null,
    created_at: '2026-09-15T03:00:00.000000+00:00',
    pos_order_items: [],
    pos_order_prizes: [],
  }));
}

// A chainable, awaitable PostgREST-ish builder. Each awaited read resolves to the
// page keyed by the latest `.range(from, …)` offset, so a test drives pagination
// by offset; the capped pull (no .range) reads offset 0.
function sbPaged(pages: Record<number, OrderRow[] | undefined>, error: unknown = null) {
  const calls = {
    gte: undefined as string | undefined,
    lte: undefined as string | undefined,
    limit: undefined as number | undefined,
    ranges: [] as [number, number][],
  };
  let currentFrom = 0;
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = self;
  builder.is = self;
  builder.order = self;
  builder.abortSignal = self;
  builder.gte = (_c: string, v: string) => { calls.gte = v; return builder; };
  builder.lte = (_c: string, v: string) => { calls.lte = v; return builder; };
  builder.limit = (n: number) => { calls.limit = n; return builder; };
  builder.range = (from: number, to: number) => { currentFrom = from; calls.ranges.push([from, to]); return builder; };
  builder.then = (resolve: (v: { data: OrderRow[] | null; error: unknown }) => unknown) =>
    resolve({ data: error ? null : (pages[currentFrom] ?? []), error });
  const from = jest.fn().mockReturnValue(builder);
  mockedGetSupabase.mockReturnValue({ from });
  return { from, calls };
}

describe('fetchRemoteOrders', () => {
  beforeEach(() => jest.clearAllMocks());

  const range = {
    start: new Date('2026-09-01T00:00:00.000Z'),
    end: new Date('2026-09-30T23:59:59.999Z'),
  };

  describe('date-scoped pull', () => {
    it('pages a bounded range past the 1000-row cap and loads every order', async () => {
      const { calls } = sbPaged({ 0: rows(1000, 0), 1000: rows(3, 1000) });
      const res = await fetchRemoteOrders(range);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.orders).toHaveLength(1003); // not capped at 500 or 1000
      expect(calls.ranges).toEqual([[0, 999], [1000, 1999]]); // a second page was read
      expect(calls.gte).toBe(range.start.toISOString());
      expect(calls.lte).toBe(range.end.toISOString());
      expect(calls.limit).toBeUndefined(); // scoped pull doesn't use .limit
    });

    it('reports the coverage window as the requested bounds', async () => {
      sbPaged({ 0: rows(5, 0) });
      const res = await fetchRemoteOrders(range);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.windowStart).toBe('2026-09-01T00:00:00.000Z');
      expect(res.windowEnd).toBe('2026-09-30T23:59:59.999Z');
    });

    it('omits the upper bound when the range has no end', async () => {
      const { calls } = sbPaged({ 0: rows(2, 0) });
      const res = await fetchRemoteOrders({ start: range.start, end: null });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(calls.gte).toBe(range.start.toISOString());
      expect(calls.lte).toBeUndefined();
      expect(res.windowEnd).toBeNull();
    });

    it('returns ok:false when a page errors (no silent truncation)', async () => {
      sbPaged({ 0: rows(1000, 0) }, { message: 'boom' });
      const res = await fetchRemoteOrders(range);
      expect(res.ok).toBe(false);
    });
  });

  describe('capped live pull (no range)', () => {
    it('uses the capped newest-N pull with an open-ended window', async () => {
      const { calls } = sbPaged({ 0: rows(2, 0) });
      const res = await fetchRemoteOrders();
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(calls.limit).toBe(500); // capped pull
      expect(calls.ranges).toEqual([]); // not paginated
      expect(res.windowStart).toBeNull(); // under the cap, so complete
      expect(res.windowEnd).toBeNull(); // live view covers up to now
    });
  });

  it('returns ok:false when Supabase is unconfigured (offline)', async () => {
    mockedGetSupabase.mockReturnValue(null);
    const res = await fetchRemoteOrders(range);
    expect(res.ok).toBe(false);
  });
});
