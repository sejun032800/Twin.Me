import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../../src/context/AppContext';
import {
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TwinGradient } from '../../src/components/ui/TwinGradient';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../src/styles/theme';

// ─── Code Generator ───────────────────────────────────────────────────────────

function generateCode(): string {
  const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let raw = '';
  for (let i = 0; i < 8; i++) {
    raw += pool[Math.floor(Math.random() * pool.length)];
  }
  // Format: "XXX XXX XX"
  return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6)}`;
}

// ─── Code Card ────────────────────────────────────────────────────────────────

function CodeCard({ code, onCopy, copied }: { code: string; onCopy: () => void; copied: boolean }) {
  return (
    <Animated.View entering={FadeInDown.delay(200).duration(600)} style={codeStyles.card}>
      <View style={codeStyles.cardInner}>
        <Text style={codeStyles.cardLabel}>YOUR INVITE CODE</Text>
        <Text style={codeStyles.codeText}>{code}</Text>
        <View style={codeStyles.divider} />
        <Pressable onPress={onCopy} style={codeStyles.copyBtn}>
          <Text style={codeStyles.copyText}>
            {copied ? '✓ 복사됨!' : '📋 코드 복사하기'}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MatchingScreen() {
  const router = useRouter();
  const { setInviteCode } = useAppContext();
  const code = useMemo(() => generateCode(), []);
  const [copied, setCopied] = useState(false);

  // Persist code to global context so later screens can reference it
  useEffect(() => {
    setInviteCode(code.replace(/\s/g, ''));
  }, [code]);

  const kakaoScale = useSharedValue(1);
  const kakaoStyle = useAnimatedStyle(() => ({ transform: [{ scale: kakaoScale.value }] }));
  const skipScale = useSharedValue(1);
  const skipStyle = useAnimatedStyle(() => ({ transform: [{ scale: skipScale.value }] }));

  const handleCopy = async () => {
    try { await Haptics.selectionAsync(); } catch {}
    const raw = code.replace(/\s/g, '');
    if (Platform.OS === 'web') {
      try { await (navigator as any).clipboard.writeText(raw); } catch {}
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleKakaoShare = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    try {
      await Share.share({
        message: `💕 Twin.me 초대 코드: ${code}\n우리 연결해요! 앱 설치 후 코드를 입력해줘 ✨`,
        title: 'Twin.me 초대',
      });
    } catch {}
    router.push('/(auth)/loading');
  };

  const handleSkip = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    router.push('/(auth)/loading');
  };

  return (
    <SafeAreaView style={s.container}>
      {/* ── Header ── */}
      <Animated.View entering={FadeInDown.duration(500)} style={s.header}>
        <Text style={s.heading}>당신만의 소중한 인연을{'\n'}연결할 준비가 되었습니다.</Text>
        <Text style={s.subheading}>
          아래 초대 코드를 연인에게 공유하고{'\n'}함께 Twin.me를 시작해보세요
        </Text>
      </Animated.View>

      {/* ── Code Card ── */}
      <CodeCard code={code} onCopy={handleCopy} copied={copied} />

      {/* ── Kakao Share Button ── */}
      <Animated.View entering={FadeInUp.delay(400).duration(500)}>
        <Pressable
          onPress={handleKakaoShare}
          onPressIn={() => { kakaoScale.value = withTiming(0.97, { duration: 60 }); }}
          onPressOut={() => { kakaoScale.value = withSpring(1, { damping: 12 }); }}
        >
          <Animated.View style={[s.kakaoButton, kakaoStyle]}>
            <Text style={s.kakaoIcon}>💬</Text>
            <Text style={s.kakaoText}>카카오톡으로 공유하기</Text>
          </Animated.View>
        </Pressable>
      </Animated.View>

      {/* ── Skip ── */}
      <Animated.View entering={FadeInUp.delay(550).duration(400)}>
        <Pressable
          onPress={handleSkip}
          onPressIn={() => { skipScale.value = withTiming(0.96, { duration: 60 }); }}
          onPressOut={() => { skipScale.value = withTiming(1, { duration: 80 }); }}
        >
          <Animated.Text style={[s.skipText, skipStyle]}>나중에 하기</Animated.Text>
        </Pressable>
      </Animated.View>

      {/* ── Step Dots ── */}
      <View style={s.stepRow}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[s.stepDot, i === 2 ? s.stepDotActive : i < 2 ? s.stepDotDone : s.stepDotInactive]}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

// ─── Code Card Styles ─────────────────────────────────────────────────────────

const codeStyles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing['2xl'],
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
  },
  cardInner: {
    backgroundColor: Colors.CARD_DARK_SLATE,
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.25)',
    paddingVertical: Spacing['3xl'],
    paddingHorizontal: Spacing['2xl'],
    alignItems: 'center',
    gap: Spacing.md,
    shadowColor: Colors.GRADIENT_START,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  cardLabel: {
    color: Colors.TEXT_MUTED,
    fontSize: 10,
    fontWeight: FontWeight.bold,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  codeText: {
    color: Colors.TEXT_ON_DARK,
    fontSize: 38,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 8,
    textAlign: 'center',
  },
  divider: {
    width: '80%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginVertical: 4,
  },
  copyBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  copyText: {
    color: Colors.BADGE_AI_BLUE,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
});

// ─── Screen Styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BG_DARK_MIDNIGHT,
    justifyContent: 'center',
    gap: Spacing.xl,
    paddingBottom: Spacing['2xl'],
  },

  header: {
    paddingHorizontal: Spacing['2xl'],
    gap: Spacing.sm,
  },
  heading: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  subheading: {
    color: Colors.TEXT_ON_DARK_SECONDARY,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },

  kakaoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing['2xl'],
    height: 60,
    borderRadius: Radius.xl,
    backgroundColor: '#FEE500',
    shadowColor: '#FEE500',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  kakaoIcon: { fontSize: 20 },
  kakaoText: {
    color: '#3A1D00',
    fontSize: FontSize.base,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.2,
  },

  skipText: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.sm,
    textAlign: 'center',
    textDecorationLine: 'underline',
    paddingVertical: 4,
  },

  stepRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  stepDot: { height: 6, borderRadius: 3 },
  stepDotActive: { width: 22, backgroundColor: Colors.GRADIENT_END },
  stepDotDone: { width: 6, backgroundColor: Colors.GRADIENT_MID },
  stepDotInactive: { width: 6, backgroundColor: 'rgba(255,255,255,0.18)' },
});
