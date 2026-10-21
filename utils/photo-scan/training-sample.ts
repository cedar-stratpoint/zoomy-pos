import type { Product } from '../../db/products';
import type { PlannedBundle } from './apply-bundles';
import type { MatchedItem, PackBox, UnsureAnswer, UnsurePack } from './match-scan';

/** Bump when the label's shape changes, so old and new samples can be told apart. */
export const TRAINING_LABEL_VERSION = 1;

/** Packs per product, keyed by SKU (`local:<id>` for a product with no Coop SKU yet). */
export type SkuCounts = Record<string, number>;

/**
 * What the photo really held, as confirmed by the cashier on "Add to sale".
 * Counts cover the whole photo; boxes exist only for the packs the scanner was unsure of.
 */
export type TrainingLabel = {
  counts: SkuCounts;
  bundles: { preset_id: number; name: string; picks: SkuCounts }[];
  unsure: {
    box: PackBox | null;
    candidates: string[];
    quantity: number;
    /** The SKU the cashier said it was; null when skipped. */
    answer: string | null;
    via: UnsureAnswer['via'];
  }[];
  /** True when the sale differs from what the scanner said (its top guess for unsure packs). */
  edited: boolean;
};

export type LabelInput = {
  /** What the scan matched, before the cashier touched it. */
  matched: MatchedItem[];
  unsurePacks: UnsurePack[];
  /** What the cashier added to the sale. */
  bundles: PlannedBundle[];
  singles: MatchedItem[];
  unsureAnswers: UnsureAnswer[];
  /** For the SKUs of bundle picks, which only carry a product id. */
  catalog: Product[];
};

export function skuKey(product: Pick<Product, 'id' | 'sku'>): string {
  return product.sku ?? `local:${product.id}`;
}

export function buildTrainingLabel(input: LabelInput): TrainingLabel {
  const { matched, unsurePacks, bundles, singles, unsureAnswers, catalog } = input;
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const keyOf = (id: number) => {
    const product = byId.get(id);
    return product ? skuKey(product) : `local:${id}`;
  };

  const bundleLabels = bundles.map(({ bundle, items }) => ({
    preset_id: bundle.id,
    name: bundle.name,
    picks: tally(items.map((i) => [keyOf(i.id), i.quantity])),
  }));
  const counts = tally([
    ...singles.map(({ product, quantity }): [string, number] => [skuKey(product), quantity]),
    ...bundleLabels.flatMap((b) => Object.entries(b.picks)),
  ]);

  const answerFor = new Map(unsureAnswers.map((a) => [a.packId, a]));
  const unsure = unsurePacks.map((pack) => {
    const answer = answerFor.get(pack.id);
    return {
      box: pack.box,
      candidates: pack.candidates.map(skuKey),
      quantity: pack.quantity,
      answer: answer?.product ? skuKey(answer.product) : null,
      via: answer?.via ?? 'skipped',
    };
  });

  return { counts, bundles: bundleLabels, unsure, edited: !sameCounts(counts, untouchedCounts(matched, unsurePacks)) };
}

/** The sale had the cashier accepted everything, taking each unsure pack's top guess. */
function untouchedCounts(matched: MatchedItem[], unsurePacks: UnsurePack[]): SkuCounts {
  return tally([
    ...matched.map(({ product, quantity }): [string, number] => [skuKey(product), quantity]),
    ...unsurePacks
      .filter((pack) => pack.candidates.length > 0)
      .map((pack): [string, number] => [skuKey(pack.candidates[0]), pack.quantity]),
  ]);
}

function tally(entries: [string, number][]): SkuCounts {
  const counts: SkuCounts = {};
  for (const [key, quantity] of entries) {
    if (quantity > 0) counts[key] = (counts[key] ?? 0) + quantity;
  }
  return counts;
}

function sameCounts(a: SkuCounts, b: SkuCounts): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => (a[k] ?? 0) === (b[k] ?? 0));
}
