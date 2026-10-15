import { matchScanItems } from '../../../utils/photo-scan/match-scan';
import { product } from '../../../__fixtures__/photo-scan';

const salmon = product({ id: 1, name: 'Freeze-Dried Salmon Cubes', sku: 'FD-SAL' });
const jerky = product({ id: 2, name: 'Tasty Treats Duck Jerky', sku: 'TT-DCK', category: 'Tasty Treats' });
const unpriced = product({ id: 3, name: 'Freeze-Dried Yoghurt Cubes', sku: 'FD-YOG', price: null });

describe('matchScanItems', () => {
  it('maps scanned SKUs to local products with their quantities', () => {
    const result = matchScanItems(
      [{ sku: 'FD-SAL', quantity: 2 }, { sku: 'TT-DCK', quantity: 1 }],
      [salmon, jerky]
    );

    expect(result.matched).toEqual([
      { product: salmon, quantity: 2 },
      { product: jerky, quantity: 1 },
    ]);
    expect(result.unmatchedCount).toBe(0);
  });

  it('sums duplicate SKUs into one line', () => {
    const result = matchScanItems(
      [{ sku: 'FD-SAL', quantity: 1 }, { sku: 'FD-SAL', quantity: 2 }],
      [salmon]
    );

    expect(result.matched).toEqual([{ product: salmon, quantity: 3 }]);
  });

  it('drops SKUs missing from the local catalog and counts their units', () => {
    const result = matchScanItems(
      [{ sku: 'FD-SAL', quantity: 1 }, { sku: 'NOPE', quantity: 2 }],
      [salmon]
    );

    expect(result.matched).toEqual([{ product: salmon, quantity: 1 }]);
    expect(result.unmatchedCount).toBe(2);
  });

  it('treats products without a price as unmatched, since they cannot be sold', () => {
    const result = matchScanItems([{ sku: 'FD-YOG', quantity: 1 }], [unpriced]);

    expect(result.matched).toEqual([]);
    expect(result.unmatchedCount).toBe(1);
  });

  it('ignores non-positive quantities', () => {
    const result = matchScanItems([{ sku: 'FD-SAL', quantity: 0 }], [salmon]);

    expect(result.matched).toEqual([]);
    expect(result.unmatchedCount).toBe(0);
  });

  it('returns nothing for an empty scan', () => {
    expect(matchScanItems([], [salmon])).toEqual({ matched: [], unmatchedCount: 0 });
  });
});
