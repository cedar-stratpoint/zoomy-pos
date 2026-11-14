import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import ProductsModal from '../../app/modals/products';
import { updateProduct } from '../../db/products';
import { toggleSavedBundle } from '../../db/saved-bundles';
import { pushProductListing } from '../../utils/products-sync';
import { pushBundle } from '../../utils/bundles-sync';

const mockShowToast = jest.fn();

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useNavigation: () => ({ setOptions: jest.fn() }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});
jest.mock('../../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
jest.mock('../../components/tour/TourTarget', () => ({
  TourTarget: ({ children }: { children: React.ReactNode }) => children,
  MaybeTourTarget: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../db/products', () => ({
  getAllProducts: jest.fn(async () => [{
    id: 1, name: 'Beef Jerky', price: 150, emoji: '🥩', is_active: 1, has_variants: 0,
    category: 'Jerky', subcategory: null, image_uri: null, sku: 'SKU-1', stock: 5, variant_count: 0,
  }]),
  updateProduct: jest.fn(async () => {}),
  deleteProduct: jest.fn(),
}));
jest.mock('../../db/saved-bundles', () => ({
  getAllSavedBundles: jest.fn(async () => [{
    id: 9, name: 'Any 3', price: 300, items: [], is_active: 1, bundle_type: 'pick',
    pick_count: 3, line_categories: ['Jerky'], emoji: null, bundle_uuid: 'b-uuid', created_at: 'x',
  }]),
  getSavedBundleById: jest.fn(async () => ({ id: 9, bundle_uuid: 'b-uuid', is_active: 0, items: [] })),
  toggleSavedBundle: jest.fn(async () => {}),
  updateSavedBundle: jest.fn(),
  deleteSavedBundle: jest.fn(),
}));
jest.mock('../../utils/products-sync', () => ({
  pushProductListing: jest.fn(),
  pushProductRename: jest.fn(),
  pushProductReprice: jest.fn(),
  pushProductEmoji: jest.fn(),
}));
jest.mock('../../utils/bundles-sync', () => ({ pushBundle: jest.fn(), deleteBundleRemote: jest.fn() }));

/** A push that stays pending until the test settles it, to look at the screen mid-flight. */
function deferred() {
  let settle!: (ok: boolean) => void;
  const promise = new Promise<boolean>((r) => { settle = r; });
  return { promise, settle };
}

describe('Products listing toggles', () => {
  beforeEach(() => jest.clearAllMocks());

  it('flips the product switch before Coop answers, and keeps it when Coop accepts', async () => {
    const push = deferred();
    (pushProductListing as jest.Mock).mockReturnValue(push.promise);
    const { findByTestId, getByTestId } = render(<ProductsModal />);

    fireEvent(await findByTestId('product-listing-1'), 'valueChange', false);

    expect(getByTestId('product-listing-1').props.value).toBe(false);
    await act(async () => push.settle(true));
    expect(getByTestId('product-listing-1').props.value).toBe(false);
    expect(pushProductListing).toHaveBeenCalledWith('SKU-1', false);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('puts the product switch and the local row back, and says so, when Coop rejects it', async () => {
    (pushProductListing as jest.Mock).mockResolvedValue(false);
    const { findByTestId, getByTestId } = render(<ProductsModal />);

    fireEvent(await findByTestId('product-listing-1'), 'valueChange', false);

    await waitFor(() => expect(getByTestId('product-listing-1').props.value).toBe(true));
    const writes = (updateProduct as jest.Mock).mock.calls.map(([, fields]) => fields.is_active);
    expect(writes).toEqual([0, 1]);
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'error',
      message: expect.stringContaining('Beef Jerky is listed again'),
    }));
  });

  it('ignores a second tap while the first is still waiting on Coop', async () => {
    const push = deferred();
    (pushProductListing as jest.Mock).mockReturnValue(push.promise);
    const { findByTestId } = render(<ProductsModal />);
    const toggle = await findByTestId('product-listing-1');

    fireEvent(toggle, 'valueChange', false);
    fireEvent(toggle, 'valueChange', true);
    await act(async () => push.settle(true));

    expect(pushProductListing).toHaveBeenCalledTimes(1);
  });

  it('rolls a synced bundle back when Coop rejects it', async () => {
    (pushBundle as jest.Mock).mockResolvedValue(false);
    const { findByTestId, getByTestId } = render(<ProductsModal />);
    fireEvent.press(await findByTestId('category-tab-Bundles'));

    fireEvent(await findByTestId('bundle-listing-9'), 'valueChange', false);

    await waitFor(() => expect(getByTestId('bundle-listing-9').props.value).toBe(true));
    expect((toggleSavedBundle as jest.Mock).mock.calls).toEqual([[9, 0], [9, 1]]);
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
  });
});
