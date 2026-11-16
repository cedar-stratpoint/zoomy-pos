import React from 'react';
import { Platform, Pressable, StyleSheet, Switch, View, type SwitchProps } from 'react-native';
import { MIN_TAP } from '../constants/theme';
import { PRESS_OPACITY } from '../constants/motion';

type Props = Omit<SwitchProps, 'value' | 'onValueChange'> & {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel?: string;
};

/**
 * The system Switch with a tap area of at least MIN_TAP (44pt).
 *
 * Native: the plain Switch. It's already about 51x31 with platform touch
 * handling (including dragging the thumb), so nothing is wrapped.
 * Web: react-native-web draws a 40x20 switch, too small for a finger. The
 * switch is drawn inside a MIN_TAP pressable that owns the tap; the switch
 * itself takes no pointer events, so a tap can never toggle twice.
 */
export function TapSwitch({ value, onValueChange, testID, accessibilityLabel, disabled, ...switchProps }: Props) {
  if (Platform.OS !== 'web') {
    return (
      <Switch
        testID={testID}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
        {...switchProps}
      />
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.tapArea, pressed && styles.pressed]}
    >
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" aria-hidden>
        <Switch value={value} disabled={disabled} {...switchProps} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tapArea: {
    minWidth: MIN_TAP,
    minHeight: MIN_TAP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: PRESS_OPACITY },
});
