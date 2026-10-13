import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { DURATION, EASE_OUT } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

export type ToastVariant = 'success' | 'error';

export type ToastInput = {
  variant: ToastVariant;
  title: string;
  message?: string;
};

type ToastContextValue = {
  showToast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}

type VisibleToast = ToastInput & { id: number };

const SUCCESS_DURATION_MS = 3000;
const ERROR_DURATION_MS = 5000;
/** How far the toast drops in from. Skipped under reduced motion. */
const ENTER_OFFSET = -16;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [toast, setToast] = useState<VisibleToast | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);
  const showing = useRef(false);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  // Exit is quicker and subtler than the enter: fade only, no travel.
  const fadeOut = useCallback(
    (onDone: () => void) => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: DURATION.toastOut,
        easing: EASE_OUT,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onDone();
      });
    },
    [opacity]
  );

  const dismiss = useCallback(() => {
    clearHideTimer();
    fadeOut(() => {
      showing.current = false;
      setToast(null);
    });
  }, [fadeOut]);

  const enter = useCallback(
    (next: VisibleToast) => {
      setToast(next);
      showing.current = true;
      opacity.setValue(0);
      translateY.setValue(reducedRef.current ? 0 : ENTER_OFFSET);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: DURATION.toastIn, easing: EASE_OUT, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: DURATION.toastIn, easing: EASE_OUT, useNativeDriver: true }),
      ]).start();
    },
    [opacity, translateY]
  );

  const showToast = useCallback(
    (input: ToastInput) => {
      clearHideTimer();
      const id = ++nextId.current;
      const next = { ...input, id };
      // A toast already on screen hands off (fade the old one, then drop the
      // new one in) instead of hard-cutting, e.g. "Sale recorded" followed by
      // "Not synced to Coop". Only the latest request wins a rapid burst.
      if (showing.current) {
        fadeOut(() => {
          if (id === nextId.current) enter(next);
        });
      } else {
        enter(next);
      }
      const duration =
        input.variant === 'error' ? ERROR_DURATION_MS : SUCCESS_DURATION_MS;
      hideTimer.current = setTimeout(() => {
        dismiss();
      }, duration);
    },
    [fadeOut, enter, dismiss]
  );

  useEffect(() => {
    return () => clearHideTimer();
  }, []);

  const ctxValue = useMemo(() => ({ showToast }), [showToast]);

  const isError = toast?.variant === 'error';
  const accent = isError ? colors.red : colors.green;
  const iconName = isError ? 'alert-circle' : 'checkmark-circle';

  return (
    <ToastContext.Provider value={ctxValue}>
      {children}
      <View
        pointerEvents="box-none"
        style={[styles.host, { paddingTop: insets.top + 12 }]}
      >
        {toast ? (
          <Animated.View
            style={[
              styles.toast,
              { borderColor: accent, opacity, transform: [{ translateY }] },
            ]}
          >
            <Pressable onPress={dismiss} style={styles.toastInner}>
              <Ionicons name={iconName} size={22} color={accent} />
              <View style={styles.toastText}>
                <Text style={styles.title} numberOfLines={1}>
                  {toast.title}
                </Text>
                {toast.message ? (
                  <Text style={styles.message} numberOfLines={4}>
                    {toast.message}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  toast: {
    minWidth: 260,
    maxWidth: 480,
    backgroundColor: c.elevated,
    borderRadius: R.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  toastInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  toastText: {
    flex: 1,
  },
  title: {
    color: c.textPrimary,
    fontSize: F.md,
    fontWeight: '700',
  },
  message: {
    color: c.textSecondary,
    fontSize: F.sm,
    marginTop: 2,
    lineHeight: 18,
  },
});
