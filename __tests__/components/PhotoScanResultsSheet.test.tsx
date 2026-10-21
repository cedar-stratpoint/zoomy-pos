import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PhotoScanResultsSheet } from '../../components/PhotoScanResultsSheet';
import { pickBundle, product } from '../../__fixtures__/photo-scan';

const salmon = product({ id: 1, name: 'Freeze-Dried Salmon Cubes', price: 200 });
const beef = product({ id: 2, name: 'Meaty Treats Beef', price: 200, category: 'Meaty Treats' });
const buyAny4 = pickBundle({ id: 10, name: 'Buy Any 4', price: 650, pick_count: 4 });

const baseProps = {
  photoUri: 'data:image/jpeg;base64,/9j/',
  initialItems: [{ product: salmon, quantity: 2 }, { product: beef, quantity: 2 }],
  unmatchedCount: 0,
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

  it('applies the cheapest saving bundles by default and confirms them', () => {
    const { getByText, getByTestId } = render(<PhotoScanResultsSheet {...baseProps} />);

    expect(getByTestId('bundle-10-count').props.children).toBe(1);
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

    // Suggested: Buy Any 4 x2 + Buy Any 2. The customer wants Buy Any 4 + Buy Any 2 x3.
    expect(getByTestId('bundle-10-count').props.children).toBe(2);
    fireEvent.press(getByTestId('bundle-10-decrement'));
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

    expect(getByTestId('bundle-10-increment').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('sends everything as singles when every bundle is set to 0', () => {
    const { getByText, getByTestId, queryByTestId } = render(<PhotoScanResultsSheet {...baseProps} />);

    fireEvent.press(getByTestId('bundle-10-decrement'));
    expect(queryByTestId('bundle-savings')).toBeNull();
    fireEvent.press(getByText('Add to sale'));

    expect(baseProps.onConfirm).toHaveBeenCalledWith({
      bundles: [],
      singles: [{ product: salmon, quantity: 2 }, { product: beef, quantity: 2 }],
    });
  });

  it('allows a bundle that costs more than the singles, but does not pick it', () => {
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

    expect(getByTestId('bundle-10-count').props.children).toBe(1);
    expect(getByTestId('bundle-11-increment').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('hides the bundle list when no bundle fits the packs', () => {
    const { queryByText } = render(
      <PhotoScanResultsSheet {...baseProps} initialItems={[{ product: salmon, quantity: 3 }]} />,
    );

    expect(queryByText('Bundles')).toBeNull();
  });

  it('drops back to the suggestion when an edit leaves a chosen bundle unfillable', () => {
    const { getAllByTestId, getByText, queryByTestId } = render(<PhotoScanResultsSheet {...baseProps} />);

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

  it('uses no em or en dashes in its copy', () => {
    const { toJSON } = render(<PhotoScanResultsSheet {...baseProps} unmatchedCount={1} />);

    expect(JSON.stringify(toJSON())).not.toMatch(/[–—]/);
  });
});
