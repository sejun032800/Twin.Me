// ─── Highlight Gallery — iPhone-style grid archive of all KakaoTalk highlights ─
// Accessed via router.push('/highlight-gallery') from KakaoTalkArchiveManager.

import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Dimensions,
  Modal,
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
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppContext } from '../src/context/AppContext';
import {
  loadHighlightCards,
  EMOTION_META,
  type HighlightCard,
  type EmotionType,
} from '../src/services/kakaoHighlightService';
import { FontSize, FontWeight, Radius, Spacing, type ThemeTokens } from '../src/styles/theme';

const { width: SW } = Dimensions.get('window');
const CARD_GAP = 10;
const CARD_W = (SW - Spacing.base * 2 - CARD_GAP) / 2;

// ── Filter tabs ───────────────────────────────────────────────────────────────

const FILTERS: Array<{ key: EmotionType | 'all'; label: string; emoji: string }> = [
  { key: 'all',      label: '전체',       emoji: '✨' },
  { key: 'caring',   label: '다정한 말',   emoji: '💌' },
  { key: 'funny',    label: '재밌는 말',   emoji: '😂' },
  { key: 'touching', label: '감동적인 말', emoji: '✨' },
  { key: 'random',   label: '뜬금없는 말', emoji: '🤪' },
];

// ── Grid card ─────────────────────────────────────────────────────────────────

function GridCard({
  card,
  onPress,
  themeTokens,
}: {
  card: HighlightCard;
  onPress: (card: HighlightCard) => void;
  themeTokens: ThemeTokens;
}) {
  const meta = EMOTION_META[card.emotion];
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[animStyle, { width: CARD_W, marginBottom: CARD_GAP }]}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.95, { damping: 12 }); }}
        onPressOut={() => { scale.value = withSpring(1.0, { damping: 12 }); }}
        onPress={() => onPress(card)}
        style={[
          g.cardShell,
          {
            borderColor: meta.color + '44',
            shadowColor: themeTokens.primary,
          },
        ]}
      >
        {/* Gradient card backdrop — theme cardBackdrop as base layer */}
        <LinearGradient
          colors={themeTokens.gradients.cardBackdrop}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Emotion gradient header */}
        <LinearGradient
          colors={[meta.color + '33', meta.color + '11']}
          style={g.cardHeader}
        >
          <Text style={g.cardEmoji}>{meta.emoji}</Text>
          <Text style={[g.cardEmoLabel, { color: meta.color }]}>{meta.label}</Text>
        </LinearGradient>

        {/* Quote */}
        <Text style={[g.cardQuote, { color: themeTokens.text }]} numberOfLines={4}>
          "{card.text}"
        </Text>

        {/* Footer */}
        <View style={g.cardFooter}>
          <Text style={[g.cardSpeaker, { color: themeTokens.textMuted }]} numberOfLines={1}>
            {card.speaker}
          </Text>
          <Text style={[g.cardDate, { color: themeTokens.textMuted }]}>{card.date}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const g = StyleSheet.create({
  cardShell: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 6,
  },
  cardHeader: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardEmoji: { fontSize: 14 },
  cardEmoLabel: { fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.3 },
  cardQuote: {
    color: '#F1F5F9',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 18,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  cardSpeaker: { color: '#64748B', fontSize: 10, flex: 1 },
  cardDate:    { color: '#475569', fontSize: 9 },
});

// ── Detail modal ──────────────────────────────────────────────────────────────

function DetailModal({
  card,
  onClose,
  onViewGallery,
}: {
  card: HighlightCard | null;
  onClose: () => void;
  onViewGallery: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!card) return null;
  const meta = EMOTION_META[card.emotion];

  const handleCopy = async () => {
    await Clipboard.setStringAsync(card.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={dm.backdrop} onPress={onClose}>
        <Pressable style={dm.card} onPress={() => {}}>
          {/* Gradient header */}
          <LinearGradient
            colors={[meta.color + '55', meta.color + '22']}
            style={dm.headerGrad}
          >
            <Text style={dm.headerEmoji}>{meta.emoji}</Text>
          </LinearGradient>

          {/* Body */}
          <View style={dm.body}>
            <View style={dm.tagRow}>
              <View style={[dm.tagBadge, { borderColor: meta.color + '66', backgroundColor: meta.color + '22' }]}>
                <Text style={[dm.tagText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              <Text style={dm.speakerText}>{card.speaker} · {card.date}</Text>
            </View>

            <ScrollView style={dm.quoteScroll} showsVerticalScrollIndicator={false}>
              <Text style={dm.quoteText}>"{card.text}"</Text>
            </ScrollView>

            {/* Action buttons */}
            <View style={dm.actionRow}>
              <Pressable
                style={[dm.actionBtn, { borderColor: 'rgba(124,58,237,0.4)' }]}
                onPress={handleCopy}
              >
                <Text style={dm.actionEmoji}>{copied ? '✅' : '📋'}</Text>
                <Text style={[dm.actionText, copied && { color: '#4ADE80' }]}>
                  {copied ? '복사됨' : '복사하기'}
                </Text>
              </Pressable>

              <Pressable
                style={[dm.actionBtn, { borderColor: 'rgba(217,70,239,0.4)' }]}
                onPress={onViewGallery}
              >
                <Text style={dm.actionEmoji}>🖼️</Text>
                <Text style={dm.actionText}>대화 하이라이트</Text>
              </Pressable>

              <Pressable
                style={[dm.actionBtn, { borderColor: 'rgba(74,222,128,0.35)' }]}
                onPress={onClose}
              >
                <Text style={dm.actionEmoji}>✕</Text>
                <Text style={dm.actionText}>닫기</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const dm = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  card: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.35)',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  headerGrad: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEmoji: { fontSize: 64 },
  body: { padding: Spacing.lg, gap: Spacing.md },
  tagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tagBadge: {
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
  },
  tagText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  speakerText: { color: '#64748B', fontSize: FontSize.xs },
  quoteScroll: { maxHeight: 100 },
  quoteText: {
    color: '#F1F5F9',
    fontSize: FontSize.base,
    fontStyle: 'italic',
    lineHeight: 24,
  },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: 'rgba(30,41,59,0.8)',
    gap: 4,
  },
  actionEmoji: { fontSize: 20 },
  actionText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function HighlightGalleryScreen() {
  const router = useRouter();
  const { highlightCards, setHighlightCards, themeTokens } = useAppContext();
  const [filter, setFilter] = useState<EmotionType | 'all'>('all');
  const [detailCard, setDetailCard] = useState<HighlightCard | null>(null);

  // Hydrate from storage on mount
  useEffect(() => {
    loadHighlightCards().then((cards) => {
      if (cards.length > 0) setHighlightCards(cards);
    });
  }, []);

  const filtered = filter === 'all'
    ? highlightCards
    : highlightCards.filter((c) => c.emotion === filter);

  const columns: [HighlightCard[], HighlightCard[]] = [[], []];
  filtered.forEach((c, i) => columns[i % 2].push(c));

  return (
    <SafeAreaView style={[sc.root, { backgroundColor: themeTokens.bg }]}>
      {/* 전체 화면 딥 배경 그라데이션 */}
      <LinearGradient
        colors={themeTokens.gradients.bgDeep}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={[sc.header, { borderBottomColor: themeTokens.primary + '30' }]}>
        <Pressable
          style={[sc.backBtn, { backgroundColor: themeTokens.primary + '18', borderColor: themeTokens.primary + '44' }]}
          onPress={() => router.back()}
        >
          <Text style={[sc.backIcon, { color: themeTokens.primary }]}>←</Text>
        </Pressable>
        <View style={sc.headerCenter}>
          <Text style={[sc.title, { color: themeTokens.text }]}>대화 하이라이트</Text>
          <Text style={[sc.subtitle, { color: themeTokens.textMuted }]}>{highlightCards.length}개의 명대사</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={sc.filterRow}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            style={[
              sc.filterChip,
              { backgroundColor: themeTokens.chipBg, borderColor: themeTokens.chipBorder },
              filter === f.key && { backgroundColor: themeTokens.primary + '22', borderColor: themeTokens.secondary },
            ]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={sc.filterChipEmoji}>{f.emoji}</Text>
            <Text style={[
              sc.filterChipText,
              { color: themeTokens.textMuted },
              filter === f.key && { color: themeTokens.text, fontWeight: FontWeight.bold },
            ]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Grid */}
      {filtered.length === 0 ? (
        <Animated.View entering={FadeIn.duration(400)} style={sc.emptyWrap}>
          <Text style={sc.emptyEmoji}>📭</Text>
          <Text style={[sc.emptyTitle, { color: themeTokens.text }]}>아직 명대사가 없어요</Text>
          <Text style={[sc.emptySub, { color: themeTokens.textMuted }]}>
            카카오톡 파일을 업로드하면{'\n'}AI가 인상 깊은 순간들을 골라드려요 ✨
          </Text>
        </Animated.View>
      ) : (
        <ScrollView
          contentContainerStyle={sc.gridContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={sc.grid}>
            {/* Left column */}
            <View style={sc.col}>
              {columns[0].map((card) => (
                <Animated.View
                  key={card.id}
                  entering={FadeInDown.duration(350).delay(40)}
                >
                  <GridCard card={card} onPress={setDetailCard} themeTokens={themeTokens} />
                </Animated.View>
              ))}
            </View>
            {/* Right column */}
            <View style={sc.col}>
              {columns[1].map((card) => (
                <Animated.View
                  key={card.id}
                  entering={FadeInDown.duration(350).delay(80)}
                >
                  <GridCard card={card} onPress={setDetailCard} themeTokens={themeTokens} />
                </Animated.View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Detail modal */}
      <DetailModal
        card={detailCard}
        onClose={() => setDetailCard(null)}
        onViewGallery={() => setDetailCard(null)}
      />
    </SafeAreaView>
  );
}

const sc = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
  },
  backIcon: { fontSize: 18, fontWeight: FontWeight.bold },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.extrabold },
  subtitle: { fontSize: FontSize.xs, marginTop: 1 },

  filterRow: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  filterChipEmoji: { fontSize: 13 },
  filterChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },

  gridContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: 40,
  },
  grid: {
    flexDirection: 'row',
    gap: CARD_GAP,
  },
  col: { flex: 1, gap: CARD_GAP },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, textAlign: 'center' },
  emptySub: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
});
