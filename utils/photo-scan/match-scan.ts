import type { Product } from '../../db/products';

/** One line the scan-products edge function recognized in the photo. */
export type ScannedItem = { sku: string; quantity: number };

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
