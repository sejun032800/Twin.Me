// ─── WebAuthModal — PIN Fallback for Web (FUN-HIS-006) ───────────────────────
//
// Shown on Platform.OS === 'web' instead of native biometric prompt.
// 4-digit numpad with masked display. Validates against WEB_SECRET_PIN.

import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { validateWebPin, WEB_SECRET_PIN } from '../../utils/authEngine';
import { FontSize, FontWeight, Radius, Spacing } from '../../styles/theme';

// ── Numpad layout ─────────────────────────────────────────────────────────────

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
] as const;

// ── PIN dots display ──────────────────────────────────────────────────────────

function PinDots({ length, error }: { length: number; error: boolean }) {
  const shake = useSharedValue(0);

  useEffect(() => {
    if (error) {
      shake.value = withRepeat(
        withSequence(
          withTiming(-8, { duration: 55 }),
          withTiming(8, { duration: 55 }),
          withTiming(0, { duration: 55 }),
        ),
        3,
        false,
      );
    }
  }, [error, shake]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  return (
    <Animated.View style={[dotStyles.row, shakeStyle]}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            dotStyles.dot,
            i < length && dotStyles.dotFilled,
            error && dotStyles.dotError,
          ]}
        />
      ))}
    </Animated.View>
  );
}

const dotStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, marginVertical: Spacing.lg },
  dot: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: '#D946EF', borderColor: '#D946EF' },
  dotError:  { borderColor: '#EF4444', backgroundColor: '#EF4444' },
});

// ── WebAuthModal ──────────────────────────────────────────────────────────────

interface WebAuthModalProps {
  visible: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

export function WebAuthModal({ visible, onSuccess, onCancel }: WebAuthModalProps) {
  const [pin, setPin]     = useState('');
  const [error, setError] = useState(false);
  const [hint, setHint]   = useState(false);

  const overlayOpacity  = useSharedValue(0);
  const cardTranslateY  = useSharedValue(40);
  const cardOpacity     = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setPin(''); setError(false); setHint(false);
      overlayOpacity.value = withTiming(1, { duration: 200 });
      cardOpacity.value    = withTiming(1, { duration: 260 });
      cardTranslateY.value = withSpring(0, { damping: 18, stiffness: 150 });
    } else {
      overlayOpacity.value = withTiming(0, { duration: 180 });
      cardOpacity.value    = withTiming(0, { duration: 160 });
      cardTranslateY.value = withTiming(40, { duration: 200 });
    }
  }, [visible, overlayOpacity, cardOpacity, cardTranslateY]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const cardStyle    = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  const handleKey = (key: string) => {
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1));
      setError(false);
      return;
    }
    if (key === '') return;
    if (pin.length >= 4) return;

    const next = pin + key;
    setPin(next);

    if (next.length === 4) {
      if (validateWebPin(next)) {
        setError(false);
        setTimeout(() => onSuccess(), 200);
      } else {
        setError(true);
        setHint(true);
        setTimeout(() => { setPin(''); setError(false); }, 700);
      }
    }
  };

  if (!visible) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      </Animated.View>

      <Animated.View style={[styles.card, cardStyle]}>
        <LinearGradient
          colors={['rgba(60,4,72,0.96)', 'rgba(15,10,40,0.99)']}
          style={StyleSheet.absoluteFill}
        />
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.lockIcon}>🔐</Text>
          <Text style={styles.title}>시크릿 플래너 잠금 해제</Text>
          <Text style={styles.subtitle}>
            웹 환경: 4자리 PIN 번호를 입력해 주세요
          </Text>
          {hint && (
            <Text style={styles.hintText}>
              힌트: 기본 PIN은 <Text style={styles.hintPin}>{WEB_SECRET_PIN}</Text>입니다
            </Text>
          )}
        </View>

        {/* PIN dots */}
        <PinDots length={pin.length} error={error} />

        {error && (
          <Text style={styles.errorText}>잘못된 PIN입니다. 다시 시도해 주세요.</Text>
        )}

        {/* Numpad */}
        <View style={styles.numpad}>
          {KEYS.map((row, ri) => (
            <View key={ri} style={styles.numpadRow}>
              {row.map((key, ki) => (
                <Pressable
                  key={ki}
                  style={({ pressed }) => [
                    styles.numKey,
                    key === '' && styles.numKeyEmpty,
                    pressed && key !== '' && styles.numKeyPressed,
                  ]}
                  onPress={() => handleKey(key)}
                  disabled={key === ''}
                >
                  <Text style={[styles.numKeyText, key === '⌫' && styles.numKeyBackspace]}>
                    {key}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>

        {/* Cancel */}
        <Pressable style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelText}>취소</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backdrop: { backgroundColor: 'rgba(5,3,18,0.88)' },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius['2xl'],
    borderWidth: 1.5,
    borderColor: 'rgba(124,58,237,0.5)',
    overflow: 'hidden',
    alignItems: 'center',
    paddingBottom: 28,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 30,
    elevation: 24,
  },
  header: { alignItems: 'center', paddingTop: 28, paddingHorizontal: 20, gap: 6 },
  lockIcon: { fontSize: 40 },
  title: {
    color: '#F1F5F9', fontSize: FontSize.lg,
    fontWeight: FontWeight.extrabold, textAlign: 'center', marginTop: 4,
  },
  subtitle: { color: '#94A3B8', fontSize: FontSize.xs, textAlign: 'center', lineHeight: 18 },
  hintText: { color: '#94A3B8', fontSize: FontSize.xs, marginTop: 4 },
  hintPin: { color: '#D946EF', fontWeight: FontWeight.bold },
  errorText: { color: '#EF4444', fontSize: FontSize.xs, marginTop: -4, marginBottom: 6 },
  numpad: { gap: 10, paddingHorizontal: 28, width: '100%' },
  numpadRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  numKey: {
    flex: 1, maxWidth: 76, height: 56, borderRadius: Radius.lg,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  numKeyEmpty: { backgroundColor: 'transparent', borderColor: 'transparent' },
  numKeyPressed: { backgroundColor: 'rgba(217,70,239,0.25)', borderColor: 'rgba(217,70,239,0.5)' },
  numKeyText: { color: '#F1F5F9', fontSize: FontSize.xl, fontWeight: FontWeight.semibold },
  numKeyBackspace: { color: '#94A3B8', fontSize: FontSize.lg },
  cancelBtn: { marginTop: Spacing.lg, paddingVertical: 8, paddingHorizontal: 28 },
  cancelText: { color: '#64748B', fontSize: FontSize.sm },
});
