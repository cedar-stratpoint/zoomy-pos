import type { Product } from '../db/products';
import type { SavedBundle } from '../db/saved-bundles';

export function product(over: Partial<Product> & Pick<Product, 'id' | 'name'>): Product {
  return {
    id: over.id,
    name: over.name,
    price: over.price === undefined ? 200 : over.price,
    emoji: over.emoji ?? '🍖',
    image_uri: null,
    has_variants: 0,
    category: over.category ?? 'Freeze Dried',
    subcategory: null,
    is_active: over.is_active ?? 1,
    created_at: '2026-10-14T00:00:00.000Z',
    sku: over.sku ?? `SKU${over.id}`,
    stock: 0,
  };
}

export function pickBundle(
  over: Partial<SavedBundle> & Pick<SavedBundle, 'id' | 'name' | 'price' | 'pick_count'>
): SavedBundle {
  return {
    id: over.id,
    name: over.name,
    items: [],
    price: over.price,
    bundle_type: 'pick',
    pick_count: over.pick_count,
    line_categories: over.line_categories ?? ['Freeze Dried', 'Meaty Treats', 'Tasty Treats'],
    is_active: 1,
    bundle_uuid: null,
    emoji: null,
    created_at: '2026-10-14T00:00:00.000Z',
  };
}
