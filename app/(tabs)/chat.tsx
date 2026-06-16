import React, { useCallback, useEffect, useRef, useState } from 'react';
import TabTutorialOverlay, { TutorialStep } from '../../src/components/onboarding/TabTutorialOverlay';
import { useTutorialGuard } from '../../src/hooks/useTutorialGuard';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import Animated, {
  FadeIn,
  FadeInRight,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { maskPII, useAppContext } from '../../src/context/AppContext';
import { runKakaoSyncPipeline } from '../../src/services/kakaoUploadService';
import { ChatStyleProfile } from '../../src/lib/kakaoParser';
import { requestSelfAiLlmResponse, requestToneRegeneration, type ChatHistoryItem } from '../../src/services/selfAiService';
import { useChatStream, ChatStreamReturn, ToneAlert, SensitiveInterceptResult } from '../../src/hooks/useChatStream';
import { useReportScheduler } from '../../src/hooks/useReportScheduler';
import { useCrisisIntelligence, CrisisMessage, CrisisAnalysisResult } from '../../src/hooks/useCrisisIntelligence';
import { WeeklyReportModal, ReportCardBubble } from '../../src/components/chat/WeeklyReportModal';
import {
  initChatroomRealtimeSocket,
  uploadMediaFile,
  RealtimeIncomingMessage,
} from '../../src/services/realtimeService';
import {
  Colors,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
  Spacing,
  ThemeTokens,
} from '../../src/styles/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type RoomType = 'partner' | 'ai' | 'analyst';
type MessageRole = 'user' | 'ai';
type MessageType = 'normal' | 'nudge' | 'report_card' | 'image' | 'video' | 'location' | 'gift';
type ToneFeedback = 'too_warm' | 'too_cold' | 'no_humor';

interface ToneWeight { warmth: number; humor: number }

interface GiftItem {
  id: string;
  name: string;
  emoji: string;
  price: string;
}

interface Message {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: number;
  type: MessageType;
  // Media (image / video)
  mediaUri?: string;
  // Location
  latitude?: number;
  longitude?: number;
  // Gift
  giftName?: string;
  giftEmoji?: string;
  giftPrice?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GIFT_CATALOG: GiftItem[] = [
  { id: 'coffee', name: '아이스 아메리카노', emoji: '☕', price: '4,500원' },
  { id: 'flower', name: '꽃다발', emoji: '💐', price: '29,000원' },
  { id: 'cake', name: '케이크', emoji: '🎂', price: '45,000원' },
  { id: 'teddy', name: '테디베어', emoji: '🧸', price: '35,000원' },
  { id: 'cinema', name: '영화 티켓', emoji: '🎬', price: '14,000원' },
  { id: 'ring', name: '커플링', emoji: '💍', price: '150,000원' },
];

// ─── Output Splitter (FUN-CHA-001) ───────────────────────────────────────────

function findBreakPoint(text: string, near: number): number {
  for (let o = 0; o <= 15; o++) {
    if (near + o < text.length && /[\s,.!?]/.test(text[near + o])) return near + o + 1;
    if (near - o >= 0 && /[\s,.!?]/.test(text[near - o])) return near - o + 1;
  }
  return near;
}

function dynamicSplitReply(text: string, profile: ChatStyleProfile): string[] {
  const { avgCharsPerBubble, splitTriggerPatterns } = profile;
  if (text.length <= Math.max(avgCharsPerBubble, 8)) return [text];
  const escaped = splitTriggerPatterns
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const candidates: number[] = [];
  for (const pat of [...escaped, '[.!?]']) {
    const re = new RegExp(pat, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const pos = m.index + m[0].length;
      if (pos > 3 && pos < text.length - 2) candidates.push(pos);
    }
  }
  const unique = [...new Set(candidates)].sort((a, b) => a - b);
  if (unique.length === 0) {
    if (text.length > avgCharsPerBubble * 2) {
      const bp = findBreakPoint(text, Math.floor(text.length / 2));
      return [text.slice(0, bp).trim(), text.slice(bp).trim()].filter(Boolean);
    }
    return [text];
  }
  const result: string[] = [];
  let start = 0;
  let nextTarget = avgCharsPerBubble;
  for (const pos of unique) {
    if (pos >= nextTarget && pos - start >= 4) {
      result.push(text.slice(start, pos).trim());
      start = pos;
      nextTarget = pos + avgCharsPerBubble;
      if (result.length >= 3) break;
    }
  }
  result.push(text.slice(start).trim());
  return result.filter(Boolean);
}

function calcBubbleDelay(text: string, profile: ChatStyleProfile): number {
  return Math.min(text.length * profile.typingSpeedFactor + profile.burstInterval * 0.5, 3500);
}

// ─── Early Dating Mode — Prompt System (Step #16) ────────────────────────────

const EARLY_DATING_SYSTEM_MODIFIER =
  '[SYSTEM_MODIFIER: EARLY_DATING_MODE = TRUE. 상대방에게 답변을 제안하거나 코칭할 때, ' +
  '아직은 서로 조심스럽고 설레는 문체, 예의를 지키되 위트 있는 톤앤매너를 유지할 것]';

export function buildSystemModifier(isEarlyDatingMode: boolean): string {
  return isEarlyDatingMode ? EARLY_DATING_SYSTEM_MODIFIER : '';
}

// ─── (Step #18) Mock reply arrays removed — replaced by requestSelfAiLlmResponse ──

// ─── Typing Indicator ─────────────────────────────────────────────────────────

function TypingIndicator({ partnerName, t, isAnalyzing }: { partnerName: string; t: ThemeTokens; isAnalyzing?: boolean }) {
  const d1 = useSharedValue(0);
  const d2 = useSharedValue(0);
  const d3 = useSharedValue(0);
  useEffect(() => {
    const bounce = (sv: typeof d1, delay: number) => {
      setTimeout(() => {
        sv.value = withRepeat(
          withSequence(withSpring(-6, { damping: 4, stiffness: 200 }), withSpring(0, { damping: 4, stiffness: 200 })),
          -1, false,
        );
      }, delay);
    };
    bounce(d1, 0); bounce(d2, 160); bounce(d3, 320);
  }, [d1, d2, d3]);
  const s1 = useAnimatedStyle(() => ({ transform: [{ translateY: d1.value }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ translateY: d2.value }] }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ translateY: d3.value }] }));
  return (
    <View style={styles.typingWrapper}>
      <Text style={[styles.typingLabel, { color: t.textMuted }]}>
          {isAnalyzing ? '트윈이가 내 생각을 분석 중이에요... 🔮' : `${partnerName} AI가 말하는 중...`}
        </Text>
      <View style={[styles.typingBubble, { backgroundColor: t.bubbleAI, borderColor: t.isLight ? 'rgba(180,140,200,0.3)' : '#4C2B8A' }]}>
        <Animated.View style={[styles.dot, s1]} />
        <Animated.View style={[styles.dot, s2]} />
        <Animated.View style={[styles.dot, s3]} />
      </View>
    </View>
  );
}

// ─── Early Mode Toggle (Step #16) ────────────────────────────────────────────

function EarlyModeToggle({
  value, onChange, label, t,
}: { value: boolean; onChange: (v: boolean) => void; label?: string; t: ThemeTokens }) {
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, { damping: 18, stiffness: 320 });
  }, [value, progress]);

  const knobAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [2, 16]) }],
  }));
  // Track fill gradient
  const gradientOpacity = useAnimatedStyle(() => ({ opacity: progress.value }));
  // Border ring gradient (appears when active)
  const ringStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.85, 1]) }],
  }));
  // Outer shadow glow (stronger than Step #16 version)
  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(progress.value, [0, 1], [0, 0.85]),
    shadowRadius: interpolate(progress.value, [0, 1], [0, 12]),
    elevation: interpolate(progress.value, [0, 1], [0, 8]),
  }));

  const handleToggle = () => {
    const next = !value;
    Haptics.impactAsync(next ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    onChange(next);
  };

  return (
    <Pressable onPress={handleToggle} style={styles.earlyToggleWrap}>
      {label != null && (
        <Text style={[styles.earlyToggleLabel, { color: value ? Colors.GRADIENT_END : t.textMuted }]}>
          {label}
        </Text>
      )}
      {/* Glow container — shadow spreads from here */}
      <Animated.View style={[styles.earlyToggleOuter, glowStyle, { shadowColor: Colors.GRADIENT_MID }]}>
        {/* Gradient border ring — fades in when toggle is On */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.earlyToggleRing, ringStyle]}>
          <LinearGradient
            colors={[Colors.GRADIENT_START, Colors.GRADIENT_MID, Colors.GRADIENT_END]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ flex: 1, borderRadius: 12 }}
          />
        </Animated.View>
        {/* Track — inset by 1.5px to reveal gradient border ring when active */}
        <View style={[
          styles.earlyToggleTrack,
          { backgroundColor: t.isLight ? '#CBD5E1' : '#334155', margin: value ? 1.5 : 0 },
        ]}>
          {/* Gradient fill background */}
          <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 10 }, gradientOpacity]}>
            <LinearGradient
              colors={[Colors.GRADIENT_START, Colors.GRADIENT_END]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flex: 1, borderRadius: 10 }}
            />
          </Animated.View>
          {/* Knob */}
          <Animated.View style={[styles.earlyToggleKnob, knobAnimStyle]} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── Profile HUD ──────────────────────────────────────────────────────────────

function ProfileHUD({ profile, t }: { profile: ChatStyleProfile; t: ThemeTokens }) {
  const { privacyLevel } = useAppContext();
  const info = privacyLevel === 3
    ? { label: '🟢 학습 중', color: '#4ADE80' }
    : privacyLevel === 2
    ? { label: '🟡 학습 일시 중단', color: '#FBBF24' }
    : { label: '🔴 수집 차단', color: '#F87171' };
  return (
    <View style={[styles.hudRow, { backgroundColor: t.isLight ? 'rgba(56,189,248,0.06)' : 'rgba(56,189,248,0.04)', borderColor: 'rgba(56,189,248,0.18)' }]}>
      <Text style={[styles.hudText, { color: t.textMuted }]}>⏱ {profile.burstInterval}ms</Text>
      <Text style={[styles.hudDivider, { color: t.divider }]}>·</Text>
      <Text style={[styles.hudText, { color: t.textMuted }]}>📝 {profile.avgCharsPerBubble}자</Text>
      <Text style={[styles.hudDivider, { color: t.divider }]}>·</Text>
      <Text style={[styles.hudText, { color: info.color }]}>{info.label}</Text>
    </View>
  );
}

// ─── Sensitive Warning Banner ─────────────────────────────────────────────────

function SensitiveWarningBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const translateY = useSharedValue(-56);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
    opacity.value = withTiming(1, { duration: 220 });
  }, [translateY, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.sensitiveBar, animStyle]}>
      <Text style={styles.sensitiveIcon}>⚠️</Text>
      <Text style={styles.sensitiveText} numberOfLines={2}>{message}</Text>
      <Pressable onPress={onDismiss} style={styles.sensitiveDismiss}>
        <Text style={styles.sensitiveDismissText}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Sensitive Intercept Modal (Step #20) ─────────────────────────────────────
// Pre-send hard stop: shown the instant [전송] is pressed if a partner-set
// trauma keyword is detected. User chooses to force-send or revise the message.

function SensitiveInterceptModal({
  visible,
  intercept,
  onForceSend,
  onRevise,
  onToneRegenerate,
}: {
  visible: boolean;
  intercept: SensitiveInterceptResult | null;
  onForceSend: () => void;
  onRevise: () => void;
  onToneRegenerate: () => void;
}) {
  const scale = useSharedValue(0.88);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, { damping: 16, stiffness: 240 });
      opacity.value = withTiming(1, { duration: 180 });
    } else {
      scale.value = withTiming(0.88, { duration: 140 });
      opacity.value = withTiming(0, { duration: 140 });
    }
  }, [visible, scale, opacity]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!intercept) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onRevise}>
      <View style={interceptStyles.backdrop}>
        <View style={interceptStyles.redPulse} pointerEvents="none" />
        <Animated.View style={[interceptStyles.card, cardStyle]}>
          {/* Top accent line */}
          <View style={interceptStyles.accentLine} />

          <View style={interceptStyles.iconRow}>
            <Text style={interceptStyles.iconEmoji}>🚨</Text>
          </View>

          <Text style={interceptStyles.title}>앗, 잠시만요!</Text>

          <Text style={interceptStyles.body}>
            현재 입력하신 내용에 상대방이 지정한 민감 주제(예:{' '}
            <Text style={interceptStyles.keyword}>'{intercept.detectedKeyword}'</Text>
            )가 포함되어 있어요.{'\n\n'}한 번 더 배려 섞인 표현으로 다듬어보는 건 어떨까요?
          </Text>

          <View style={interceptStyles.btnRow}>
            {/* Primary: AI tone regeneration (Step #21) */}
            <TouchableOpacity
              style={interceptStyles.btnPrimary}
              onPress={onToneRegenerate}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#7C3AED', '#D946EF', '#FF6B8B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={interceptStyles.btnPrimaryGrad}
              >
                <Text style={interceptStyles.btnPrimaryText}>✨ 트윈이가 다정하게 다듬어줘</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Secondary: manual revise */}
            <TouchableOpacity
              style={interceptStyles.btnRevise}
              onPress={onRevise}
              activeOpacity={0.75}
            >
              <Text style={interceptStyles.btnReviseText}>직접 수정할게요</Text>
            </TouchableOpacity>

            {/* Tertiary: force send */}
            <TouchableOpacity
              style={interceptStyles.btnSecondary}
              onPress={onForceSend}
              activeOpacity={0.75}
            >
              <Text style={interceptStyles.btnSecondaryText}>그냥 보낼게요</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const interceptStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 13, 26, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  // Soft red ambient glow behind the card
  redPulse: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(239, 68, 68, 0.07)',
    alignSelf: 'center',
    top: '35%',
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(18, 10, 35, 0.98)',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.45)',
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 24,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 18,
  },
  accentLine: {
    height: 3,
    backgroundColor: '#EF4444',
    borderRadius: 2,
    marginBottom: 20,
    opacity: 0.8,
  },
  iconRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  iconEmoji: {
    fontSize: 38,
  },
  title: {
    color: '#F1F5F9',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 14,
  },
  body: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: 24,
  },
  keyword: {
    color: '#FCA5A5',
    fontWeight: '700',
  },
  btnRow: {
    gap: 10,
  },
  btnRevise: {
    borderRadius: 50,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: 'rgba(100, 116, 139, 0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(100, 116, 139, 0.30)',
  },
  btnReviseText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600',
  },
  btnSecondary: {
    borderRadius: 50,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.38)',
  },
  btnSecondaryText: {
    color: '#F87171',
    fontSize: 15,
    fontWeight: '600',
  },
  btnPrimary: {
    borderRadius: 50,
    overflow: 'hidden',
  },
  btnPrimaryGrad: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});

// ─── [Step #21] Tone Regeneration Loading Overlay ────────────────────────────
// Glassmorphism-style full-screen overlay shown while the LLM is refining
// the user's message into a gentler, more considerate tone.

function ToneRegenerationLoadingOverlay() {
  const shimmer = useSharedValue(0);
  const dotY1 = useSharedValue(0);
  const dotY2 = useSharedValue(0);
  const dotY3 = useSharedValue(0);
  const cardScale = useSharedValue(0.9);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    cardScale.value = withSpring(1, { damping: 14, stiffness: 200 });
    cardOpacity.value = withTiming(1, { duration: 240 });
    shimmer.value = withRepeat(withTiming(1, { duration: 1600 }), -1, true);
    const bounce = (sv: typeof dotY1, delay: number) => {
      setTimeout(() => {
        sv.value = withRepeat(
          withSequence(withSpring(-5, { damping: 4, stiffness: 180 }), withSpring(0, { damping: 4, stiffness: 180 })),
          -1, false,
        );
      }, delay);
    };
    bounce(dotY1, 0); bounce(dotY2, 210); bounce(dotY3, 420);
  }, [shimmer, dotY1, dotY2, dotY3, cardScale, cardOpacity]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0, 0.55, 0]),
    transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-130, 130]) }],
  }));
  const d1 = useAnimatedStyle(() => ({ transform: [{ translateY: dotY1.value }] }));
  const d2 = useAnimatedStyle(() => ({ transform: [{ translateY: dotY2.value }] }));
  const d3 = useAnimatedStyle(() => ({ transform: [{ translateY: dotY3.value }] }));

  return (
    <View style={regenOverlayStyles.backdrop}>
      <Animated.View style={[regenOverlayStyles.card, cardStyle]}>
        {/* Glass gradient background */}
        <LinearGradient
          colors={['rgba(124,58,237,0.22)', 'rgba(217,70,239,0.14)', 'rgba(255,107,139,0.08)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Shimmer sweep layer */}
        <View style={regenOverlayStyles.shimmerClip}>
          <Animated.View style={[regenOverlayStyles.shimmerBar, shimmerStyle]}>
            <LinearGradient
              colors={['transparent', 'rgba(217,70,239,0.32)', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
        <Text style={regenOverlayStyles.sparkle}>✨</Text>
        <Text style={regenOverlayStyles.title}>문장을 다듬고 있어요</Text>
        <Text style={regenOverlayStyles.subtitle}>
          트윈이가 상대방을 배려하는{'\n'}다정한 문장으로 다듬고 있어요...
        </Text>
        <View style={regenOverlayStyles.dotRow}>
          <Animated.View style={[regenOverlayStyles.dot, d1]} />
          <Animated.View style={[regenOverlayStyles.dot, d2]} />
          <Animated.View style={[regenOverlayStyles.dot, d3]} />
        </View>
      </Animated.View>
    </View>
  );
}

const regenOverlayStyles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(10, 13, 26, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    zIndex: 200,
  },
  card: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(217,70,239,0.38)',
    paddingVertical: 40,
    paddingHorizontal: 28,
    alignItems: 'center',
    backgroundColor: 'rgba(18, 10, 35, 0.96)',
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 20,
    overflow: 'hidden',
  },
  shimmerClip: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    overflow: 'hidden',
  },
  shimmerBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 120,
  },
  sparkle: {
    fontSize: 42,
    marginBottom: 14,
  },
  title: {
    color: '#F1F5F9',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 26,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.GRADIENT_MID,
  },
});

// ─── Tone Guide Popup (Drop-in for AI room) ───────────────────────────────────

function ToneGuidePopup({
  alert, onDismiss,
}: { alert: ToneAlert; onDismiss: (id: string) => void }) {
  const translateY = useSharedValue(-80);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withSpring(0, { damping: 16, stiffness: 180 });
    opacity.value = withTiming(1, { duration: 250 });
  }, [translateY, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.tonePopup, animStyle]}>
      <View style={styles.tonePopupHeader}>
        <Text style={styles.tonePopupIcon}>💡</Text>
        <Text style={styles.tonePopupTitle}>말투 가이드 알림</Text>
        <Pressable onPress={() => onDismiss(alert.id)} style={styles.tonePopupClose}>
          <Text style={styles.tonePopupCloseText}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.tonePopupBody}>
        <Text style={styles.tonePopupDetected}>
          <Text style={styles.tonePopupKeyword}>"{alert.detectedKeyword}"</Text>
          {' '}이 감지됐어요.
        </Text>
        <View style={styles.tonePopupSuggRow}>
          <Text style={styles.tonePopupSuggLabel}>대신 →</Text>
          <Text style={styles.tonePopupSuggText}>{alert.suggestion}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── [Step #17] Media Bubble (image / video with upload progress) ─────────────

function MediaBubble({
  message, uploadProgress,
}: { message: Message; uploadProgress?: number }) {
  const isUser = message.role === 'user';
  const isUploading = uploadProgress !== undefined && uploadProgress < 100;

  return (
    <View style={[styles.mediaBubble, isUser ? styles.mediaBubbleUser : styles.mediaBubbleAI]}>
      {message.type === 'image' && message.mediaUri ? (
        <Image source={{ uri: message.mediaUri }} style={styles.mediaImage} resizeMode="cover" />
      ) : (
        <View style={styles.videoPlaceholder}>
          <LinearGradient
            colors={['rgba(124,58,237,0.3)', 'rgba(217,70,239,0.2)']}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.videoPlaceholderIcon}>🎬</Text>
          <Text style={styles.videoPlaceholderText}>동영상</Text>
        </View>
      )}
      {isUploading && (
        <View style={styles.uploadOverlay}>
          <View style={styles.uploadProgressTrack}>
            <View style={[styles.uploadProgressFill, { width: `${uploadProgress}%` as any }]} />
          </View>
          <Text style={styles.uploadProgressText}>{uploadProgress}%</Text>
        </View>
      )}
    </View>
  );
}

// ─── [Step #17] Location Bubble ───────────────────────────────────────────────

function LocationBubble({
  latitude, longitude, role,
}: { latitude: number; longitude: number; role: MessageRole }) {
  const isUser = role === 'user';
  const lat = latitude.toFixed(5);
  const lng = longitude.toFixed(5);

  const handleOpenMap = async () => {
    const label = encodeURIComponent('현재 위치');
    const nativeUrl = Platform.OS === 'ios'
      ? `maps://maps.apple.com/?ll=${latitude},${longitude}&q=${label}`
      : `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`;
    const webUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
    try {
      const canOpen = await Linking.canOpenURL(nativeUrl);
      await Linking.openURL(canOpen ? nativeUrl : webUrl);
    } catch {
      try { await Linking.openURL(webUrl); } catch {
        Alert.alert('지도 열기 실패', '기기에서 지도 앱을 열 수 없습니다.');
      }
    }
  };

  return (
    <View style={[styles.locationCard, isUser ? styles.locationCardUser : styles.locationCardAI]}>
      <LinearGradient
        colors={['rgba(124,58,237,0.18)', 'rgba(217,70,239,0.12)', 'rgba(255,107,139,0.08)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.locationGradBg}
      >
        {/* Mini map mock */}
        <View style={styles.locationMapMock}>
          <View style={styles.locationGridWrap}>
            {Array.from({ length: 16 }).map((_, i) => (
              <View key={i} style={styles.locationGridDot} />
            ))}
          </View>
          <View style={styles.locationPinWrap}>
            <Text style={styles.locationMapPin}>📍</Text>
          </View>
        </View>
        <View style={styles.locationInfo}>
          <Text style={styles.locationLabel}>현재 위치 공유</Text>
          <Text style={styles.locationCoords}>{lat}°N, {lng}°E</Text>
          <TouchableOpacity style={styles.locationOpenBtn} onPress={handleOpenMap} activeOpacity={0.75}>
            <Text style={styles.locationOpenText}>지도에서 보기 →</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
}

// ─── [Step #17] Gift Bubble ───────────────────────────────────────────────────

function GiftBubble({
  giftName, giftEmoji, giftPrice, role, senderName,
}: {
  giftName: string; giftEmoji: string; giftPrice: string;
  role: MessageRole; senderName: string;
}) {
  const isUser = role === 'user';
  const glowOpacity = useSharedValue(0.55);

  useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900 }),
        withTiming(0.55, { duration: 900 }),
      ), -1, false,
    );
  }, [glowOpacity]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  return (
    <View style={[styles.giftBubbleWrap, isUser ? styles.giftBubbleWrapUser : styles.giftBubbleWrapAI]}>
      <LinearGradient
        colors={['#FF6B8B', '#D946EF', '#7C3AED']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.giftBubbleGradBorder}
      >
        <View style={styles.giftBubbleInner}>
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.giftBubbleGlow, glowStyle]}
          />
          <Text style={styles.giftBubbleEmoji}>{giftEmoji}</Text>
          <Text style={styles.giftBubbleTitle}>
            {isUser ? '나' : senderName}님이 선물을 보냈어요 💝
          </Text>
          <Text style={styles.giftBubbleName}>{giftName}</Text>
          <Text style={styles.giftBubblePrice}>{giftPrice}</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

// ─── [Step #17] Gift Catalog Sheet ───────────────────────────────────────────

function GiftCatalogSheet({
  visible, onClose, onSelect, t,
}: {
  visible: boolean; onClose: () => void;
  onSelect: (gift: GiftItem) => void; t: ThemeTokens;
}) {
  const translateY = useSharedValue(500);
  const dimOpacity = useSharedValue(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setSelectedId(null);
      dimOpacity.value = withTiming(1, { duration: 250 });
      translateY.value = withSpring(0, { damping: 22, stiffness: 210 });
    } else {
      dimOpacity.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(500, { duration: 240 });
    }
  }, [visible, translateY, dimOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dimOpacity.value }));
  if (!visible) return null;

  const selectedGift = GIFT_CATALOG.find((g) => g.id === selectedId) ?? null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.dim, dimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.giftSheet, { backgroundColor: t.card, borderColor: t.divider }, sheetStyle]}>
        <View style={styles.sheetHandle} />
        <Text style={[styles.giftSheetTitle, { color: t.text }]}>🎁 선물 카탈로그</Text>
        <Text style={[styles.giftSheetSubtitle, { color: t.textMuted }]}>특별한 선물로 마음을 전해보세요 💝</Text>
        <View style={styles.giftGrid}>
          {GIFT_CATALOG.map((gift) => {
            const isActive = selectedId === gift.id;
            return (
              <TouchableOpacity
                key={gift.id}
                style={[
                  styles.giftGridItem,
                  {
                    backgroundColor: isActive ? 'rgba(255,107,139,0.12)' : t.inputBg,
                    borderColor: isActive ? Colors.GRADIENT_END : t.divider,
                    borderWidth: isActive ? 1.5 : 1,
                  },
                ]}
                onPress={() => {
                  setSelectedId(gift.id);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.75}
              >
                <Text style={styles.giftGridEmoji}>{gift.emoji}</Text>
                <Text style={[styles.giftGridName, { color: t.text }]} numberOfLines={1}>{gift.name}</Text>
                <Text style={[styles.giftGridPrice, { color: t.textMuted }]}>{gift.price}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          style={[styles.giftSendBtn, { opacity: selectedGift ? 1 : 0.4 }]}
          disabled={!selectedGift}
          onPress={() => { if (selectedGift) onSelect(selectedGift); }}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[Colors.GRADIENT_START, Colors.GRADIENT_MID, Colors.GRADIENT_END]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.giftSendBtnGrad}
          >
            <Text style={styles.giftSendBtnText}>
              {selectedGift ? `💝 ${selectedGift.name} 선물 보내기` : '선물을 선택해주세요'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sheetCloseBtn} onPress={onClose}>
          <Text style={[styles.sheetCloseBtnText, { color: t.textMuted }]}>닫기</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── [Step #17] Updated Attachment Bar ───────────────────────────────────────

interface AttachmentBarHandlers {
  onPickImage: () => void;
  onPickVideo: () => void;
  onShareLocation: () => void;
  onOpenGiftCatalog: () => void;
  onKakaoLearn: () => void;
  isKakaoLearning: boolean;
}

function AttachmentBar({ onPickImage, onPickVideo, onShareLocation, onOpenGiftCatalog, onKakaoLearn, isKakaoLearning }: AttachmentBarHandlers) {
  return (
    <View style={styles.attachBar}>
      <Pressable style={styles.attachBtn} onPress={onPickImage}>
        <Text style={styles.attachBtnIcon}>📷</Text>
        <Text style={styles.attachBtnLabel}>갤러리</Text>
      </Pressable>
      <Pressable style={styles.attachBtn} onPress={onPickVideo}>
        <Text style={styles.attachBtnIcon}>🎬</Text>
        <Text style={styles.attachBtnLabel}>동영상</Text>
      </Pressable>
      <Pressable style={styles.attachBtn} onPress={onShareLocation}>
        <Text style={styles.attachBtnIcon}>📍</Text>
        <Text style={styles.attachBtnLabel}>위치 공유</Text>
      </Pressable>
      <Pressable style={styles.attachBtn} onPress={onOpenGiftCatalog}>
        <Text style={styles.attachBtnIcon}>🎁</Text>
        <Text style={styles.attachBtnLabel}>선물</Text>
      </Pressable>
      <Pressable
        style={[styles.attachBtn, isKakaoLearning && { opacity: 0.5 }]}
        onPress={onKakaoLearn}
        disabled={isKakaoLearning}
      >
        <Text style={styles.attachBtnIcon}>{isKakaoLearning ? '⏳' : '💬'}</Text>
        <Text style={[styles.attachBtnLabel, { color: '#D946EF', fontWeight: '700' as const }]}>
          {isKakaoLearning ? '분석중...' : '카카오톡 학습'}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Tone Feedback Sheet (FUN-CHA-002) ────────────────────────────────────────

const TONE_OPTIONS: { id: ToneFeedback; label: string; weight: Partial<ToneWeight> }[] = [
  { id: 'too_warm', label: '너무 다정함 🌸', weight: { warmth: -1 } },
  { id: 'too_cold', label: '너무 딱딱함 🧊', weight: { warmth: 1 } },
  { id: 'no_humor', label: '유머 코드 안 맞음 😶', weight: { humor: 1 } },
];

function ToneFeedbackSheet({
  visible, onClose, onSelect, t,
}: { visible: boolean; onClose: () => void; onSelect: (fb: ToneFeedback) => void; t: ThemeTokens }) {
  const translateY = useSharedValue(400);
  const dimOpacity = useSharedValue(0);
  const [selected, setSelected] = useState<ToneFeedback | null>(null);

  useEffect(() => {
    if (visible) {
      setSelected(null);
      dimOpacity.value = withTiming(1, { duration: 250 });
      translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
    } else {
      dimOpacity.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(400, { duration: 250 });
    }
  }, [visible, translateY, dimOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dimOpacity.value }));
  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.dim, dimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.bottomSheet, { backgroundColor: t.card, borderColor: t.divider }, sheetStyle]}>
        <View style={styles.sheetHandle} />
        <Text style={[styles.sheetTitle, { color: t.text }]}>🤖 말투 교정하기</Text>
        <Text style={[styles.sheetSubtitle, { color: t.textMuted }]}>어떤 부분이 어색했나요? 즉시 답변을 재생성합니다.</Text>
        <View style={styles.feedbackChips}>
          {TONE_OPTIONS.map((opt) => {
            const isActive = selected === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[styles.feedbackChip, {
                  backgroundColor: isActive ? `${Colors.GRADIENT_START}22` : t.inputBg,
                  borderColor: isActive ? Colors.GRADIENT_START : t.divider,
                  borderWidth: isActive ? 1.5 : 1,
                }]}
                onPress={() => setSelected(opt.id)}
                activeOpacity={0.75}
              >
                <Text style={[styles.feedbackChipText, { color: isActive ? Colors.GRADIENT_START : t.text }]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          style={[styles.sheetSubmitBtn, { backgroundColor: selected ? Colors.GRADIENT_START : t.inputBg, opacity: selected ? 1 : 0.45 }]}
          disabled={!selected}
          onPress={() => { if (selected) onSelect(selected); }}
          activeOpacity={0.8}
        >
          <Text style={[styles.sheetSubmitText, { color: selected ? '#fff' : t.textMuted }]}>교정 적용하기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sheetCloseBtn} onPress={onClose}>
          <Text style={[styles.sheetCloseBtnText, { color: t.textMuted }]}>닫기</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Crisis Mode (FUN-CHA-003) ────────────────────────────────────────────────

function CrisisMode({
  visible, partnerName, onClose, crisisProbability,
}: {
  visible: boolean;
  partnerName: string;
  onClose: () => void;
  crisisProbability: number;
}) {
  const pctDisplay = Math.round(crisisProbability * 100);
  const pulseOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.88);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      pulseOpacity.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0.15, { duration: 900 })), -1, false);
      cardScale.value = withSpring(1, { damping: 16, stiffness: 180 });
      cardOpacity.value = withTiming(1, { duration: 350 });
      const boom = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 220);
      };
      boom(); setTimeout(boom, 1300); setTimeout(boom, 2700);
    } else {
      pulseOpacity.value = withTiming(0, { duration: 300 });
      cardOpacity.value = withTiming(0, { duration: 200 });
      cardScale.value = withTiming(0.88, { duration: 200 });
    }
  }, [visible, pulseOpacity, cardScale, cardOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: cardOpacity.value, transform: [{ scale: cardScale.value }] }));

  if (!visible) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.crisisOverlay]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.crisisWineGlow, pulseStyle]} />
      <Animated.View style={[styles.crisisCard, cardStyle]}>
        <View style={styles.crisisWineLine} />
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          <Text style={styles.crisisTitleText}>잠시 대화를 멈추고{'\n'}거울을 바라보세요</Text>
          <View style={styles.crisisDivider} />
          <View style={styles.crisisReflectionBox}>
            <Text style={styles.crisisReflectionText}>
              방금 전 {partnerName}이의 대화에 당신이 보낸 문장은 {partnerName}이에게 단순한 반박을 넘어{' '}
              <Text style={styles.crisisHighlight}>깊은 거절감을 주었을 확률이 {pctDisplay}%</Text>입니다.
            </Text>
            <Text style={[styles.crisisReflectionText, { marginTop: 12 }]}>
              당신은 대화를 빨리 끝내기 위해 {partnerName}이의 서운함을{' '}
              <Text style={styles.crisisHighlight}>'징징거림'으로 치부</Text>하지 않았나요?
            </Text>
          </View>
          <View style={styles.iMessageBox}>
            <Text style={styles.iMessageTitle}>💡 나-전달법(I-Message) 가이드</Text>
            <Text style={styles.iMessageText}>
              <Text style={styles.iMessageBad}>{'❌  "너는 왜 항상 그래"'}</Text>{'\n'}
              <Text style={styles.iMessageGood}>{'✅  "나는 그 말을 들었을 때 많이 속상했어"'}</Text>
            </Text>
            <Text style={styles.iMessageHint}>
              흥분이 가라앉은 후, 내 감정을 주어로 말해보세요.{'\n'}
              상대를 탓하지 않고 나의 감정을 전하는 것이 핵심입니다.
            </Text>
          </View>
          <TouchableOpacity style={styles.crisisActionBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.crisisActionText}>👉 내 대화 습관 인정하고 돌아가기</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ─── [Step #23] Crisis Warning Bar ───────────────────────────────────────────
// Persistent banner shown at the top of the chat when crisisActive is true.
// Tapping it opens the full CrisisMode reflection overlay.

function CrisisWarningBar({
  crisisResult, onPress,
}: {
  crisisResult: CrisisAnalysisResult;
  onPress: () => void;
}) {
  const translateY = useSharedValue(-52);
  const opacity = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
    opacity.value = withTiming(1, { duration: 260 });
    pulse.value = withRepeat(
      withSequence(withTiming(0.72, { duration: 750 }), withTiming(1, { duration: 750 })),
      -1, false,
    );
  }, [translateY, opacity, pulse]);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const pct = Math.round(crisisResult.crisisProbability * 100);

  return (
    <Animated.View style={[crisisBarStyles.bar, barStyle]}>
      <Animated.View style={[crisisBarStyles.pulse, pulseStyle]} />
      <TouchableOpacity style={crisisBarStyles.inner} onPress={onPress} activeOpacity={0.85}>
        <Text style={crisisBarStyles.icon}>🚨</Text>
        <View style={crisisBarStyles.textWrap}>
          <Text style={crisisBarStyles.title}>현재 두 분의 대화 온도가 급격히 낮아졌어요</Text>
          <Text style={crisisBarStyles.sub}>위기 감지 {pct}% · 탭하여 자세히 보기</Text>
        </View>
        <Text style={crisisBarStyles.chevron}>›</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const crisisBarStyles = StyleSheet.create({
  bar: {
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 2,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(239,68,68,0.55)',
    backgroundColor: 'rgba(127,0,43,0.18)',
  },
  pulse: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(239,68,68,0.10)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  icon: { fontSize: 20 },
  textWrap: { flex: 1 },
  title: { color: '#FCA5A5', fontSize: 13, fontWeight: '700', letterSpacing: -0.2 },
  sub: { color: 'rgba(252,165,165,0.65)', fontSize: 11, marginTop: 1 },
  chevron: { color: '#F87171', fontSize: 20, fontWeight: '300' },
});

// ─── [Step #23] Repair Bids Bar ───────────────────────────────────────────────
// Horizontal scroll of contextual reconciliation prompts shown above the input
// when crisis is active. Tapping a bid pre-fills the text input.

const REPAIR_BIDS = [
  '우리 잠깐 쉬면서 얘기할까? 🤍',
  '지금 많이 힘들지? 같이 해결해나가자 💪',
  '미안해, 내가 표현이 서툴렀어 🥺',
  '네 말이 맞아, 내가 좀 더 들을게 👂',
  '잠깐 안아줄 수 있어? 🫂',
];

function RepairBidsBar({ onSelect }: { onSelect: (text: string) => void }) {
  const translateY = useSharedValue(40);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withSpring(0, { damping: 20, stiffness: 240 });
    opacity.value = withTiming(1, { duration: 220 });
  }, [translateY, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[repairStyles.wrap, animStyle]}>
      <Text style={repairStyles.label}>💬 화해 유도 문장</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={repairStyles.scroll}>
        {REPAIR_BIDS.map((bid) => (
          <TouchableOpacity
            key={bid}
            style={repairStyles.chip}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(bid);
            }}
            activeOpacity={0.78}
          >
            <Text style={repairStyles.chipText}>{bid}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const repairStyles = StyleSheet.create({
  wrap: {
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(239,68,68,0.28)',
    backgroundColor: 'rgba(127,0,43,0.07)',
  },
  label: {
    color: 'rgba(252,165,165,0.70)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    paddingHorizontal: 14,
    marginBottom: 5,
  },
  scroll: { paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  chip: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.38)',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipText: { color: '#FCA5A5', fontSize: 13, fontWeight: '500' },
});

// ─── [Step #23] Red Neon Pulse Border ────────────────────────────────────────
// Animated absolute-fill overlay that adds a pulsing red neon border glow
// when the crisis score exceeds the warning threshold. Renders behind all
// interactive content (pointerEvents="none").

function CrisisPulseBorder({ visible }: { visible: boolean }) {
  const opacity = useSharedValue(0);
  const borderOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withRepeat(
        withSequence(withTiming(0.22, { duration: 800 }), withTiming(0.06, { duration: 800 })),
        -1, false,
      );
      borderOpacity.value = withTiming(1, { duration: 400 });
    } else {
      opacity.value = withTiming(0, { duration: 300 });
      borderOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [visible, opacity, borderOpacity]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const borderStyle = useAnimatedStyle(() => ({ opacity: borderOpacity.value }));

  return (
    <View style={crisisPulseStyles.root} pointerEvents="none">
      <Animated.View style={[crisisPulseStyles.glow, glowStyle]} />
      <Animated.View style={[crisisPulseStyles.border, borderStyle]} />
    </View>
  );
}

const crisisPulseStyles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 0 },
  glow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(190,18,60,0.14)',
  },
  border: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2.5,
    borderColor: 'rgba(239,68,68,0.62)',
    borderRadius: 0,
  },
});

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message, isRegenerating, onLongPress, onReportCardPress, t, uploadProgress, partnerName,
}: {
  message: Message;
  isRegenerating: boolean;
  onLongPress: (msg: Message) => void;
  onReportCardPress: () => void;
  t: ThemeTokens;
  uploadProgress?: number;
  partnerName: string;
}) {
  const isUser = message.role === 'user';
  const scale = useSharedValue(0.88);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 220 });
    opacity.value = withTiming(1, { duration: 200 });
  }, [scale, opacity]);

  useEffect(() => {
    opacity.value = withTiming(isRegenerating ? 0.25 : 1, { duration: isRegenerating ? 280 : 350 });
  }, [isRegenerating, opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  // Nudge banner
  if (message.type === 'nudge') {
    return (
      <Animated.View style={[styles.nudgeBanner, animStyle]}>
        <Text style={styles.nudgeEmoji}>🔔</Text>
        <Text style={styles.nudgeText}>{message.text}</Text>
      </Animated.View>
    );
  }

  // Weekly report card
  if (message.type === 'report_card') {
    return (
      <Animated.View style={[styles.bubbleRowAI, animStyle]}>
        <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
        <ReportCardBubble onPress={onReportCardPress} />
      </Animated.View>
    );
  }

  // Image / Video media bubble
  if (message.type === 'image' || message.type === 'video') {
    return (
      <Animated.View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAI, animStyle]}>
        {!isUser && <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>}
        <MediaBubble message={message} uploadProgress={uploadProgress} />
      </Animated.View>
    );
  }

  // Location bubble
  if (message.type === 'location' && message.latitude !== undefined && message.longitude !== undefined) {
    return (
      <Animated.View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAI, animStyle]}>
        {!isUser && <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>}
        <LocationBubble latitude={message.latitude} longitude={message.longitude} role={message.role} />
      </Animated.View>
    );
  }

  // Gift bubble
  if (message.type === 'gift' && message.giftName && message.giftEmoji && message.giftPrice) {
    return (
      <Animated.View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAI, animStyle]}>
        <GiftBubble
          giftName={message.giftName}
          giftEmoji={message.giftEmoji}
          giftPrice={message.giftPrice}
          role={message.role}
          senderName={partnerName}
        />
      </Animated.View>
    );
  }

  // Normal text bubble
  const userBg = t.isLight ? '#E8E0F5' : Colors.CARD_DARK_SLATE;
  const userTxt = t.isLight ? '#2D1B69' : Colors.TEXT_ON_DARK;
  const aiBg = t.isLight ? '#FFFFFF' : '#2D1B69';
  const aiBorder = t.isLight ? 'rgba(180,140,200,0.3)' : '#4C2B8A';
  const aiTxt = t.isLight ? '#1E293B' : '#E2D9FF';

  return (
    <Animated.View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAI, animStyle]}>
      {!isUser && <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>}
      <Pressable onLongPress={() => !isUser && onLongPress(message)} delayLongPress={400}>
        <View style={[
          styles.bubble,
          isUser
            ? [styles.bubbleUser, { backgroundColor: userBg }]
            : [styles.bubbleAI, { backgroundColor: aiBg, borderColor: aiBorder }],
        ]}>
          <Text style={[styles.bubbleText, { color: isUser ? userTxt : aiTxt }]}>{message.text}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Chat Room View ───────────────────────────────────────────────────────────

const ALPHA = 0.1;

function ChatRoomView({
  roomType, partnerName, onBack, t, streamState, onOpenReport,
}: {
  roomType: RoomType; partnerName: string; onBack: () => void; t: ThemeTokens;
  streamState: ChatStreamReturn; onOpenReport: () => void;
}) {
  const {
    chatStyleProfile, setChatStyleProfile, privacyLevel,
    isEarlyDatingMode, setIsEarlyDatingMode,
    roomEarlyModeMap, setRoomEarlyMode,
    myProfile, trainingResult,
    subscriptionStatus,
    coupleId,
    addMemorySentences,
    lastKakaoSyncTimestamp,
    setLastKakaoSyncTimestamp,
    triggerMirrorMode,
    setTriggerMirrorMode,
  } = useAppContext();

  // Step #40: derive deep inference flag from subscription plan
  const isPremiumDeep = subscriptionStatus.isPremium && subscriptionStatus.planId === 'deep';

  // Room-level early dating mode — independent per-room, persists across room re-entry
  // because roomEarlyModeMap lives in AppContext (not in local component state).
  const isRoomEarlyMode = roomEarlyModeMap[roomType] ?? false;
  const profileRef = useRef<ChatStyleProfile>(chatStyleProfile);
  useEffect(() => { profileRef.current = chatStyleProfile; }, [chatStyleProfile]);

  const roomConfig = {
    partner: { name: partnerName, emoji: '❤️', badge: null as string | null, status: '실제 연인 채팅방', isReal: true },
    ai: { name: `${partnerName} AI`, emoji: '💜', badge: 'AI' as string | null, status: '트윈 AI · 말투 학습 완료', isReal: false },
    analyst: { name: '연애 분석가 트윈이', emoji: '🔬', badge: 'AI' as string | null, status: '갈등 감지 · 관계 리포트 전문', isReal: false },
  };
  const config = roomConfig[roomType];

  const getInitialMessages = (): Message[] => {
    if (roomType === 'partner') return [{
      id: '0', role: 'ai', type: 'normal', timestamp: Date.now() - 60000,
      text: `이 채팅방은 ${partnerName}님과의 실제 대화 공간이에요. 카카오톡에서 직접 대화를 이어가세요! 💌`,
    }];
    if (roomType === 'analyst') return [
      { id: '0', role: 'ai', type: 'normal', timestamp: Date.now() - 120000, text: `안녕하세요! 저는 연애 분석가 트윈이예요 🔬\n두 분의 관계를 분석하고, 더 행복한 연애를 도와드릴게요.` },
      { id: 'report-0', role: 'ai', type: 'report_card', timestamp: Date.now() - 60000, text: '' },
    ];
    return [{ id: '0', role: 'ai', type: 'normal', timestamp: Date.now() - 60000, text: `안녕~ 나야 ${partnerName} AI ⚡ 보고 싶었어 🥺` }];
  };

  const [messages, setMessages] = useState<Message[]>(getInitialMessages());
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [crisisVisible, setCrisisVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [correctionCount, setCorrectionCount] = useState(0);
  const [nudgeTriggered, setNudgeTriggered] = useState(false);
  const [showAttachBar, setShowAttachBar] = useState(false);
  const [isKakaoLearning, setIsKakaoLearning] = useState(false);
  // Step #17 new state
  const [uploadProgressMap, setUploadProgressMap] = useState<Map<string, number>>(new Map());
  const [giftSheetVisible, setGiftSheetVisible] = useState(false);
  // Step #18: LLM call in-flight indicator
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  // Step #20: sensitive keyword intercept modal
  const [interceptVisible, setInterceptVisible] = useState(false);
  const [interceptResult, setInterceptResult] = useState<SensitiveInterceptResult | null>(null);
  const pendingSendTextRef = useRef<string>('');
  // Step #21: tone regeneration loading overlay
  const [isToneRegenerating, setIsToneRegenerating] = useState(false);
  // Step #23: crisis intelligence engine
  const { result: crisisResult, runAnalysis: runCrisisAnalysis } = useCrisisIntelligence();
  const crisisModalShownRef = useRef(false);

  const toneWeightRef = useRef<ToneWeight>({ warmth: 0, humor: 0 });
  // Step #18: rolling chat history ref for multi-turn LLM context
  const chatHistoryRef = useRef<Message[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessages = useRef<string[]>([]);
  const lastSendTimeRef = useRef<number>(0);

  // Step #23: watch LLM-computed crisis score — fire modal once per crisis episode
  useEffect(() => {
    if (crisisResult?.crisisModalTrigger && !crisisModalShownRef.current) {
      crisisModalShownRef.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setTimeout(() => setCrisisVisible(true), 600);
    }
    if (!crisisResult?.crisisModalTrigger) {
      crisisModalShownRef.current = false;
    }
  }, [crisisResult?.crisisModalTrigger]);

  // FUN-HOM-002 크로스 탭 라우팅: 홈 오버플로우 CRITICAL_LOSS 배너 → FUN-CHA-003 강제 발동
  useEffect(() => {
    if (triggerMirrorMode) {
      setTriggerMirrorMode(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setTimeout(() => setCrisisVisible(true), 400);
    }
  }, [triggerMirrorMode]);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      chatHistoryRef.current = next;
      return next;
    });
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  // ── [Step #17] Realtime partner message listener ────────────────────────────
  useEffect(() => {
    if (roomType !== 'partner') return undefined;
    const activeCoupleId = coupleId ?? 'demo-couple-id';
    const cleanup = initChatroomRealtimeSocket(activeCoupleId, (incoming: RealtimeIncomingMessage) => {
      addMessage({
        id: incoming.id,
        role: 'ai',
        text: incoming.text,
        timestamp: incoming.timestamp,
        type: incoming.type,
        mediaUri: incoming.mediaUri,
        latitude: incoming.latitude,
        longitude: incoming.longitude,
        giftName: incoming.giftName,
        giftEmoji: incoming.giftEmoji,
        giftPrice: incoming.giftPrice,
      });
    });
    return cleanup;
  }, [roomType, addMessage]);

  // ── [Step #17] Image picker ─────────────────────────────────────────────────
  const handlePickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '사진 라이브러리 접근 권한이 필요합니다.\n설정에서 권한을 허용해주세요.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [4, 3],
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const msgId = `img-${Date.now()}`;
      addMessage({ id: msgId, role: 'user', text: '', timestamp: Date.now(), type: 'image', mediaUri: asset.uri });
      setUploadProgressMap((prev) => new Map(prev).set(msgId, 1));
      try {
        await uploadMediaFile(asset.uri, 'image', (pct) => {
          setUploadProgressMap((prev) => new Map(prev).set(msgId, pct));
        }, coupleId ?? undefined);
        setUploadProgressMap((prev) => { const next = new Map(prev); next.delete(msgId); return next; });
      } catch {
        Alert.alert('업로드 실패', '이미지 전송에 실패했습니다. 잠시 후 다시 시도해주세요.');
        setUploadProgressMap((prev) => { const next = new Map(prev); next.delete(msgId); return next; });
      }
    } catch {
      Alert.alert('오류', '갤러리를 열 수 없습니다.');
    }
  }, [addMessage]);

  // ── [Step #17] Video picker ─────────────────────────────────────────────────
  const handlePickVideo = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '사진 라이브러리 접근 권한이 필요합니다.\n설정에서 권한을 허용해주세요.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 0.7,
        videoMaxDuration: 60,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const msgId = `vid-${Date.now()}`;
      addMessage({ id: msgId, role: 'user', text: '', timestamp: Date.now(), type: 'video', mediaUri: asset.uri });
      setUploadProgressMap((prev) => new Map(prev).set(msgId, 1));
      // Video compression would happen here in production (e.g. via expo-video or ffmpeg-kit)
      try {
        await uploadMediaFile(asset.uri, 'video', (pct) => {
          setUploadProgressMap((prev) => new Map(prev).set(msgId, pct));
        }, coupleId ?? undefined);
        setUploadProgressMap((prev) => { const next = new Map(prev); next.delete(msgId); return next; });
      } catch {
        Alert.alert('업로드 실패', '동영상 전송에 실패했습니다. 잠시 후 다시 시도해주세요.');
        setUploadProgressMap((prev) => { const next = new Map(prev); next.delete(msgId); return next; });
      }
    } catch {
      Alert.alert('오류', '갤러리를 열 수 없습니다.');
    }
  }, [addMessage]);

  // ── [Step #17] Location sharing ─────────────────────────────────────────────
  const handleShareLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '위치 서비스 접근 권한이 필요합니다.\n설정에서 권한을 허용해주세요.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      addMessage({
        id: `loc-${Date.now()}`,
        role: 'user',
        text: '',
        timestamp: Date.now(),
        type: 'location',
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('위치 오류', '현재 위치를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.');
    }
  }, [addMessage]);

  // ── [Step #17] Gift send ────────────────────────────────────────────────────
  const handleSendGift = useCallback((gift: GiftItem) => {
    setGiftSheetVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 300);
    addMessage({
      id: `gift-${Date.now()}`,
      role: 'user',
      text: '',
      timestamp: Date.now(),
      type: 'gift',
      giftName: gift.name,
      giftEmoji: gift.emoji,
      giftPrice: gift.price,
    });
  }, [addMessage]);

  // ── 카카오톡 대화 학습 (Step #50) ─────────────────────────────────────────────
  const handleKakaoLearn = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      let content: string;

      setIsKakaoLearning(true);
      setShowAttachBar(false);

      if (Platform.OS === 'web') {
        const res = await fetch(asset.uri);
        content = await res.text();
      } else {
        content = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      if (!content || content.trim().length === 0) {
        Alert.alert('파일 오류', '비어 있는 파일이에요. 카카오톡 .txt 파일을 선택해주세요.');
        setIsKakaoLearning(false);
        return;
      }

      const { newRecords, newLastTs, deltaCount } = await runKakaoSyncPipeline(
        content,
        lastKakaoSyncTimestamp,
      );

      if (newLastTs) setLastKakaoSyncTimestamp(newLastTs);

      if (newRecords.length > 0) {
        addMemorySentences(newRecords);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          '카카오톡 학습 완료 💬',
          `신규 대화 ${deltaCount}건 중 ${newRecords.length}개의 감동 순간을 DNA 나선에 새겼어요! 🧬`,
          [{ text: '확인', style: 'default' }],
        );
      } else if (deltaCount === 0) {
        Alert.alert('이미 최신이에요 ✅', '이전에 업로드한 이후 새로운 대화 내역이 없어요.', [{ text: '확인' }]);
      } else {
        Alert.alert('감동 순간 없음', '신규 대화에서 특별한 순간을 찾지 못했어요. 더 많은 대화를 담아보세요!', [{ text: '확인' }]);
      }
    } catch {
      Alert.alert('오류', '파일을 분석하는 중 문제가 발생했어요. 다시 시도해주세요.');
    } finally {
      setIsKakaoLearning(false);
    }
  }, [addMemorySentences, lastKakaoSyncTimestamp, setLastKakaoSyncTimestamp]);

  // Handle deadlock nudge arriving in AI room
  useEffect(() => {
    if (streamState.deadlockNudge && roomType === 'ai') {
      addMessage({
        id: `deadlock-${Date.now()}`,
        role: 'ai', text: streamState.deadlockNudge,
        timestamp: Date.now(), type: 'nudge',
      });
      streamState.clearDeadlockNudge();
    }
  }, [streamState.deadlockNudge, roomType, addMessage, streamState]);

  const triggerAIReply = useCallback(async (userTexts: string[]) => {
    const profile = profileRef.current;
    setIsTyping(true);
    setIsAnalyzing(true);

    // Build multi-turn history for LLM context (skip media/nudge bubbles)
    const history: ChatHistoryItem[] = chatHistoryRef.current
      .filter((m) => m.type === 'normal' && m.text.trim())
      .slice(-20)
      .map((m) => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text,
      }));

    let reply: string;
    try {
      reply = await requestSelfAiLlmResponse(
        userTexts.filter(Boolean).join('\n'),
        history,
        {
          myProfile,
          trainingResult,
          chatStyleProfile: profile,
          isEarlyDatingMode,
          isRoomEarlyMode,
          privacyLevel,
          roomType: roomType === 'analyst' ? 'analyst' : 'ai',
          // Step #40: inject deep inference flag for Deep Talk Night subscribers
          isPremiumDeep,
        },
      );
    } catch {
      reply = '잠시 생각을 정리 중이에요. 잠시 후 다시 말을 걸어주세요! 🕊️';
    } finally {
      setIsAnalyzing(false);
    }

    const parts = dynamicSplitReply(reply, profile);
    let cum = Math.round(profile.burstInterval * 0.4);
    parts.forEach((part, i) => {
      const delay = cum;
      setTimeout(() => {
        if (i === parts.length - 1) setIsTyping(false);
        addMessage({ id: `ai-${Date.now()}-${i}`, role: 'ai', text: part, timestamp: Date.now(), type: 'normal' });
      }, delay);
      cum += calcBubbleDelay(part, profile);
    });
  }, [addMessage, roomType, isEarlyDatingMode, isRoomEarlyMode, myProfile, trainingResult, privacyLevel]);

  const applyRollingAverage = useCallback((text: string, gapMs: number) => {
    const p = profileRef.current;
    const chars = text.replace(/\s/g, '').length || 1;
    const ending = text.trimEnd().slice(-3).trim();
    const newBurst = Math.round(Math.max(800, Math.min(5000, p.burstInterval * (1 - ALPHA) + gapMs * ALPHA)));
    const newAvg = Math.round(Math.max(3, Math.min(80, p.avgCharsPerBubble * (1 - ALPHA) + chars * ALPHA)));
    const newSpeed = Math.round(Math.max(30, Math.min(120, p.typingSpeedFactor * (1 - ALPHA) + (35 + chars * 1.4) * ALPHA)));
    let pats = [...p.splitTriggerPatterns];
    if (ending.length > 0 && !pats.includes(ending)) pats = [ending, ...pats].slice(0, 5);
    setChatStyleProfile({ burstInterval: newBurst, avgCharsPerBubble: newAvg, typingSpeedFactor: newSpeed, splitTriggerPatterns: pats });
  }, [setChatStyleProfile]);

  // ── Core send pipeline (called after intercept check passes) ─────────────────
  const doSend = useCallback((text: string) => {
    setInputText('');
    streamState.checkSensitive('');

    const now = Date.now();
    const gap = lastSendTimeRef.current > 0 ? now - lastSendTimeRef.current : 0;
    lastSendTimeRef.current = now;

    addMessage({ id: `u-${now}`, role: 'user', text, timestamp: now, type: 'normal' });

    if (roomType === 'partner') streamState.tapMessage(text);

    // Step #23: async psychological analysis — replaces static keyword check
    if (roomType === 'partner' || roomType === 'ai') {
      const snapshot: CrisisMessage[] = [...chatHistoryRef.current].map((m) => ({
        role: m.role,
        text: m.text,
        timestamp: m.timestamp,
        type: m.type,
      }));
      runCrisisAnalysis(snapshot);
    }

    if (!config.isReal && gap > 200 && gap < 10_000 && privacyLevel === 3) {
      applyRollingAverage(maskPII(text), gap);
    }
    if (config.isReal) return;

    pendingMessages.current.push(text);
    if (bufferTimer.current) clearTimeout(bufferTimer.current);
    bufferTimer.current = setTimeout(() => {
      const batch = [...pendingMessages.current];
      pendingMessages.current = [];
      triggerAIReply(batch);
    }, profileRef.current.burstInterval);
  }, [addMessage, triggerAIReply, config.isReal, applyRollingAverage, privacyLevel, roomType, streamState]);

  // ── [Step #20] Sensitive intercept → modal → [force send] or [revise] ────────
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;

    if (roomType === 'partner') {
      const hit = streamState.validateMessageSensitivity(text);
      if (hit) {
        pendingSendTextRef.current = text;
        setInterceptResult(hit);
        setInterceptVisible(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
    }

    doSend(text);
  }, [inputText, roomType, streamState, doSend]);

  const handleForceSend = useCallback(() => {
    setInterceptVisible(false);
    setInterceptResult(null);
    const text = pendingSendTextRef.current;
    pendingSendTextRef.current = '';
    if (text) doSend(text);
  }, [doSend]);

  const handleCancelSend = useCallback(() => {
    setInterceptVisible(false);
    setInterceptResult(null);
    pendingSendTextRef.current = '';
    // Input text preserved — user edits and retries
  }, []);

  // ── [Step #21] Tone regeneration: sends originalMessage+keyword to LLM with
  // TONE_REGENERATION_PROTOCOL override; adds refined AI message to the list.
  // On any failure, restores the original text to the input (rollback guard).
  const handleToneRegenerate = useCallback(async () => {
    const originalText = pendingSendTextRef.current;
    const keyword = interceptResult?.detectedKeyword ?? '';

    setInterceptVisible(false);
    setInterceptResult(null);
    pendingSendTextRef.current = '';

    setIsToneRegenerating(true);
    try {
      const refined = await requestToneRegeneration(
        originalText,
        keyword,
        {
          myProfile,
          trainingResult,
          chatStyleProfile: profileRef.current,
          isEarlyDatingMode,
          isRoomEarlyMode,
          privacyLevel,
          roomType: 'ai',
        },
      );
      addMessage({
        id: `regen-${Date.now()}`,
        role: 'ai',
        text: refined,
        timestamp: Date.now(),
        type: 'normal',
      });
    } catch {
      // Rollback: restore original message to input so user doesn't lose their text
      setInputText(originalText);
    } finally {
      setIsToneRegenerating(false);
    }
  }, [interceptResult, addMessage, myProfile, trainingResult, isEarlyDatingMode, isRoomEarlyMode, privacyLevel]);

  const handleChangeText = useCallback((text: string) => {
    setInputText(text);
    if (roomType === 'partner') streamState.checkSensitive(text);
  }, [roomType, streamState]);

  const handleToneFeedback = useCallback((fb: ToneFeedback) => {
    setFeedbackVisible(false);
    const opt = TONE_OPTIONS.find((o) => o.id === fb);
    if (opt?.weight) {
      toneWeightRef.current = {
        warmth: toneWeightRef.current.warmth + (opt.weight.warmth ?? 0),
        humor: toneWeightRef.current.humor + (opt.weight.humor ?? 0),
      };
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newCount = correctionCount + 1;
    setCorrectionCount(newCount);
    if (selectedMessage) {
      const id = selectedMessage.id;
      setRegeneratingId(id);

      const TONE_HINTS: Record<ToneFeedback, string> = {
        too_warm: '조금 더 자연스럽고 평범한 톤으로 다시 답해줘.',
        too_cold: '좀 더 따뜻하고 친근하게 다시 답해줘.',
        no_humor: '유머보다 공감 중심으로 자연스럽게 다시 답해줘.',
      };
      const lastUserText = chatHistoryRef.current
        .filter((m) => m.role === 'user' && m.type === 'normal')
        .slice(-1)[0]?.text ?? '';
      const regenHistory: ChatHistoryItem[] = chatHistoryRef.current
        .filter((m) => m.type === 'normal' && m.text.trim() && m.id !== id)
        .slice(-18)
        .map((m) => ({
          role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.text,
        }));

      requestSelfAiLlmResponse(
        `${lastUserText}\n[말투 재생성 요청: ${TONE_HINTS[fb]}]`,
        regenHistory,
        {
          myProfile,
          trainingResult,
          chatStyleProfile: profileRef.current,
          isEarlyDatingMode,
          isRoomEarlyMode,
          privacyLevel,
          roomType: 'ai',
          isPremiumDeep,
        },
      ).then((newText) => {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: newText } : m)));
        setTimeout(() => setRegeneratingId(null), 80);
      }).catch(() => {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: '잠시 생각을 정리 중이에요. 잠시 후 다시 말을 걸어주세요! 🕊️' } : m)));
        setTimeout(() => setRegeneratingId(null), 80);
      });
    }
    if (newCount >= 3 && !nudgeTriggered) {
      setNudgeTriggered(true);
      setTimeout(() => {
        addMessage({ id: `nudge-${Date.now()}`, role: 'ai', text: '일일이 고치기 귀찮으시다면, 메인 탭에서 딱 10분만 전화를 받아보세요! 📞', timestamp: Date.now(), type: 'nudge' });
      }, 1200);
    }
    setSelectedMessage(null);
  }, [correctionCount, nudgeTriggered, selectedMessage, addMessage, roomType, isEarlyDatingMode, isRoomEarlyMode, myProfile, trainingResult, privacyLevel]);

  const currentToneAlert = roomType === 'ai' && streamState.pendingToneAlerts.length > 0
    ? streamState.pendingToneAlerts[0]
    : null;

  const crisisActive = crisisResult?.crisisActive ?? false;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      {/* Step #23: Red neon pulse border — renders behind all content */}
      <CrisisPulseBorder visible={crisisActive} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: t.divider, backgroundColor: t.headerBg }]}>
        <View style={styles.headerLeft}>
          <Pressable style={[styles.backBtn, { backgroundColor: t.card }]} onPress={onBack}>
            <Text style={[styles.backBtnText, { color: t.text }]}>←</Text>
          </Pressable>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarEmoji}>{config.emoji}</Text>
            {config.badge && (
              <View style={styles.aiBadgeHeader}><Text style={styles.aiBadgeHeaderText}>{config.badge}</Text></View>
            )}
          </View>
          <View>
            <Text style={[styles.headerName, { color: t.text }]}>{config.name}{roomType === 'ai' ? ' ⚡' : ''}</Text>
            <Text style={[styles.headerStatus, { color: t.textMuted }]}>{config.status}</Text>
          </View>
        </View>
        {roomType === 'partner' && (
          <Pressable
            style={[styles.attachToggleBtn, { backgroundColor: showAttachBar ? `${Colors.GRADIENT_START}22` : t.card }]}
            onPress={() => setShowAttachBar((v) => !v)}
          >
            <Text style={[styles.attachToggleText, { color: showAttachBar ? Colors.GRADIENT_START : t.textMuted }]}>+</Text>
          </Pressable>
        )}
        {roomType === 'ai' && (
          <EarlyModeToggle
            value={isRoomEarlyMode}
            onChange={(v) => setRoomEarlyMode(roomType, v)}
            label="연애 초기"
            t={t}
          />
        )}
      </View>

      {/* Step #23: Crisis warning bar — shown when probability >= 0.75 */}
      {crisisActive && crisisResult && (
        <CrisisWarningBar
          crisisResult={crisisResult}
          onPress={() => setCrisisVisible(true)}
        />
      )}

      {/* Profile HUD (AI rooms only) */}
      {roomType !== 'partner' && <ProfileHUD profile={chatStyleProfile} t={t} />}

      {/* [Step #17] Updated Attachment bar (partner room) */}
      {roomType === 'partner' && showAttachBar && (
        <AttachmentBar
          onPickImage={handlePickImage}
          onPickVideo={handlePickVideo}
          onShareLocation={handleShareLocation}
          onOpenGiftCatalog={() => setGiftSheetVisible(true)}
          onKakaoLearn={handleKakaoLearn}
          isKakaoLearning={isKakaoLearning}
        />
      )}

      {/* Tone Guide Drop-in popup (AI room) */}
      {currentToneAlert && (
        <ToneGuidePopup alert={currentToneAlert} onDismiss={streamState.dismissToneAlert} />
      )}

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          style={{ backgroundColor: t.bg }}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isRegenerating={regeneratingId === item.id}
              t={t}
              onReportCardPress={onOpenReport}
              uploadProgress={uploadProgressMap.get(item.id)}
              partnerName={partnerName}
              onLongPress={(msg) => {
                if (roomType !== 'partner') {
                  setSelectedMessage(msg);
                  setFeedbackVisible(true);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
              }}
            />
          )}
          ListFooterComponent={isTyping ? <TypingIndicator partnerName={partnerName} t={t} isAnalyzing={isAnalyzing} /> : null}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {/* Sensitive Warning Banner (above input, partner room) */}
        {roomType === 'partner' && streamState.sensitiveWarning && (
          <SensitiveWarningBanner
            message={streamState.sensitiveWarning.message}
            onDismiss={() => streamState.checkSensitive('')}
          />
        )}

        {/* Step #23: Repair bids — shown when crisis is active */}
        {crisisActive && (
          <RepairBidsBar onSelect={(bid) => setInputText(bid)} />
        )}

        <View style={[styles.inputRow, { backgroundColor: t.bg, borderTopColor: t.divider }]}>
          <TextInput
            style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
            value={inputText}
            onChangeText={handleChangeText}
            placeholder={config.isReal ? `${partnerName}님께 전할 말...` : '메시지 보내기...'}
            placeholderTextColor={t.textMuted}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim()}
            activeOpacity={0.8}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <ToneFeedbackSheet
        visible={feedbackVisible} t={t}
        onClose={() => { setFeedbackVisible(false); setSelectedMessage(null); }}
        onSelect={handleToneFeedback}
      />
      <CrisisMode
        visible={crisisVisible}
        partnerName={partnerName}
        onClose={() => setCrisisVisible(false)}
        crisisProbability={crisisResult?.crisisProbability ?? 0.84}
      />

      {/* [Step #20] Sensitive Intercept Modal */}
      <SensitiveInterceptModal
        visible={interceptVisible}
        intercept={interceptResult}
        onForceSend={handleForceSend}
        onRevise={handleCancelSend}
        onToneRegenerate={handleToneRegenerate}
      />

      {/* [Step #17] Gift Catalog Sheet */}
      <GiftCatalogSheet
        visible={giftSheetVisible}
        onClose={() => setGiftSheetVisible(false)}
        onSelect={handleSendGift}
        t={t}
      />

      {/* [Step #21] Tone Regeneration Loading Overlay — rendered last to sit above all siblings */}
      {isToneRegenerating && <ToneRegenerationLoadingOverlay />}

      {/* [Step #50] KakaoTalk Learning Overlay */}
      {isKakaoLearning && (
        <Modal visible transparent animationType="fade" statusBarTranslucent>
          <View style={kakaoLearnS.overlay}>
            <View style={kakaoLearnS.card}>
              <LinearGradient
                colors={['rgba(217,70,239,0.15)', 'rgba(124,58,237,0.1)']}
                style={StyleSheet.absoluteFill}
              />
              <Text style={kakaoLearnS.emoji}>💬</Text>
              <Text style={kakaoLearnS.title}>카카오톡 대화 분석 중...</Text>
              <Text style={kakaoLearnS.sub}>AI가 감동적인 순간을 선별하고 있어요 🧬</Text>
              <View style={kakaoLearnS.dotRow}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={[kakaoLearnS.dot, { opacity: 0.4 + i * 0.3 }]} />
                ))}
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const kakaoLearnS = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(18,6,38,0.97)',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(217,70,239,0.45)',
    padding: 28,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 20,
  },
  emoji: { fontSize: 40 },
  title: {
    color: '#F1F5F9',
    fontSize: 17,
    fontWeight: '700' as const,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  sub: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  dotRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D946EF' },
});

// ─── Gradient Glow Avatar (partner row) ──────────────────────────────────────

function PartnerGlowAvatar({ emoji, t }: { emoji: string; t: ThemeTokens }) {
  return (
    <LinearGradient
      colors={['#FF6B8B', '#D946EF', '#7C3AED']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={styles.partnerGlowRing}
    >
      <View style={[styles.partnerGlowInner, { backgroundColor: t.card }]}>
        <Text style={styles.dmAvatarEmoji}>{emoji}</Text>
      </View>
    </LinearGradient>
  );
}

// ─── DM Row ───────────────────────────────────────────────────────────────────

function DMRow({
  emoji, name, badge, preview, time, onPress, t, isPartner, alertCount,
}: {
  emoji: string; name: string; badge?: string; preview: string; time: string;
  onPress: () => void; t: ThemeTokens; isPartner?: boolean; alertCount?: number;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { scale.value = withTiming(0.98, { duration: 60 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 100 }); }}
    >
      <Animated.View style={[styles.dmRow, animStyle]}>
        <View style={styles.dmAvatarWrap}>
          {isPartner ? (
            <PartnerGlowAvatar emoji={emoji} t={t} />
          ) : (
            <View style={[styles.dmAvatar, { backgroundColor: t.card, borderColor: t.isLight ? 'rgba(180,140,200,0.4)' : 'rgba(124,58,237,0.3)' }]}>
              <Text style={styles.dmAvatarEmoji}>{emoji}</Text>
            </View>
          )}
          {badge && (
            <View style={styles.dmBadge}><Text style={styles.dmBadgeText}>{badge}</Text></View>
          )}
          {(alertCount ?? 0) > 0 && (
            <View style={styles.alertCountBadge}>
              <Text style={styles.alertCountText}>{alertCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.dmInfo}>
          <View style={styles.dmNameRow}>
            <Text style={[styles.dmName, { color: t.text }]}>{name}</Text>
            <Text style={[styles.dmTime, { color: t.textMuted }]}>{time}</Text>
          </View>
          <Text style={[styles.dmPreview, { color: t.textSecondary }]} numberOfLines={1}>{preview}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── DM List View ─────────────────────────────────────────────────────────────

function DMListView({
  partnerName, onEnterRoom, t, toneAlertCount,
}: {
  partnerName: string; onEnterRoom: (room: RoomType) => void; t: ThemeTokens; toneAlertCount: number;
}) {
  const { isEarlyDatingMode, setIsEarlyDatingMode } = useAppContext();
  const { shouldShow, markDone } = useTutorialGuard('chat');

  const refPartnerRow = useRef<View>(null);
  const refAiRow = useRef<View>(null);
  const refAnalystRow = useRef<View>(null);
  const refTipBox = useRef<View>(null);

  const tutorialSteps: TutorialStep[] = [
    {
      targetRef: refPartnerRow,
      title: '❤️ 파트너 채팅방',
      description: '카카오톡을 연동하면 실제 연인과의 대화를 AI가 분석해 드려요.',
      arrowDir: 'below',
      pad: 10,
    },
    {
      targetRef: refAiRow,
      title: '💜 파트너 AI',
      description: '파트너의 말투와 성격을 학습한 AI가 대신 답장 초안을 생성해요.',
      arrowDir: 'below',
      pad: 10,
    },
    {
      targetRef: refAnalystRow,
      title: '🔬 분석가 트윈이',
      description: '매주 연애 리포트와 위기 신호를 감지해 알려드려요.',
      arrowDir: 'above',
      pad: 10,
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, { color: t.text }]}>채팅</Text>
        <EarlyModeToggle value={isEarlyDatingMode} onChange={setIsEarlyDatingMode} label="연애 초기 모드" t={t} />
      </View>
      <View style={[styles.listDivider, { backgroundColor: t.divider }]} />

      <Animated.View entering={FadeIn.duration(300)} style={styles.dmList}>
        <View ref={refPartnerRow} collapsable={false}>
          <Animated.View entering={FadeInRight.delay(0).duration(300)}>
            <DMRow
              emoji="❤️" name={partnerName}
              preview="카카오톡 연동 · 실제 연인 채팅방" time="지금"
              onPress={() => onEnterRoom('partner')} t={t} isPartner
            />
          </Animated.View>
        </View>

        <View style={[styles.aiSectionLabel, { borderTopColor: t.divider }]}>
          <View style={[styles.aiSectionLine, { backgroundColor: t.divider }]} />
          <View style={styles.aiSectionBadge}>
            <Text style={styles.aiSectionBadgeText}>AI 어시스턴트</Text>
          </View>
          <View style={[styles.aiSectionLine, { backgroundColor: t.divider }]} />
        </View>

        <View ref={refAiRow} collapsable={false}>
          <Animated.View entering={FadeInRight.delay(100).duration(300)}>
            <DMRow
              emoji="💜" name={`${partnerName} AI`} badge="AI"
              preview={`안녕~ 나야 ${partnerName} AI ⚡ 보고 싶었어 🥺`} time="방금"
              onPress={() => onEnterRoom('ai')} t={t}
              alertCount={toneAlertCount > 0 ? toneAlertCount : undefined}
            />
          </Animated.View>
        </View>
        <View style={[styles.rowDivider, { backgroundColor: t.divider }]} />

        <View ref={refAnalystRow} collapsable={false}>
          <Animated.View entering={FadeInRight.delay(180).duration(300)}>
            <DMRow
              emoji="🔬" name="분석가 트윈이 💬" badge="AI"
              preview="📊 이번 주 연애 리포트가 도착했어요!" time="어제"
              onPress={() => onEnterRoom('analyst')} t={t}
            />
          </Animated.View>
        </View>
      </Animated.View>

      <View ref={refTipBox} collapsable={false} style={styles.tipBox}>
        <Text style={styles.tipText}>
          💡 커플 방에서 날카로운 말투가 감지되면, AI 방에서 실시간 말투 가이드를 받아보세요.
        </Text>
      </View>

      {/* ── 신규 유저 스포트라이트 튜토리얼 ── */}
      <TabTutorialOverlay
        steps={tutorialSteps}
        visible={shouldShow}
        onDone={markDone}
      />
    </SafeAreaView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { partnerProfile, themeTokens } = useAppContext();
  const t = themeTokens;
  const partnerName = partnerProfile.name;
  const [activeRoom, setActiveRoom] = useState<RoomType | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  // Step #22 — weekly report scheduler: cold-start hydration + upload trigger + Sunday 22:00 cron
  useReportScheduler();

  const streamState = useChatStream();

  return (
    <>
      {activeRoom !== null ? (
        <ChatRoomView
          roomType={activeRoom}
          partnerName={partnerName}
          t={t}
          streamState={streamState}
          onBack={() => setActiveRoom(null)}
          onOpenReport={() => setReportModalVisible(true)}
        />
      ) : (
        <DMListView
          partnerName={partnerName}
          onEnterRoom={(r) => setActiveRoom(r)}
          t={t}
          toneAlertCount={streamState.pendingToneAlerts.length}
        />
      )}
      <WeeklyReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },

  // DM List
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  listTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, letterSpacing: -0.5 },
  earlyModeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  earlyModeBadgeText: { fontSize: FontSize.xs },
  listDivider: { height: StyleSheet.hairlineWidth },
  dmList: { flex: 1 },

  // AI section separator
  aiSectionLabel: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  aiSectionLine: { flex: 1, height: StyleSheet.hairlineWidth },
  aiSectionBadge: { backgroundColor: `${Colors.BADGE_AI_BLUE}18`, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: `${Colors.BADGE_AI_BLUE}35` },
  aiSectionBadgeText: { color: Colors.BADGE_AI_BLUE, fontSize: 9, fontWeight: FontWeight.semibold },

  // DM Row
  dmRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.md },
  dmAvatarWrap: { position: 'relative', width: 52, height: 52 },
  dmAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  dmAvatarEmoji: { fontSize: 26 },
  partnerGlowRing: { width: 52, height: 52, borderRadius: 26, padding: 2.5 },
  partnerGlowInner: { flex: 1, borderRadius: 23.5, alignItems: 'center', justifyContent: 'center' },
  dmBadge: { position: 'absolute', bottom: -2, right: -4, backgroundColor: Colors.BADGE_AI_BLUE, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
  dmBadgeText: { fontSize: 8, fontWeight: FontWeight.bold, color: '#fff' },
  alertCountBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  alertCountText: { fontSize: 8, fontWeight: FontWeight.bold, color: '#fff' },
  dmInfo: { flex: 1, gap: 4 },
  dmNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dmName: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  dmTime: { fontSize: FontSize.xs },
  dmPreview: { fontSize: FontSize.sm },
  rowDivider: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.base + 52 + Spacing.md },
  tipBox: { marginHorizontal: Spacing.base, marginBottom: 80, backgroundColor: 'rgba(56,189,248,0.08)', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(56,189,248,0.2)' },
  tipText: { color: Colors.BADGE_AI_BLUE, fontSize: FontSize.xs, lineHeight: 18 },

  // Chat Room Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, marginRight: 4 },
  backBtnText: { fontSize: FontSize.lg, lineHeight: 22 },
  avatarWrap: { position: 'relative', width: 40, height: 40 },
  avatarEmoji: { fontSize: 32, lineHeight: 40 },
  aiBadgeHeader: { position: 'absolute', bottom: -2, right: -4, backgroundColor: Colors.BADGE_AI_BLUE, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
  aiBadgeHeaderText: { fontSize: 8, fontWeight: FontWeight.bold, color: '#fff' },
  headerName: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  headerStatus: { fontSize: FontSize.xs, marginTop: 1 },

  // Early Mode Toggle (Step #19 — room-level version with gradient border ring)
  earlyToggleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  earlyToggleLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  // Outer glow shell — borderRadius must accommodate 1.5px border + 10px inner radius
  earlyToggleOuter: { borderRadius: 12, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, width: 37, height: 23, justifyContent: 'center', alignItems: 'center' },
  // Gradient ring layer — sits inside earlyToggleOuter, fills it entirely
  earlyToggleRing: { borderRadius: 12, overflow: 'hidden' },
  // Track sits inside the ring with margin to reveal gradient border when active
  earlyToggleTrack: { width: 34, height: 20, borderRadius: 10, justifyContent: 'center', overflow: 'hidden' },
  earlyToggleKnob: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF', top: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 1.5, elevation: 2 },

  // Attach toggle
  attachToggleBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  attachToggleText: { fontSize: 22, lineHeight: 24, fontWeight: FontWeight.bold },

  // Attach bar
  attachBar: { flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.base, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(124,58,237,0.15)', backgroundColor: 'rgba(124,58,237,0.04)' },
  attachBtn: { alignItems: 'center', gap: 3, flex: 1 },
  attachBtnIcon: { fontSize: 24 },
  attachBtnLabel: { fontSize: 9, color: Colors.TEXT_MUTED },

  // Profile HUD
  hudRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: Spacing.base, borderBottomWidth: 1 },
  hudText: { fontSize: 10, fontWeight: FontWeight.medium },
  hudDivider: { fontSize: 10 },

  // Sensitive Warning Banner
  sensitiveBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.base, marginBottom: 4, backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: Radius.md, padding: Spacing.sm, paddingHorizontal: Spacing.md, borderWidth: 1.5, borderColor: 'rgba(251,191,36,0.45)' },
  sensitiveIcon: { fontSize: 14 },
  sensitiveText: { flex: 1, color: '#FDE68A', fontSize: FontSize.xs, lineHeight: 17 },
  sensitiveDismiss: { padding: 4 },
  sensitiveDismissText: { color: '#FBBF24', fontSize: 12 },

  // Tone Guide Popup
  tonePopup: { marginHorizontal: Spacing.base, marginBottom: Spacing.sm, backgroundColor: 'rgba(30,41,59,0.95)', borderRadius: Radius.xl, padding: Spacing.base, borderWidth: 1.5, borderColor: 'rgba(56,189,248,0.35)', ...Shadows.subtle },
  tonePopupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  tonePopupIcon: { fontSize: 16 },
  tonePopupTitle: { flex: 1, color: Colors.BADGE_AI_BLUE, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  tonePopupClose: { padding: 4 },
  tonePopupCloseText: { color: '#64748B', fontSize: 12 },
  tonePopupBody: { gap: 5 },
  tonePopupDetected: { color: '#94A3B8', fontSize: FontSize.xs },
  tonePopupKeyword: { color: '#F87171', fontWeight: FontWeight.bold },
  tonePopupSuggRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  tonePopupSuggLabel: { color: Colors.BADGE_AI_BLUE, fontSize: FontSize.xs, fontWeight: FontWeight.bold, marginTop: 1 },
  tonePopupSuggText: { flex: 1, color: '#A78BFA', fontSize: FontSize.xs, lineHeight: 18 },

  // ── [Step #17] Media Bubble ───────────────────────────────────────────────
  mediaBubble: { borderRadius: Radius.lg, overflow: 'hidden', maxWidth: 220 },
  mediaBubbleUser: { alignSelf: 'flex-end' },
  mediaBubbleAI: { alignSelf: 'flex-start' },
  mediaImage: { width: 220, height: 165, borderRadius: Radius.lg },
  videoPlaceholder: { width: 220, height: 140, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,41,59,0.85)', overflow: 'hidden', gap: 6 },
  videoPlaceholderIcon: { fontSize: 36 },
  videoPlaceholderText: { color: '#E2D9FF', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  uploadOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(10,13,26,0.78)', paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center', gap: 5 },
  uploadProgressTrack: { width: '100%', height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden' },
  uploadProgressFill: { height: '100%', backgroundColor: Colors.GRADIENT_END, borderRadius: 2 },
  uploadProgressText: { color: '#fff', fontSize: 10, fontWeight: FontWeight.semibold },

  // ── [Step #17] Location Bubble ────────────────────────────────────────────
  locationCard: { borderRadius: Radius.xl, overflow: 'hidden', maxWidth: 240 },
  locationCardUser: { alignSelf: 'flex-end' },
  locationCardAI: { alignSelf: 'flex-start' },
  locationGradBg: { padding: 0 },
  locationMapMock: { height: 100, backgroundColor: 'rgba(15,23,42,0.55)', position: 'relative', alignItems: 'center', justifyContent: 'center' },
  locationGridWrap: { flexDirection: 'row', flexWrap: 'wrap', width: 80, height: 80, opacity: 0.25 },
  locationGridDot: { width: 20, height: 20, borderWidth: 0.5, borderColor: '#7C3AED' },
  locationPinWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  locationMapPin: { fontSize: 28 },
  locationInfo: { padding: Spacing.md, gap: 3 },
  locationLabel: { color: '#E2D9FF', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  locationCoords: { color: 'rgba(226,217,255,0.6)', fontSize: 10, fontFamily: 'monospace' },
  locationOpenBtn: { marginTop: 5, backgroundColor: 'rgba(124,58,237,0.3)', borderRadius: Radius.md, paddingVertical: 5, paddingHorizontal: 10, alignSelf: 'flex-start' },
  locationOpenText: { color: '#A78BFA', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  // ── [Step #17] Gift Bubble ────────────────────────────────────────────────
  giftBubbleWrap: { maxWidth: 240 },
  giftBubbleWrapUser: { alignSelf: 'flex-end' },
  giftBubbleWrapAI: { alignSelf: 'flex-start' },
  giftBubbleGradBorder: { borderRadius: Radius.xl, padding: 2 },
  giftBubbleInner: { backgroundColor: 'rgba(10,13,26,0.92)', borderRadius: Radius.xl - 1, alignItems: 'center', padding: Spacing.base, gap: 4, overflow: 'hidden' },
  giftBubbleGlow: { borderRadius: Radius.xl, backgroundColor: 'rgba(217,70,239,0.12)' },
  giftBubbleEmoji: { fontSize: 36 },
  giftBubbleTitle: { color: '#FDA4AF', fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textAlign: 'center' },
  giftBubbleName: { color: '#F1F5F9', fontSize: FontSize.base, fontWeight: FontWeight.extrabold, textAlign: 'center' },
  giftBubblePrice: { color: 'rgba(241,245,249,0.5)', fontSize: FontSize.xs, textAlign: 'center' },

  // ── [Step #17] Gift Catalog Sheet ────────────────────────────────────────
  giftSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: Radius['2xl'], borderTopRightRadius: Radius['2xl'], paddingHorizontal: Spacing.base, paddingBottom: Spacing['3xl'], paddingTop: Spacing.md, borderTopWidth: 1 },
  giftSheetTitle: { fontSize: FontSize.md, fontWeight: FontWeight.extrabold, textAlign: 'center', marginBottom: 4 },
  giftSheetSubtitle: { fontSize: FontSize.sm, textAlign: 'center', marginBottom: Spacing.md },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: Spacing.md },
  giftGridItem: { width: '30%', borderRadius: Radius.lg, padding: Spacing.sm, alignItems: 'center', gap: 3 },
  giftGridEmoji: { fontSize: 28 },
  giftGridName: { fontSize: 10, fontWeight: FontWeight.semibold, textAlign: 'center' },
  giftGridPrice: { fontSize: 9, textAlign: 'center' },
  giftSendBtn: { borderRadius: Radius.pill, overflow: 'hidden', marginBottom: Spacing.sm },
  giftSendBtnGrad: { paddingVertical: Spacing.md, alignItems: 'center' },
  giftSendBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },

  // Messages
  messageList: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: 6 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 2 },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAI: { justifyContent: 'flex-start', gap: 6 },
  aiBadge: { backgroundColor: Colors.BADGE_AI_BLUE, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, marginBottom: 2, alignSelf: 'flex-end' },
  aiBadgeText: { fontSize: 8, fontWeight: FontWeight.bold, color: '#fff' },
  bubble: { maxWidth: 260, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderRadius: Radius.lg },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleAI: { borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleText: { fontSize: FontSize.base, lineHeight: 22 },

  // Nudge banner
  nudgeBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.xl, marginVertical: 6, padding: Spacing.md, backgroundColor: 'rgba(56,189,248,0.09)', borderRadius: Radius.md, borderWidth: 1, borderColor: 'rgba(56,189,248,0.35)' },
  nudgeEmoji: { fontSize: 18 },
  nudgeText: { flex: 1, fontSize: FontSize.sm, color: Colors.BADGE_AI_BLUE, lineHeight: 20 },

  // Typing indicator
  typingWrapper: { paddingHorizontal: Spacing.base, marginBottom: 8, marginLeft: 30, gap: 3 },
  typingLabel: { fontSize: FontSize.xs, marginLeft: 4 },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.lg, borderBottomLeftRadius: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, alignSelf: 'flex-start', borderWidth: 1, minWidth: 64, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.BADGE_AI_BLUE },

  // Input
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, paddingBottom: Spacing.base, gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderRadius: Radius.pill, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm + 2, fontSize: FontSize.base, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.GRADIENT_START, alignItems: 'center', justifyContent: 'center', ...Shadows.subtle },
  sendBtnDisabled: { opacity: 0.35 },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: FontWeight.bold, marginTop: -1 },

  // Bottom Sheet (Tone Feedback)
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  bottomSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: Radius['2xl'], borderTopRightRadius: Radius['2xl'], paddingHorizontal: Spacing.xl, paddingBottom: Spacing['3xl'], paddingTop: Spacing.md, borderTopWidth: 1 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.TEXT_MUTED, alignSelf: 'center', marginBottom: Spacing.base },
  sheetTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, textAlign: 'center', marginBottom: 4 },
  sheetSubtitle: { fontSize: FontSize.sm, textAlign: 'center', marginBottom: Spacing.base },
  feedbackChips: { gap: Spacing.sm },
  feedbackChip: { borderRadius: Radius.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.base, alignItems: 'center' },
  feedbackChipText: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  sheetSubmitBtn: { borderRadius: Radius.pill, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.base },
  sheetSubmitText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  sheetCloseBtn: { marginTop: Spacing.sm, alignItems: 'center', paddingVertical: Spacing.sm },
  sheetCloseBtnText: { fontSize: FontSize.sm },

  // Crisis Mode
  crisisOverlay: { backgroundColor: 'rgba(5, 3, 18, 0.97)', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  crisisWineGlow: { backgroundColor: 'rgba(190, 18, 60, 0.18)' },
  crisisCard: { backgroundColor: 'rgba(15, 10, 40, 0.98)', borderRadius: Radius['2xl'], paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.xl, marginHorizontal: Spacing.lg, borderWidth: 1.5, borderColor: 'rgba(190, 18, 60, 0.5)', width: '90%', maxHeight: '86%', ...Shadows.card },
  crisisWineLine: { height: 3, backgroundColor: '#BE123C', borderRadius: 2, marginBottom: Spacing.lg, opacity: 0.85 },
  crisisTitleText: { color: '#F1F5F9', fontSize: FontSize.md + 1, fontWeight: FontWeight.extrabold, textAlign: 'center', letterSpacing: 0.4, lineHeight: 30, marginBottom: Spacing.sm },
  crisisDivider: { height: 1, backgroundColor: 'rgba(190, 18, 60, 0.28)', marginVertical: Spacing.md },
  crisisReflectionBox: { backgroundColor: 'rgba(190, 18, 60, 0.07)', borderRadius: Radius.md, padding: Spacing.base, marginVertical: Spacing.sm, borderLeftWidth: 3, borderLeftColor: '#BE123C' },
  crisisReflectionText: { color: '#CBD5E1', fontSize: FontSize.sm, lineHeight: 23 },
  crisisHighlight: { color: '#FDA4AF', fontWeight: FontWeight.bold },
  iMessageBox: { backgroundColor: 'rgba(30, 41, 59, 0.55)', borderRadius: Radius.md, padding: Spacing.base, marginVertical: Spacing.md, borderWidth: 1, borderColor: 'rgba(56,189,248,0.18)' },
  iMessageTitle: { color: Colors.BADGE_AI_BLUE, fontSize: FontSize.sm, fontWeight: FontWeight.bold, marginBottom: 8 },
  iMessageText: { color: '#94A3B8', fontSize: FontSize.sm, lineHeight: 24 },
  iMessageBad: { color: '#F87171' },
  iMessageGood: { color: '#86EFAC' },
  iMessageHint: { color: '#64748B', fontSize: FontSize.xs, marginTop: 8, lineHeight: 18 },
  crisisActionBtn: { backgroundColor: 'rgba(190, 18, 60, 0.12)', borderRadius: Radius.pill, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, marginTop: Spacing.base, alignItems: 'center', borderWidth: 1.5, borderColor: '#BE123C' },
  crisisActionText: { color: '#FDA4AF', fontSize: FontSize.base, fontWeight: FontWeight.bold, textAlign: 'center' },
});
