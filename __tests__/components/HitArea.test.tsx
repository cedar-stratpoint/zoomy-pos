import React from 'react';
import { Pressable, StyleSheet, Switch } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { HitArea } from '../../components/HitArea';
import { TapSwitch } from '../../components/TapSwitch';
import { MIN_TAP } from '../../constants/theme';

describe('HitArea', () => {
  it('is a transparent 44pt box centred on its touchable', () => {
    const { getByTestId } = render(<HitArea />);
    const style = StyleSheet.flatten(getByTestId('hit-area', { includeHiddenElements: true }).props.style);

    expect(style).toMatchObject({ position: 'absolute', top: '50%', height: MIN_TAP, marginTop: -MIN_TAP / 2 });
    expect(style).toMatchObject({ left: '50%', width: MIN_TAP, marginLeft: -MIN_TAP / 2 });
    expect(style.backgroundColor).toBeUndefined();
  });

  it('spans the full width of a wide pill', () => {
    const { getByTestId } = render(<HitArea fullWidth />);
    const style = StyleSheet.flatten(getByTestId('hit-area', { includeHiddenElements: true }).props.style);

    expect(style).toMatchObject({ left: 0, right: 0, height: MIN_TAP });
    expect(style.width).toBeUndefined();
  });

  it('is hidden from screen readers', () => {
    const { getByTestId } = render(<HitArea />);
    expect(getByTestId('hit-area', { includeHiddenElements: true }).props.importantForAccessibility).toBe('no-hide-descendants');
  });
});

describe('TapSwitch', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is the plain system Switch on native', () => {
    const onValueChange = jest.fn();
    const { getByTestId, UNSAFE_getByType, UNSAFE_queryByType } = render(<TapSwitch testID="sw" value={false} onValueChange={onValueChange} />);

    fireEvent(getByTestId('sw'), 'valueChange', true);

    expect(onValueChange).toHaveBeenCalledWith(true);
    // The real Switch with its own touch handling, not wrapped in a Pressable.
    expect(UNSAFE_getByType(Switch)).toBeTruthy();
    expect(UNSAFE_queryByType(Pressable)).toBeNull();
  });

  describe('on web', () => {
    beforeEach(() => {
      const { Platform } = jest.requireActual('react-native');
      jest.replaceProperty(Platform, 'OS', 'web');
    });

    it('owns the tap in a 44pt area and flips the value once', () => {
      const onValueChange = jest.fn();
      const { getByTestId } = render(<TapSwitch testID="sw" value={false} onValueChange={onValueChange} />);
      const tapArea = getByTestId('sw');

      fireEvent.press(tapArea);

      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange).toHaveBeenCalledWith(true);
      expect(StyleSheet.flatten(tapArea.props.style)).toMatchObject({ minWidth: MIN_TAP, minHeight: MIN_TAP });
    });

    it('announces itself as a switch with its checked state', () => {
      const { getByTestId } = render(<TapSwitch testID="sw" value accessibilityLabel="List Beef" onValueChange={jest.fn()} />);
      const tapArea = getByTestId('sw');

      expect(tapArea.props.accessibilityRole).toBe('switch');
      expect(tapArea.props.accessibilityState).toMatchObject({ checked: true });
      expect(tapArea.props.accessibilityLabel).toBe('List Beef');
    });

    it('ignores taps while disabled', () => {
      const onValueChange = jest.fn();
      const { getByTestId } = render(<TapSwitch testID="sw" value={false} disabled onValueChange={onValueChange} />);

      fireEvent.press(getByTestId('sw'));

      expect(onValueChange).not.toHaveBeenCalled();
    });
  });
});
