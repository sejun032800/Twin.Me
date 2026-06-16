/**
 * TabTutorialOverlay — 신규 유저 스포트라이트 코치마크 시스템
 *
 * 기술: SVG 없이 4-rect punch-out 기법으로 spotlight 효과 구현
 *   ┌──── TOP (dark) ─────┐
 *   │LEFT │ TARGET │ RIGHT │   ← spotlight "hole"
 *   └─── BOTTOM (dark) ───┘
 *
 * 사용법:
 *   const ref1 = useRef<View>(null);
 *   const ref2 = useRef<View>(null);
 *   const steps: TutorialStep[] = [
 *     { targetRef: ref1, title: '제목', description: '설명', arrowDir: 'below' },
 *     { targetRef: ref2, title: '제목2', description: '설명2', arrowDir: 'above' },
 *   ];
 *   <View ref={ref1}> ... </View>
 *   <TabTutorialOverlay steps={steps} visible={shouldShow} onDone={markDone} />
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { BrandTokens, Colors, FontSize, FontWeight, Radius } from '../../styles/theme';

const { width: SW, height: SH } = Dimensions.get('screen');

// ─── Types ────────────────────────────────────────────────────────────────────

export type ArrowDirection = 'above' | 'below' | 'left' | 'right';

export interface TutorialStep {
  targetRef: React.RefObject<View | null>;
  title: string;
  description: string;
  /** Where to render the label bubble relative to the spotlight */
  arrowDir: ArrowDirection;
  /** Optional spotlight padding around the target (default 12) */
  pad?: number;
}

interface SpotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_SPOT: SpotRect = { x: SW / 2 - 80, y: SH / 2 - 60, w: 160, h: 120 };
const SPRING_CFG = { damping: 22, stiffness: 260 };
const BUBBLE_W = 220;
const BUBBLE_PADDING = 16;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function measureRef(ref: React.RefObject<View | null>): Promise<SpotRect> {
  return new Promise((resolve) => {
    if (!ref.current) { resolve(DEFAULT_SPOT); return; }
    ref.current.measureInWindow((x, y, w, h) => {
      resolve({ x, y, w, h });
    });
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  steps: TutorialStep[];
  visible: boolean;
  onDone: () => void;
}

export default function TabTutorialOverlay({ steps, visible, onDone }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const [spot, setSpot] = useState<SpotRect>(DEFAULT_SPOT);
  const [mounted, setMounted] = useState(false);

  // Animated shared values for the 4 dark rects
  const topH = useSharedValue(0);
  const botY = useSharedValue(SH);
  const botH = useSharedValue(0);
  const leftW = useSharedValue(0);
  const rightX = useSharedValue(SW);
  const rightW = useSharedValue(0);
  const midY = useSharedValue(0);
  const midH = useSharedValue(120);

  // Entry fade
  const overlayOpacity = useSharedValue(0);
  const bubbleOpacity = useSharedValue(0);

  // Glow ring pulse
  const glowScale = useSharedValue(1);

  const isBusyRef = useRef(false);

  // ── applySpot: update 4-rect layout from a SpotRect ─────────────────────
  const applySpot = useCallback(
    (r: SpotRect, pad: number, animate: boolean) => {
      const p = pad;
      const sx = Math.max(0, r.x - p);
      const sy = Math.max(0, r.y - p);
      const sw = r.w + p * 2;
      const sh = r.h + p * 2;

      const cfg = animate ? SPRING_CFG : { duration: 0 };
      const fn = animate ? withSpring : (v: number) => withTiming(v, { duration: 0 });

      topH.value = animate ? withSpring(sy, SPRING_CFG) : sy;
      midY.value = animate ? withSpring(sy, SPRING_CFG) : sy;
      midH.value = animate ? withSpring(sh, SPRING_CFG) : sh;
      botY.value = animate ? withSpring(sy + sh, SPRING_CFG) : sy + sh;
      botH.value = animate ? withSpring(SH - sy - sh, SPRING_CFG) : SH - sy - sh;
      leftW.value = animate ? withSpring(sx, SPRING_CFG) : sx;
      rightX.value = animate ? withSpring(sx + sw, SPRING_CFG) : sx + sw;
      rightW.value = animate ? withSpring(SW - sx - sw, SPRING_CFG) : SW - sx - sw;

      setSpot({ x: sx, y: sy, w: sw, h: sh });
    },
    [topH, midY, midH, botY, botH, leftW, rightX, rightW],
  );

  // ── loadStep: measure target ref and update layout ───────────────────────
  const loadStep = useCallback(
    async (idx: number, animate: boolean) => {
      if (isBusyRef.current) return;
      isBusyRef.current = true;
      const step = steps[idx];
      const pad = step.pad ?? 12;
      // Small delay so layout is flushed before measuring
      await new Promise<void>((r) => setTimeout(r, animate ? 0 : 80));
      const r = await measureRef(step.targetRef);
      applySpot(r, pad, animate);
      bubbleOpacity.value = withTiming(1, { duration: 200 });
      glowScale.value = withSpring(1.06, { damping: 8, stiffness: 140 });
      setTimeout(() => {
        glowScale.value = withSpring(1, { damping: 12, stiffness: 200 });
      }, 350);
      isBusyRef.current = false;
    },
    [steps, applySpot, bubbleOpacity, glowScale],
  );

  // ── mount / show ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) {
      overlayOpacity.value = withTiming(0, { duration: 220 });
      setTimeout(() => setMounted(false), 240);
      return;
    }
    setStepIdx(0);
    setMounted(true);
    overlayOpacity.value = withTiming(1, { duration: 300 });
    bubbleOpacity.value = withTiming(0, { duration: 0 });
    // Load step after mount delay
    setTimeout(() => loadStep(0, false), 150);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── advance step ─────────────────────────────────────────────────────────
  const advance = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    const next = stepIdx + 1;
    if (next >= steps.length) {
      overlayOpacity.value = withTiming(0, { duration: 220 });
      setTimeout(() => {
        setMounted(false);
        onDone();
      }, 240);
      return;
    }
    bubbleOpacity.value = withTiming(0, { duration: 120 });
    setStepIdx(next);
    loadStep(next, true);
  }, [stepIdx, steps.length, overlayOpacity, bubbleOpacity, loadStep, onDone]);

  // ── dismiss (X button) ───────────────────────────────────────────────────
  const dismiss = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    overlayOpacity.value = withTiming(0, { duration: 200 });
    setTimeout(() => {
      setMounted(false);
      onDone();
    }, 220);
  }, [overlayOpacity, onDone]);

  // ── animated styles ───────────────────────────────────────────────────────
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));
  const topStyle = useAnimatedStyle(() => ({
    height: topH.value,
  }));
  const botStyle = useAnimatedStyle(() => ({
    top: botY.value,
    height: botH.value,
  }));
  const leftStyle = useAnimatedStyle(() => ({
    top: midY.value,
    height: midH.value,
    width: leftW.value,
  }));
  const rightStyle = useAnimatedStyle(() => ({
    top: midY.value,
    height: midH.value,
    left: rightX.value,
    width: rightW.value,
  }));
  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
  }));
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: bubbleOpacity.value,
  }));

  if (!mounted) return null;

  const step = steps[Math.min(stepIdx, steps.length - 1)];
  const isLast = stepIdx === steps.length - 1;

  // Bubble position calculation
  const bubbleLeft = Math.max(
    BUBBLE_PADDING,
    Math.min(spot.x + spot.w / 2 - BUBBLE_W / 2, SW - BUBBLE_W - BUBBLE_PADDING),
  );

  let bubbleTop: number;
  let arrowAbove = false; // arrow points up (bubble is below spotlight)
  const bubbleH = 110;
  const GAP = 20;

  if (step.arrowDir === 'below') {
    bubbleTop = spot.y + spot.h + GAP;
    arrowAbove = true;
  } else if (step.arrowDir === 'above') {
    bubbleTop = spot.y - bubbleH - GAP;
    arrowAbove = false;
  } else {
    // default: place below if room, else above
    const fitsBelow = spot.y + spot.h + GAP + bubbleH < SH - 80;
    bubbleTop = fitsBelow ? spot.y + spot.h + GAP : spot.y - bubbleH - GAP;
    arrowAbove = fitsBelow;
  }

  // Clamp bubble vertically
  bubbleTop = Math.max(60, Math.min(bubbleTop, SH - bubbleH - 80));

  // Arrow tip horizontal center = spotlight center
  const arrowLeft = spot.x + spot.w / 2 - bubbleLeft - 10;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, overlayStyle]}
      pointerEvents="box-none"
    >
      {/* ── 4 dark rects ────────────────────────────────────────────── */}
      <Animated.View style={[styles.darkRect, styles.topRect, topStyle]} />
      <Animated.View style={[styles.darkRect, styles.botRect, botStyle]} />
      <Animated.View style={[styles.darkRect, styles.leftRect, leftStyle]} />
      <Animated.View style={[styles.darkRect, styles.rightRect, rightStyle]} />

      {/* ── Glow ring around spotlight ───────────────────────────────── */}
      <Animated.View
        style={[
          styles.glowRing,
          {
            left: spot.x - 3,
            top: spot.y - 3,
            width: spot.w + 6,
            height: spot.h + 6,
            borderRadius: 14,
          },
          glowStyle,
        ]}
        pointerEvents="none"
      />

      {/* ── Tap catcher (advance on tap) ─────────────────────────────── */}
      <Pressable style={StyleSheet.absoluteFill} onPress={advance} />

      {/* ── Label bubble ─────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.bubble,
          { top: bubbleTop, left: bubbleLeft, width: BUBBLE_W },
          bubbleStyle,
        ]}
        pointerEvents="box-none"
      >
        {/* Arrow connector */}
        {arrowAbove && (
          <View
            style={[
              styles.arrowUp,
              { left: Math.max(10, Math.min(arrowLeft, BUBBLE_W - 30)) },
            ]}
          />
        )}
        {!arrowAbove && (
          <View
            style={[
              styles.arrowDown,
              { left: Math.max(10, Math.min(arrowLeft, BUBBLE_W - 30)) },
            ]}
          />
        )}

        {/* Content */}
        <LinearGradient
          colors={['#1A1030', '#0E0824']}
          style={styles.bubbleInner}
        >
          {/* Step indicator dots */}
          <View style={styles.dots}>
            {steps.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === stepIdx ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>

          {/* Title */}
          <Text style={styles.bubbleTitle}>{step.title}</Text>

          {/* Description */}
          <Text style={styles.bubbleDesc}>{step.description}</Text>

          {/* CTA */}
          <Pressable onPress={advance} style={styles.ctaBtn} hitSlop={8}>
            <LinearGradient
              colors={[Colors.GRADIENT_START, Colors.GRADIENT_MID, Colors.GRADIENT_END]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              <Text style={styles.ctaText}>
                {isLast ? '시작하기 ✨' : `다음  →  ${stepIdx + 1}/${steps.length}`}
              </Text>
            </LinearGradient>
          </Pressable>
        </LinearGradient>
      </Animated.View>

      {/* ── Close (✕) button ─────────────────────────────────────────── */}
      <Pressable
        style={styles.closeBtn}
        onPress={dismiss}
        hitSlop={12}
      >
        <Text style={styles.closeTxt}>✕</Text>
      </Pressable>

      {/* ── "화면을 터치하면 다음으로" hint ─────────────────────────── */}
      <Animated.Text
        style={[styles.tapHint, { top: spot.y > SH * 0.6 ? spot.y - 28 : spot.y + spot.h + 8 }, bubbleStyle]}
        pointerEvents="none"
      >
        화면을 터치하면 다음으로 넘어갑니다
      </Animated.Text>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const DIM_COLOR = 'rgba(5,3,18,0.82)';

const styles = StyleSheet.create({
  root: {
    zIndex: 9999,
    elevation: 9999,
  },
  darkRect: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: DIM_COLOR,
  },
  topRect: {
    top: 0,
  },
  botRect: {
    right: 0,
    left: 0,
  },
  leftRect: {
    position: 'absolute',
    left: 0,
    backgroundColor: DIM_COLOR,
  },
  rightRect: {
    position: 'absolute',
    backgroundColor: DIM_COLOR,
  },
  glowRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: BrandTokens.PRIMARY,
    shadowColor: BrandTokens.PRIMARY,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  bubble: {
    position: 'absolute',
    borderRadius: Radius.xl ?? 16,
    overflow: 'hidden',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(188,132,238,0.35)',
  },
  bubbleInner: {
    padding: 16,
    gap: 8,
    borderRadius: Radius.xl ?? 16,
  },
  arrowUp: {
    position: 'absolute',
    top: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#1A1030',
  },
  arrowDown: {
    position: 'absolute',
    bottom: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#0E0824',
  },
  dots: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: BrandTokens.PRIMARY,
    width: 18,
  },
  dotInactive: {
    backgroundColor: 'rgba(244,143,177,0.35)',
  },
  bubbleTitle: {
    fontSize: FontSize.md ?? 16,
    fontWeight: FontWeight.bold ?? '700',
    color: Colors.TEXT_ON_DARK,
    letterSpacing: -0.3,
  },
  bubbleDesc: {
    fontSize: FontSize.sm ?? 13,
    color: Colors.TEXT_ON_DARK_SECONDARY,
    lineHeight: 18,
  },
  ctaBtn: {
    marginTop: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  ctaGradient: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: FontSize.sm ?? 13,
    fontWeight: FontWeight.semibold ?? '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 32,
    right: 20,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(30,20,50,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(188,132,238,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10001,
  },
  closeTxt: {
    color: Colors.TEXT_ON_DARK,
    fontSize: 14,
    fontWeight: FontWeight.semibold ?? '600',
  },
  tapHint: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.3,
  },
});
