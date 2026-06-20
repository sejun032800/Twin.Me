// ─── KakaoTalkArchiveManager — Upload + Guide + Emotion Pipeline Trigger ─────
// Rendered inside chat.tsx ('+' button) and settings tab.
// Handles file picking, parse trigger, and persists to AppContext.highlightCards.

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useAppContext } from '../context/AppContext';
import {
  runEmotionHighlightPipeline,
  loadHighlightCards,
  EMOTION_META,
  type HighlightCard,
} from '../services/kakaoHighlightService';
import {
  requestNotificationPermission,
  scheduleDailyReminder,
  scheduleWeeklyQuoteReminder,
} from '../services/localNotificationService';
import { runKakaoSyncPipeline } from '../services/kakaoUploadService';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../styles/theme';

// ── re-export for convenience ────────────────────────────────────────────────
export { EMOTION_META };
export type { HighlightCard };

// ── Guide steps ──────────────────────────────────────────────────────────────

const GUIDE_STEPS = [
  { num: '1', text: '연인과의 카카오톡 채팅방 우측 상단 메뉴(☰) 선택' },
  { num: '2', text: '하단 우측 설정(톱니바퀴) 아이콘 클릭' },
  { num: '3', text: "'대화 내용 내보내기' 선택" },
  { num: '4', text: "'텍스트 메시지만 보내기' 선택 후 파일 저장" },
  { num: '5', text: '저장된 .txt 파일을 아래 버튼으로 업로드해주세요! 💌' },
];

// ── Loading pulsing dots ──────────────────────────────────────────────────────

function PulsingDots() {
  const op = useSharedValue(1);
  useEffect(() => {
    op.value = withRepeat(withTiming(0.2, { duration: 700 }), -1, true);
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: op.value }));
  return (
    <Animated.View style={[s.dotsRow, style]}>
      {['●', '●', '●'].map((d, i) => (
        <Text key={i} style={s.dot}>{d}</Text>
      ))}
    </Animated.View>
  );
}

// ── Emotion result card ────────────────────────────────────────────────────────

function EmotionResultCard({ card }: { card: HighlightCard }) {
  const meta = EMOTION_META[card.emotion];
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(card.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  };

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={[s.emotionCard, { borderColor: meta.color + '55' }]}>
      <View style={s.emotionCardHeader}>
        <Text style={s.emotionEmoji}>{meta.emoji}</Text>
        <Text style={[s.emotionLabel, { color: meta.color }]}>{meta.label}</Text>
        <Text style={s.emotionDate}>{card.date}</Text>
      </View>
      <Text style={s.emotionText}>"{card.text}"</Text>
      <Text style={s.emotionSpeaker}>{card.speaker}</Text>
      <Pressable style={s.copyBtn} onPress={handleCopy}>
        <Text style={[s.copyBtnText, copied && { color: '#4ADE80' }]}>
          {copied ? '✅ 복사됨' : '📋 복사하기'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
}

// ── Main Component ────────────────────────────────────────────────────────────

type Phase = 'idle' | 'picked' | 'processing' | 'done' | 'error';

export default function KakaoTalkArchiveManager({ visible, onClose }: Props) {
  const router = useRouter();
  const {
    myProfile,
    partnerProfile,
    lastKakaoSyncTimestamp,
    setLastKakaoSyncTimestamp,
    addMemorySentences,
    addHighlightCards,
    setHighlightCards,
    highlightCards,
  } = useAppContext();

  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState('');
  const [rawText, setRawText] = useState('');
  const [newCards, setNewCards] = useState<HighlightCard[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [processLabel, setProcessLabel] = useState('');

  // Hydrate from AsyncStorage on first open
  useEffect(() => {
    if (!visible) return;
    loadHighlightCards().then((cards) => {
      if (cards.length > 0) setHighlightCards(cards);
    });
  }, [visible]);

  const handlePickFile = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      let content: string;

      if (Platform.OS === 'web') {
        const res = await fetch(asset.uri);
        content = await res.text();
      } else {
        content = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      if (!content?.trim()) {
        setErrorMsg('파일 내용이 비어 있어요. 올바른 카카오톡 .txt 파일을 선택해주세요.');
        setPhase('error');
        return;
      }

      setRawText(content);
      setFileName(asset.name ?? 'kakao.txt');
      setPhase('picked');
      await Haptics.selectionAsync();
    } catch {
      setErrorMsg('파일을 읽는 중 오류가 발생했어요. 다시 시도해주세요.');
      setPhase('error');
    }
  };

  const handleProcess = async () => {
    if (!rawText) return;
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

    setPhase('processing');

    try {
      // Step A: run existing touching-moment sync
      setProcessLabel('AI가 감동적인 순간을 선별 중...');
      const syncResult = await runKakaoSyncPipeline(
        rawText,
        lastKakaoSyncTimestamp,
        5,
      );
      if (syncResult.newRecords.length > 0) {
        addMemorySentences(syncResult.newRecords);
      }
      if (syncResult.newLastTs) {
        setLastKakaoSyncTimestamp(syncResult.newLastTs);
      }

      // Step B: run 4-emotion classification
      setProcessLabel('4가지 감정으로 명대사 분류 중...');
      const emotionResult = await runEmotionHighlightPipeline(
        rawText,
        lastKakaoSyncTimestamp,
      );

      if (emotionResult.newCards.length > 0) {
        addHighlightCards(emotionResult.newCards);
        setNewCards(emotionResult.newCards);
      }

      // Step C: schedule notifications
      const granted = await requestNotificationPermission();
      if (granted && emotionResult.allCards.length > 0) {
        await scheduleDailyReminder(partnerProfile.name);
        await scheduleWeeklyQuoteReminder(emotionResult.allCards, partnerProfile.name);
      }

      setPhase('done');
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    } catch {
      setErrorMsg('처리 중 오류가 발생했어요. 다시 시도해주세요.');
      setPhase('error');
    }
  };

  const handleViewGallery = () => {
    onClose();
    router.push('/highlight-gallery');
  };

  const handleReset = () => {
    setPhase('idle');
    setFileName('');
    setRawText('');
    setNewCards([]);
    setErrorMsg('');
    setProcessLabel('');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={s.backdrop} onPress={onClose} />

      <View style={s.sheet}>
        <LinearGradient
          colors={['rgba(22,16,40,0.99)', 'rgba(10,13,26,1)']}
          style={s.inner}
        >
          {/* Handle */}
          <View style={s.handle} />

          {/* Header badge */}
          <LinearGradient
            colors={['#7C3AED', '#D946EF', '#FF6B8B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.headerBadge}
          >
            <Text style={s.headerEmoji}>💬</Text>
            <Text style={s.headerText}>카카오톡 추억 자산화</Text>
          </LinearGradient>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

            {/* ── IDLE / PICKED ── */}
            {(phase === 'idle' || phase === 'picked') && (
              <>
                <Animated.View entering={FadeIn.duration(400)}>
                  <Text style={s.sectionTitle}>📁 파일 업로드</Text>

                  {/* Upload zone */}
                  <Pressable
                    style={[s.uploadZone, phase === 'picked' && s.uploadZonePicked]}
                    onPress={phase === 'idle' ? handlePickFile : undefined}
                  >
                    <Text style={s.uploadIcon}>{phase === 'picked' ? '✅' : '📂'}</Text>
                    <Text style={[s.uploadTitle, phase === 'picked' && { color: Colors.GRADIENT_MID }]}>
                      {phase === 'picked' ? fileName : '카카오톡 .txt 파일 선택'}
                    </Text>
                    <Text style={s.uploadSub}>
                      {phase === 'picked'
                        ? '파일이 준비됐어요! 아래 버튼을 눌러주세요'
                        : '터치하여 파일 선택'}
                    </Text>
                  </Pressable>

                  {/* CTA */}
                  {phase === 'idle' ? (
                    <Pressable onPress={handlePickFile} style={s.ctaWrap}>
                      <LinearGradient
                        colors={['#7C3AED', '#D946EF', '#FF6B8B']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={s.ctaGrad}
                      >
                        <Text style={s.ctaTxt}>📁 파일 선택하기</Text>
                      </LinearGradient>
                    </Pressable>
                  ) : (
                    <Pressable onPress={handleProcess} style={s.ctaWrap}>
                      <LinearGradient
                        colors={['#7C3AED', '#D946EF', '#FF6B8B']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={s.ctaGrad}
                      >
                        <Text style={s.ctaTxt}>🧠 AI 감정 분석 시작하기</Text>
                      </LinearGradient>
                    </Pressable>
                  )}

                  {/* Guide */}
                  <View style={s.guideCard}>
                    <Text style={s.guideTitle}>📖 카카오톡 파일 내보내기 방법</Text>
                    {GUIDE_STEPS.map((step) => (
                      <View key={step.num} style={s.guideStep}>
                        <View style={s.guideNum}>
                          <Text style={s.guideNumText}>{step.num}</Text>
                        </View>
                        <Text style={s.guideStepText}>{step.text}</Text>
                      </View>
                    ))}
                    <View style={s.guideTip}>
                      <Text style={s.guideTipText}>
                        💡 메뉴(☰) → 설정(톱니바퀴) → 대화 내용 내보내기 → 텍스트 메시지만 보내기
                      </Text>
                    </View>
                  </View>

                  {/* Existing archive badge */}
                  {highlightCards.length > 0 && (
                    <Pressable style={s.archiveBadge} onPress={handleViewGallery}>
                      <LinearGradient
                        colors={['rgba(124,58,237,0.18)', 'rgba(217,70,239,0.12)']}
                        style={s.archiveBadgeInner}
                      >
                        <Text style={s.archiveBadgeEmoji}>🖼️</Text>
                        <Text style={s.archiveBadgeText}>
                          명대사 {highlightCards.length}개 저장됨 · 갤러리 보기 →
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  )}
                </Animated.View>
              </>
            )}

            {/* ── PROCESSING ── */}
            {phase === 'processing' && (
              <Animated.View entering={FadeIn.duration(300)} style={s.loadingBlock}>
                <ActivityIndicator size="large" color="#D946EF" />
                <Text style={s.loadingTitle}>AI가 분석 중이에요...</Text>
                <PulsingDots />
                <Text style={s.loadingLabel}>{processLabel}</Text>
                <View style={s.emotionChipRow}>
                  {(['caring', 'funny', 'touching', 'random'] as const).map((e) => (
                    <View key={e} style={[s.emotionChip, { borderColor: EMOTION_META[e].color + '66' }]}>
                      <Text style={s.emotionChipText}>{EMOTION_META[e].emoji} {EMOTION_META[e].label}</Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}

            {/* ── DONE ── */}
            {phase === 'done' && (
              <Animated.View entering={FadeIn.duration(400)}>
                <View style={s.doneHeader}>
                  <Text style={s.doneEmoji}>🎉</Text>
                  <Text style={s.doneTitle}>
                    명대사 {newCards.length}개 발굴 완료!
                  </Text>
                  <Text style={s.doneSub}>
                    AI가 4가지 감정으로 분류한 인상적인 순간들이에요
                  </Text>
                </View>

                {newCards.map((card) => (
                  <EmotionResultCard key={card.id} card={card} />
                ))}

                {newCards.length === 0 && (
                  <View style={s.emptyDone}>
                    <Text style={s.emptyDoneText}>
                      새로운 명대사가 없어요.{'\n'}이미 분석된 내용이거나 감동적인 문장이 부족해요 💬
                    </Text>
                  </View>
                )}

                {/* Gallery CTA */}
                <Pressable style={s.ctaWrap} onPress={handleViewGallery}>
                  <LinearGradient
                    colors={['#7C3AED', '#D946EF', '#FF6B8B']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s.ctaGrad}
                  >
                    <Text style={s.ctaTxt}>🖼️ 대화 하이라이트 갤러리 보기</Text>
                  </LinearGradient>
                </Pressable>

                <Pressable style={s.secondaryBtn} onPress={handleReset}>
                  <Text style={s.secondaryBtnText}>다시 업로드하기</Text>
                </Pressable>
              </Animated.View>
            )}

            {/* ── ERROR ── */}
            {phase === 'error' && (
              <Animated.View entering={FadeIn.duration(300)} style={s.errorBlock}>
                <Text style={s.errorEmoji}>⚠️</Text>
                <Text style={s.errorTitle}>처리할 수 없어요</Text>
                <Text style={s.errorMsg}>{errorMsg}</Text>
                <Pressable style={s.ctaWrap} onPress={handleReset}>
                  <LinearGradient
                    colors={['#7C3AED', '#D946EF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s.ctaGrad}
                  >
                    <Text style={s.ctaTxt}>다시 시도하기</Text>
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: 'rgba(124,58,237,0.4)',
  },
  inner: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: 0,
    gap: Spacing.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(148,163,184,0.3)',
    alignSelf: 'center',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 11,
    alignSelf: 'center',
  },
  headerEmoji: { fontSize: 20 },
  headerText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },

  sectionTitle: {
    color: '#F1F5F9',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },

  // Upload zone
  uploadZone: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(30,41,59,0.5)',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  uploadZonePicked: {
    borderColor: 'rgba(124,58,237,0.5)',
    borderStyle: 'solid',
    backgroundColor: 'rgba(124,58,237,0.06)',
  },
  uploadIcon: { fontSize: 32 },
  uploadTitle: {
    color: '#F1F5F9',
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  uploadSub: {
    color: '#64748B',
    fontSize: FontSize.xs,
    textAlign: 'center',
  },

  // CTA
  ctaWrap: { borderRadius: Radius.xl, overflow: 'hidden', marginBottom: Spacing.sm },
  ctaGrad: { paddingVertical: 14, alignItems: 'center' },
  ctaTxt: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },

  // Guide
  guideCard: {
    backgroundColor: 'rgba(30,41,59,0.7)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: Spacing.md,
  },
  guideTitle: {
    color: '#F1F5F9',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    marginBottom: 2,
  },
  guideStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guideNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(124,58,237,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.45)',
    flexShrink: 0,
    marginTop: 1,
  },
  guideNumText: {
    color: '#C084FC',
    fontSize: 11,
    fontWeight: FontWeight.extrabold,
  },
  guideStepText: {
    flex: 1,
    color: '#94A3B8',
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  guideTip: {
    backgroundColor: 'rgba(56,189,248,0.07)',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.18)',
    marginTop: Spacing.xs,
  },
  guideTipText: {
    color: '#38BDF8',
    fontSize: FontSize.xs,
    lineHeight: 17,
  },

  // Archive badge
  archiveBadge: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(124,58,237,0.35)',
  },
  archiveBadgeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  archiveBadgeEmoji: { fontSize: 18 },
  archiveBadgeText: {
    color: '#C084FC',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },

  // Loading
  loadingBlock: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    gap: Spacing.md,
  },
  loadingTitle: {
    color: '#F1F5F9',
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    color: '#D946EF',
    fontSize: 10,
  },
  loadingLabel: {
    color: '#64748B',
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  emotionChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 4,
  },
  emotionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  emotionChipText: {
    color: '#94A3B8',
    fontSize: 11,
  },

  // Done
  doneHeader: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  doneEmoji: { fontSize: 44 },
  doneTitle: {
    color: '#F1F5F9',
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    textAlign: 'center',
  },
  doneSub: {
    color: '#64748B',
    fontSize: FontSize.sm,
    textAlign: 'center',
  },

  // Emotion card
  emotionCard: {
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.sm,
  },
  emotionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emotionEmoji: { fontSize: 18 },
  emotionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    flex: 1,
  },
  emotionDate: {
    color: '#475569',
    fontSize: 10,
  },
  emotionText: {
    color: '#F1F5F9',
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  emotionSpeaker: {
    color: '#64748B',
    fontSize: 11,
  },
  copyBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.3)',
  },
  copyBtnText: {
    color: '#C084FC',
    fontSize: 11,
    fontWeight: FontWeight.semibold,
  },

  emptyDone: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyDoneText: {
    color: '#64748B',
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },

  secondaryBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  secondaryBtnText: {
    color: '#475569',
    fontSize: FontSize.sm,
    textDecorationLine: 'underline',
  },

  // Error
  errorBlock: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    gap: Spacing.md,
  },
  errorEmoji: { fontSize: 44 },
  errorTitle: {
    color: '#F1F5F9',
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  errorMsg: {
    color: '#64748B',
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});
