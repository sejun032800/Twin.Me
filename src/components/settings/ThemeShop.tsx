/**
 * ThemeShop.tsx — Step #41
 * Bottom-sheet modal commerce UI for purchasable Twin.me custom skins.
 *
 * Three product tiers:
 *   cyber_neon    — Cyber Punk laser-blue / hot-pink border skin
 *   aurora_dream  — Animated aurora gradient background layer
 *   retro_pixel   — Retro monospace / pixel font with terminal green skin
 *
 * Purchase flow:
 *   [소장하기] → react-native-iap requestPurchase (lazy-require, same pattern
 *               as iapService.ts) → backend ownership verify → markOwned() → applyTheme()
 *   [적용하기] → instant applyTheme() (local, no re-verify needed)
 *   [현재 적용 중] → disabled, shows active indicator
 */

import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { THEME_CATALOG, useCustomTheme, type CustomThemeSpec } from '../../context/CustomThemeContext';
import {
  Colors,
  FontSize,
  FontWeight,
  Radius,
  Spacing,
  TabBar,
} from '../../styles/theme';
import type { ThemeTokens } from '../../styles/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = SCREEN_H * 0.82;

// ── IAP helpers (lazy-require mirror of iapService.ts pattern) ────────────────

const OWNERSHIP_VERIFY_URL = 'https://api.twin.me/api/v1/themes/verify-ownership';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function iapModule(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-iap');
  } catch {
    throw new Error('IAP_NOT_AVAILABLE');
  }
}

async function verifyThemeOwnership(sku: string, transactionId: string): Promise<boolean> {
  try {
    const res = await fetch(OWNERSHIP_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku, transactionId }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { owned?: boolean };
    return json.owned === true;
  } catch {
    // Backend unreachable — trust successful IAP receipt locally
    return true;
  }
}

async function purchaseThemeProduct(sku: string): Promise<string> {
  const m = iapModule(); // throws IAP_NOT_AVAILABLE if not installed
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    function settle(fn: () => void) {
      if (settled) return;
      settled = true;
      updateSub.remove();
      errorSub.remove();
      fn();
    }

    const updateSub = m.purchaseUpdatedListener(async (purchase: Record<string, unknown>) => {
      if (purchase.productId !== sku) return;
      const transactionId = (purchase.transactionId as string | undefined) ?? '';
      try {
        await m.finishTransaction({ purchase, isConsumable: false });
        settle(() => resolve(transactionId));
      } catch (err) {
        settle(() => reject(err));
      }
    });

    const errorSub = m.purchaseErrorListener((err: Record<string, unknown>) => {
      if (err.code === 'E_USER_CANCELLED') {
        const e = new Error('USER_CANCELLED') as Error & { userCancelled: boolean };
        e.userCancelled = true;
        settle(() => reject(e));
      } else {
        settle(() => reject(new Error(String(err.message ?? 'IAP_ERROR'))));
      }
    });

    m.requestPurchase({ sku }).catch((err: unknown) => settle(() => reject(err)));
  });
}

// ── Aurora preview animation ──────────────────────────────────────────────────

function AuroraPreviewSwatch({ colors }: { colors: readonly [string, string, string] }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const layerStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + progress.value * 0.35,
  }));

  return (
    <View style={swatchS.container}>
      <LinearGradient colors={[...colors]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, layerStyle]}>
        <LinearGradient
          colors={[colors[2], colors[0], colors[1]]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Text style={swatchS.icon}>🌌</Text>
    </View>
  );
}

function StaticPreviewSwatch({
  colors,
  emoji,
}: {
  colors: readonly [string, string, string];
  emoji: string;
}) {
  return (
    <View style={swatchS.container}>
      <LinearGradient colors={[...colors]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Text style={swatchS.icon}>{emoji}</Text>
    </View>
  );
}

const swatchS = StyleSheet.create({
  container: {
    width: '100%',
    height: 90,
    borderRadius: Radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 32 },
});

// ── Theme Card ─────────────────────────────────────────────────────────────────

interface ThemeCardProps {
  spec: CustomThemeSpec;
  isOwned: boolean;
  isActive: boolean;
  isPurchasing: boolean;
  onPurchase: (spec: CustomThemeSpec) => void;
  onApply: (id: string) => void;
  onReset: () => void;
  enterDelay: number;
}

function ThemeCard({
  spec,
  isOwned,
  isActive,
  isPurchasing,
  onPurchase,
  onApply,
  onReset,
  enterDelay,
}: ThemeCardProps) {
  const scale = useSharedValue(0.92);
  const opacity = useSharedValue(0);
  const btnScale = useSharedValue(1);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(enterDelay, withSpring(1, { damping: 18, stiffness: 220 }));
    opacity.value = withDelay(enterDelay, withTiming(1, { duration: 350 }));
  }, []);

  useEffect(() => {
    if (isActive) {
      shimmer.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      shimmer.value = withTiming(0, { duration: 300 });
    }
  }, [isActive]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const borderStyle = useAnimatedStyle(() => ({
    opacity: isActive ? 0.7 + shimmer.value * 0.3 : 0.35,
  }));

  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const handleBtnPress = () => {
    if (isActive) {
      onReset();
    } else if (isOwned) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      btnScale.value = withSequence(
        withTiming(0.93, { duration: 60 }),
        withSpring(1, { damping: 12, stiffness: 700 }),
      );
      onApply(spec.id);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onPurchase(spec);
    }
  };

  const borderColors: readonly [string, string, string] = isActive
    ? [spec.accentPrimary, spec.accentSecondary, spec.accentPrimary]
    : ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.15)'];

  return (
    <Animated.View style={[tcS.wrapper, cardStyle]}>
      {/* Animated border glow */}
      <Animated.View style={[StyleSheet.absoluteFill, borderStyle, { borderRadius: Radius.xl }]}>
        <LinearGradient
          colors={[...borderColors]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: Radius.xl, padding: 1.5 }]}
        />
      </Animated.View>

      {/* Card body */}
      <LinearGradient
        colors={[spec.bgColors[0], spec.bgColors[1]]}
        style={tcS.card}
      >
        {/* Active indicator badge */}
        {isActive && (
          <LinearGradient
            colors={[spec.accentPrimary, spec.accentSecondary]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={tcS.activeBadge}
          >
            <Text style={tcS.activeBadgeText}>✓ 현재 적용 중</Text>
          </LinearGradient>
        )}

        {/* Preview swatch */}
        {spec.auroraAnimated ? (
          <AuroraPreviewSwatch colors={spec.previewColors} />
        ) : (
          <StaticPreviewSwatch colors={spec.previewColors} emoji={spec.emoji} />
        )}

        {/* Meta */}
        <View style={tcS.meta}>
          <Text style={tcS.emoji}>{spec.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[tcS.name, { color: spec.textColor }]}>{spec.name}</Text>
            <Text style={[tcS.tagline, { color: spec.textSecondary }]}>{spec.tagline}</Text>
          </View>
        </View>

        {/* Font family chip (Retro Pixel only) */}
        {spec.fontFamily != null && (
          <View style={[tcS.fontChip, { borderColor: spec.accentPrimary + '55' }]}>
            <Text style={[tcS.fontChipText, { color: spec.accentPrimary, fontFamily: spec.fontFamily }]}>
              Aa — {Platform.OS === 'ios' ? 'Courier' : 'monospace'} 폰트 적용
            </Text>
          </View>
        )}

        {/* Colour token chips */}
        <View style={tcS.chipRow}>
          <View style={[tcS.colorDot, { backgroundColor: spec.accentPrimary }]} />
          <Text style={[tcS.chipLabel, { color: spec.textSecondary }]}>{spec.accentPrimary}</Text>
          <View style={[tcS.colorDot, { backgroundColor: spec.accentSecondary }]} />
          <Text style={[tcS.chipLabel, { color: spec.textSecondary }]}>{spec.accentSecondary}</Text>
        </View>

        {/* Action button */}
        <Animated.View style={btnAnimStyle}>
          <Pressable
            style={[
              tcS.btn,
              isActive && tcS.btnActive,
              !isOwned && !isActive && { borderColor: spec.accentPrimary + '55' },
            ]}
            onPress={handleBtnPress}
            disabled={isPurchasing}
          >
            {isPurchasing ? (
              <LinearGradient
                colors={[spec.accentPrimary, spec.accentSecondary]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={tcS.btnGrad}
              >
                <ActivityIndicator size="small" color="rgba(0,0,0,0.7)" />
                <Text style={[tcS.btnText, { color: '#000' }]}>결제 처리 중...</Text>
              </LinearGradient>
            ) : isActive ? (
              <View style={[tcS.btnGrad, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                <Text style={[tcS.btnText, { color: spec.accentPrimary }]}>✕ 기본 테마로 돌아가기</Text>
              </View>
            ) : isOwned ? (
              <LinearGradient
                colors={[spec.accentPrimary, spec.accentSecondary]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={tcS.btnGrad}
              >
                <Text style={[tcS.btnText, { color: '#000', fontWeight: FontWeight.bold }]}>
                  ✦ 적용하기
                </Text>
              </LinearGradient>
            ) : (
              <View style={[tcS.btnGrad, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                <Text style={[tcS.btnText, { color: spec.accentPrimary }]}>
                  🛒 소장하기  {spec.priceLabel}
                </Text>
              </View>
            )}
          </Pressable>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}

const tcS = StyleSheet.create({
  wrapper: {
    borderRadius: Radius.xl,
    shadowColor: '#7C3AED',
    shadowRadius: 18,
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  card: {
    borderRadius: Radius.xl,
    margin: 1.5,
    padding: Spacing.md,
    gap: Spacing.sm,
    overflow: 'hidden',
  },
  activeBadge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activeBadgeText: {
    color: '#000',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  emoji: { fontSize: 26, marginTop: 1 },
  name: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    lineHeight: 20,
  },
  tagline: {
    fontSize: FontSize.xs,
    lineHeight: 16,
    marginTop: 2,
  },
  fontChip: {
    borderRadius: Radius.sm,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  fontChipText: {
    fontSize: FontSize.sm,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  chipLabel: {
    fontSize: 10,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.3,
  },
  btn: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  btnActive: {
    borderColor: 'rgba(255,255,255,0.12)',
  },
  btnGrad: {
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  btnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.2,
  },
});

// ── Apply flash overlay ───────────────────────────────────────────────────────
// Brief full-screen flash that fires when the user taps [적용하기]

function ApplyFlash({ visible }: { visible: boolean }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withSequence(
        withTiming(0.55, { duration: 80 }),
        withTiming(0, { duration: 320 }),
      );
    }
  }, [visible]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: '#7C3AED', zIndex: 999 }, style]}
      pointerEvents="none"
    />
  );
}

// ── Snackbar ──────────────────────────────────────────────────────────────────

function ShopSnackbar({
  message,
  visible,
  type,
}: {
  message: string;
  visible: boolean;
  type: 'error' | 'success';
}) {
  const ty = useSharedValue(80);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      ty.value = withSpring(0, { damping: 20, stiffness: 280 });
      opacity.value = withTiming(1, { duration: 180 });
    } else {
      ty.value = withTiming(80, { duration: 240, easing: Easing.in(Easing.quad) });
      opacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
    opacity: opacity.value,
  }));

  const isSuccess = type === 'success';

  return (
    <Animated.View style={[snkS.bar, { borderColor: isSuccess ? '#4ADE8044' : '#EF444444' }, animStyle]} pointerEvents="none">
      <Text style={snkS.icon}>{isSuccess ? '✨' : '⚠️'}</Text>
      <Text style={[snkS.text, { color: isSuccess ? '#86EFAC' : '#FCA5A5' }]}>{message}</Text>
    </Animated.View>
  );
}

const snkS = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15,10,30,0.96)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    zIndex: 9999,
    shadowColor: '#7C3AED',
    shadowRadius: 18,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  icon: { fontSize: 16 },
  text: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    lineHeight: 18,
  },
});

// ── Active theme indicator strip ──────────────────────────────────────────────

function ActiveThemeStrip({ spec }: { spec: CustomThemeSpec | null }) {
  const glow = useSharedValue(0);

  useEffect(() => {
    if (spec) {
      glow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      glow.value = withTiming(0, { duration: 300 });
    }
  }, [spec?.id]);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.3 + glow.value * 0.4,
  }));

  if (!spec) {
    return (
      <View style={stripS.container}>
        <Text style={stripS.label}>현재 테마:</Text>
        <View style={stripS.defaultBadge}>
          <Text style={stripS.defaultBadgeText}>기본 Twin.me 테마</Text>
        </View>
      </View>
    );
  }

  return (
    <Animated.View style={[stripS.container, glowStyle, { shadowColor: spec.accentPrimary }]}>
      <Text style={stripS.label}>현재 테마:</Text>
      <LinearGradient
        colors={[spec.accentPrimary, spec.accentSecondary]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={stripS.activeBadge}
      >
        <Text style={stripS.activeBadgeText}>
          {spec.emoji} {spec.name}
        </Text>
      </LinearGradient>
    </Animated.View>
  );
}

const stripS = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  label: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  defaultBadge: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  defaultBadgeText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: FontSize.xs,
  },
  activeBadge: {
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activeBadgeText: {
    color: '#000',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
});

// ── ThemeShop (main export) ───────────────────────────────────────────────────

interface ThemeShopProps {
  visible: boolean;
  onClose: () => void;
  t: ThemeTokens;
}

export function ThemeShop({ visible, onClose, t }: ThemeShopProps) {
  const { activeTheme, ownedThemeIds, applyTheme, markOwned, isFontLoaded } = useCustomTheme();

  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [applyFlash, setApplyFlash] = useState(false);
  const [snackMsg, setSnackMsg] = useState('');
  const [snackType, setSnackType] = useState<'error' | 'success'>('error');
  const [snackVisible, setSnackVisible] = useState(false);

  // Sheet slide animation
  const sheetTy = useSharedValue(SHEET_H);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      sheetTy.value = withSpring(0, { damping: 26, stiffness: 300, mass: 1 });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    } else {
      sheetTy.value = withTiming(SHEET_H, { duration: 280, easing: Easing.in(Easing.cubic) });
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTy.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  function showSnack(msg: string, type: 'error' | 'success' = 'error') {
    setSnackMsg(msg);
    setSnackType(type);
    setSnackVisible(true);
    setTimeout(() => setSnackVisible(false), 3200);
  }

  const handleApply = useCallback((id: string) => {
    if (!isFontLoaded) {
      showSnack('폰트 로딩 중입니다. 잠시 후 다시 시도해주세요.', 'error');
      return;
    }
    applyTheme(id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setApplyFlash(true);
    setTimeout(() => setApplyFlash(false), 500);
    showSnack('테마가 성공적으로 적용되었어요 ✨', 'success');
  }, [applyTheme, isFontLoaded]);

  const handleReset = useCallback(() => {
    applyTheme(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    showSnack('기본 Twin.me 테마로 돌아왔어요', 'success');
  }, [applyTheme]);

  const handlePurchase = useCallback(async (spec: CustomThemeSpec) => {
    setPurchasingId(spec.id);
    try {
      const transactionId = await purchaseThemeProduct(spec.sku);
      const owned = await verifyThemeOwnership(spec.sku, transactionId);
      if (owned) {
        markOwned(spec.id);
        handleApply(spec.id);
        showSnack(`${spec.name} 테마를 소장했어요 🎉`, 'success');
      } else {
        showSnack('소유권 확인에 실패했습니다. 고객센터에 문의해주세요.', 'error');
      }
    } catch (err) {
      const isCancelled = (err as { userCancelled?: boolean }).userCancelled === true;
      if (!isCancelled) {
        if ((err as Error).message === 'IAP_NOT_AVAILABLE') {
          showSnack('인앱 결제는 EAS Build가 필요합니다. (react-native-iap)', 'error');
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          showSnack('결제가 완료되지 않았어요. 스토어 계정 상태를 확인해 주세요 💳', 'error');
        }
      }
    } finally {
      setPurchasingId(null);
    }
  }, [markOwned, handleApply]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.72)' }, backdropStyle]}
        />
      </Pressable>

      {/* Sheet */}
      <Animated.View style={[shopS.sheet, sheetStyle]}>
        {/* Handle bar */}
        <View style={shopS.handle} />

        {/* Header */}
        <View style={shopS.header}>
          <View>
            <Text style={shopS.headerTitle}>나만의 에이전트 & 테마 꾸미기</Text>
            <Text style={shopS.headerSub}>스킨·배경·폰트를 직접 소장하고 실시간 적용해보세요 🎨</Text>
          </View>
          <Pressable style={shopS.closeBtn} onPress={onClose} hitSlop={12}>
            <Text style={shopS.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        {/* Active theme indicator */}
        <ActiveThemeStrip spec={activeTheme} />

        {/* Divider */}
        <View style={[shopS.divider, { backgroundColor: t.cardBorder }]} />

        {/* Theme cards */}
        <ScrollView
          contentContainerStyle={shopS.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {THEME_CATALOG.map((spec, i) => (
            <ThemeCard
              key={spec.id}
              spec={spec}
              isOwned={ownedThemeIds.includes(spec.id)}
              isActive={activeTheme?.id === spec.id}
              isPurchasing={purchasingId === spec.id}
              onPurchase={handlePurchase}
              onApply={handleApply}
              onReset={handleReset}
              enterDelay={i * 80}
            />
          ))}

          {/* Footer note */}
          <Text style={shopS.footerNote}>
            구매 완료된 테마는 앱을 재시작해도 유지됩니다.{'\n'}
            폰트 변경 사항은 모든 텍스트에 즉시 반영됩니다.
          </Text>
        </ScrollView>

        {/* Apply flash + snackbar */}
        <ApplyFlash visible={applyFlash} />
        <ShopSnackbar message={snackMsg} visible={snackVisible} type={snackType} />
      </Animated.View>
    </Modal>
  );
}

const shopS = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_H,
    backgroundColor: '#0E0B1E',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.28)',
    shadowColor: '#7C3AED',
    shadowRadius: 32,
    shadowOpacity: 0.55,
    shadowOffset: { width: 0, height: -8 },
    elevation: 24,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: 4,
    gap: Spacing.sm,
  },
  headerTitle: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    lineHeight: 22,
  },
  headerSub: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.xs,
    lineHeight: 16,
    marginTop: 3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  closeBtnText: {
    color: Colors.TEXT_MUTED,
    fontSize: 14,
    fontWeight: FontWeight.semibold,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.base,
    marginVertical: Spacing.xs,
  },
  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: TabBar.height + 32,
    gap: Spacing.md,
  },
  footerNote: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
    paddingVertical: Spacing.sm,
  },
});

// ── ThemeShopEntryCard (used in settings/index.tsx) ───────────────────────────

interface ThemeShopEntryCardProps {
  t: ThemeTokens;
  onPress: () => void;
}

export function ThemeShopEntryCard({ t, onPress }: ThemeShopEntryCardProps) {
  const { activeTheme } = useCustomTheme();
  const breathe = useSharedValue(0);

  useEffect(() => {
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const breatheStyle = useAnimatedStyle(() => ({
    opacity: 0.75 + breathe.value * 0.25,
  }));

  const accentColor = activeTheme?.accentPrimary ?? '#7C3AED';
  const secondaryColor = activeTheme?.accentSecondary ?? '#FF6B8B';

  return (
    <Pressable
      style={({ pressed }) => [entryS.card, { backgroundColor: t.card, borderColor: t.cardBorder }, pressed && { opacity: 0.8 }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      {/* Breathing neon border */}
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: Radius.lg }, breatheStyle]}>
        <LinearGradient
          colors={[accentColor + '40', secondaryColor + '20', accentColor + '10']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: Radius.lg }]}
        />
      </Animated.View>

      <View style={entryS.row}>
        {/* Icon */}
        <LinearGradient
          colors={[accentColor, secondaryColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={entryS.iconBg}
        >
          <Text style={entryS.iconEmoji}>🎨</Text>
        </LinearGradient>

        {/* Labels */}
        <View style={{ flex: 1 }}>
          <Text style={[entryS.label, { color: t.text }]}>나만의 에이전트 & 테마 꾸미기</Text>
          <Text style={[entryS.sub, { color: t.textSecondary }]}>
            {activeTheme
              ? `${activeTheme.emoji} ${activeTheme.name} 적용 중`
              : '스킨·배경·폰트 3종 테마 상점 →'}
          </Text>
        </View>

        {/* Active theme swatch or chevron */}
        {activeTheme ? (
          <LinearGradient
            colors={[activeTheme.accentPrimary, activeTheme.accentSecondary]}
            style={entryS.activeSwatch}
          >
            <Text style={entryS.activeSwatchText}>{activeTheme.emoji}</Text>
          </LinearGradient>
        ) : (
          <Text style={[entryS.chevron, { color: t.textMuted }]}>›</Text>
        )}
      </View>
    </Pressable>
  );
}

const entryS = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    overflow: 'hidden',
    shadowColor: '#7C3AED',
    shadowRadius: 10,
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconBg: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: { fontSize: 20 },
  label: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    lineHeight: 20,
  },
  sub: {
    fontSize: FontSize.xs,
    lineHeight: 16,
    marginTop: 2,
  },
  activeSwatch: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeSwatchText: { fontSize: 18 },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 24,
  },
});
