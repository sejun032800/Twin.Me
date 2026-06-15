/**
 * BudgetRangeSlider.tsx
 *
 * Custom dual-thumb range slider built with Reanimated 4 + GestureHandler 2.
 * No external slider library — uses existing deps only.
 * Range: ₩0 ~ ₩300,000  |  Step: ₩10,000  |  Dark-mode neon theme
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

// ─── Slider Constants ─────────────────────────────────────────────────────────

const B_MIN   = 0;
const B_MAX   = 300_000;
const B_STEP  = 10_000;
const N_STEPS = (B_MAX - B_MIN) / B_STEP; // 30
const THUMB_D = 28;
const THUMB_R = THUMB_D / 2;
const TRACK_H = 5;
const TRACK_VERT = (THUMB_D - TRACK_H) / 2;

// ─── Worklet helpers (must run on UI thread inside gesture callbacks) ─────────

function posToVal(pos: number, tw: number): number {
  'worklet';
  const usable = Math.max(1, tw - THUMB_D);
  const ratio = Math.max(0, Math.min(1, pos / usable));
  const stepIdx = Math.round(ratio * N_STEPS);
  return B_MIN + stepIdx * B_STEP;
}

function valToPos(val: number, tw: number): number {
  'worklet';
  const usable = Math.max(1, tw - THUMB_D);
  return ((val - B_MIN) / (B_MAX - B_MIN)) * usable;
}

// ─── Helpers (JS thread only) ─────────────────────────────────────────────────

function fmtKRW(val: number): string {
  if (val === 0) return '₩0';
  return `₩${val.toLocaleString('ko-KR')}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BudgetRangeSliderProps {
  minValue: number;
  maxValue: number;
  /** Called on every drag frame — use for real-time label updates only. */
  onValuesChange?: (min: number, max: number) => void;
  /** Called when the user releases a thumb — use to trigger API re-fetch. */
  onValuesChangeFinish: (min: number, max: number) => void;
}

// ─── BudgetRangeSlider ────────────────────────────────────────────────────────

export function BudgetRangeSlider({
  minValue,
  maxValue,
  onValuesChange,
  onValuesChangeFinish,
}: BudgetRangeSliderProps) {
  const trackW    = useSharedValue(0);
  const lowPos    = useSharedValue(0);
  const highPos   = useSharedValue(0);
  const startLow  = useSharedValue(0);
  const startHigh = useSharedValue(0);

  const [displayMin, setDisplayMin] = useState(minValue);
  const [displayMax, setDisplayMax] = useState(maxValue);
  const [isReady, setIsReady]       = useState(false);

  // ── Layout handler (runs on JS thread) ────────────────────────────────────
  const handleLayout = (width: number) => {
    trackW.value  = width;
    lowPos.value  = valToPos(minValue, width);
    highPos.value = valToPos(maxValue, width);
    setIsReady(true);
  };

  // ── Low thumb gesture ──────────────────────────────────────────────────────
  const lowGesture = Gesture.Pan()
    .onBegin(() => {
      startLow.value = lowPos.value;
    })
    .onUpdate((e) => {
      const tw = trackW.value;
      const minGapPx = (B_STEP / B_MAX) * Math.max(1, tw - THUMB_D);
      const clamped = Math.max(
        0,
        Math.min(highPos.value - minGapPx, startLow.value + e.translationX),
      );
      lowPos.value = clamped;
      const val = posToVal(clamped, tw);
      runOnJS(setDisplayMin)(val);
      if (onValuesChange) {
        runOnJS(onValuesChange)(val, posToVal(highPos.value, tw));
      }
    })
    .onEnd(() => {
      const tw = trackW.value;
      const snappedVal = posToVal(lowPos.value, tw);
      const snappedPos = valToPos(snappedVal, tw);
      lowPos.value = withSpring(snappedPos, { damping: 22, stiffness: 320 });
      runOnJS(setDisplayMin)(snappedVal);
      runOnJS(onValuesChangeFinish)(snappedVal, posToVal(highPos.value, tw));
    });

  // ── High thumb gesture ─────────────────────────────────────────────────────
  const highGesture = Gesture.Pan()
    .onBegin(() => {
      startHigh.value = highPos.value;
    })
    .onUpdate((e) => {
      const tw = trackW.value;
      const usable = tw - THUMB_D;
      const minGapPx = (B_STEP / B_MAX) * Math.max(1, usable);
      const clamped = Math.max(
        lowPos.value + minGapPx,
        Math.min(usable, startHigh.value + e.translationX),
      );
      highPos.value = clamped;
      const val = posToVal(clamped, tw);
      runOnJS(setDisplayMax)(val);
      if (onValuesChange) {
        runOnJS(onValuesChange)(posToVal(lowPos.value, tw), val);
      }
    })
    .onEnd(() => {
      const tw = trackW.value;
      const snappedVal = posToVal(highPos.value, tw);
      const snappedPos = valToPos(snappedVal, tw);
      highPos.value = withSpring(snappedPos, { damping: 22, stiffness: 320 });
      runOnJS(setDisplayMax)(snappedVal);
      runOnJS(onValuesChangeFinish)(posToVal(lowPos.value, tw), snappedVal);
    });

  // ── Animated styles ────────────────────────────────────────────────────────
  const activeStyle = useAnimatedStyle(() => ({
    left: lowPos.value + THUMB_R,
    width: Math.max(0, highPos.value - lowPos.value),
  }));

  const lowThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: lowPos.value }],
  }));

  const highThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: highPos.value }],
  }));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={brsS.wrap}>
      {/* Range badge row */}
      <View style={brsS.labelRow}>
        <View style={brsS.minBadge}>
          <Text style={brsS.minTxt}>{fmtKRW(displayMin)}</Text>
        </View>
        <Text style={brsS.sep}>–</Text>
        <View style={brsS.maxBadge}>
          <Text style={brsS.maxTxt}>{fmtKRW(displayMax)}</Text>
        </View>
      </View>

      {/* Slider track + thumbs */}
      <View
        style={[brsS.trackContainer, !isReady && brsS.hidden]}
        onLayout={(e) => handleLayout(e.nativeEvent.layout.width)}
      >
        {/* Inactive (gray) background track */}
        <View style={brsS.trackBg} />

        {/* Active neon gradient fill */}
        <Animated.View style={[brsS.activeWrap, activeStyle]}>
          <LinearGradient
            colors={['#22D3EE', '#7C3AED', '#FF6B8B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={brsS.activeFill}
          />
        </Animated.View>

        {/* Low (left) thumb */}
        <Animated.View style={[brsS.thumbWrap, lowThumbStyle]}>
          <GestureDetector gesture={lowGesture}>
            <View style={brsS.thumb}>
              <View style={[brsS.thumbDot, brsS.dotCyan]} />
            </View>
          </GestureDetector>
        </Animated.View>

        {/* High (right) thumb */}
        <Animated.View style={[brsS.thumbWrap, highThumbStyle]}>
          <GestureDetector gesture={highGesture}>
            <View style={brsS.thumb}>
              <View style={[brsS.thumbDot, brsS.dotPink]} />
            </View>
          </GestureDetector>
        </Animated.View>
      </View>

      {/* Endpoint labels */}
      <View style={brsS.limitsRow}>
        <Text style={brsS.limitTxt}>₩0</Text>
        <Text style={brsS.limitTxt}>₩30만</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const brsS = StyleSheet.create({
  wrap: { gap: 10, paddingHorizontal: 2 },
  hidden: { opacity: 0 },

  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  minBadge: {
    backgroundColor: 'rgba(34,211,238,0.12)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.38)',
  },
  minTxt: { color: '#22D3EE', fontSize: 12, fontWeight: '700' as const, letterSpacing: -0.3 },
  maxBadge: {
    backgroundColor: 'rgba(255,107,139,0.12)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,107,139,0.38)',
  },
  maxTxt: { color: '#FF6B8B', fontSize: 12, fontWeight: '700' as const, letterSpacing: -0.3 },
  sep: { color: '#475569', fontSize: 13, fontWeight: '600' as const },

  trackContainer: {
    height: THUMB_D,
    position: 'relative',
  },
  trackBg: {
    position: 'absolute',
    left: THUMB_R,
    right: THUMB_R,
    top: TRACK_VERT,
    height: TRACK_H,
    backgroundColor: 'rgba(51,65,85,0.85)',
    borderRadius: TRACK_H / 2,
  },
  activeWrap: {
    position: 'absolute',
    top: TRACK_VERT,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    overflow: 'hidden',
  },
  activeFill: { flex: 1 },

  thumbWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: THUMB_D,
    height: THUMB_D,
  },
  thumb: {
    width: THUMB_D,
    height: THUMB_D,
    borderRadius: THUMB_R,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.42,
    shadowRadius: 6,
    elevation: 9,
    borderWidth: 2,
    borderColor: 'rgba(124,58,237,0.35)',
  },
  thumbDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotCyan: { backgroundColor: '#22D3EE' },
  dotPink: { backgroundColor: '#FF6B8B' },

  limitsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  limitTxt: { color: '#334155', fontSize: 10, fontWeight: '600' as const },
});
