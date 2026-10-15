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
 * The cheapest mix of active "pick any N" bundles for the basket, as counts, or
 * no bundles when none beats paying for every pack as a single. Every count
 * combination is tried (baskets and bundle lists are tiny); ties prefer fewer bundles.
 */
export function suggestBundleCounts(items: MatchedItem[], bundles: SavedBundle[]): BundleCounts {
  const units = expandUnits(items);
  const best = bestCandidate(usableBundles(bundles), units, sumPrices(units));
  const counts: BundleCounts = {};
  for (const { bundle } of best.fills) counts[bundle.id] = (counts[bundle.id] ?? 0) + 1;
  return counts;
}

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

/** Packs still left as singles that could go into one more of this bundle. */
export function eligibleLeft(plan: BundlePlan, bundle: SavedBundle): number {
  const eligibleIds = new Set(
    eligibleFlavors(plan.singles.map((s) => s.product), bundle.line_categories ?? []).map((p) => p.id),
  );
  return plan.singles.reduce((sum, s) => sum + (eligibleIds.has(s.product.id) ? s.quantity : 0), 0);
}

/** Bundles that can be used at all: a pick count and at least one product line. */
export function usableBundles(bundles: SavedBundle[]): SavedBundle[] {
  return bundles.filter((b) => (b.pick_count ?? 0) > 0 && (b.line_categories?.length ?? 0) > 0);
}

/** The cheapest count combination, or all singles when no bundle beats them. */
function bestCandidate(usable: SavedBundle[], units: Product[], singlesTotal: number): Candidate {
  let best: Candidate = { fills: [], singles: units, total: singlesTotal };
  for (const counts of countCombinations(usable, units.length)) {
    const candidate = fillBundles(usable, counts, units);
    if (candidate && isBetter(candidate, best)) best = candidate;
  }
  return best;
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

/** Every vector of per-bundle counts whose total pack demand fits the basket. */
function countCombinations(bundles: SavedBundle[], unitCount: number): number[][] {
  const combos: number[][] = [];
  const walk = (index: number, remaining: number, counts: number[]) => {
    if (index === bundles.length) {
      if (counts.some((c) => c > 0)) combos.push(counts);
      return;
    }
    const pick = bundles[index].pick_count as number;
    for (let n = 0; n * pick <= remaining; n++) {
      walk(index + 1, remaining - n * pick, [...counts, n]);
    }
  };
  walk(0, unitCount, []);
  return combos;
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

function isBetter(candidate: Candidate, best: Candidate): boolean {
  if (candidate.total !== best.total) return candidate.total < best.total;
  return candidate.fills.length < best.fills.length;
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
