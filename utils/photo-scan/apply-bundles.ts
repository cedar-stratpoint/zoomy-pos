import type { Product } from '../../db/products';
import type { BundleItemInput, SavedBundle } from '../../db/saved-bundles';
import { eligibleFlavors } from '../bundles';
import type { MatchedItem } from './match-scan';

export type PlannedBundle = { bundle: SavedBundle; items: BundleItemInput[] };

export type BundlePlan = {
  bundles: PlannedBundle[];
  singles: MatchedItem[];
  total: number;
  /** All-singles total minus `total`. Negative when the bundles cost more. */
  savings: number;
};

type Fill = { bundle: SavedBundle; units: Product[] };
type Candidate = { fills: Fill[]; singles: Product[]; total: number };

/** How many of each bundle (by bundle id) the customer is buying. Missing ids mean 0. */
export type BundleCounts = Record<number, number>;

/**
 * Fills the requested bundle counts from the basket, each bundle taking its most
 * expensive eligible packs; the rest stay singles. Null when the packs cannot
 * fill every requested bundle. Savings are negative when the bundles cost more.
 */
export function planBundles(items: MatchedItem[], bundles: SavedBundle[], counts: BundleCounts): BundlePlan | null {
  const units = expandUnits(items);
  const usable = usableBundles(bundles);
  const candidate = fillBundles(usable, usable.map((b) => counts[b.id] ?? 0), units);
  return candidate ? toPlan(candidate, sumPrices(units)) : null;
}

/** Bundles that can be used at all: a pick count and at least one product line. */
export function usableBundles(bundles: SavedBundle[]): SavedBundle[] {
  return bundles.filter((b) => (b.pick_count ?? 0) > 0 && (b.line_categories?.length ?? 0) > 0);
}

function toPlan(candidate: Candidate, singlesTotal: number): BundlePlan {
  return {
    bundles: candidate.fills.map((f) => ({ bundle: f.bundle, items: groupBundleItems(f.units) })),
    singles: groupSingles(candidate.singles),
    total: candidate.total,
    savings: singlesTotal - candidate.total,
  };
}

/** One entry per pack, most expensive first (stable, so scan order breaks ties). */
function expandUnits(items: MatchedItem[]): Product[] {
  const units = items.flatMap(({ product, quantity }) => Array<Product>(quantity).fill(product));
  return units.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
}

function sumPrices(units: Product[]): number {
  return units.reduce((sum, p) => sum + (p.price ?? 0), 0);
}

/**
 * Fills the requested bundles from the basket, narrowest bundle first so a
 * bundle limited to one line is not starved by a broader one. Returns null when
 * some bundle cannot be filled.
 */
function fillBundles(bundles: SavedBundle[], counts: number[], units: Product[]): Candidate | null {
  const requested = bundles
    .flatMap((bundle, i) => Array<SavedBundle>(counts[i]).fill(bundle))
    .sort((a, b) => eligibleCount(a, units) - eligibleCount(b, units));

  let remaining = units;
  const fills: Fill[] = [];
  for (const bundle of requested) {
    const eligibleIds = new Set(eligibleFlavors(remaining, bundle.line_categories ?? []).map((p) => p.id));
    const taken: Product[] = [];
    const rest: Product[] = [];
    for (const unit of remaining) {
      if (taken.length < (bundle.pick_count as number) && eligibleIds.has(unit.id)) taken.push(unit);
      else rest.push(unit);
    }
    if (taken.length < (bundle.pick_count as number)) return null;
    fills.push({ bundle, units: taken });
    remaining = rest;
  }

  const total = fills.reduce((sum, f) => sum + f.bundle.price, 0) + sumPrices(remaining);
  return { fills, singles: remaining, total };
}

function eligibleCount(bundle: SavedBundle, units: Product[]): number {
  return eligibleFlavors(units, bundle.line_categories ?? []).length;
}

/** Same shape as `selectionToBundleItems`: one entry per product with its count. */
function groupBundleItems(units: Product[]): BundleItemInput[] {
  return groupSingles(units).map(({ product, quantity }) => ({ id: product.id, name: product.name, quantity }));
}

function groupSingles(units: Product[]): MatchedItem[] {
  const lines: MatchedItem[] = [];
  for (const product of units) {
    const line = lines.find((l) => l.product.id === product.id);
    if (line) line.quantity += 1;
    else lines.push({ product, quantity: 1 });
  }
  return lines;
}
