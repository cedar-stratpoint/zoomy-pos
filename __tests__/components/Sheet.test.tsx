import React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { Sheet } from '../../components/Sheet';

describe('Sheet', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders its content while visible', () => {
    render(
      <Sheet visible onRequestClose={jest.fn()}>
        <Text>Pick a size</Text>
      </Sheet>
    );
    expect(screen.getByText('Pick a size')).toBeTruthy();
  });

  it('keeps showing the last content through the exit, then unmounts', () => {
    // Callers clear their data as they close (`{selected && …}`), so the sheet
    // must hold the last open content while it animates away.
    const { rerender } = render(
      <Sheet visible onRequestClose={jest.fn()}>
        <Text>Transaction #12</Text>
      </Sheet>
    );

    rerender(
      <Sheet visible={false} onRequestClose={jest.fn()}>
        {null}
      </Sheet>
    );
    expect(screen.getByText('Transaction #12')).toBeTruthy();

    act(() => {
      jest.runAllTimers();
    });
    expect(screen.queryByText('Transaction #12')).toBeNull();
  });

  it('renders nothing when never opened', () => {
    render(
      <Sheet visible={false} onRequestClose={jest.fn()}>
        <Text>Hidden</Text>
      </Sheet>
    );
    expect(screen.queryByText('Hidden')).toBeNull();
  });
});
