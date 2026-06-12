import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors, FontSize, FontWeight } from '../../src/styles/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const BAR_COUNT = 12;
const BAR_WIDTH = 4;
const BAR_GAP = 5;
const BAR_MAX_H = 48;
const BAR_MIN_H = 6;

// Phase offset (ms) and speed (ms/half-cycle) for organic non-uniform bounce
const BAR_PHASE = [0, 216, 108, 324, 54, 270, 162, 378, 72, 288, 180, 396];
const BAR_SPEED = [600, 700, 550, 750, 620, 680, 580, 720, 640, 590, 710, 660];

// ─── Single Equalizer Bar ─────────────────────────────────────────────────────

function EqBar({ index, collapse }: { index: number; collapse: boolean }) {
  const height = useSharedValue(BAR_MIN_H);
  const opacity = useSharedValue(1);

  // Start bouncing on mount
  useEffect(() => {
    height.value = withDelay(
      BAR_PHASE[index],
      withRepeat(
        withSequence(
          withTiming(BAR_MAX_H, {
            duration: BAR_SPEED[index],
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(BAR_MIN_H, {
            duration: BAR_SPEED[index],
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
        false,
      ),
    );
  }, []);

  // Collapse toward centre when `collapse` flips true
  useEffect(() => {
    if (!collapse) return;
    // Bars furthest from centre collapse last, creating a converge-to-middle effect
    const distFromCenter = Math.abs(index - (BAR_COUNT - 1) / 2);
    const delay = (BAR_COUNT / 2 - distFromCenter) * 30;
    height.value = withDelay(
      delay,
      withTiming(2, { duration: 350, easing: Easing.out(Easing.quad) }),
    );
    opacity.value = withDelay(
      delay + 220,
      withTiming(0, { duration: 250 }),
    );
  }, [collapse]);

  // Bars on left half use GRADIENT_START, right half use GRADIENT_END
  const barColor = index < BAR_COUNT / 2 ? Colors.GRADIENT_START : Colors.GRADIENT_END;

  const animStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.bar,
        { width: BAR_WIDTH, marginHorizontal: BAR_GAP / 2, backgroundColor: barColor },
        animStyle,
      ]}
    />
  );
}

// ─── Logo after merge ─────────────────────────────────────────────────────────

function DnaLogo() {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.18, { duration: 360, easing: Easing.out(Easing.back(1.6)) }),
      withTiming(1.0, { duration: 200, easing: Easing.inOut(Easing.quad) }),
    );
    opacity.value = withTiming(1, { duration: 320 });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return <Animated.Text style={[styles.logoText, animStyle]}>Twin.me</Animated.Text>;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

// Timeline (ms from mount):
//   0      → EQ bars bouncing
//   2200   → collapse bars
//   2900   → logo springs in (collapse 350ms + opacity fade 250ms + 100ms buffer)
//   3500   → tagline fades in (logo fully settled)
//   5400   → navigate to matching

export default function SplashScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<'eq' | 'logo' | 'tagline'>('eq');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('logo'), 2600);      // bars collapsed
    const t2 = setTimeout(() => setPhase('tagline'), 3300);   // logo settled
    const t3 = setTimeout(() => router.replace('/(auth)/ingestion'), 5400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <View style={styles.container}>
      {/* EQ bars — always rendered, collapse prop drives exit animation */}
      <View style={styles.eqRow}>
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <EqBar key={i} index={i} collapse={phase !== 'eq'} />
        ))}
      </View>

      {phase !== 'eq' && <DnaLogo />}

      {phase === 'tagline' && (
        <Animated.Text
          entering={FadeIn.delay(0).duration(900)}
          style={styles.tagline}
        >
          내가 없는 순간에도,{'\n'}너를 가장 나답게 사랑할 또 하나의 나.
        </Animated.Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BG_DARK_MIDNIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eqRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: BAR_MAX_H + 8,
  },
  bar: {
    borderRadius: 3,
    alignSelf: 'flex-end',
  },
  logoText: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.extrabold,
    letterSpacing: -0.5,
    marginTop: 24,
  },
  tagline: {
    color: Colors.TEXT_ON_DARK_SECONDARY,
    fontSize: FontSize.base,
    fontWeight: FontWeight.regular,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 16,
    paddingHorizontal: 32,
  },
});
