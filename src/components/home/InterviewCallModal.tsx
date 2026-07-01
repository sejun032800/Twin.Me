// ─── 트윈 제네시스 인터뷰 엔진 — 통화 UI 오버라이드 (FUN-HOM-001 Override) ─────
// 전화 수신 UI 셸은 유지하되, 내부 진행은 useGenesisInterview 상태 머신이 구동한다.
// 인터뷰어는 "갓 태어난 트윈 본인" — 모든 카피는 단정이 아닌 제안+확인 톤.

import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { useAppContext } from '../../context/AppContext';
import { useGenesisInterview } from '../../hooks/useGenesisInterview';
import { CLAY_STAGE_LABEL, GenesisAct } from '../../types/genesis';
import ClayTwinAvatar from './ClayTwinAvatar';
import { Colors, Gradients } from '../../styles/theme';

// ── Types ──────────────────────────────────────────────────────────────────────
type Phase = 'incoming' | 'active' | 'completed';

const ACT_LABEL: Record<GenesisAct, string> = {
  1: '1막 · 잡담',
  2: '2막 · 개인 성향',
  3: '3막 · 연애 성향',
  4: '4막 · 엔딩',
};

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
  return true;
}

// ── Component ──────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onCompleted: () => void;
  onClose: () => void;
}

const BTN_SIZE = 72;

export default function InterviewCallModal({ visible, onCompleted, onClose }: Props) {
  const { myProfile, completeGenesisInterview, setHasCompletedInterview } = useAppContext();
  const genesis = useGenesisInterview(myProfile.mbti);
  const [phase, setPhase] = useState<Phase>('incoming');
  const [typedText, setTypedText] = useState('');
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

    setPhase('incoming');
    setTypedText('');
    progressVal.value = 0;
    qOpacity.value = 0;
    qY.value = 16;
    tickScale.value = 0;
    tickOpacity.value = 0;
    acceptPulse.value = 1;
    ring1.value = 1;
    ring2.value = 1;
    declinePulse.value = 1;

    overlayOpacity.value = withTiming(1, { duration: 350 });
    cardScale.value = withSpring(1, { damping: 18, stiffness: 200 });

    acceptPulse.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 600, easing: Easing.out(Easing.sin) }),
        withTiming(1, { duration: 600, easing: Easing.in(Easing.sin) }),
      ),
      -1, false,
    );
    ring1.value = withRepeat(
      withSequence(withTiming(1.7, { duration: 1100, easing: Easing.out(Easing.cubic) }), withTiming(1, { duration: 0 })),
      -1, false,
    );
    ring2.value = withDelay(450, withRepeat(
      withSequence(withTiming(2.0, { duration: 1100, easing: Easing.out(Easing.cubic) }), withTiming(1, { duration: 0 })),
      -1, false,
    ));
    declinePulse.value = withRepeat(
      withSequence(withTiming(1.08, { duration: 700, easing: Easing.out(Easing.sin) }), withTiming(1, { duration: 700, easing: Easing.in(Easing.sin) })),
      -1, false,
    );

    return () => {
      cancelRef.current?.();
    };
  }, [visible]);

  // 진행도 → 프로그레스 바 애니메이션 동기화
  useEffect(() => {
    if (phase === 'active') {
      progressVal.value = withTiming(genesis.progress, { duration: 400, easing: Easing.out(Easing.quad) });
    }
  }, [genesis.progress, phase]);

  // 질문이 바뀔 때마다 카드 페이드 트랜지션
  const prevQuestionId = useRef<string | null>(null);
  useEffect(() => {
    const id = genesis.currentQuestion?.id ?? null;
    if (id !== prevQuestionId.current) {
      prevQuestionId.current = id;
      setTypedText('');
      qOpacity.value = 0;
      qY.value = 10;
      qOpacity.value = withTiming(1, { duration: 400 });
      qY.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) });
    }
  }, [genesis.currentQuestion?.id]);

  // 4막 엔딩 세리머니 도달 → 완료 처리
  useEffect(() => {
    if (genesis.phase === 'ceremony' && phase === 'active') {
      const matrix = genesis.finalizePersonaMatrix();
      completeGenesisInterview(matrix);
      setHasCompletedInterview(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setPhase('completed');
      progressVal.value = withTiming(100, { duration: 500 });
      tickOpacity.value = withDelay(300, withTiming(1, { duration: 400 }));
      tickScale.value = withDelay(300, withSpring(1, { damping: 12, stiffness: 180 }));

      setTimeout(() => {
        onCompleted();
        overlayOpacity.value = withTiming(0, { duration: 500 }, (finished) => {
          'worklet';
          if (finished) runOnJS(onClose)();
        });
      }, 2600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genesis.phase, phase]);

  // ── Accept handler ───────────────────────────────────────────────────────────
  const handleAccept = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const granted = await requestMicPermission();
    if (!granted) {
      Alert.alert('마이크 접근 필요', '인터뷰를 진행하려면 마이크 접근을 허용해주세요.', [{ text: '확인' }]);
      return;
    }

    setPhase('active');
    micOpacity.value = withRepeat(
      withSequence(withTiming(0.3, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1, false,
    );
    qOpacity.value = withTiming(1, { duration: 400 });
    qY.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) });

    genesis.start();
    cancelRef.current = () => {};
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

  const handleSubmitTyped = () => {
    if (!typedText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    genesis.submitTranscript(typedText.trim());
  };

  const handleQuickReply = (label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    genesis.submitTranscript(label);
  };

  const handleConfirmYes = () => {
    if (!genesis.pendingConfirm) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    genesis.confirmArchetype(genesis.pendingConfirm.archetype.id);
  };

  const handleConfirmOverride = (archetypeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    genesis.confirmArchetype(archetypeId);
  };

  // ── Animated styles ──────────────────────────────────────────────────────────
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }] }));
  const acceptBtnStyle = useAnimatedStyle(() => ({ transform: [{ scale: acceptPulse.value }] }));
  const declineBtnStyle = useAnimatedStyle(() => ({ transform: [{ scale: declinePulse.value }] }));
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
  const progressStyle = useAnimatedStyle(() => ({ width: `${progressVal.value}%` as any }));
  const tickStyle = useAnimatedStyle(() => ({
    opacity: tickOpacity.value,
    transform: [{ scale: tickScale.value }],
  }));
  const micStyle = useAnimatedStyle(() => ({ opacity: micOpacity.value }));

  const isConfirming = genesis.phase === 'confirming' && !!genesis.pendingConfirm;

  return (
    <Modal transparent statusBarTranslucent animationType="none" visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        <Animated.View style={[styles.card, cardStyle]}>

          <ClayTwinAvatar stage={genesis.clayStage} pulseSignal={genesis.pulseSignal} size={116} />

          <Text style={styles.callerName}>
            {phase === 'incoming' ? '갓 태어난 트윈이' : CLAY_STAGE_LABEL[genesis.clayStage]}
          </Text>

          <Text style={styles.statusText}>
            {phase === 'incoming' && '전화가 걸려오는 중...'}
            {phase === 'active' && `${ACT_LABEL[genesis.act]} · ${genesis.progress}%`}
            {phase === 'completed' && 'AI 정확도 95% 달성! 🎉'}
          </Text>

          {phase !== 'incoming' && (
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, progressStyle]}>
                <LinearGradient colors={Gradients.TWIN_PRIMARY.colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
              </Animated.View>
            </View>
          )}

          {/* ── Active: 되짚기(confirm) 단계 ── */}
          {phase === 'active' && isConfirming && genesis.pendingConfirm && (
            <Animated.View style={[styles.questionCard, qCardStyle]}>
              <Text style={styles.confirmLabel}>아, 그러니까...</Text>
              <Text style={styles.questionText}>"{genesis.pendingConfirm.archetype.label}"라는 거지?</Text>
              <View style={styles.confirmRow}>
                <Pressable style={styles.confirmYesBtn} onPress={handleConfirmYes}>
                  <Text style={styles.confirmYesText}>응 맞아</Text>
                </Pressable>
              </View>
              <Text style={styles.confirmOtherLabel}>아니면, 이게 더 맞아?</Text>
              <View style={styles.chipRow}>
                {genesis.pendingConfirm.question.archetypes
                  .filter((a) => a.id !== genesis.pendingConfirm?.archetype.id)
                  .map((a) => (
                    <Pressable key={a.id} style={styles.chip} onPress={() => handleConfirmOverride(a.id)}>
                      <Text style={styles.chipText}>{a.label}</Text>
                    </Pressable>
                  ))}
              </View>
            </Animated.View>
          )}

          {/* ── Active: 질문 + 입력 ── */}
          {phase === 'active' && !isConfirming && genesis.currentQuestion && (
            <Animated.View style={[styles.questionCard, qCardStyle]}>
              <Text style={styles.questionText}>{genesis.currentQuestion.prompt}</Text>

              {genesis.inputMode === 'voice' ? (
                <>
                  <Animated.Text style={[styles.micText, micStyle]}>🎙️ 듣고 있어요...</Animated.Text>
                  {genesis.act === 1 ? (
                    <Pressable style={styles.confirmYesBtn} onPress={() => handleQuickReply('응 알겠어')}>
                      <Text style={styles.confirmYesText}>말했어, 다음으로 →</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.chipRow}>
                      {genesis.currentQuestion.archetypes.map((a) => (
                        <Pressable key={a.id} style={styles.chip} onPress={() => handleQuickReply(a.keywords[0] ?? a.label)}>
                          <Text style={styles.chipText}>🎙️ {a.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <Pressable onPress={genesis.switchToTyping}>
                    <Text style={styles.switchModeText}>말로 하기 어려우면 적어줘도 돼 ⌨️</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <TextInput
                    value={typedText}
                    onChangeText={setTypedText}
                    placeholder="편하게 적어줘..."
                    placeholderTextColor="rgba(226,232,240,0.4)"
                    style={styles.textInput}
                    multiline
                  />
                  <Pressable style={styles.confirmYesBtn} onPress={handleSubmitTyped}>
                    <Text style={styles.confirmYesText}>보내기</Text>
                  </Pressable>
                  <Pressable onPress={genesis.switchToVoice}>
                    <Text style={styles.switchModeText}>🎙️ 다시 말로 할게</Text>
                  </Pressable>
                </>
              )}
            </Animated.View>
          )}

          {/* ── Completed: tick ── */}
          {phase === 'completed' && (
            <Animated.View style={[styles.completionBox, tickStyle]}>
              <Text style={styles.completionEmoji}>✅</Text>
              <Text style={styles.completionText}>
                {'안녕, 나는 너야 ㅋㅋㅋ\nAI 정확도가 95%로 상승했어요!'}
              </Text>
              <Text style={styles.completionSubText}>
                설정 &gt; 마이 트윈 AI에서 내 오라 해설을 확인해봐 🎨
              </Text>
            </Animated.View>
          )}

          {/* ── Incoming: call buttons ── */}
          {phase === 'incoming' && (
            <View style={styles.callBtns}>
              <View style={styles.btnCol}>
                <Animated.View style={[styles.callBtn, styles.declineBtn, declineBtnStyle]}>
                  <Pressable onPress={handleDecline} style={styles.btnTouchable}>
                    <Text style={styles.callIcon}>📵</Text>
                  </Pressable>
                </Animated.View>
                <Text style={styles.btnLabel}>거절</Text>
              </View>

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

          {phase === 'active' && (
            <Pressable onPress={handleDecline} style={styles.endCallBtn}>
              <Text style={styles.endCallText}>📵  통화 종료</Text>
            </Pressable>
          )}

        </Animated.View>
        </ScrollView>
      </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10,13,26,0.97)',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  card: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  callerName: { fontSize: 22, fontWeight: '700', color: '#F1F5F9', letterSpacing: -0.3 },
  statusText: { fontSize: 14, color: Colors.TEXT_MUTED, letterSpacing: 0.2 },
  progressTrack: {
    width: '100%', height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 4,
  },
  progressFill: { height: '100%', borderRadius: 2, overflow: 'hidden' },
  questionCard: {
    width: '100%',
    backgroundColor: Colors.CARD_DARK_SLATE,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(124,58,237,0.35)',
  },
  confirmLabel: { fontSize: 12, color: Colors.TEXT_MUTED, fontWeight: '600' },
  questionText: { fontSize: 15, color: '#F1F5F9', fontWeight: '500', lineHeight: 23, fontStyle: 'italic' },
  micText: { fontSize: 13, color: '#22C55E', fontWeight: '600', marginTop: 2 },
  switchModeText: { fontSize: 12, color: Colors.TEXT_MUTED, textAlign: 'center', marginTop: 4, textDecorationLine: 'underline' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20,
    backgroundColor: 'rgba(124,58,237,0.18)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)',
  },
  chipText: { fontSize: 13, color: '#E9D5FF', fontWeight: '500' },
  confirmRow: { flexDirection: 'row', gap: 10 },
  confirmYesBtn: {
    alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20,
    backgroundColor: '#22C55E',
  },
  confirmYesText: { fontSize: 14, color: '#052e13', fontWeight: '700' },
  confirmOtherLabel: { fontSize: 12, color: Colors.TEXT_MUTED, marginTop: 2 },
  textInput: {
    minHeight: 60, maxHeight: 120, color: '#F1F5F9', fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  completionBox: { alignItems: 'center', gap: 14, marginTop: 8 },
  completionEmoji: { fontSize: 64 },
  completionText: { fontSize: 15, color: '#F1F5F9', fontWeight: '500', textAlign: 'center', lineHeight: 22 },
  completionSubText: { fontSize: 12, color: Colors.TEXT_MUTED, textAlign: 'center', marginTop: -4 },
  callBtns: { flexDirection: 'row', gap: 88, marginTop: 36, alignItems: 'flex-start' },
  btnCol: { alignItems: 'center', gap: 10 },
  acceptWrapper: { width: BTN_SIZE, height: BTN_SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: BTN_SIZE, height: BTN_SIZE, borderRadius: BTN_SIZE / 2, backgroundColor: 'rgba(34,197,94,0.28)' },
  callBtn: {
    width: BTN_SIZE, height: BTN_SIZE, borderRadius: BTN_SIZE / 2, alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 18, elevation: 10,
  },
  acceptBtn: { backgroundColor: '#22C55E', shadowColor: '#22C55E', shadowOpacity: 0.55 },
  declineBtn: { backgroundColor: Colors.ALERT_SIREN_RED, shadowColor: Colors.ALERT_SIREN_RED, shadowOpacity: 0.45 },
  btnTouchable: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: BTN_SIZE / 2 },
  callIcon: { fontSize: 28 },
  btnLabel: { fontSize: 13, color: Colors.TEXT_MUTED, fontWeight: '500' },
  endCallBtn: {
    marginTop: 24, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 28,
    backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
  },
  endCallText: { fontSize: 15, color: Colors.ALERT_SIREN_RED, fontWeight: '600' },
});
