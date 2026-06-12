import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  FontSize,
  FontWeight,
  Radius,
  Shadows,
  Spacing,
  ThemeTokens,
} from '../../styles/theme';

const MEMORY_RINGS = [
  { id: '1', label: '에펠탑', emoji: '🗼' },
  { id: '2', label: '커피 데이트', emoji: '☕' },
  { id: '3', label: '선물', emoji: '🎁' },
  { id: '4', label: '100일', emoji: '💝' },
  { id: '5', label: '부산여행', emoji: '✈️' },
  { id: '6', label: '겨울밤', emoji: '⛄' },
];

const RING_SIZE = 72;
const RING_INNER = 63;
const RING_BORDER = (RING_SIZE - RING_INNER) / 2;

function RingItem({ item, t }: { item: typeof MEMORY_RINGS[0]; t: ThemeTokens }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      style={styles.ringWrapper}
      onPressIn={() => { scale.value = withTiming(0.92, { duration: 80 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 120 }); }}
    >
      <Animated.View style={animStyle}>
        <LinearGradient
          colors={t.gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBorder}
        >
          <View style={[styles.ringInner, { backgroundColor: t.avatarInner }]}>
            <Text style={styles.emoji}>{item.emoji}</Text>
          </View>
        </LinearGradient>
      </Animated.View>
      <Text style={[styles.ringLabel, { color: t.textSecondary }]} numberOfLines={1}>
        {item.label}
      </Text>
    </Pressable>
  );
}

interface Props {
  t: ThemeTokens;
}

export default function MemoryRingSection({ t }: Props) {
  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: t.text }]}>추억 아카이브</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        decelerationRate="fast"
      >
        {MEMORY_RINGS.map((item) => (
          <RingItem key={item.id} item={item} t={t} />
        ))}

        {/* + 추가 링 버튼 */}
        <Pressable style={styles.ringWrapper}>
          <View
            style={[
              styles.gradientBorder,
              styles.addBorder,
              { borderColor: t.divider },
            ]}
          >
            <View style={[styles.ringInner, { backgroundColor: t.card }]}>
              <Text style={[styles.plusIcon, { color: t.textMuted }]}>+</Text>
            </View>
          </View>
          <Text style={[styles.ringLabel, { color: t.textMuted }]}>추가</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.lg,
    paddingRight: Spacing.base,
    paddingBottom: Spacing.xs,
  },
  ringWrapper: {
    alignItems: 'center',
    gap: 8,
    width: RING_SIZE,
  },
  gradientBorder: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.glow,
    shadowOpacity: 0.25,
  },
  ringInner: {
    width: RING_INNER,
    height: RING_INNER,
    borderRadius: RING_INNER / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 28 },
  ringLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
    width: RING_SIZE,
  },
  addBorder: {
    borderWidth: RING_BORDER,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  plusIcon: {
    fontSize: 24,
    fontWeight: FontWeight.regular,
  },
});
