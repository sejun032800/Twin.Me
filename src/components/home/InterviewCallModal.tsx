import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Gradients } from '../../styles/theme';

// ── Types ──────────────────────────────────────────────────────────────────────
type Phase = 'incoming' | 'active' | 'completed';

// ── Mock interview questions ───────────────────────────────────────────────────
// Real implementation: feed these as system prompts to GPT-4o Realtime API
// wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17
const MOCK_QUESTIONS = [
  {
    text: '"연애에서 가장 중요하게 생각하는 가치가 뭐야?\n솔직하게 말해줘. 💬"',
    hint: '자유롭게 말하면 돼. 내가 듣고 있어.',
    duration: 8000,
  },
  {
    text: '"최근 파트너와 가장 기억에 남았던 순간을\n떠올려봐. 어떤 느낌이었어? ✨"',
    hint: '그 감정을 그대로 표현해줘.',
    duration: 8000,
  },
  {
    text: '"이 관계에서 더 깊어지고 싶은 부분이\n있다면 솔직하게 이야기해봐. 🤍"',
    hint: '편하게 이야기해줘.',
    duration: 8000,
  },
] as const;

// ── Mic permission ─────────────────────────────────────────────────────────────
async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: '마이크 접근 권한',
          message: '트윈이와의 인터뷰를 위해 마이크 접근이 필요해요.',
          buttonPositive: '허용',
          buttonNegative: '거부',
        },
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }
  // iOS: permission is prompted by the OS on first audio access
  return true;
}

// ── Voice session controller (mock) ───────────────────────────────────────────
// Architecture stub — replace body with:
//   const ws = new WebSocket('wss://api.openai.com/v1/realtime?...');
//   ws.onopen = () => ws.send(JSON.stringify({ type: 'session.create', ... }));
//   ws.onmessage = (e) => { /* stream AI audio delta back to device speaker */ };
function startAiVoiceInterviewSession(
  onQuestionAdvance: (idx: number) => void,
  onSessionEnd: () => void,
): () => void {
  let idx = 0;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const next = () => {
    if (cancelled) return;
    if (idx >= MOCK_QUESTIONS.length) {
      onSessionEnd();
      return;
    }
    onQuestionAdvance(idx);
    const duration = MOCK_QUESTIONS[idx].duration;
    timer = setTimeout(() => {
      idx += 1;
      next();
    }, duration);
  };

  next();
  return () => {
    cancelled = true;
    if (timer !== null) clearTimeout(timer);
  };
}

// ── Component ──────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onCompleted: () => void;
  onClose: () => void;
}

const BTN_SIZE = 72;

export default function InterviewCallModal({ visible, onCompleted, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('incoming');
  const [currentQ, setCurrentQ] = useState(0);
  const cancelRef = useRef<(() => void) | null>(null);

  // shared values
  const overlayOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.9);
  const acceptPulse = useSharedValue(1);
  const ring1 = useSharedValue(1);
  const ring2 = useSharedValue(1);
  const declinePulse = useSharedValue(1);
  const qOpacity = useSharedValue(0);
  const qY = useSharedValue(16);
  const progressVal = useSharedValue(0);
  const tickScale = useSharedValue(0);
  const tickOpacity = useSharedValue(0);
  const micOpacity = useSharedValue(1);

  useEffect(() => {
    if (!visible) return;

    // Reset
    setPhase('incoming');
    setCurrentQ(0);
    progressVal.value = 0;
    qOpacity.value = 0;
    qY.value = 16;
    tickScale.value = 0;
    tickOpacity.value = 0;
    acceptPulse.value = 1;
    ring1.value = 1;
    ring2.value = 1;
    declinePulse.value = 1;

    // Fade in
    overlayOpacity.value = withTiming(1, { duration: 350 });
    cardScale.value = withSpring(1, { damping: 18, stiffness: 200 });

    // Accept button pulse
    acceptPulse.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 600, easing: Easing.out(Easing.sin) }),
        withTiming(1, { duration: 600, easing: Easing.in(Easing.sin) }),
      ),
      -1,
      false,
    );
    // Ring 1: spreads from 1x to 1.7x then instantly resets
    ring1.value = withRepeat(
      withSequence(
        withTiming(1.7, { duration: 1100, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 0 }),
      ),
      -1,
      false,
    );
    // Ring 2: offset by 450ms for stagger
    ring2.value = withDelay(
      450,
      withRepeat(
        withSequence(
          withTiming(2.0, { duration: 1100, easing: Easing.out(Easing.cubic) }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
        false,
      ),
    );
    // Decline button subtle pulse
    declinePulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 700, easing: Easing.out(Easing.sin) }),
        withTiming(1, { duration: 700, easing: Easing.in(Easing.sin) }),
      ),
      -1,
      false,
    );

    return () => {
      cancelRef.current?.();
    };
  }, [visible]);

  // ── Accept handler ───────────────────────────────────────────────────────────
  const handleAccept = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const granted = await requestMicPermission();
    if (!granted) {
      Alert.alert('마이크 접근 필요', '인터뷰를 진행하려면 마이크 접근을 허용해주세요.', [
        { text: '확인' },
      ]);
      return;
    }

    setPhase('active');

    // Mic blink animation
    micOpacity.value = withRepeat(
      withSequence(withTiming(0.3, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1,
      false,
    );

    // First question card slides in
    qOpacity.value = withTiming(1, { duration: 400 });
    qY.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) });

    const cancel = startAiVoiceInterviewSession(
      (idx) => {
        // Fade out → update question → fade in
        qOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
          'worklet';
          if (finished) {
            runOnJS(setCurrentQ)(idx);
            qOpacity.value = withTiming(1, { duration: 400 });
          }
        });
        qY.value = withSequence(
          withTiming(10, { duration: 200 }),
          withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) }),
        );
        progressVal.value = withTiming((idx / MOCK_QUESTIONS.length) * 100, {
          duration: 500,
          easing: Easing.out(Easing.quad),
        });
      },
      () => {
        // All questions answered
        setPhase('completed');
        progressVal.value = withTiming(100, { duration: 500 });
        tickOpacity.value = withDelay(300, withTiming(1, { duration: 400 }));
        tickScale.value = withDelay(300, withSpring(1, { damping: 12, stiffness: 180 }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        setTimeout(() => {
          onCompleted(); // triggers AccuracyBanner dissolve + score update
          overlayOpacity.value = withTiming(0, { duration: 500 }, (finished) => {
            'worklet';
            if (finished) runOnJS(onClose)();
          });
        }, 2500);
      },
    );
    cancelRef.current = cancel;
  };

  // ── Decline / end call handler ───────────────────────────────────────────────
  const handleDecline = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    cancelRef.current?.();
    overlayOpacity.value = withTiming(0, { duration: 350 }, (finished) => {
      'worklet';
      if (finished) runOnJS(onClose)();
    });
  };

  // ── Animated styles ──────────────────────────────────────────────────────────
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }] }));
  const acceptBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: acceptPulse.value }],
  }));
  const declineBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: declinePulse.value }],
  }));
  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring1.value }],
    opacity: interpolate(ring1.value, [1, 1.7], [0.45, 0]),
  }));
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring2.value }],
    opacity: interpolate(ring2.value, [1, 2.0], [0.3, 0]),
  }));
  const qCardStyle = useAnimatedStyle(() => ({
    opacity: qOpacity.value,
    transform: [{ translateY: qY.value }],
  }));
  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressVal.value}%` as any,
  }));
  const tickStyle = useAnimatedStyle(() => ({
    opacity: tickOpacity.value,
    transform: [{ scale: tickScale.value }],
  }));
  const micStyle = useAnimatedStyle(() => ({ opacity: micOpacity.value }));

  const q = MOCK_QUESTIONS[Math.min(currentQ, MOCK_QUESTIONS.length - 1)];

  return (
    <Modal transparent statusBarTranslucent animationType="none" visible={visible}>
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <Animated.View style={[styles.card, cardStyle]}>

          {/* ── Avatar ── */}
          <LinearGradient
            colors={Gradients.TWIN_PRIMARY.colors}
            start={Gradients.TWIN_PRIMARY.start}
            end={Gradients.TWIN_PRIMARY.end}
            style={styles.avatarRing}
          >
            <View style={styles.avatarInner}>
              <Text style={styles.avatarEmoji}>🤖</Text>
            </View>
          </LinearGradient>

          <Text style={styles.callerName}>연애 분석가 트윈이</Text>

          <Text style={styles.statusText}>
            {phase === 'incoming' && '전화가 걸려오는 중...'}
            {phase === 'active' && `인터뷰 진행 중 · ${currentQ + 1} / ${MOCK_QUESTIONS.length}`}
            {phase === 'completed' && 'AI 정확도 95% 달성! 🎉'}
          </Text>

          {/* ── Progress bar ── */}
          {phase !== 'incoming' && (
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, progressStyle]}>
                <LinearGradient
                  colors={Gradients.TWIN_PRIMARY.colors}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            </View>
          )}

          {/* ── Active: question card ── */}
          {phase === 'active' && (
            <Animated.View style={[styles.questionCard, qCardStyle]}>
              <Text style={styles.questionText}>{q.text}</Text>
              <Text style={styles.questionHint}>{q.hint}</Text>
              <Animated.Text style={[styles.micText, micStyle]}>🎙️ 말하는 중...</Animated.Text>
            </Animated.View>
          )}

          {/* ── Active: question dots ── */}
          {phase === 'active' && (
            <View style={styles.dots}>
              {MOCK_QUESTIONS.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i <= currentQ ? styles.dotActive : styles.dotInactive]}
                />
              ))}
            </View>
          )}

          {/* ── Completed: tick ── */}
          {phase === 'completed' && (
            <Animated.View style={[styles.completionBox, tickStyle]}>
              <Text style={styles.completionEmoji}>✅</Text>
              <Text style={styles.completionText}>
                {'AI 정확도가 95%로 상승했어요!\n트윈이가 당신을 훨씬 잘 이해해요.'}
              </Text>
            </Animated.View>
          )}

          {/* ── Incoming: call buttons ── */}
          {phase === 'incoming' && (
            <View style={styles.callBtns}>
              {/* Decline */}
              <View style={styles.btnCol}>
                <Animated.View style={[styles.callBtn, styles.declineBtn, declineBtnStyle]}>
                  <Pressable onPress={handleDecline} style={styles.btnTouchable}>
                    <Text style={styles.callIcon}>📵</Text>
                  </Pressable>
                </Animated.View>
                <Text style={styles.btnLabel}>거절</Text>
              </View>

              {/* Accept */}
              <View style={styles.btnCol}>
                <View style={styles.acceptWrapper}>
                  <Animated.View style={[styles.ring, ring2Style]} />
                  <Animated.View style={[styles.ring, ring1Style]} />
                  <Animated.View style={[styles.callBtn, styles.acceptBtn, acceptBtnStyle]}>
                    <Pressable onPress={handleAccept} style={styles.btnTouchable}>
                      <Text style={styles.callIcon}>📞</Text>
                    </Pressable>
                  </Animated.View>
                </View>
                <Text style={styles.btnLabel}>수락</Text>
              </View>
            </View>
          )}

          {/* ── Active: end call ── */}
          {phase === 'active' && (
            <Pressable onPress={handleDecline} style={styles.endCallBtn}>
              <Text style={styles.endCallText}>📵  통화 종료</Text>
            </Pressable>
          )}

        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10,13,26,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 52,
    paddingHorizontal: 24,
  },
  avatarRing: {
    width: 116,
    height: 116,
    borderRadius: 58,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarInner: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: Colors.CARD_DARK_SLATE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 54 },
  callerName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F1F5F9',
    letterSpacing: -0.3,
  },
  statusText: {
    fontSize: 14,
    color: Colors.TEXT_MUTED,
    letterSpacing: 0.2,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },
  questionCard: {
    width: '100%',
    backgroundColor: Colors.CARD_DARK_SLATE,
    borderRadius: 16,
    padding: 20,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(124,58,237,0.35)',
  },
  questionText: {
    fontSize: 15,
    color: '#F1F5F9',
    fontWeight: '500',
    lineHeight: 23,
    fontStyle: 'italic',
  },
  questionHint: {
    fontSize: 12,
    color: Colors.TEXT_MUTED,
  },
  micText: {
    fontSize: 13,
    color: '#22C55E',
    fontWeight: '600',
    marginTop: 2,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: { backgroundColor: Colors.GRADIENT_START },
  dotInactive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  completionBox: {
    alignItems: 'center',
    gap: 14,
    marginTop: 8,
  },
  completionEmoji: { fontSize: 64 },
  completionText: {
    fontSize: 15,
    color: '#F1F5F9',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
  },
  callBtns: {
    flexDirection: 'row',
    gap: 88,
    marginTop: 36,
    alignItems: 'flex-start',
  },
  btnCol: {
    alignItems: 'center',
    gap: 10,
  },
  acceptWrapper: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    backgroundColor: 'rgba(34,197,94,0.28)',
  },
  callBtn: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 18,
    elevation: 10,
  },
  acceptBtn: {
    backgroundColor: '#22C55E',
    shadowColor: '#22C55E',
    shadowOpacity: 0.55,
  },
  declineBtn: {
    backgroundColor: Colors.ALERT_SIREN_RED,
    shadowColor: Colors.ALERT_SIREN_RED,
    shadowOpacity: 0.45,
  },
  btnTouchable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BTN_SIZE / 2,
  },
  callIcon: { fontSize: 28 },
  btnLabel: {
    fontSize: 13,
    color: Colors.TEXT_MUTED,
    fontWeight: '500',
  },
  endCallBtn: {
    marginTop: 36,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 28,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
  },
  endCallText: {
    fontSize: 15,
    color: Colors.ALERT_SIREN_RED,
    fontWeight: '600',
  },
});
