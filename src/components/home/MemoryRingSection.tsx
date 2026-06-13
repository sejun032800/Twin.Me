import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { DateCourse, useAppContext } from '../../context/AppContext';
import {
  FontSize,
  FontWeight,
  Radius,
  Shadows,
  Spacing,
  ThemeTokens,
} from '../../styles/theme';

const { width: SCREEN_W } = Dimensions.get('window');

const RING_SIZE = 72;
const RING_INNER = 63;
const RING_BORDER = (RING_SIZE - RING_INNER) / 2;
const GRAY_RING: [string, string, string] = ['#475569', '#64748B', '#94A3B8'];

// ─── Detail Popup Modal ───────────────────────────────────────────────────────

function DetailModal({
  item,
  visible,
  onClose,
  t,
}: {
  item: DateCourse | null;
  visible: boolean;
  onClose: () => void;
  t: ThemeTokens;
}) {
  if (!item) return null;

  const cardBg = t.isLight
    ? 'rgba(255,245,247,0.97)'
    : 'rgba(10,13,26,0.96)';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        {/* Stop touch propagation so card taps don't close modal */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {}}
          style={[styles.cardOuter, { maxWidth: Math.min(SCREEN_W - 40, 380) }]}
        >
          <LinearGradient
            colors={['rgba(124,58,237,0.55)', 'rgba(217,70,239,0.35)', 'rgba(255,107,139,0.25)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardGradBorder}
          >
            <View style={[styles.cardInner, { backgroundColor: cardBg }]}>
              {/* Photo */}
              {item.imageUrl ? (
                <Image
                  source={{ uri: item.imageUrl }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ) : (
                <LinearGradient
                  colors={t.gradientColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.photo, styles.photoPlaceholder]}
                >
                  <Text style={styles.photoPlaceholderEmoji}>📸</Text>
                  <Text style={styles.photoPlaceholderText}>아직 사진이 없어요</Text>
                </LinearGradient>
              )}

              {/* Close button */}
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>

              {/* Info */}
              <View style={styles.info}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaEmoji}>📍</Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.metaTitle, { color: t.text }]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text style={[styles.metaDate, { color: t.textMuted }]}>
                      {item.date}
                    </Text>
                  </View>
                  {item.myRating > 0 && (
                    <Text style={[styles.rating, { color: t.textMuted }]}>
                      {'⭐'.repeat(item.myRating)}
                    </Text>
                  )}
                </View>

                <View style={[styles.divider, { backgroundColor: t.divider }]} />

                <Text style={[styles.ootdLabel, { color: t.textSecondary }]}>
                  그날의 OOTD
                </Text>
                <View style={styles.ootdRow}>
                  <OotdChip
                    emoji="🙋‍♂️"
                    text={item.myOotd ?? '기록 없음'}
                    t={t}
                  />
                  <OotdChip
                    emoji="🙋‍♀️"
                    text={item.partnerOotd ?? '기록 없음'}
                    t={t}
                  />
                </View>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function OotdChip({
  emoji,
  text,
  t,
}: {
  emoji: string;
  text: string;
  t: ThemeTokens;
}) {
  return (
    <View
      style={[
        styles.ootdChip,
        { backgroundColor: t.chipBg, borderColor: t.chipBorder },
      ]}
    >
      <Text style={styles.ootdChipEmoji}>{emoji}</Text>
      <Text
        style={[styles.ootdChipText, { color: t.text }]}
        numberOfLines={2}
      >
        {text}
      </Text>
    </View>
  );
}

// ─── Ring Item ────────────────────────────────────────────────────────────────

function RingItem({
  item,
  t,
  onPress,
}: {
  item: DateCourse;
  t: ThemeTokens;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isRead = item.isRead ?? false;
  const ringColors = isRead ? GRAY_RING : t.gradientColors;

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
          colors={ringColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.gradientBorder,
            isRead && { shadowOpacity: 0, elevation: 0 },
          ]}
        >
          <View style={[styles.ringInner, { backgroundColor: t.avatarInner }]}>
            <Text style={styles.emoji}>{deriveEmoji(item.title)}</Text>
          </View>
        </LinearGradient>
      </Animated.View>
      <Text
        style={[
          styles.ringLabel,
          { color: isRead ? t.textMuted : t.textSecondary },
        ]}
        numberOfLines={1}
      >
        {item.title}
      </Text>
    </Pressable>
  );
}

function deriveEmoji(title: string): string {
  if (/카페|커피/.test(title)) return '☕';
  if (/여행|trip/i.test(title)) return '✈️';
  if (/공원|피크닉/.test(title)) return '🌸';
  if (/영화/.test(title)) return '🎬';
  if (/이자카야|술집|바\b/.test(title)) return '🍶';
  if (/한강/.test(title)) return '🌊';
  if (/100일|기념/.test(title)) return '💝';
  if (/생일/.test(title)) return '🎂';
  if (/선물/.test(title)) return '🎁';
  return '💑';
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface Props {
  t: ThemeTokens;
}

export default function MemoryRingSection({ t }: Props) {
  const { dateCourses, markCourseAsRead, setTriggerAddCourse } = useAppContext();
  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState<DateCourse | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const handleRingPress = useCallback(
    (item: DateCourse) => {
      markCourseAsRead(item.id);
      setSelectedItem(item);
      setModalVisible(true);
    },
    [markCourseAsRead],
  );

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
    setTimeout(() => setSelectedItem(null), 300);
  }, []);

  const handleAddPress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setTriggerAddCourse(true);
    router.navigate('/history');
  }, [router, setTriggerAddCourse]);

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: t.text }]}>추억 아카이브</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        decelerationRate="fast"
      >
        {dateCourses.map((item) => (
          <RingItem
            key={item.id}
            item={item}
            t={t}
            onPress={() => handleRingPress(item)}
          />
        ))}

        {/* + 추가 링 */}
        <Pressable style={styles.ringWrapper} onPress={handleAddPress}>
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

      <DetailModal
        item={selectedItem}
        visible={modalVisible}
        onClose={handleModalClose}
        t={t}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  // Ring item
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
    shadowOpacity: 0.35,
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
  // Modal
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.80)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  cardOuter: {
    width: '100%',
  },
  cardGradBorder: {
    borderRadius: Radius['2xl'],
    padding: 1.5,
  },
  cardInner: {
    borderRadius: Radius['2xl'] - 1,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: 200,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  photoPlaceholderEmoji: { fontSize: 44 },
  photoPlaceholderText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: FontWeight.semibold,
  },
  info: {
    padding: Spacing.base,
    gap: Spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  metaEmoji: { fontSize: 20 },
  metaTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  metaDate: {
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  rating: {
    fontSize: FontSize.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  ootdLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  ootdRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  ootdChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  ootdChipEmoji: { fontSize: 16 },
  ootdChipText: {
    flex: 1,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    lineHeight: 16,
  },
});
