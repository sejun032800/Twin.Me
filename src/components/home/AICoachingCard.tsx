import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAppContext } from '../../context/AppContext';
import {
  CoachingMessage,
  FALLBACK_MESSAGE,
  fetchTwinCoachingMessage,
  getCachedMessage,
  shouldRefetch,
} from '../../services/coachingService';
import {
  Colors,
  FontSize,
  FontWeight,
  Radius,
  Spacing,
  ThemeTokens,
} from '../../styles/theme';

// ── Typing animation constants ───────────────────────────────────────────────
const CHARS_PER_TICK = 3;
const TICK_MS = 40;

// ── Typing dots: 3-dot bounce indicator for loading state ───────────────────
function TypingDots() {
  const d1 = useRef(new Animated.Value(0)).current;
  const d2 = useRef(new Animated.Value(0)).current;
  const d3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeBounce = (dot: Animated.Value) =>
      Animated.loop(
        Animated.sequence([
          Animated.spring(dot, { toValue: -6, useNativeDriver: true, damping: 4, stiffness: 200 }),
          Animated.spring(dot, { toValue: 0,  useNativeDriver: true, damping: 4, stiffness: 200 }),
        ]),
      );
    const entries = [
      { dot: d1, delay: 0 },
      { dot: d2, delay: 160 },
      { dot: d3, delay: 320 },
    ].map(({ dot, delay }) => {
      const anim = makeBounce(dot);
      const timer = setTimeout(() => anim.start(), delay);
      return { anim, timer };
    });
    return () => entries.forEach(({ anim, timer }) => { clearTimeout(timer); anim.stop(); });
  }, [d1, d2, d3]);

  return (
    <View style={dotStyles.row}>
      {([d1, d2, d3] as Animated.Value[]).map((dot, i) => (
        <Animated.View key={i} style={[dotStyles.dot, { transform: [{ translateY: dot }] }]} />
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.GRADIENT_START },
});

// ── Category style map ───────────────────────────────────────────────────────
const CATEGORY_META: Record<
  CoachingMessage['category'],
  { icon: string; label: string; color: string }
> = {
  warning: { icon: '⚠️', label: '주의 코칭', color: '#F97316' },
  sweet:   { icon: '💕', label: '달달 코칭', color: Colors.GRADIENT_END },
  tip:     { icon: '💡', label: 'AI 코칭',   color: Colors.BADGE_AI_BLUE },
};

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  partnerName: string; // kept for API compatibility — read from context internally
  t: ThemeTokens;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function AICoachingCard({ t }: Props) {
  const {
    coupleId,
    myProfile,
    partnerProfile,
    partnerAiMood,
    weeklyMetrics,
    hasCompletedInterview,
  } = useAppContext();

  const ctx = {
    coupleId,
    partnerName: partnerProfile.name,
    myName: myProfile.name,
    partnerMood: partnerAiMood,
    weeklyMetrics,
    hasCompletedInterview,
  };

  const [message, setMessage] = useState<CoachingMessage | null>(null);
  const [displayedText, setDisplayedText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Neon pulse animation for the avatar glow ring
  const pulseAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1,   duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 1800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Typing animation: reveal `fullText` character by character
  const startTyping = useCallback((fullText: string) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setDisplayedText('');
    let revealed = 0;
    intervalRef.current = setInterval(() => {
      revealed = Math.min(revealed + CHARS_PER_TICK, fullText.length);
      setDisplayedText(fullText.slice(0, revealed));
      if (revealed >= fullText.length && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, TICK_MS);
  }, []);

  // Load coaching message on mount with 24h cache + warning-entry logic
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    async function load() {
      setIsLoading(true);

      const cached = getCachedMessage(ctx);

      // Serve from cache immediately when fresh
      if (cached && !shouldRefetch(ctx)) {
        setMessage(cached);
        setIsLoading(false);
        startTyping(cached.coachingText);
        return;
      }

      // Show stale cache instantly, then silently refresh in background
      if (cached) {
        setMessage(cached);
        setIsLoading(false);
        startTyping(cached.coachingText);
      }

      try {
        const fresh = await fetchTwinCoachingMessage(ctx, signal);
        if (!signal.aborted) {
          setMessage(fresh);
          setIsLoading(false);
          startTyping(fresh.coachingText);
        }
      } catch {
        if (!signal.aborted) {
          const fallback = cached ?? FALLBACK_MESSAGE;
          setMessage(fallback);
          setIsLoading(false);
          startTyping(fallback.coachingText);
        }
      }
    }

    load();

    return () => {
      abortRef.current?.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // Mount-only: cache logic inside handles re-fetch conditions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived visuals ──────────────────────────────────────────────────────
  const category = message?.category ?? 'tip';
  const meta = CATEGORY_META[category];

  const glass = {
    backgroundColor: t.isLight
      ? 'rgba(255,255,255,0.72)'
      : 'rgba(30,41,59,0.72)',
    borderColor: t.isLight
      ? 'rgba(200,160,180,0.30)'
      : 'rgba(255,255,255,0.08)',
  };

  const isTyping = displayedText.length < (message?.coachingText.length ?? 0);

  return (
    <View style={[styles.card, glass]}>
      {/* Top shimmer gradient line */}
      <LinearGradient
        colors={['#7C3AED', '#D946EF', '#FF6B8B']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.shimmerLine}
      />

      {/* Header row: neon violet avatar + title + category badge */}
      <View style={styles.header}>
        {/* Pulsing glow ring behind avatar */}
        <Animated.View
          style={[styles.glowRing, { opacity: pulseAnim }]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={['#7C3AED', '#D946EF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* Avatar */}
        <LinearGradient
          colors={['#7C3AED', '#D946EF', '#FF6B8B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatarCircle}
        >
          <Text style={styles.avatarIcon}>🔮</Text>
        </LinearGradient>

        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: t.text }]}>
            분석가 트윈이의 한마디
          </Text>
          <Text style={[styles.headerSub, { color: t.textMuted }]}>
            {isLoading && !message ? '분석 중...' : '오늘의 AI 코칭'}
          </Text>
        </View>

        {/* Category badge */}
        <View
          style={[
            styles.categoryBadge,
            {
              backgroundColor: `${meta.color}18`,
              borderColor: `${meta.color}40`,
            },
          ]}
        >
          <Text style={styles.categoryBadgeIcon}>{meta.icon}</Text>
          <Text style={[styles.categoryBadgeLabel, { color: meta.color }]}>
            {meta.label}
          </Text>
        </View>
      </View>

      {/* Coaching text body */}
      {isLoading && !message ? (
        <View style={styles.loadingContainer}>
          <TypingDots />
        </View>
      ) : (
        <Text style={[styles.coachingBody, { color: t.textSecondary }]}>
          {'"'}{displayedText}
          {isTyping && (
            <Text style={[styles.cursor, { color: Colors.GRADIENT_START }]}>
              {'|'}
            </Text>
          )}
          {'"'}
        </Text>
      )}

      {/* Footer: AI badge + relative timestamp */}
      <View style={styles.footer}>
        <View style={styles.aiBadge}>
          <View style={styles.aiDot} />
          <Text style={styles.aiLabel}>트윈 AI 분석</Text>
        </View>
        {message && (
          <Text style={[styles.timestamp, { color: t.textMuted }]}>
            {formatRelativeDate(message.createdAt)}
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatRelativeDate(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return '방금 분석됨';
  if (hours < 24) return `${hours}시간 전 분석`;
  return '오늘 분석됨';
}

// ── Styles ───────────────────────────────────────────────────────────────────
const AVATAR_SIZE = 46;
const GLOW_EXTRA = 12; // extra radius for the glow ring

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.base,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'visible',
    padding: Spacing.base,
    gap: Spacing.md,
  },
  shimmerLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.8,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: 4,
  },
  glowRing: {
    position: 'absolute',
    left: -(GLOW_EXTRA / 2),
    top: 4 - GLOW_EXTRA / 2,
    width: AVATAR_SIZE + GLOW_EXTRA,
    height: AVATAR_SIZE + GLOW_EXTRA,
    borderRadius: (AVATAR_SIZE + GLOW_EXTRA) / 2,
    overflow: 'hidden',
    opacity: 0.35,
  },
  avatarCircle: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: { fontSize: 22 },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  headerSub: {
    fontSize: FontSize.xs,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryBadgeIcon: { fontSize: 10 },
  categoryBadgeLabel: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
  },
  loadingContainer: {
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachingBody: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    lineHeight: FontSize.base * 1.7,
    fontStyle: 'italic',
    minHeight: 72,
  },
  cursor: {
    fontStyle: 'normal',
    fontWeight: FontWeight.bold,
    fontSize: FontSize.base + 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(56,189,248,0.10)',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.25)',
  },
  aiDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.BADGE_AI_BLUE,
  },
  aiLabel: {
    color: Colors.BADGE_AI_BLUE,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  timestamp: {
    fontSize: FontSize.xs,
  },
});
