// ─── Aura Share Card — 9:16 Instagram Story Format (§8.3 SNS 공유 카드) ────────
// ViralShareCard.tsx와 동일한 web(DOM 캡처)/native(HTML 공유시트) 패턴.
// 프라이버시 가드: 이 카드는 auraStoryPool의 curated title(감성 칭호)과
// AuraVector HSL 색상만 렌더링한다 — 대화 원문·구체 스탯은 절대 포함하지 않는다.

import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import type { AuraChannel } from '../../types/genesis';
import { FontSize, FontWeight, Radius, Spacing } from '../../styles/theme';
import { captureAndShareAura } from '../../utils/auraShareEngine';

const CARD_W = Math.min(300, Dimensions.get('window').width - 48);
const CARD_H = Math.round(CARD_W * (16 / 9));

function toCss({ hue, saturation, lightness }: AuraChannel): string {
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

interface AuraShareCardProps {
  meshStops: AuraChannel[];
  dominantTitle: string;
  cardRef?: React.RefObject<View | null>;
}

export function AuraShareCard({ meshStops, dominantTitle, cardRef }: AuraShareCardProps) {
  const gradientColors = meshStops.map(toCss) as unknown as readonly [string, string, ...string[]];

  return (
    <View ref={cardRef} style={[s.root, { width: CARD_W, height: CARD_H }]}>
      <LinearGradient
        colors={gradientColors.length >= 2 ? gradientColors : ['#7C3AED', '#D946EF']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { opacity: 0.5 }]}
      />
      <View style={[StyleSheet.absoluteFill, s.dimOverlay]} />

      <View style={s.logoRow}>
        <Text style={s.logoMain}>Twin</Text>
        <Text style={s.logoDot}>.me</Text>
        <Text style={s.logoEmoji}> 🎨</Text>
      </View>

      <View style={s.center}>
        <View style={s.swatchRow}>
          {meshStops.map((c, i) => (
            <View key={i} style={[s.swatch, { backgroundColor: toCss(c) }]} />
          ))}
        </View>
        <Text style={s.title}>"{dominantTitle}"</Text>
        <Text style={s.tag}>이게 나의 연애 색이야</Text>
      </View>

      <Text style={s.brand}>TWIN.ME · 나의 연애 색 찾기</Text>
    </View>
  );
}

interface AuraShareModalProps {
  visible: boolean;
  onClose: () => void;
  meshStops: AuraChannel[];
  dominantTitle: string;
}

export function AuraShareModal({ visible, onClose, meshStops, dominantTitle }: AuraShareModalProps) {
  const [capturing, setCapturing] = useState(false);
  const overlayOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(60);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      overlayOpacity.value = withTiming(1, { duration: 220 });
      cardOpacity.value = withTiming(1, { duration: 280 });
      cardTranslateY.value = withSpring(0, { damping: 18, stiffness: 140 });
    } else {
      overlayOpacity.value = withTiming(0, { duration: 200 });
      cardOpacity.value = withTiming(0, { duration: 180 });
      cardTranslateY.value = withTiming(60, { duration: 240 });
    }
  }, [visible, overlayOpacity, cardOpacity, cardTranslateY]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  const cardRef = useRef<View>(null);

  const handleCapture = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCapturing(true);
    try {
      const domRef = Platform.OS === 'web' && cardRef.current ? (cardRef.current as unknown as Element) : null;
      await captureAndShareAura({ domRef, meshStops, dominantTitle });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('오류', '이미지 생성에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setCapturing(false);
    }
  }, [meshStops, dominantTitle]);

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, m.root]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, m.backdrop, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[m.modal, cardStyle]}>
        <View style={m.header}>
          <View style={{ flex: 1 }}>
            <Text style={m.headerTitle}>🎨 나의 연애 색 카드</Text>
            <Text style={m.headerSub}>인스타 스토리에 자랑해 보세요!</Text>
          </View>
          <Pressable onPress={onClose} style={m.closeBtn}>
            <Text style={m.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <View style={m.cardWrap}>
          <AuraShareCard cardRef={cardRef} meshStops={meshStops} dominantTitle={dominantTitle} />
        </View>

        <View style={m.actions}>
          <TouchableOpacity
            style={[m.actionBtn, capturing && m.actionBtnDisabled]}
            onPress={handleCapture}
            activeOpacity={0.82}
            disabled={capturing}
          >
            <LinearGradient
              colors={['#7C3AED', '#D946EF', '#FF6B8B']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={m.actionBtnGrad}
            >
              {capturing ? (
                <View style={m.loadingRow}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={m.actionBtnText}>  카드 생성 중...</Text>
                </View>
              ) : (
                <Text style={m.actionBtnText}>
                  {Platform.OS === 'web' ? '📥 이미지 저장 (PNG)' : '📤 공유하기'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={m.cancelBtn} onPress={onClose} activeOpacity={0.75}>
            <Text style={m.cancelBtnText}>다음에 할게요</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { borderRadius: Radius.xl, overflow: 'hidden', backgroundColor: '#0A0D1A' },
  dimOverlay: { backgroundColor: 'rgba(10,13,26,0.35)' },
  logoRow: { flexDirection: 'row', alignItems: 'baseline', padding: 20 },
  logoMain: { color: '#E2D9FF', fontSize: 16, fontWeight: FontWeight.extrabold },
  logoDot: { color: '#D946EF', fontSize: 16, fontWeight: FontWeight.extrabold },
  logoEmoji: { fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 20 },
  swatchRow: { flexDirection: 'row', gap: 6 },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  title: { color: '#F1F5F9', fontSize: 20, fontWeight: FontWeight.extrabold, textAlign: 'center', lineHeight: 28 },
  tag: { color: '#CBD5E1', fontSize: 12 },
  brand: { color: '#64748B', fontSize: 9, textAlign: 'center', paddingBottom: 18, letterSpacing: 0.5 },
});

const m = StyleSheet.create({
  root: { zIndex: 9999 },
  backdrop: { backgroundColor: 'rgba(5,3,18,0.92)' },
  modal: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(12,9,30,0.99)',
    borderTopLeftRadius: Radius['2xl'], borderTopRightRadius: Radius['2xl'],
    borderWidth: 1, borderColor: 'rgba(217,70,239,0.20)', paddingBottom: 36, overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  headerTitle: { color: '#F1F5F9', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  headerSub: { color: '#64748B', fontSize: FontSize.xs },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: '#94A3B8', fontSize: 16 },
  cardWrap: { alignItems: 'center', paddingVertical: Spacing.base },
  actions: { paddingHorizontal: Spacing.xl, gap: Spacing.sm, marginTop: Spacing.sm },
  actionBtn: { borderRadius: Radius.pill, overflow: 'hidden' },
  actionBtnDisabled: { opacity: 0.65 },
  actionBtnGrad: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold, letterSpacing: 0.3 },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { color: '#64748B', fontSize: FontSize.sm },
});
