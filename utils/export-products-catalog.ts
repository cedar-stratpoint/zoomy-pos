import {
  getActiveProducts,
  getActiveVariantsGroupedByProduct,
  type Product,
  type ProductVariant,
} from '../db/products';
import { getSavedBundles } from '../db/saved-bundles';

export type ExportCatalog = {
  products: Product[];
  variantsByProductId: Map<number, ProductVariant[]>;
  bundles: Awaited<ReturnType<typeof getSavedBundles>>;
};

/**
 * Everything the product export writes: active products, the variants of the
 * ones that have variants, and saved bundles. Variants come from one grouped
 * query rather than one query per product. Shared by the native and web export.
 */
export async function gatherExportCatalog(): Promise<ExportCatalog> {
  const [products, allVariants, bundles] = await Promise.all([
    getActiveProducts(),
    getActiveVariantsGroupedByProduct(),
    getSavedBundles(),
  ]);
  const variantsByProductId = new Map<number, ProductVariant[]>();
  for (const p of products) {
    if (p.has_variants) variantsByProductId.set(p.id, allVariants.get(p.id) ?? []);
  }
  return { products, variantsByProductId, bundles };
}
