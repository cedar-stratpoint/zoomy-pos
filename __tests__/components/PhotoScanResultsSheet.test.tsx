import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PhotoScanResultsSheet } from '../../components/PhotoScanResultsSheet';
import { pickBundle, product } from '../../__fixtures__/photo-scan';
import type { UnsurePack } from '../../utils/photo-scan/match-scan';

const salmon = product({ id: 1, name: 'Freeze-Dried Salmon Cubes', price: 200 });
const beef = product({ id: 2, name: 'Meaty Treats Beef', price: 200, category: 'Meaty Treats' });
const buyAny4 = pickBundle({ id: 10, name: 'Buy Any 4', price: 650, pick_count: 4 });

const baseProps = {
  photoUri: 'data:image/jpeg;base64,/9j/',
  initialItems: [{ product: salmon, quantity: 2 }, { product: beef, quantity: 2 }],
  unmatchedCount: 0,
  unsurePacks: [] as UnsurePack[],
  catalog: [salmon, beef],
  pickBundles: [buyAny4],
  onConfirm: jest.fn(),
  onScanAgain: jest.fn(),
  onClose: jest.fn(),
};

describe('PhotoScanResultsSheet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows each scanned product with its scanned quantity', () => {
    const { getByText, getAllByTestId } = render(<PhotoScanResultsSheet {...baseProps} />);

    expect(getByText('Freeze-Dried Salmon Cubes')).toBeTruthy();
    expect(getByText('Meaty Treats Beef')).toBeTruthy();
    expect(getAllByTestId('qty-value').map((n) => n.props.children)).toEqual([2, 2]);
  });

  it('lists the bundles the packs can fill without preselecting any', () => {
    const { getByText, getByTestId, queryByTestId } = render(<PhotoScanResultsSheet {...baseProps} />);

    expect(getByText('Buy Any 4')).toBeTruthy();
    expect(getByTestId('bundle-10-count').props.children).toBe(0);
    expect(queryByTestId('bundle-savings')).toBeNull();
  });

  it('applies a bundle the cashier picks and confirms it', () => {
    const { getByText, getByTestId } = render(<PhotoScanResultsSheet {...baseProps} />);

    fireEvent.press(getByTestId('bundle-10-increment'));
    expect(getByText('Bundles save ₱150.00')).toBeTruthy();
    fireEvent.press(getByText('Add to sale'));

    const { bundles, singles } = baseProps.onConfirm.mock.calls[0][0];
    expect(bundles.map((b: { bundle: { id: number } }) => b.bundle.id)).toEqual([10]);
    expect(singles).toEqual([]);
  });

  it('lets the cashier add several bundles, including the same one twice', () => {
    const buyAny2 = pickBundle({ id: 11, name: 'Buy Any 2', price: 350, pick_count: 2 });
    const props = {
      ...baseProps,
      initialItems: [{ product: salmon, quantity: 6 }, { product: beef, quantity: 4 }],
      pickBundles: [buyAny4, buyAny2],
    };
    const { getByTestId, getByText } = render(<PhotoScanResultsSheet {...props} />);

    // The customer wants Buy Any 4 + Buy Any 2 x3.
    fireEvent.press(getByTestId('bundle-10-increment'));
    fireEvent.press(getByTestId('bundle-11-increment'));
    fireEvent.press(getByTestId('bundle-11-increment'));
    fireEvent.press(getByTestId('bundle-11-increment'));
    expect(getByTestId('bundle-10-count').props.children).toBe(1);
    expect(getByTestId('bundle-11-count').props.children).toBe(3);
    fireEvent.press(getByText('Add to sale'));

    const { bundles, singles } = props.onConfirm.mock.calls[0][0];
    expect(bundles.map((b: { bundle: { id: number } }) => b.bundle.id).sort()).toEqual([10, 11, 11, 11]);
    expect(singles).toEqual([]);
  });

  it('stops adding a bundle once the packs run out', () => {
    const { getByTestId } = render(<PhotoScanResultsSheet {...baseProps} />);

    fireEvent.press(getByTestId('bundle-10-increment'));
    expect(getByTestId('bundle-10-increment').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('sends everything as singles when no bundle is picked', () => {
    const { getByText } = render(<PhotoScanResultsSheet {...baseProps} />);

    fireEvent.press(getByText('Add to sale'));

    expect(baseProps.onConfirm).toHaveBeenCalledWith({
      bundles: [],
      singles: [{ product: salmon, quantity: 2 }, { product: beef, quantity: 2 }],
    });
  });

  it('allows a bundle that costs more than the singles', () => {
    const pricey = pickBundle({ id: 12, name: 'Pricey 4', price: 900, pick_count: 4 });
    const { getByText, getByTestId } = render(<PhotoScanResultsSheet {...baseProps} pickBundles={[pricey]} />);

    expect(getByTestId('bundle-12-count').props.children).toBe(0);
    fireEvent.press(getByTestId('bundle-12-increment'));
    expect(getByText('Bundles cost ₱100.00 more')).toBeTruthy();
  });

  it('only lists bundles the packs can fill', () => {
    const buyAny2 = pickBundle({ id: 11, name: 'Buy Any 2', price: 350, pick_count: 2 });
    const { getByText, queryByText } = render(
      <PhotoScanResultsSheet
        {...baseProps}
        initialItems={[{ product: salmon, quantity: 3 }]}
        pickBundles={[buyAny4, buyAny2]}
      />,
    );

    expect(getByText('Buy Any 2')).toBeTruthy();
    expect(queryByText('Buy Any 4')).toBeNull();
  });

  it('keeps a bundle listed after its packs are used by another bundle', () => {
    const buyAny2 = pickBundle({ id: 11, name: 'Buy Any 2', price: 350, pick_count: 2 });
    const { getByTestId } = render(<PhotoScanResultsSheet {...baseProps} pickBundles={[buyAny4, buyAny2]} />);

    fireEvent.press(getByTestId('bundle-10-increment'));
    expect(getByTestId('bundle-11-increment').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('hides the bundle list when no bundle fits the packs', () => {
    const { queryByText } = render(
      <PhotoScanResultsSheet {...baseProps} initialItems={[{ product: salmon, quantity: 3 }]} />,
    );

    expect(queryByText('Bundles')).toBeNull();
  });

  it('drops back to singles when an edit leaves a chosen bundle unfillable', () => {
    const { getAllByTestId, getByTestId, getByText, queryByTestId } = render(<PhotoScanResultsSheet {...baseProps} />);

    fireEvent.press(getByTestId('bundle-10-increment'));
    fireEvent.press(getAllByTestId('qty-decrement')[0]);
    expect(queryByTestId('bundle-10')).toBeNull();

    fireEvent.press(getByText('Add to sale'));
    expect(baseProps.onConfirm).toHaveBeenCalledWith({
      bundles: [],
      singles: [{ product: salmon, quantity: 1 }, { product: beef, quantity: 2 }],
    });
  });

  it('lets a removed product be restored with Undo', () => {
    const props = { ...baseProps, initialItems: [{ product: salmon, quantity: 1 }] };
    const { getByTestId, getByText, queryByTestId } = render(<PhotoScanResultsSheet {...props} />);

    fireEvent.press(getByTestId('qty-decrement'));
    expect(queryByTestId('qty-value')).toBeNull();

    fireEvent.press(getByText('Undo'));
    expect(getByTestId('qty-value').props.children).toBe(1);
  });

  it('does not confirm when every product was removed', () => {
    const props = { ...baseProps, initialItems: [{ product: salmon, quantity: 1 }] };
    const { getByTestId, getByText } = render(<PhotoScanResultsSheet {...props} />);

    fireEvent.press(getByTestId('qty-decrement'));
    fireEvent.press(getByText('Add to sale'));

    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('tells the cashier how many items could not be matched', () => {
    const { getByText } = render(<PhotoScanResultsSheet {...baseProps} unmatchedCount={2} />);

    expect(getByText('2 items could not be matched. Add them manually.')).toBeTruthy();
  });

  it('shows an empty state when nothing was found', () => {
    const { getByText } = render(<PhotoScanResultsSheet {...baseProps} initialItems={[]} />);

    expect(getByText('No products found')).toBeTruthy();
  });

  it('opens the whole photo and closes it again', () => {
    const { getByTestId, queryByTestId } = render(<PhotoScanResultsSheet {...baseProps} />);

    expect(queryByTestId('photo-viewer-image')).toBeNull();
    fireEvent.press(getByTestId('photo-preview'));
    expect(getByTestId('photo-viewer-image').props.resizeMode).toBe('contain');

    fireEvent.press(getByTestId('photo-viewer-close'));
    expect(queryByTestId('photo-viewer-image')).toBeNull();
  });

  describe('unsure packs', () => {
    const duckPear = product({ id: 20, name: 'Super Duo Bites Duck Pear', price: 300, category: 'Super Duo Bites' });
    const duckCarrot = product({ id: 21, name: 'Super Duo Bites Duck Carrot', price: 300, category: 'Super Duo Bites' });
    const unsure: UnsurePack = { id: 0, candidates: [duckPear, duckCarrot], quantity: 1, box: null, cropUri: null };
    const props = { ...baseProps, unsurePacks: [unsure], catalog: [salmon, beef, duckPear, duckCarrot] };

    it('asks about the pack and blocks adding until it is answered', () => {
      const { getByText, getByTestId } = render(<PhotoScanResultsSheet {...props} />);

      expect(getByText('1 pack needs a check')).toBeTruthy();
      expect(getByTestId('footer-count').props.children.join('')).toBe('4 packs, 1 to check');
      expect(getByTestId('add-to-sale').props.accessibilityState).toMatchObject({ disabled: true });
    });

    it('adds the picked guess as a line and allows adding to the sale', () => {
      const { getByTestId, getByText, queryByTestId } = render(<PhotoScanResultsSheet {...props} />);

      fireEvent.press(getByTestId('unsure-option-21'));
      expect(queryByTestId('unsure-card')).toBeNull();
      expect(getByText('Super Duo Bites Duck Carrot')).toBeTruthy();
      fireEvent.press(getByText('Add to sale'));

      const { bundles, singles } = props.onConfirm.mock.calls[0][0];
      const all = [...singles, ...bundles.flatMap((b: { items: { id: number; quantity: number }[] }) =>
        b.items.map((i) => ({ product: { id: i.id }, quantity: i.quantity })))];
      expect(all.filter((l: { product: { id: number } }) => l.product.id === 21)).toHaveLength(1);
    });

    it('adds to an existing line when the answer was already scanned', () => {
      const pack = { ...unsure, candidates: [salmon] };
      const { getByTestId, getAllByTestId } = render(<PhotoScanResultsSheet {...props} unsurePacks={[pack]} />);

      fireEvent.press(getByTestId('unsure-option-1'));

      expect(getAllByTestId('qty-value').map((n) => n.props.children)).toEqual([3, 2]);
    });

    it('drops the pack when it is not a pack', () => {
      const { getByTestId, queryByTestId } = render(<PhotoScanResultsSheet {...props} />);

      fireEvent.press(getByTestId('unsure-skip'));

      expect(queryByTestId('unsure-card')).toBeNull();
      expect(getByTestId('footer-count').props.children.join('')).toBe('4 packs');
      expect(getByTestId('add-to-sale').props.accessibilityState).toMatchObject({ disabled: false });
    });

    it('lets the cashier search every product when no guess fits', () => {
      const { getByTestId, getAllByTestId } = render(<PhotoScanResultsSheet {...props} />);

      fireEvent.press(getByTestId('unsure-something-else'));
      fireEvent.changeText(getByTestId('product-picker-search'), 'duck pear');
      fireEvent.press(getByTestId('product-picker-20'));

      // The picker keeps its last rows on screen while it slides away, so count lines instead.
      expect(getAllByTestId('qty-value').map((n) => n.props.children)).toEqual([2, 2, 1]);
      expect(getByTestId('add-to-sale').props.accessibilityState).toMatchObject({ disabled: false });
    });

    it('asks about several unsure packs one at a time', () => {
      const second = { ...unsure, id: 1 };
      const { getByText, getByTestId } = render(<PhotoScanResultsSheet {...props} unsurePacks={[unsure, second]} />);

      expect(getByText('2 packs need a check')).toBeTruthy();
      fireEvent.press(getByTestId('unsure-option-20'));
      expect(getByText('1 pack needs a check')).toBeTruthy();
    });

    it('offers only the product list when the scanner had no guess', () => {
      const { getByText, queryByTestId } = render(
        <PhotoScanResultsSheet {...props} unsurePacks={[{ ...unsure, candidates: [] }]} />,
      );

      expect(getByText('Pick the product')).toBeTruthy();
      expect(queryByTestId('unsure-option-20')).toBeNull();
    });
  });

  it('uses no em or en dashes in its copy', () => {
    const { toJSON } = render(<PhotoScanResultsSheet {...baseProps} unmatchedCount={1} />);

    expect(JSON.stringify(toJSON())).not.toMatch(/[–—]/);
  });
});
