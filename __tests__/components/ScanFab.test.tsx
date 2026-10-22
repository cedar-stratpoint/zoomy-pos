import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ScanFab } from '../../components/ScanFab';

describe('ScanFab', () => {
  // The visible label is hidden from screen readers (the button carries the name),
  // so these queries opt in to hidden elements.
  it('shows its label at rest', () => {
    const { getByTestId } = render(<ScanFab collapsed={false} onPress={jest.fn()} />);

    expect(getByTestId('scan-fab-label', { includeHiddenElements: true })).toHaveStyle({ opacity: 1 });
  });

  it('tucks its label away when collapsed', () => {
    const { getByTestId } = render(<ScanFab collapsed onPress={jest.fn()} />);

    expect(getByTestId('scan-fab-label', { includeHiddenElements: true })).toHaveStyle({ opacity: 0, width: 0 });
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<ScanFab collapsed={false} onPress={onPress} />);

    fireEvent.press(getByTestId('scan-fab'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps its name for screen readers when shrunk to an icon', () => {
    const { getByTestId } = render(<ScanFab collapsed onPress={jest.fn()} />);

    expect(getByTestId('scan-fab').props.accessibilityLabel).toBe('Scan products');
    expect(getByTestId('scan-fab').props.accessibilityRole).toBe('button');
  });
});
