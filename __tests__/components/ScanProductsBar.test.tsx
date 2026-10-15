import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ScanProductsBar } from '../../components/ScanProductsBar';

describe('ScanProductsBar', () => {
  it('shows the title and what scanning does', () => {
    const { getByText } = render(<ScanProductsBar onPress={jest.fn()} />);
    expect(getByText('Scan products')).toBeTruthy();
    expect(getByText('Snap the packs and they go straight into the sale')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<ScanProductsBar onPress={onPress} />);
    fireEvent.press(getByTestId('scan-products-bar'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is announced as a button', () => {
    const { getByTestId } = render(<ScanProductsBar onPress={jest.fn()} />);
    expect(getByTestId('scan-products-bar').props.accessibilityRole).toBe('button');
  });
});
