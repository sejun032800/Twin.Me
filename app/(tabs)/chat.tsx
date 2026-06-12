import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext } from '../../src/context/AppContext';
import { ChatStyleProfile } from '../../src/lib/kakaoParser';
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
type MessageType = 'normal' | 'nudge';
type ToneFeedback = 'too_warm' | 'too_cold' | 'no_humor';

interface ToneWeight {
  warmth: number;
  humor: number;
}

interface Message {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: number;
  type: MessageType;
}

// ─── Crisis keywords ──────────────────────────────────────────────────────────

const CRISIS_KEYWORDS = [
  '헤어져', '헤어지자', '헤어질', '짜증나', '짜증났', '너무하네',
  '싸웠어', '연락하지마', '그만하자', '더 이상', '지쳐',
];

function detectCrisis(text: string): boolean {
  return CRISIS_KEYWORDS.some((kw) => text.includes(kw));
}

// ─── Dynamic Output Splitter (FUN-CHA-001) ────────────────────────────────────

function findBreakPoint(text: string, near: number): number {
  for (let offset = 0; offset <= 15; offset++) {
    if (near + offset < text.length && /[\s,.!?]/.test(text[near + offset])) return near + offset + 1;
    if (near - offset >= 0 && /[\s,.!?]/.test(text[near - offset])) return near - offset + 1;
  }
  return near;
}

function dynamicSplitReply(text: string, profile: ChatStyleProfile): string[] {
  const { avgCharsPerBubble, splitTriggerPatterns } = profile;

  if (text.length <= Math.max(avgCharsPerBubble, 8)) return [text];

  // Collect split-candidate positions: after trigger patterns + standard punctuation
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

  // Walk forward placing split points every ~avgCharsPerBubble chars
  const result: string[] = [];
  let start = 0;
  let nextTarget = avgCharsPerBubble;

  for (const pos of unique) {
    if (pos >= nextTarget && pos - start >= 4) {
      result.push(text.slice(start, pos).trim());
      start = pos;
      nextTarget = pos + avgCharsPerBubble;
      if (result.length >= 3) break; // cap at 4 bubbles
    }
  }
  result.push(text.slice(start).trim());
  return result.filter(Boolean);
}

// ─── Typing delay formula: charCount × typingSpeedFactor + burstInterval × 0.5
function calcBubbleDelay(text: string, profile: ChatStyleProfile): number {
  const charDelay = text.length * profile.typingSpeedFactor;
  const burstComponent = profile.burstInterval * 0.5;
  return Math.min(charDelay + burstComponent, 3500);
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

function mockAIReplyWithWeight(
  _userMessages: string[],
  roomType: RoomType,
  weight: ToneWeight,
): string {
  if (roomType === 'analyst') {
    return ANALYST_REPLIES[Math.floor(Math.random() * ANALYST_REPLIES.length)];
  }
  let pool: string[];
  if (weight.humor > 1) pool = REPLIES_FUNNY;
  else if (weight.warmth < -1) pool = REPLIES_FORMAL;
  else if (weight.warmth > 1) pool = REPLIES_WARM;
  else pool = REPLIES_NEUTRAL;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────

function TypingIndicator({ partnerName, t }: { partnerName: string; t: ThemeTokens }) {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    const bounce = (sv: typeof dot1, delay: number) => {
      setTimeout(() => {
        sv.value = withRepeat(
          withSequence(
            withSpring(-6, { damping: 4, stiffness: 200 }),
            withSpring(0, { damping: 4, stiffness: 200 }),
          ),
          -1,
          false,
        );
      }, delay);
    };
    bounce(dot1, 0);
    bounce(dot2, 160);
    bounce(dot3, 320);
  }, [dot1, dot2, dot3]);

  const s1 = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ translateY: dot3.value }] }));

  return (
    <View style={styles.typingWrapper}>
      <Text style={[styles.typingLabel, { color: t.textMuted }]}>
        {partnerName} AI가 말하는 중...
      </Text>
      <View
        style={[
          styles.typingBubble,
          {
            backgroundColor: t.bubbleAI,
            borderColor: t.isLight ? 'rgba(180,140,200,0.3)' : '#4C2B8A',
          },
        ]}
      >
        <Animated.View style={[styles.dot, s1]} />
        <Animated.View style={[styles.dot, s2]} />
        <Animated.View style={[styles.dot, s3]} />
      </View>
    </View>
  );
}

// ─── Profile HUD (shows live profile stats) ──────────────────────────────────

function ProfileHUD({ profile, t }: { profile: ChatStyleProfile; t: ThemeTokens }) {
  return (
    <View style={[styles.hudRow, { backgroundColor: t.isLight ? 'rgba(56,189,248,0.06)' : 'rgba(56,189,248,0.04)', borderColor: 'rgba(56,189,248,0.18)' }]}>
      <Text style={[styles.hudText, { color: t.textMuted }]}>
        ⏱ {profile.burstInterval}ms
      </Text>
      <Text style={[styles.hudDivider, { color: t.divider }]}>·</Text>
      <Text style={[styles.hudText, { color: t.textMuted }]}>
        📝 {profile.avgCharsPerBubble}자
      </Text>
      <Text style={[styles.hudDivider, { color: t.divider }]}>·</Text>
      <Text style={[styles.hudText, { color: t.textMuted }]}>
        ⌨️ {profile.typingSpeedFactor}ms/자
      </Text>
    </View>
  );
}

// ─── Tone Feedback Options ────────────────────────────────────────────────────

const TONE_OPTIONS: { id: ToneFeedback; label: string; weight: Partial<ToneWeight> }[] = [
  { id: 'too_warm', label: '너무 다정함 🌸', weight: { warmth: -1 } },
  { id: 'too_cold', label: '너무 딱딱함 🧊', weight: { warmth: 1 } },
  { id: 'no_humor', label: '유머 코드 안 맞음 😶', weight: { humor: 1 } },
];

// ─── Feedback Bottom Sheet (FUN-CHA-002) ──────────────────────────────────────

function ToneFeedbackSheet({
  visible,
  onClose,
  onSelect,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (fb: ToneFeedback) => void;
  t: ThemeTokens;
}) {
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
      <Animated.View
        style={[styles.bottomSheet, { backgroundColor: t.card, borderColor: t.divider }, sheetStyle]}
      >
        <View style={styles.sheetHandle} />
        <Text style={[styles.sheetTitle, { color: t.text }]}>🤖 말투 교정하기</Text>
        <Text style={[styles.sheetSubtitle, { color: t.textMuted }]}>
          어떤 부분이 어색했나요? 즉시 답변을 재생성합니다.
        </Text>
        <View style={styles.feedbackChips}>
          {TONE_OPTIONS.map((opt) => {
            const isActive = selected === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.feedbackChip,
                  {
                    backgroundColor: isActive ? `${Colors.GRADIENT_START}22` : t.inputBg,
                    borderColor: isActive ? Colors.GRADIENT_START : t.divider,
                    borderWidth: isActive ? 1.5 : 1,
                  },
                ]}
                onPress={() => setSelected(opt.id)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.feedbackChipText,
                    { color: isActive ? Colors.GRADIENT_START : t.text },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          style={[
            styles.sheetSubmitBtn,
            { backgroundColor: selected ? Colors.GRADIENT_START : t.inputBg, opacity: selected ? 1 : 0.45 },
          ]}
          disabled={!selected}
          onPress={() => { if (selected) onSelect(selected); }}
          activeOpacity={0.8}
        >
          <Text style={[styles.sheetSubmitText, { color: selected ? '#fff' : t.textMuted }]}>
            교정 적용하기
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sheetCloseBtn} onPress={onClose}>
          <Text style={[styles.sheetCloseBtnText, { color: t.textMuted }]}>닫기</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Crisis Mode (FUN-CHA-003) — 반성의 거울 ──────────────────────────────────

function CrisisMode({
  visible,
  partnerName,
  onClose,
}: {
  visible: boolean;
  partnerName: string;
  onClose: () => void;
}) {
  const pulseOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.88);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 900 }),
          withTiming(0.15, { duration: 900 }),
        ),
        -1,
        false,
      );
      cardScale.value = withSpring(1, { damping: 16, stiffness: 180 });
      cardOpacity.value = withTiming(1, { duration: 350 });

      const doubleBoom = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 220);
      };
      doubleBoom();
      setTimeout(doubleBoom, 1300);
      setTimeout(doubleBoom, 2700);
    } else {
      pulseOpacity.value = withTiming(0, { duration: 300 });
      cardOpacity.value = withTiming(0, { duration: 200 });
      cardScale.value = withTiming(0.88, { duration: 200 });
    }
  }, [visible, pulseOpacity, cardScale, cardOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.crisisOverlay]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.crisisWineGlow, pulseStyle]} />
      <Animated.View style={[styles.crisisCard, cardStyle]}>
        <View style={styles.crisisWineLine} />
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          <Text style={styles.crisisTitleText}>
            잠시 대화를 멈추고{'\n'}거울을 바라보세요
          </Text>
          <View style={styles.crisisDivider} />
          <View style={styles.crisisReflectionBox}>
            <Text style={styles.crisisReflectionText}>
              방금 전 {partnerName}이의 대화에 당신이 보낸 문장은 {partnerName}이에게{' '}
              단순한 반박을 넘어{' '}
              <Text style={styles.crisisHighlight}>깊은 거절감을 주었을 확률이 84%</Text>
              입니다.
            </Text>
            <Text style={[styles.crisisReflectionText, { marginTop: 12 }]}>
              당신은 대화를 빨리 끝내기 위해 {partnerName}이의 서운함을{' '}
              <Text style={styles.crisisHighlight}>'징징거림'으로 치부</Text>
              하지 않았나요?
            </Text>
          </View>
          <View style={styles.iMessageBox}>
            <Text style={styles.iMessageTitle}>💡 나-전달법(I-Message) 가이드</Text>
            <Text style={styles.iMessageText}>
              <Text style={styles.iMessageBad}>{'❌  "너는 왜 항상 그래"'}</Text>
              {'\n'}
              <Text style={styles.iMessageGood}>{'✅  "나는 그 말을 들었을 때 많이 속상했어"'}</Text>
            </Text>
            <Text style={styles.iMessageHint}>
              흥분이 가라앉은 후, 내 감정을 주어로 말해보세요.{'\n'}
              상대를 탓하지 않고 나의 감정을 전하는 것이 핵심입니다.
            </Text>
          </View>
          <TouchableOpacity style={styles.crisisActionBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.crisisActionText}>
              👉 내 대화 습관 인정하고 돌아가기
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isRegenerating,
  onLongPress,
  t,
}: {
  message: Message;
  isRegenerating: boolean;
  onLongPress: (msg: Message) => void;
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
    opacity.value = withTiming(isRegenerating ? 0.25 : 1, {
      duration: isRegenerating ? 280 : 350,
    });
  }, [isRegenerating, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (message.type === 'nudge') {
    return (
      <Animated.View style={[styles.nudgeBanner, animStyle]}>
        <Text style={styles.nudgeEmoji}>🔔</Text>
        <Text style={styles.nudgeText}>{message.text}</Text>
      </Animated.View>
    );
  }

  const userBubbleBg = t.isLight ? '#E8E0F5' : Colors.CARD_DARK_SLATE;
  const userBubbleText = t.isLight ? '#2D1B69' : Colors.TEXT_ON_DARK;
  const aiBubbleBg = t.isLight ? '#FFFFFF' : '#2D1B69';
  const aiBubbleBorder = t.isLight ? 'rgba(180,140,200,0.3)' : '#4C2B8A';
  const aiBubbleText = t.isLight ? '#1E293B' : '#E2D9FF';

  return (
    <Animated.View
      style={[
        styles.bubbleRow,
        isUser ? styles.bubbleRowUser : styles.bubbleRowAI,
        animStyle,
      ]}
    >
      {!isUser && (
        <View style={styles.aiBadge}>
          <Text style={styles.aiBadgeText}>AI</Text>
        </View>
      )}
      <Pressable onLongPress={() => !isUser && onLongPress(message)} delayLongPress={400}>
        <View
          style={[
            styles.bubble,
            isUser
              ? [styles.bubbleUser, { backgroundColor: userBubbleBg }]
              : [styles.bubbleAI, { backgroundColor: aiBubbleBg, borderColor: aiBubbleBorder }],
          ]}
        >
          <Text style={[styles.bubbleText, { color: isUser ? userBubbleText : aiBubbleText }]}>
            {message.text}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Chat Room View ───────────────────────────────────────────────────────────

const ALPHA = 0.1; // rolling average weight for continuous learning

function ChatRoomView({
  roomType,
  partnerName,
  onBack,
  t,
}: {
  roomType: RoomType;
  partnerName: string;
  onBack: () => void;
  t: ThemeTokens;
}) {
  const { chatStyleProfile, setChatStyleProfile } = useAppContext();

  // Ref-mirror so callbacks never go stale
  const profileRef = useRef<ChatStyleProfile>(chatStyleProfile);
  useEffect(() => { profileRef.current = chatStyleProfile; }, [chatStyleProfile]);

  const roomConfig = {
    partner: {
      name: partnerName, emoji: '❤️', badge: null as string | null,
      status: '실제 연인 채팅방', isReal: true,
    },
    ai: {
      name: `${partnerName} AI`, emoji: '💜', badge: 'AI' as string | null,
      status: '트윈 AI · 말투 학습 완료', isReal: false,
    },
    analyst: {
      name: '연애 분석가 트윈이', emoji: '🔬', badge: 'AI' as string | null,
      status: '갈등 감지 · 관계 리포트 전문', isReal: false,
    },
  };

  const config = roomConfig[roomType];

  const getInitialMessage = (): Message => {
    if (roomType === 'partner') return {
      id: '0', role: 'ai', type: 'normal', timestamp: Date.now() - 60000,
      text: `이 채팅방은 ${partnerName}님과의 실제 대화 공간이에요. 카카오톡에서 직접 대화를 이어가세요! 💌`,
    };
    if (roomType === 'analyst') return {
      id: '0', role: 'ai', type: 'normal', timestamp: Date.now() - 60000,
      text: `안녕하세요! 저는 연애 분석가 트윈이예요 🔬\n두 분의 관계를 분석하고, 더 행복한 연애를 도와드릴게요.`,
    };
    return {
      id: '0', role: 'ai', type: 'normal', timestamp: Date.now() - 60000,
      text: `안녕~ 나야 ${partnerName} AI ⚡ 보고 싶었어 🥺`,
    };
  };

  const [messages, setMessages] = useState<Message[]>([getInitialMessage()]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [crisisVisible, setCrisisVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [correctionCount, setCorrectionCount] = useState(0);
  const [nudgeTriggered, setNudgeTriggered] = useState(false);

  const toneWeightRef = useRef<ToneWeight>({ warmth: 0, humor: 0 });
  const flatListRef = useRef<FlatList>(null);
  const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessages = useRef<string[]>([]);
  const lastSendTimeRef = useRef<number>(0);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  const triggerAIReply = useCallback(
    (userTexts: string[]) => {
      const profile = profileRef.current;
      setIsTyping(true);
      const reply = mockAIReplyWithWeight(userTexts, roomType, toneWeightRef.current);
      const parts = dynamicSplitReply(reply, profile);

      let cumDelay = Math.round(profile.burstInterval * 0.4);
      parts.forEach((part, i) => {
        const partDelay = cumDelay;
        setTimeout(() => {
          if (i === parts.length - 1) setIsTyping(false);
          addMessage({
            id: `ai-${Date.now()}-${i}`,
            role: 'ai',
            text: part,
            timestamp: Date.now(),
            type: 'normal',
          });
        }, partDelay);
        cumDelay += calcBubbleDelay(part, profile);
      });
    },
    [addMessage, roomType],
  );

  // ── Rolling-average updater (Continuous Learning) ──────────────────────────
  const applyRollingAverage = useCallback(
    (text: string, gapMs: number) => {
      const p = profileRef.current;
      const charCount = text.replace(/\s/g, '').length || 1;
      const ending = text.trimEnd().slice(-3).trim();

      const newBurst = Math.round(
        Math.max(800, Math.min(5000, p.burstInterval * (1 - ALPHA) + gapMs * ALPHA))
      );
      const newAvgChars = Math.round(
        Math.max(3, Math.min(80, p.avgCharsPerBubble * (1 - ALPHA) + charCount * ALPHA))
      );
      const newSpeedFactor = Math.round(
        Math.max(30, Math.min(120, p.typingSpeedFactor * (1 - ALPHA) + (35 + charCount * 1.4) * ALPHA))
      );

      let patterns = [...p.splitTriggerPatterns];
      if (ending.length > 0 && !patterns.includes(ending)) {
        patterns = [ending, ...patterns].slice(0, 5);
      }

      setChatStyleProfile({
        burstInterval: newBurst,
        avgCharsPerBubble: newAvgChars,
        typingSpeedFactor: newSpeedFactor,
        splitTriggerPatterns: patterns,
      });
    },
    [setChatStyleProfile],
  );

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');

    const now = Date.now();
    const gap = lastSendTimeRef.current > 0 ? now - lastSendTimeRef.current : 0;
    lastSendTimeRef.current = now;

    addMessage({ id: `u-${now}`, role: 'user', text, timestamp: now, type: 'normal' });

    if (detectCrisis(text)) {
      setTimeout(() => setCrisisVisible(true), 400);
      return;
    }

    // Continuous learning: update profile from real typing behavior
    if (!config.isReal && gap > 200 && gap < 10_000) {
      applyRollingAverage(text, gap);
    }

    if (config.isReal) return;

    // Burst aggregation using dynamic burstInterval from profile
    pendingMessages.current.push(text);
    if (bufferTimer.current) clearTimeout(bufferTimer.current);
    bufferTimer.current = setTimeout(() => {
      const batch = [...pendingMessages.current];
      pendingMessages.current = [];
      triggerAIReply(batch);
    }, profileRef.current.burstInterval);
  }, [inputText, addMessage, triggerAIReply, config.isReal, applyRollingAverage]);

  const handleToneFeedback = useCallback(
    (fb: ToneFeedback) => {
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
        const msgId = selectedMessage.id;
        setRegeneratingId(msgId);
        setTimeout(() => {
          const newText = mockAIReplyWithWeight([], roomType, toneWeightRef.current);
          setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, text: newText } : m)));
          setTimeout(() => setRegeneratingId(null), 80);
        }, 700);
      }

      if (newCount >= 3 && !nudgeTriggered) {
        setNudgeTriggered(true);
        setTimeout(() => {
          addMessage({
            id: `nudge-${Date.now()}`,
            role: 'ai',
            text: '일일이 고치기 귀찮으시다면, 메인 탭에서 딱 10분만 전화를 받아보세요! 📞',
            timestamp: Date.now(),
            type: 'nudge',
          });
        }, 1200);
      }

      setSelectedMessage(null);
    },
    [correctionCount, nudgeTriggered, selectedMessage, addMessage, roomType],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: t.divider, backgroundColor: t.headerBg }]}>
        <View style={styles.headerLeft}>
          <Pressable style={[styles.backBtn, { backgroundColor: t.card }]} onPress={onBack}>
            <Text style={[styles.backBtnText, { color: t.text }]}>←</Text>
          </Pressable>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarEmoji}>{config.emoji}</Text>
            {config.badge && (
              <View style={styles.aiBadgeHeader}>
                <Text style={styles.aiBadgeHeaderText}>{config.badge}</Text>
              </View>
            )}
          </View>
          <View>
            <Text style={[styles.headerName, { color: t.text }]}>
              {config.name}{roomType === 'ai' ? ' ⚡' : ''}
            </Text>
            <Text style={[styles.headerStatus, { color: t.textMuted }]}>{config.status}</Text>
          </View>
        </View>
        {roomType === 'ai' && (
          <View style={styles.earlyModeToggle}>
            <Text style={[styles.earlyModeLabel, { color: t.textMuted }]}>연애 초기</Text>
            <View style={[styles.toggleTrack, { backgroundColor: t.card }]}>
              <View style={styles.toggleKnob} />
            </View>
          </View>
        )}
      </View>

      {/* Live profile HUD — only in AI rooms */}
      {roomType !== 'partner' && (
        <ProfileHUD profile={chatStyleProfile} t={t} />
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
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
              onLongPress={(msg) => {
                if (roomType !== 'partner') {
                  setSelectedMessage(msg);
                  setFeedbackVisible(true);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
              }}
            />
          )}
          ListFooterComponent={
            isTyping ? <TypingIndicator partnerName={partnerName} t={t} /> : null
          }
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        <View style={[styles.inputRow, { backgroundColor: t.bg, borderTopColor: t.divider }]}>
          <TextInput
            style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
            value={inputText}
            onChangeText={setInputText}
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
        visible={feedbackVisible}
        t={t}
        onClose={() => { setFeedbackVisible(false); setSelectedMessage(null); }}
        onSelect={handleToneFeedback}
      />
      <CrisisMode
        visible={crisisVisible}
        partnerName={partnerName}
        onClose={() => setCrisisVisible(false)}
      />
    </SafeAreaView>
  );
}

// ─── DM List Row ──────────────────────────────────────────────────────────────

function DMRow({
  emoji, name, badge, preview, time, onPress, t,
}: {
  emoji: string; name: string; badge?: string; preview: string;
  time: string; onPress: () => void; t: ThemeTokens;
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
          <View
            style={[
              styles.dmAvatar,
              {
                backgroundColor: t.card,
                borderColor: t.isLight ? 'rgba(180,140,200,0.4)' : 'rgba(124,58,237,0.3)',
              },
            ]}
          >
            <Text style={styles.dmAvatarEmoji}>{emoji}</Text>
          </View>
          {badge && (
            <View style={styles.dmBadge}>
              <Text style={styles.dmBadgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <View style={styles.dmInfo}>
          <View style={styles.dmNameRow}>
            <Text style={[styles.dmName, { color: t.text }]}>{name}</Text>
            <Text style={[styles.dmTime, { color: t.textMuted }]}>{time}</Text>
          </View>
          <Text style={[styles.dmPreview, { color: t.textSecondary }]} numberOfLines={1}>
            {preview}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── DM List View ─────────────────────────────────────────────────────────────

function DMListView({
  partnerName, onEnterRoom, t,
}: {
  partnerName: string;
  onEnterRoom: (room: RoomType) => void;
  t: ThemeTokens;
}) {
  const rooms: { type: RoomType; emoji: string; name: string; badge?: string; preview: string; time: string }[] = [
    { type: 'partner', emoji: '❤️', name: partnerName, preview: '카카오톡 연동 · 실제 연인 채팅방', time: '지금' },
    { type: 'ai', emoji: '💜', name: `${partnerName} AI`, badge: 'AI', preview: `안녕~ 나야 ${partnerName} AI ⚡ 보고 싶었어 🥺`, time: '방금' },
    { type: 'analyst', emoji: '🔬', name: '연애 분석가 트윈이', badge: 'AI', preview: '오늘 대화 감성 스코어: 긍정 78% ✨', time: '어제' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, { color: t.text }]}>채팅</Text>
        <View style={styles.earlyModeBadge}>
          <Text style={[styles.earlyModeBadgeText, { color: t.textMuted }]}>연애 초기 모드</Text>
          <View style={[styles.toggleTrack, { backgroundColor: t.card }]}>
            <View style={styles.toggleKnob} />
          </View>
        </View>
      </View>
      <View style={[styles.listDivider, { backgroundColor: t.divider }]} />
      <Animated.View entering={FadeIn.duration(300)} style={styles.dmList}>
        {rooms.map((room, i) => (
          <React.Fragment key={room.type}>
            <Animated.View entering={FadeInRight.delay(i * 80).duration(300)}>
              <DMRow {...room} onPress={() => onEnterRoom(room.type)} t={t} />
            </Animated.View>
            {i < rooms.length - 1 && (
              <View style={[styles.rowDivider, { backgroundColor: t.divider }]} />
            )}
          </React.Fragment>
        ))}
      </Animated.View>
      <View style={styles.tipBox}>
        <Text style={styles.tipText}>
          💡 AI 말풍선을 꾹 눌러 말투 교정 · 갈등 키워드 입력 시 성찰 모드 자동 활성화
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

  if (activeRoom !== null) {
    return (
      <ChatRoomView
        roomType={activeRoom}
        partnerName={partnerName}
        t={t}
        onBack={() => setActiveRoom(null)}
      />
    );
  }
  return (
    <DMListView partnerName={partnerName} onEnterRoom={(r) => setActiveRoom(r)} t={t} />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },

  // DM List
  listHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  listTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, letterSpacing: -0.5 },
  earlyModeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  earlyModeBadgeText: { fontSize: FontSize.xs },
  listDivider: { height: StyleSheet.hairlineWidth },
  dmList: { flex: 1 },
  dmRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.md,
  },
  dmAvatarWrap: { position: 'relative', width: 52, height: 52 },
  dmAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  dmAvatarEmoji: { fontSize: 26 },
  dmBadge: { position: 'absolute', bottom: -2, right: -4, backgroundColor: Colors.BADGE_AI_BLUE, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
  dmBadgeText: { fontSize: 8, fontWeight: FontWeight.bold, color: '#fff' },
  dmInfo: { flex: 1, gap: 4 },
  dmNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dmName: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  dmTime: { fontSize: FontSize.xs },
  dmPreview: { fontSize: FontSize.sm },
  rowDivider: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.base + 52 + Spacing.md },
  tipBox: {
    marginHorizontal: Spacing.base, marginBottom: 80,
    backgroundColor: 'rgba(56,189,248,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(56,189,248,0.2)',
  },
  tipText: { color: Colors.BADGE_AI_BLUE, fontSize: FontSize.xs, lineHeight: 18 },

  // Chat Room Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth,
  },
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

  // Profile HUD
  hudRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 5, paddingHorizontal: Spacing.base,
    borderBottomWidth: 1,
  },
  hudText: { fontSize: 10, fontWeight: FontWeight.medium },
  hudDivider: { fontSize: 10 },

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
  nudgeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: Spacing.xl, marginVertical: 6, padding: Spacing.md,
    backgroundColor: 'rgba(56,189,248,0.09)', borderRadius: Radius.md,
    borderWidth: 1, borderColor: 'rgba(56,189,248,0.35)',
  },
  nudgeEmoji: { fontSize: 18 },
  nudgeText: { flex: 1, fontSize: FontSize.sm, color: Colors.BADGE_AI_BLUE, lineHeight: 20 },

  // Typing indicator
  typingWrapper: { paddingHorizontal: Spacing.base, marginBottom: 8, marginLeft: 30, gap: 3 },
  typingLabel: { fontSize: FontSize.xs, marginLeft: 4 },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.lg,
    borderBottomLeftRadius: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4,
    alignSelf: 'flex-start', borderWidth: 1, minWidth: 64, justifyContent: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.BADGE_AI_BLUE },

  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, paddingBottom: Spacing.base,
    gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, borderRadius: Radius.pill, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm + 2, fontSize: FontSize.base, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.GRADIENT_START, alignItems: 'center', justifyContent: 'center', ...Shadows.subtle },
  sendBtnDisabled: { opacity: 0.35 },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: FontWeight.bold, marginTop: -1 },

  // Bottom Sheet
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: Radius['2xl'], borderTopRightRadius: Radius['2xl'],
    paddingHorizontal: Spacing.xl, paddingBottom: Spacing['3xl'], paddingTop: Spacing.md, borderTopWidth: 1,
  },
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
  crisisCard: {
    backgroundColor: 'rgba(15, 10, 40, 0.98)', borderRadius: Radius['2xl'],
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.xl,
    marginHorizontal: Spacing.lg, borderWidth: 1.5, borderColor: 'rgba(190, 18, 60, 0.5)',
    width: '90%', maxHeight: '86%', ...Shadows.card,
  },
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
