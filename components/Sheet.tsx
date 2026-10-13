import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Modal, Pressable, StyleSheet, View, useWindowDimensions,
  type LayoutChangeEvent, type StyleProp, type ViewStyle,
} from 'react-native';
import { DURATION, EASE_OUT, EASE_SHEET } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Props = {
  visible: boolean;
  /** Android back button / web Escape. */
  onRequestClose: () => void;
  /** Edge the panel lives on and slides from. */
  from?: 'bottom' | 'top';
  /** Dim layer color. It fades in place; only the panel travels. */
  backdropColor?: string;
  /** When set, tapping the dim layer calls this (usually the close handler). */
  onBackdropPress?: () => void;
  backdropLabel?: string;
  /** Panel style (background, radius, padding, maxHeight). */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * Edge-anchored sheet over a transparent Modal. Replaces `animationType="slide"`,
 * which slides the whole modal so the dim layer rides up with the panel. Here
 * the backdrop fades and the panel slides from its edge, and the sheet stays
 * mounted through its exit so closing animates too. Under reduced motion both
 * layers just fade.
 */
export function Sheet({
  visible, onRequestClose, from = 'bottom', backdropColor = 'rgba(0,0,0,0.6)',
  onBackdropPress, backdropLabel = 'Close', style, children,
}: Props) {
  const reduced = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const [panelHeight, setPanelHeight] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  // Keep the Modal up until the exit finishes. Set during render (not in an
  // effect) so opening never commits a frame with the Modal still hidden.
  const [shown, setShown] = useState(visible);
  if (visible && !shown) setShown(true);

  // Callers often clear the data the panel renders at the same moment they
  // close it; keep showing the last open content while it animates away.
  const lastChildren = useRef(children);
  if (visible) lastChildren.current = children;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduced ? DURATION.fade : visible ? DURATION.sheetIn : DURATION.sheetOut,
      easing: reduced ? EASE_OUT : EASE_SHEET,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setShown(false);
    });
    return () => animation.stop();
  }, [visible, reduced, progress]);

  // Until the panel is measured, park it a full screen away so it never flashes.
  const distance = (panelHeight || windowHeight) * (from === 'bottom' ? 1 : -1);
  const translateY = reduced
    ? 0
    : progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] });

  const onPanelLayout = (e: LayoutChangeEvent) => setPanelHeight(e.nativeEvent.layout.height);

  const backdrop = (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: backdropColor, opacity: progress }]} />
  );

  return (
    <Modal visible={shown} transparent animationType="none" onRequestClose={onRequestClose}>
      <View style={[styles.container, from === 'bottom' ? styles.bottom : styles.top]}>
        {onBackdropPress ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={onBackdropPress} accessibilityLabel={backdropLabel}>
            {backdrop}
          </Pressable>
        ) : (
          backdrop
        )}
        <Animated.View
          onLayout={onPanelLayout}
          style={[style, { opacity: reduced ? progress : 1, transform: [{ translateY }] }]}
        >
          {visible ? children : lastChildren.current}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bottom: { justifyContent: 'flex-end' },
  top: { justifyContent: 'flex-start' },
});
