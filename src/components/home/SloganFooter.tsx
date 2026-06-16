// Step #53 — Dynamic Slogan Engine
// - highlight count < 5  → show default signature slogan
// - highlight count ≥ 5  → swap with random KakaoTalk quote, formatted as:
//   Twin.me - "${quote}" - YY.MM.어느날 밤/낮

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useAppContext } from '../../context/AppContext';
import { formatHighlightSlogan, pickRandomHighlight } from '../../services/kakaoHighlightService';
import { FontSize, FontWeight, Spacing, ThemeTokens } from '../../styles/theme';

const DEFAULT_SLOGAN = '"내가 없는 순간에도,\n너를 가장 나답게 사랑할 또 하나의 나."';
const SWAP_THRESHOLD = 5;

interface Props {
  t: ThemeTokens;
}

export default function SloganFooter({ t }: Props) {
  const { highlightCards } = useAppContext();
  const [displaySlogan, setDisplaySlogan] = useState<string>(DEFAULT_SLOGAN);
  const [isCustom, setIsCustom] = useState(false);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const shouldSwap = highlightCards.length >= SWAP_THRESHOLD;

    opacity.value = withTiming(0, { duration: 280 }, () => {
      if (shouldSwap) {
        const pick = pickRandomHighlight(highlightCards);
        if (pick) {
          setDisplaySlogan(formatHighlightSlogan(pick));
          setIsCustom(true);
        } else {
          setDisplaySlogan(DEFAULT_SLOGAN);
          setIsCustom(false);
        }
      } else {
        setDisplaySlogan(DEFAULT_SLOGAN);
        setIsCustom(false);
      }
      opacity.value = withTiming(1, { duration: 380 });
    });
  }, [highlightCards.length]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.container}>
      <Text style={[styles.divider, { color: t.divider }]}>· · ·</Text>

      <Animated.Text
        style={[
          styles.slogan,
          { color: t.textMuted },
          isCustom && styles.sloganCustom,
          animStyle,
        ]}
        numberOfLines={isCustom ? undefined : 2}
      >
        {displaySlogan}
      </Animated.Text>

      <Animated.Text style={[styles.brand, { color: t.textMuted }, animStyle]}>
        — twin.me
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  divider: {
    fontSize: FontSize.base,
    letterSpacing: 6,
    marginBottom: Spacing.xs,
    opacity: 0.4,
  },
  slogan: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
    lineHeight: FontSize.sm * 1.9,
    fontStyle: 'italic',
    opacity: 0.65,
  },
  sloganCustom: {
    fontSize: FontSize.xs,
    opacity: 0.8,
    lineHeight: FontSize.xs * 2,
  },
  brand: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    opacity: 0.45,
    letterSpacing: 1.5,
    marginTop: 4,
  },
});
