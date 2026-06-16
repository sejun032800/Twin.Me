import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useAppContext } from '../../context/AppContext';
import type { ThemeTokens } from '../../styles/theme';
import { FontSize, FontWeight, Spacing } from '../../styles/theme';
import type { MemoryRing } from '../../types/gallery';
import StoryViewer from '../StoryViewer';

const RING_SIZE = 72;
const RING_INNER = 63;

// Rainbow gradient for AI ring border — matches brand palette
const AI_RING_COLORS: [string, string, string] = ['#7C3AED', '#D946EF', '#FF6B8B'];

// ─── Single ring item ─────────────────────────────────────────────────────────

function RingItem({
  ring,
  onPress,
}: {
  ring: MemoryRing;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withTiming(0.88, { duration: 80 });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };
  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: 150 });
  };

  return (
    <Pressable
      style={styles.ringWrapper}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
    >
      <Animated.View style={animStyle}>
        <LinearGradient
          colors={AI_RING_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBorder}
        >
          <View style={styles.ringInner}>
            {ring.coverUri ? (
              <Image
                source={{ uri: ring.coverUri }}
                style={styles.coverImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.placeholderEmoji}>📸</Text>
            )}
          </View>
        </LinearGradient>
      </Animated.View>
      <Text style={styles.ringLabel} numberOfLines={1}>
        {ring.title}
      </Text>
    </Pressable>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface Props {
  t: ThemeTokens;
}

export default function AIMemoryRingSection({ t }: Props) {
  const { memoryRings } = useAppContext();
  const [selectedRing, setSelectedRing] = useState<MemoryRing | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);

  if (memoryRings.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: t.text }]}>
        ✨ 트윈이가 엮은 우리의 추억
      </Text>
      <Text style={[styles.sectionSub, { color: t.textMuted }]}>
        AI가 사진을 분석해 자동으로 엮은 추억 링이에요
      </Text>

      <FlatList
        horizontal
        data={memoryRings}
        keyExtractor={(r) => r.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        renderItem={({ item }) => (
          <RingItem
            ring={item}
            onPress={() => {
              setSelectedRing(item);
              setViewerVisible(true);
            }}
          />
        )}
      />

      <StoryViewer
        ring={selectedRing}
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  sectionSub: {
    fontSize: FontSize.xs,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.xs,
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
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.50,
    shadowRadius: 8,
    elevation: 8,
  },
  ringInner: {
    width: RING_INNER,
    height: RING_INNER,
    borderRadius: RING_INNER / 2,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImage: {
    width: RING_INNER,
    height: RING_INNER,
    borderRadius: RING_INNER / 2,
  },
  placeholderEmoji: {
    fontSize: 28,
  },
  ringLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
    color: '#94A3B8',
    width: RING_SIZE,
  },
});
