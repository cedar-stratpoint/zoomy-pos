import { eligibleLeft, planBundles, suggestBundleCounts } from '../../../utils/photo-scan/apply-bundles';
import { pickBundle, product } from '../../../__fixtures__/photo-scan';

const buyAny4 = pickBundle({ id: 10, name: 'Buy Any 4', price: 650, pick_count: 4 });
const buyAny2 = pickBundle({ id: 11, name: 'Buy Any 2', price: 350, pick_count: 2 });

const salmon = product({ id: 1, name: 'Salmon', price: 200 });
const beef = product({ id: 2, name: 'Beef', price: 200, category: 'Meaty Treats' });
const jerky = product({ id: 3, name: 'Duck Jerky', price: 200, category: 'Tasty Treats' });
const duo = product({ id: 4, name: 'Duo Duck Pear', price: 200, category: 'Super Duo Bites' });

describe('suggestBundleCounts', () => {
  it('suggests one Buy Any 4 for 4 eligible packs', () => {
    expect(suggestBundleCounts([{ product: salmon, quantity: 4 }], [buyAny4, buyAny2])).toEqual({ 10: 1 });
  });

  it('suggests the cheapest mix of different bundles', () => {
    const items = [{ product: salmon, quantity: 3 }, { product: beef, quantity: 2 }, { product: jerky, quantity: 1 }];
    expect(suggestBundleCounts(items, [buyAny4, buyAny2])).toEqual({ 10: 1, 11: 1 });
  });

  it('suggests the same bundle twice when that is cheapest', () => {
    expect(suggestBundleCounts([{ product: salmon, quantity: 8 }], [buyAny4])).toEqual({ 10: 2 });
  });

  it('suggests no bundles when none beats the singles', () => {
    const cheap = product({ id: 5, name: 'Cheap', price: 100 });
    expect(suggestBundleCounts([{ product: cheap, quantity: 4 }], [buyAny4])).toEqual({});
  });

  it('prefers fewer bundles when totals tie', () => {
    const buyAny4At700 = pickBundle({ id: 13, name: 'Buy Any 4', price: 700, pick_count: 4 });
    expect(suggestBundleCounts([{ product: salmon, quantity: 4 }], [buyAny4At700, buyAny2])).toEqual({ 13: 1 });
  });

  it('ignores bundles with no pick count or no lines', () => {
    const broken = pickBundle({ id: 14, name: 'Broken', price: 1, pick_count: null as unknown as number });
    const noLines = pickBundle({ id: 15, name: 'No lines', price: 1, pick_count: 1, line_categories: [] });
    expect(suggestBundleCounts([{ product: salmon, quantity: 2 }], [broken, noLines])).toEqual({});
  });
});

describe('planBundles', () => {
  it('fills the requested bundles and leaves the rest as singles', () => {
    const plan = planBundles([{ product: salmon, quantity: 5 }], [buyAny4], { 10: 1 });

    expect(plan?.bundles.map((b) => b.bundle.id)).toEqual([10]);
    expect(plan?.singles).toEqual([{ product: salmon, quantity: 1 }]);
    expect(plan?.total).toBe(850);
    expect(plan?.savings).toBe(150);
  });

  it('fills several bundles at once, including repeats', () => {
    const plan = planBundles([{ product: salmon, quantity: 10 }], [buyAny4, buyAny2], { 10: 2, 11: 1 });

    expect(plan?.bundles.map((b) => b.bundle.id).sort()).toEqual([10, 10, 11]);
    expect(plan?.singles).toEqual([]);
    expect(plan?.total).toBe(1650);
  });

  it('returns null when the packs cannot fill every requested bundle', () => {
    expect(planBundles([{ product: salmon, quantity: 5 }], [buyAny4], { 10: 2 })).toBeNull();
  });

  it('sends everything as singles when no bundles are requested', () => {
    const plan = planBundles([{ product: salmon, quantity: 2 }], [buyAny4], {});

    expect(plan).toEqual({ bundles: [], singles: [{ product: salmon, quantity: 2 }], total: 400, savings: 0 });
  });

  it('reports negative savings when the bundle costs more', () => {
    const cheap = product({ id: 5, name: 'Cheap', price: 100 });
    expect(planBundles([{ product: cheap, quantity: 4 }], [buyAny4], { 10: 1 })?.savings).toBe(-250);
  });

  it('only fills a bundle with products from its lines', () => {
    const freezeDriedOnly = pickBundle({
      id: 12, name: 'FD Any 4', price: 650, pick_count: 4, line_categories: ['Freeze Dried'],
    });
    const plan = planBundles(
      [{ product: salmon, quantity: 4 }, { product: duo, quantity: 1 }],
      [freezeDriedOnly],
      { 12: 1 },
    );

    expect(plan?.bundles[0].items).toEqual([{ id: 1, name: 'Salmon', quantity: 4 }]);
    expect(plan?.singles).toEqual([{ product: duo, quantity: 1 }]);
  });

  it('puts the most expensive packs into the bundle', () => {
    const premium = product({ id: 6, name: 'Premium', price: 300 });
    const budget = product({ id: 7, name: 'Budget', price: 100 });
    const plan = planBundles(
      [{ product: budget, quantity: 1 }, { product: premium, quantity: 1 }, { product: salmon, quantity: 3 }],
      [buyAny4],
      { 10: 1 },
    );

    expect(plan?.bundles[0].items).toEqual([
      { id: 6, name: 'Premium', quantity: 1 },
      { id: 1, name: 'Salmon', quantity: 3 },
    ]);
    expect(plan?.singles).toEqual([{ product: budget, quantity: 1 }]);
    expect(plan?.total).toBe(750);
  });

  it('groups a bundle\'s packs by product', () => {
    const plan = planBundles([{ product: salmon, quantity: 2 }, { product: beef, quantity: 2 }], [buyAny4], { 10: 1 });

    expect(plan?.bundles[0].items).toEqual([
      { id: 1, name: 'Salmon', quantity: 2 },
      { id: 2, name: 'Beef', quantity: 2 },
    ]);
  });
});

describe('eligibleLeft', () => {
  it('counts the singles that could go into one more of the bundle', () => {
    const plan = planBundles(
      [{ product: salmon, quantity: 6 }, { product: duo, quantity: 2 }],
      [buyAny4],
      { 10: 1 },
    )!;

    expect(eligibleLeft(plan, buyAny4)).toBe(2);
  });
});
