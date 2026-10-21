import type { Product } from '../../db/products';

/** One line the scan-products edge function recognized in the photo. */
export type ScannedItem = { sku: string; quantity: number };

/** Where a pack sits in the photo, as fractions (0 to 1) of its width and height. */
export type PackBox = { x: number; y: number; width: number; height: number };

/** A pack the scanner saw but could not pin down: its guesses, most likely first. */
export type UnsureScan = { candidates: string[]; quantity: number; box: PackBox | null };

/** An unsure pack ready for the cashier to check. */
export type UnsurePack = {
  id: number;
  /** Sellable local products, most likely first. May be empty: the cashier then searches. */
  candidates: Product[];
  quantity: number;
  box: PackBox | null;
  /** The pack cut out of the photo, once cropped; null shows the whole photo. */
  cropUri: string | null;
};

/** How the cashier answered an unsure pack: one of its guesses, another product, or skipped. */
export type UnsureAnswer = {
  packId: number;
  /** Null when skipped. */
  product: Product | null;
  via: 'candidate' | 'other' | 'skipped';
};

/** A scanned line resolved to a sellable local product. */
export type MatchedItem = { product: Product; quantity: number };

export type MatchResult = {
  matched: MatchedItem[];
  /** Units the scan returned that cannot go in the cart: SKU missing locally, or no price. */
  unmatchedCount: number;
};

/**
 * Resolves scanned SKUs against the local catalog (Coop's SKU is `products.sku`).
 * Duplicate SKUs are summed into one line, in first-seen order.
 */
export function matchScanItems(items: ScannedItem[], products: Product[]): MatchResult {
  const bySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku as string, p]));
  const matched: MatchedItem[] = [];
  let unmatchedCount = 0;

  for (const { sku, quantity } of items) {
    if (quantity <= 0) continue;
    const product = bySku.get(sku);
    if (!product || product.price == null) {
      unmatchedCount += quantity;
      continue;
    }
    const existing = matched.find((m) => m.product.id === product.id);
    if (existing) existing.quantity += quantity;
    else matched.push({ product, quantity });
  }

  return { matched, unmatchedCount };
}

/**
 * Resolves unsure packs' guessed SKUs to sellable local products. A pack whose
 * guesses are all unknown or unpriced is kept with no candidates, so it is
 * still flagged to the cashier rather than silently dropped.
 */
export function matchUnsure(unsure: UnsureScan[], products: Product[]): UnsurePack[] {
  const bySku = new Map(products.filter((p) => p.sku && p.price != null).map((p) => [p.sku as string, p]));
  return unsure
    .filter((u) => u.quantity > 0)
    .map((u, id) => ({
      id,
      candidates: u.candidates.map((sku) => bySku.get(sku)).filter((p): p is Product => p != null),
      quantity: u.quantity,
      box: u.box,
      cropUri: null,
    }));
}
