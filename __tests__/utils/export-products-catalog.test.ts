import { gatherExportCatalog } from '../../utils/export-products-catalog';
import * as products from '../../db/products';
import * as bundles from '../../db/saved-bundles';

describe('gatherExportCatalog', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads variants once for the whole catalog and keeps only products that have variants', async () => {
    jest.spyOn(products, 'getActiveProducts').mockResolvedValue([
      { id: 1, name: 'Jerky', has_variants: 1 },
      { id: 2, name: 'Biscuit', has_variants: 0 },
      { id: 3, name: 'Chews', has_variants: 1 },
    ] as unknown as products.Product[]);
    const grouped = jest.spyOn(products, 'getActiveVariantsGroupedByProduct').mockResolvedValue(
      new Map([[1, [{ id: 10, product_id: 1, name: 'Beef' } as products.ProductVariant]]]),
    );
    const perProduct = jest.spyOn(products, 'getVariantsByProductId');
    jest.spyOn(bundles, 'getSavedBundles').mockResolvedValue([]);

    const catalog = await gatherExportCatalog();

    expect(grouped).toHaveBeenCalledTimes(1);
    expect(perProduct).not.toHaveBeenCalled();
    expect([...catalog.variantsByProductId.keys()]).toEqual([1, 3]);
    expect(catalog.variantsByProductId.get(3)).toEqual([]);
  });
});
