import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { maskPII, useAppContext } from '../../src/context/AppContext';
import { ChatStyleProfile } from '../../src/lib/kakaoParser';
import { useChatStream, ChatStreamReturn, ToneAlert } from '../../src/hooks/useChatStream';
import { WeeklyReportModal, ReportCardBubble } from '../../src/components/chat/WeeklyReportModal';
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
type MessageType = 'normal' | 'nudge' | 'report_card';
type ToneFeedback = 'too_warm' | 'too_cold' | 'no_humor';

interface ToneWeight { warmth: number; humor: number }

interface Message {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: number;
  type: MessageType;
}

// ─── Crisis detection (FUN-CHA-003) ──────────────────────────────────────────

const CRISIS_KEYWORDS = [
  '헤어져', '헤어지자', '헤어질', '짜증나', '짜증났', '너무하네',
  '싸웠어', '연락하지마', '그만하자', '더 이상', '지쳐',
];
function detectCrisis(text: string) {
  return CRISIS_KEYWORDS.some((kw) => text.includes(kw));
}

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

// ─── Mock AI replies ──────────────────────────────────────────────────────────

const REPLIES_WARM = [
  '응~ 나도 생각하고 있었어. 오늘 어떻게 지냈어?',
  '맞아 정말 그렇지. 나 진짜 요즘 너 보고 싶었는데.',
  '아 진짜? 나 그 얘기 들으니까 마음이 좀 놓이네. 다행이다.',
  '너 그럴 때 진짜 귀여워 알지?',
  '오늘 같이 있었으면 좋았을 텐데. 다음엔 꼭 같이 가자.',
];
const REPLIES_NEUTRAL = [
  '그거 진짜야? 나도 비슷한 거 느꼈어.',
  '헉 그랬어? 힘들었겠다. 고생했어.',
  '아, 그렇구나. 그 부분에 대해 좀 더 얘기해줘.',
  '음… 어떻게 됐어? 결국에는?',
  '그래. 나도 그 부분은 좀 생각해봐야겠다.',
];
const REPLIES_FORMAL = [
  '그 상황이 어떻게 전개됐는지 좀 더 설명해 줄 수 있어?',
  '맞아. 그 판단은 타당하다고 생각해.',
  '그 건에 대해서는 시간을 두고 생각해보는 게 좋겠어.',
  '알겠어. 내가 그 부분을 놓쳤네.',
];
const REPLIES_FUNNY = [
  '그거 진짜야? 역시 우리 통하나봐 ㅎㅎ',
  'ㅋㅋㅋ 아 그거 너무 웃기다. 진짜 그 사람 왜 그래?',
  '아 ㅋㅋ 맞아 나 그때 진짜 참았잖아. 지금 생각해도 웃겨.',
  '헐 진짜?? ㅋㅋㅋ 그 말을 진짜 한 거야?',
];
const ANALYST_REPLIES = [
  '최근 대화 패턴 분석 결과, 두 분의 공감 지수가 87%로 상당히 높게 측정됩니다. 좋은 신호예요! 🎯',
  '오늘 대화에서 상대방의 감정 온도가 약간 낮게 감지됩니다. 따뜻한 한마디가 효과적일 것 같아요.',
  '커플 갈등 예방 팁: 하루 한 번, 오늘 있었던 작은 행복을 공유해보세요.',
  '이번 주 두 분의 대화 감성 스코어: 긍정 78% / 중립 18% / 부정 4%. 매우 건강한 상태입니다! ✨',
];

function mockAIReplyWithWeight(_: string[], room: RoomType, w: ToneWeight): string {
  if (room === 'analyst') return ANALYST_REPLIES[Math.floor(Math.random() * ANALYST_REPLIES.length)];
  if (w.humor > 1) return REPLIES_FUNNY[Math.floor(Math.random() * REPLIES_FUNNY.length)];
  if (w.warmth < -1) return REPLIES_FORMAL[Math.floor(Math.random() * REPLIES_FORMAL.length)];
  if (w.warmth > 1) return REPLIES_WARM[Math.floor(Math.random() * REPLIES_WARM.length)];
  return REPLIES_NEUTRAL[Math.floor(Math.random() * REPLIES_NEUTRAL.length)];
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────

function TypingIndicator({ partnerName, t }: { partnerName: string; t: ThemeTokens }) {
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
      <Text style={[styles.typingLabel, { color: t.textMuted }]}>{partnerName} AI가 말하는 중...</Text>
      <View style={[styles.typingBubble, { backgroundColor: t.bubbleAI, borderColor: t.isLight ? 'rgba(180,140,200,0.3)' : '#4C2B8A' }]}>
        <Animated.View style={[styles.dot, s1]} />
        <Animated.View style={[styles.dot, s2]} />
        <Animated.View style={[styles.dot, s3]} />
      </View>
    </View>
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

// ─── [NEW] Sensitive Warning Banner ───────────────────────────────────────────

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

// ─── [NEW] Tone Guide Popup (Drop-in for AI room) ─────────────────────────────

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

// ─── [NEW] Attachment Bar (partner room) ─────────────────────────────────────

function AttachmentBar({ partnerName }: { partnerName: string }) {
  const toast = (label: string) => Alert.alert(`${label} 첨부`, `${partnerName}님께 ${label}을 보내는 기능은 정식 출시 버전에서 제공됩니다.`);
  return (
    <View style={styles.attachBar}>
      <Pressable style={styles.attachBtn} onPress={() => toast('사진')}>
        <Text style={styles.attachBtnIcon}>📷</Text>
        <Text style={styles.attachBtnLabel}>갤러리</Text>
      </Pressable>
      <Pressable style={styles.attachBtn} onPress={() => toast('영상')}>
        <Text style={styles.attachBtnIcon}>🎬</Text>
        <Text style={styles.attachBtnLabel}>동영상</Text>
      </Pressable>
      <Pressable style={styles.attachBtn} onPress={() => toast('위치')}>
        <Text style={styles.attachBtnIcon}>📍</Text>
        <Text style={styles.attachBtnLabel}>위치 공유</Text>
      </Pressable>
      <Pressable style={styles.attachBtn} onPress={() => toast('선물')}>
        <Text style={styles.attachBtnIcon}>🎁</Text>
        <Text style={styles.attachBtnLabel}>선물</Text>
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
              <TouchableOpacity key={opt.id} style={[styles.feedbackChip, { backgroundColor: isActive ? `${Colors.GRADIENT_START}22` : t.inputBg, borderColor: isActive ? Colors.GRADIENT_START : t.divider, borderWidth: isActive ? 1.5 : 1 }]} onPress={() => setSelected(opt.id)} activeOpacity={0.75}>
                <Text style={[styles.feedbackChipText, { color: isActive ? Colors.GRADIENT_START : t.text }]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity style={[styles.sheetSubmitBtn, { backgroundColor: selected ? Colors.GRADIENT_START : t.inputBg, opacity: selected ? 1 : 0.45 }]} disabled={!selected} onPress={() => { if (selected) onSelect(selected); }} activeOpacity={0.8}>
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

function CrisisMode({ visible, partnerName, onClose }: { visible: boolean; partnerName: string; onClose: () => void }) {
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
            <Text style={styles.crisisReflectionText}>방금 전 {partnerName}이의 대화에 당신이 보낸 문장은 {partnerName}이에게 단순한 반박을 넘어 <Text style={styles.crisisHighlight}>깊은 거절감을 주었을 확률이 84%</Text>입니다.</Text>
            <Text style={[styles.crisisReflectionText, { marginTop: 12 }]}>당신은 대화를 빨리 끝내기 위해 {partnerName}이의 서운함을 <Text style={styles.crisisHighlight}>'징징거림'으로 치부</Text>하지 않았나요?</Text>
          </View>
          <View style={styles.iMessageBox}>
            <Text style={styles.iMessageTitle}>💡 나-전달법(I-Message) 가이드</Text>
            <Text style={styles.iMessageText}><Text style={styles.iMessageBad}>{'❌  "너는 왜 항상 그래"'}</Text>{'\n'}<Text style={styles.iMessageGood}>{'✅  "나는 그 말을 들었을 때 많이 속상했어"'}</Text></Text>
            <Text style={styles.iMessageHint}>흥분이 가라앉은 후, 내 감정을 주어로 말해보세요.{'\n'}상대를 탓하지 않고 나의 감정을 전하는 것이 핵심입니다.</Text>
          </View>
          <TouchableOpacity style={styles.crisisActionBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.crisisActionText}>👉 내 대화 습관 인정하고 돌아가기</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message, isRegenerating, onLongPress, onReportCardPress, t,
}: {
  message: Message; isRegenerating: boolean;
  onLongPress: (msg: Message) => void;
  onReportCardPress: () => void;
  t: ThemeTokens;
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

  if (message.type === 'nudge') {
    return (
      <Animated.View style={[styles.nudgeBanner, animStyle]}>
        <Text style={styles.nudgeEmoji}>🔔</Text>
        <Text style={styles.nudgeText}>{message.text}</Text>
      </Animated.View>
    );
  }

  if (message.type === 'report_card') {
    return (
      <Animated.View style={[styles.bubbleRowAI, animStyle]}>
        <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
        <ReportCardBubble onPress={onReportCardPress} />
      </Animated.View>
    );
  }

  const userBg = t.isLight ? '#E8E0F5' : Colors.CARD_DARK_SLATE;
  const userTxt = t.isLight ? '#2D1B69' : Colors.TEXT_ON_DARK;
  const aiBg = t.isLight ? '#FFFFFF' : '#2D1B69';
  const aiBorder = t.isLight ? 'rgba(180,140,200,0.3)' : '#4C2B8A';
  const aiTxt = t.isLight ? '#1E293B' : '#E2D9FF';

  return (
    <Animated.View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAI, animStyle]}>
      {!isUser && <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>}
      <Pressable onLongPress={() => !isUser && onLongPress(message)} delayLongPress={400}>
        <View style={[styles.bubble, isUser ? [styles.bubbleUser, { backgroundColor: userBg }] : [styles.bubbleAI, { backgroundColor: aiBg, borderColor: aiBorder }]]}>
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
  const { chatStyleProfile, setChatStyleProfile, privacyLevel } = useAppContext();
  const profileRef = useRef<ChatStyleProfile>(chatStyleProfile);
  useEffect(() => { profileRef.current = chatStyleProfile; }, [chatStyleProfile]);

  const roomConfig = {
    partner: { name: partnerName, emoji: '❤️', badge: null as string | null, status: '실제 연인 채팅방', isReal: true },
    ai: { name: `${partnerName} AI`, emoji: '💜', badge: 'AI' as string | null, status: '트윈 AI · 말투 학습 완료', isReal: false },
    analyst: { name: '연애 분석가 트윈이', emoji: '🔬', badge: 'AI' as string | null, status: '갈등 감지 · 관계 리포트 전문', isReal: false },
  };
  const config = roomConfig[roomType];

  const getInitialMessages = (): Message[] => {
    if (roomType === 'partner') return [{ id: '0', role: 'ai', type: 'normal', timestamp: Date.now() - 60000, text: `이 채팅방은 ${partnerName}님과의 실제 대화 공간이에요. 카카오톡에서 직접 대화를 이어가세요! 💌` }];
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

  const toneWeightRef = useRef<ToneWeight>({ warmth: 0, humor: 0 });
  const flatListRef = useRef<FlatList>(null);
  const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessages = useRef<string[]>([]);
  const lastSendTimeRef = useRef<number>(0);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

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

  const triggerAIReply = useCallback((userTexts: string[]) => {
    const profile = profileRef.current;
    setIsTyping(true);
    const reply = mockAIReplyWithWeight(userTexts, roomType, toneWeightRef.current);
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
  }, [addMessage, roomType]);

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

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    streamState.checkSensitive(''); // clear sensitive warning on send

    const now = Date.now();
    const gap = lastSendTimeRef.current > 0 ? now - lastSendTimeRef.current : 0;
    lastSendTimeRef.current = now;

    addMessage({ id: `u-${now}`, role: 'user', text, timestamp: now, type: 'normal' });

    // Tap the message to the AI analysis stream (partner room only)
    if (roomType === 'partner') streamState.tapMessage(text);

    if (detectCrisis(text)) {
      setTimeout(() => setCrisisVisible(true), 400);
      return;
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
  }, [inputText, addMessage, triggerAIReply, config.isReal, applyRollingAverage, privacyLevel, roomType, streamState]);

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
      setTimeout(() => {
        const newText = mockAIReplyWithWeight([], roomType, toneWeightRef.current);
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: newText } : m)));
        setTimeout(() => setRegeneratingId(null), 80);
      }, 700);
    }
    if (newCount >= 3 && !nudgeTriggered) {
      setNudgeTriggered(true);
      setTimeout(() => {
        addMessage({ id: `nudge-${Date.now()}`, role: 'ai', text: '일일이 고치기 귀찮으시다면, 메인 탭에서 딱 10분만 전화를 받아보세요! 📞', timestamp: Date.now(), type: 'nudge' });
      }, 1200);
    }
    setSelectedMessage(null);
  }, [correctionCount, nudgeTriggered, selectedMessage, addMessage, roomType]);

  // Current tone alert to display (only in AI room, show one at a time)
  const currentToneAlert = roomType === 'ai' && streamState.pendingToneAlerts.length > 0
    ? streamState.pendingToneAlerts[0]
    : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
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
          <View style={styles.earlyModeToggle}>
            <Text style={[styles.earlyModeLabel, { color: t.textMuted }]}>연애 초기</Text>
            <View style={[styles.toggleTrack, { backgroundColor: t.card }]}><View style={styles.toggleKnob} /></View>
          </View>
        )}
      </View>

      {/* Profile HUD (AI rooms only) */}
      {roomType !== 'partner' && <ProfileHUD profile={chatStyleProfile} t={t} />}

      {/* Attachment bar (partner room) */}
      {roomType === 'partner' && showAttachBar && <AttachmentBar partnerName={partnerName} />}

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
              onLongPress={(msg) => {
                if (roomType !== 'partner') {
                  setSelectedMessage(msg);
                  setFeedbackVisible(true);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
              }}
            />
          )}
          ListFooterComponent={isTyping ? <TypingIndicator partnerName={partnerName} t={t} /> : null}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {/* Sensitive Warning Banner (above input, partner room) */}
        {roomType === 'partner' && streamState.sensitiveWarning && (
          <SensitiveWarningBanner
            message={streamState.sensitiveWarning.message}
            onDismiss={() => streamState.checkSensitive('')}
          />
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

      <ToneFeedbackSheet visible={feedbackVisible} t={t} onClose={() => { setFeedbackVisible(false); setSelectedMessage(null); }} onSelect={handleToneFeedback} />
      <CrisisMode visible={crisisVisible} partnerName={partnerName} onClose={() => setCrisisVisible(false)} />
    </SafeAreaView>
  );
}

// ─── [NEW] Gradient Glow Avatar (partner row) ─────────────────────────────────

function PartnerGlowAvatar({ emoji, t }: { emoji: string; t: ThemeTokens }) {
  return (
    <LinearGradient
      colors={['#FF6B8B', '#D946EF', '#7C3AED']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
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
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, { color: t.text }]}>채팅</Text>
        <View style={styles.earlyModeBadge}>
          <Text style={[styles.earlyModeBadgeText, { color: t.textMuted }]}>연애 초기 모드</Text>
          <View style={[styles.toggleTrack, { backgroundColor: t.card }]}><View style={styles.toggleKnob} /></View>
        </View>
      </View>
      <View style={[styles.listDivider, { backgroundColor: t.divider }]} />

      <Animated.View entering={FadeIn.duration(300)} style={styles.dmList}>
        {/* Room 1: Partner (top-pinned, gradient glow) */}
        <Animated.View entering={FadeInRight.delay(0).duration(300)}>
          <DMRow
            emoji="❤️" name={partnerName}
            preview="카카오톡 연동 · 실제 연인 채팅방" time="지금"
            onPress={() => onEnterRoom('partner')} t={t} isPartner
          />
        </Animated.View>

        {/* Divider + "AI" label */}
        <View style={[styles.aiSectionLabel, { borderTopColor: t.divider }]}>
          <View style={[styles.aiSectionLine, { backgroundColor: t.divider }]} />
          <View style={styles.aiSectionBadge}>
            <Text style={styles.aiSectionBadgeText}>AI 어시스턴트</Text>
          </View>
          <View style={[styles.aiSectionLine, { backgroundColor: t.divider }]} />
        </View>

        {/* Room 2: Self-AI (tone alert badge) */}
        <Animated.View entering={FadeInRight.delay(100).duration(300)}>
          <DMRow
            emoji="💜" name={`${partnerName} AI`} badge="AI"
            preview={`안녕~ 나야 ${partnerName} AI ⚡ 보고 싶었어 🥺`} time="방금"
            onPress={() => onEnterRoom('ai')} t={t}
            alertCount={toneAlertCount > 0 ? toneAlertCount : undefined}
          />
        </Animated.View>
        <View style={[styles.rowDivider, { backgroundColor: t.divider }]} />

        {/* Room 3: Analyst chatbot */}
        <Animated.View entering={FadeInRight.delay(180).duration(300)}>
          <DMRow
            emoji="🔬" name="분석가 트윈이 💬" badge="AI"
            preview="📊 이번 주 연애 리포트가 도착했어요!" time="어제"
            onPress={() => onEnterRoom('analyst')} t={t}
          />
        </Animated.View>
      </Animated.View>

      {/* Tip box */}
      <View style={styles.tipBox}>
        <Text style={styles.tipText}>
          💡 커플 방에서 날카로운 말투가 감지되면, AI 방에서 실시간 말투 가이드를 받아보세요.
        </Text>
      </View>
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
  aiSectionLabel: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base,
    paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, gap: 8,
  },
  aiSectionLine: { flex: 1, height: StyleSheet.hairlineWidth },
  aiSectionBadge: {
    backgroundColor: `${Colors.BADGE_AI_BLUE}18`, borderRadius: Radius.pill,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: `${Colors.BADGE_AI_BLUE}35`,
  },
  aiSectionBadgeText: { color: Colors.BADGE_AI_BLUE, fontSize: 9, fontWeight: FontWeight.semibold },

  // DM Row
  dmRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.md },
  dmAvatarWrap: { position: 'relative', width: 52, height: 52 },
  dmAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  dmAvatarEmoji: { fontSize: 26 },

  // Gradient glow avatar
  partnerGlowRing: { width: 52, height: 52, borderRadius: 26, padding: 2.5 },
  partnerGlowInner: { flex: 1, borderRadius: 23.5, alignItems: 'center', justifyContent: 'center' },

  // Badges
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
  earlyModeToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  earlyModeLabel: { fontSize: FontSize.xs },
  toggleTrack: { width: 32, height: 18, borderRadius: 9, justifyContent: 'center', paddingHorizontal: 2 },
  toggleKnob: { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.TEXT_MUTED },

  // Attach toggle
  attachToggleBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  attachToggleText: { fontSize: 22, lineHeight: 24, fontWeight: FontWeight.bold },

  // Attach bar
  attachBar: { flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.base, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(124,58,237,0.15)', backgroundColor: 'rgba(124,58,237,0.04)' },
  attachBtn: { alignItems: 'center', gap: 3 },
  attachBtnIcon: { fontSize: 24 },
  attachBtnLabel: { fontSize: 9, color: Colors.TEXT_MUTED },

  // Profile HUD
  hudRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: Spacing.base, borderBottomWidth: 1 },
  hudText: { fontSize: 10, fontWeight: FontWeight.medium },
  hudDivider: { fontSize: 10 },

  // Sensitive Warning Banner
  sensitiveBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: Spacing.base, marginBottom: 4,
    backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: Radius.md,
    padding: Spacing.sm, paddingHorizontal: Spacing.md,
    borderWidth: 1.5, borderColor: 'rgba(251,191,36,0.45)',
  },
  sensitiveIcon: { fontSize: 14 },
  sensitiveText: { flex: 1, color: '#FDE68A', fontSize: FontSize.xs, lineHeight: 17 },
  sensitiveDismiss: { padding: 4 },
  sensitiveDismissText: { color: '#FBBF24', fontSize: 12 },

  // Tone Guide Popup (Drop-in)
  tonePopup: {
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    backgroundColor: 'rgba(30,41,59,0.95)',
    borderRadius: Radius.xl,
    padding: Spacing.base,
    borderWidth: 1.5, borderColor: 'rgba(56,189,248,0.35)',
    ...Shadows.subtle,
  },
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

  // Bottom Sheet
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
