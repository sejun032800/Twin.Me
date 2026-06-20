import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext, type LinkedProvider } from '../../../src/context/AppContext';
import { useCustomTheme } from '../../../src/context/CustomThemeContext';
import { FontSize, FontWeight, Radius, Spacing, type ThemeTokens } from '../../../src/styles/theme';
import { OCEAN_THEME_ID, OceanTokens } from '../../../src/styles/ocean';
import { SAVANNAH_THEME_ID, SavannahTokens } from '../../../src/styles/savannah';
import { PASTEL_PINK_THEME_ID, PastelPinkTokens } from '../../../src/styles/pastelPink';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Provider config ───────────────────────────────────────────────────────────

interface ProviderConfig {
  id: LinkedProvider;
  label: string;
  sublabel: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  logo: string;
}

function getProviders(isLight: boolean, isOcean: boolean, isSavannah: boolean, isPastel: boolean): ProviderConfig[] {
  return [
    {
      id: 'GOOGLE',
      label: 'Google',
      sublabel: 'Gmail · Google 계정',
      bgColor:     (isOcean || isSavannah || isPastel) ? '#FFFFFF' : (isLight ? '#FFFFFF' : '#131314'),
      borderColor: isOcean
        ? OceanTokens.AQUA_MUTED
        : isSavannah
          ? SavannahTokens.AMBER_MUTED
          : isPastel
            ? PastelPinkTokens.PASTEL_MUTED
            : (isLight ? '#DADCE0' : '#8E918F'),
      textColor:   (isOcean || isSavannah || isPastel) ? '#202124' : (isLight ? '#202124' : '#E3E3E3'),
      logo: 'G',
    },
    {
      id: 'KAKAO',
      label: 'Kakao',
      sublabel: '카카오계정 · 카카오톡',
      bgColor: '#FEE500',
      borderColor: '#E6CC00',
      textColor: '#191919',
      logo: 'K',
    },
    {
      id: 'NAVER',
      label: 'Naver',
      sublabel: '네이버 아이디 · NAVER',
      bgColor: '#03C75A',
      borderColor: '#02A94B',
      textColor: '#FFFFFF',
      logo: 'N',
    },
    {
      id: 'APPLE',
      label: 'Apple',
      sublabel: 'Apple ID · iCloud',
      bgColor:     isLight ? '#FFFFFF' : '#000000',
      borderColor: isLight ? '#000000' : '#1A1A1A',
      textColor:   isLight ? '#000000' : '#FFFFFF',
      logo: '',
    },
  ];
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function SyncToast({ visible, t }: { visible: boolean; t: ThemeTokens }) {
  const opacity = useRef(new RNAnimated.Value(0)).current;
  const translateY = useRef(new RNAnimated.Value(20)).current;

  if (visible) {
    RNAnimated.parallel([
      RNAnimated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      RNAnimated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  } else {
    RNAnimated.parallel([
      RNAnimated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      RNAnimated.timing(translateY, { toValue: 10, duration: 250, useNativeDriver: true }),
    ]).start();
  }

  return (
    <RNAnimated.View style={[s.toast, { opacity, transform: [{ translateY }] }]}>
      <LinearGradient
        colors={t.isLight ? ['rgba(255,255,255,0.97)', 'rgba(245,241,248,0.97)'] : ['rgba(30,20,60,0.97)', 'rgba(20,12,45,0.97)']}
        style={[s.toastInner, { borderColor: t.isLight ? 'rgba(114,84,119,0.30)' : 'rgba(167,139,250,0.3)' }]}
      >
        <Text style={s.toastIcon}>✓</Text>
        <Text style={[s.toastText, { color: t.isLight ? t.text : '#E9E3FF' }]}>
          지금까지의 연애 DNA 데이터가 안전하게 연동되었습니다!
        </Text>
      </LinearGradient>
    </RNAnimated.View>
  );
}

// ── Provider Button ───────────────────────────────────────────────────────────

function ProviderButton({
  config,
  isLinked,
  isLoading,
  onPress,
  linkedAt,
}: {
  config: ProviderConfig;
  isLinked: boolean;
  isLoading: boolean;
  onPress: () => void;
  linkedAt?: string;
}) {
  const scale = useRef(new RNAnimated.Value(1)).current;

  const handlePressIn = () => {
    if (isLinked || isLoading) return;
    RNAnimated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    RNAnimated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
  };

  const isApple = config.id === 'APPLE';

  return (
    <RNAnimated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        disabled={isLinked || isLoading}
        style={[
          s.providerBtn,
          { backgroundColor: config.bgColor, borderColor: config.borderColor },
          isLinked && s.providerBtnLinked,
        ]}
      >
        {/* Logo badge */}
        <View style={[s.logoBadge, isApple && s.logoBadgeApple]}>
          {isApple ? (
            <Text style={s.appleLogoText}>{'\u{F8FF}'}</Text>
          ) : (
            <Text style={[s.logoText, { color: config.textColor }]}>{config.logo}</Text>
          )}
        </View>

        {/* Labels */}
        <View style={s.providerLabels}>
          <Text style={[s.providerName, { color: config.textColor }]}>{config.label}</Text>
          <Text style={[s.providerSub, { color: config.textColor, opacity: 0.65 }]}>
            {config.sublabel}
          </Text>
        </View>

        {/* Right side */}
        <View style={s.rightSide}>
          {isLoading ? (
            <ActivityIndicator size="small" color={config.textColor} />
          ) : isLinked ? (
            <View style={s.linkedBadge}>
              <Text style={s.linkedBadgeText}>✓ 연동됨 • 동기화 완료</Text>
            </View>
          ) : (
            <Text style={[s.connectLabel, { color: config.textColor, opacity: 0.55 }]}>
              연동하기 →
            </Text>
          )}
        </View>
      </Pressable>
    </RNAnimated.View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AccountLinkScreen() {
  const router = useRouter();
  const { userAccount, linkSocialAccount, themeTokens } = useAppContext();
  const { activeTheme } = useCustomTheme();
  const isOcean = activeTheme?.id === OCEAN_THEME_ID;
  const isSavannah = activeTheme?.id === SAVANNAH_THEME_ID;
  const isPastel = activeTheme?.id === PASTEL_PINK_THEME_ID;
  const t = themeTokens;

  const [loadingProvider, setLoadingProvider] = useState<LinkedProvider | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLink = async (provider: LinkedProvider) => {
    if (loadingProvider) return;
    if (userAccount.linkedProviders.includes(provider)) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoadingProvider(provider);
    try {
      await linkSocialAccount(provider);
      setLoadingProvider(null);
      setToastVisible(true);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToastVisible(false), 3500);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setLoadingProvider(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const linkedCount = userAccount.linkedProviders.length;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: t.bg }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: t.cardBorder }]}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Text style={[s.backIcon, { color: t.isLight ? t.secondary : '#A78BFA' }]}>←</Text>
        </Pressable>
        <Text style={[s.headerTitle, { color: t.text }]}>소셜 계정 연동</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero glass card */}
        <LinearGradient
          colors={t.isLight ? ['rgba(114,84,119,0.10)', 'rgba(83,85,170,0.06)'] : ['rgba(120,80,220,0.18)', 'rgba(60,30,120,0.10)']}
          style={[s.heroCard, { borderColor: t.isLight ? 'rgba(114,84,119,0.22)' : 'rgba(167,139,250,0.25)' }]}
        >
          <View style={s.heroIconWrap}>
            <LinearGradient colors={t.isLight ? [t.secondary, t.tertiary] : ['#A855F7', '#7C3AED']} style={s.heroIconGrad}>
              <Text style={s.heroIcon}>🔗</Text>
            </LinearGradient>
          </View>
          <Text style={[s.heroTitle, { color: t.text }]}>데이터 보존 & 계정 연동</Text>
          <Text style={[s.heroDesc, { color: t.textSecondary }]}>
            무료 게스트 상태에서 쌓아온 연애 DNA 점수,{'\n'}
            24개 지표, 데이트 코스 히스토리를{'\n'}
            소셜 계정에 안전하게 묶어두세요.
          </Text>
          {linkedCount > 0 && (
            <View style={[s.linkedCountBadge, { backgroundColor: t.chipBg, borderColor: t.chipBorder }]}>
              <Text style={[s.linkedCountText, { color: t.isLight ? t.secondary : '#C4B5FD' }]}>
                {linkedCount}개 계정 연동됨
              </Text>
            </View>
          )}
        </LinearGradient>

        {/* Provider list */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: t.textMuted }]}>연동 가능한 계정</Text>
          <View style={s.providerList}>
            {getProviders(t.isLight, isOcean, isSavannah, isPastel).map((config) => {
              const isLinked = userAccount.linkedProviders.includes(config.id);
              const isLoading = loadingProvider === config.id;
              return (
                <ProviderButton
                  key={config.id}
                  config={config}
                  isLinked={isLinked}
                  isLoading={isLoading}
                  onPress={() => handleLink(config.id)}
                />
              );
            })}
          </View>
        </View>

        {/* Data migration info */}
        <View style={[s.infoCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
          <Text style={[s.infoTitle, { color: t.textMuted }]}>연동 시 동기화되는 데이터</Text>
          {[
            '💜 연애 DNA 일치율 점수',
            '📊 24개 마이크로 이벤트 로그',
            '📍 멀티 레이어 데이트 지도 코스',
            '📋 주간 감정 리포트',
          ].map((item) => (
            <Text key={item} style={[s.infoItem, { color: t.textSecondary }]}>
              {item}
            </Text>
          ))}
          <Text style={[s.infoFooter, { color: t.textMuted }]}>
            연동 후에도 기기 내 로컬 데이터는 유지됩니다.
          </Text>
        </View>
      </ScrollView>

      {/* Toast */}
      <SyncToast visible={toastVisible} t={t} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 22,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: 120,
    gap: Spacing.lg,
  },
  heroCard: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: 10,
  },
  heroIconWrap: {
    marginBottom: 4,
  },
  heroIconGrad: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 12,
  },
  heroIcon: {
    fontSize: 28,
  },
  heroTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  heroDesc: {
    fontSize: FontSize.sm,
    lineHeight: 22,
    textAlign: 'center',
  },
  linkedCountBadge: {
    marginTop: 4,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
  },
  linkedCountText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
  },
  providerList: {
    gap: 10,
  },
  providerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    gap: 14,
  },
  providerBtnLinked: {
    opacity: 0.75,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadgeApple: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  logoText: {
    fontSize: 20,
    fontWeight: FontWeight.bold,
  },
  appleLogoText: {
    color: '#FFFFFF',
    fontSize: 20,
  },
  providerLabels: {
    flex: 1,
    gap: 2,
  },
  providerName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  providerSub: {
    fontSize: FontSize.xs,
  },
  rightSide: {
    alignItems: 'flex-end',
    minWidth: 90,
  },
  linkedBadge: {
    backgroundColor: 'rgba(52,211,153,0.18)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.45)',
  },
  linkedBadgeText: {
    color: '#6EE7B7',
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
  connectLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  infoCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 8,
  },
  infoTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  infoItem: {
    fontSize: FontSize.sm,
    lineHeight: 22,
  },
  infoFooter: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 17,
  },
  // Toast
  toast: {
    position: 'absolute',
    bottom: 40,
    left: Spacing.md,
    right: Spacing.md,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
  },
  toastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    gap: 10,
    borderWidth: 1,
    borderRadius: Radius.lg,
  },
  toastIcon: {
    color: '#6EE7B7',
    fontSize: 18,
    fontWeight: FontWeight.bold,
  },
  toastText: {
    flex: 1,
    fontSize: FontSize.sm,
    lineHeight: 20,
    fontWeight: FontWeight.medium,
  },
});
