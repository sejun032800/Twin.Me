import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import type { MemoryRing } from '../types/gallery';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const AUTO_PLAY_MS = 4000;

// ─── Progress bar segment ─────────────────────────────────────────────────────

function ProgressSegment({
  index,
  currentIndex,
  progressAnim,
}: {
  index: number;
  currentIndex: number;
  progressAnim: SharedValue<number>;
}) {
  const fillStyle = useAnimatedStyle(() => {
    const v =
      index < currentIndex ? 1 : index === currentIndex ? progressAnim.value : 0;
    return { flex: v };
  });
  const spacerStyle = useAnimatedStyle(() => {
    const v =
      index < currentIndex ? 0 : index === currentIndex ? 1 - progressAnim.value : 1;
    return { flex: v };
  });

  return (
    <View style={seg.track}>
      <Animated.View style={[seg.fill, fillStyle]} />
      <Animated.View style={spacerStyle} />
    </View>
  );
}

const seg = StyleSheet.create({
  track: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.30)',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  fill: {
    height: '100%',
    backgroundColor: '#ffffff',
  },
});

// ─── StoryViewer ─────────────────────────────────────────────────────────────

interface Props {
  ring: MemoryRing | null;
  visible: boolean;
  onClose: () => void;
}

export default function StoryViewer({ ring, visible, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const progressAnim = useSharedValue(0);
  const translateY = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const photos = ring?.photos ?? [];
  const total = photos.length;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev >= total - 1) {
        onClose();
        return prev;
      }
      return prev + 1;
    });
  }, [total, onClose]);

  const goPrev = useCallback(() => {
    clearTimer();
    cancelAnimation(progressAnim);
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, [clearTimer]);

  const handleTapNext = useCallback(() => {
    clearTimer();
    cancelAnimation(progressAnim);
    goNext();
  }, [clearTimer, goNext]);

  // Start/restart progress animation and auto-advance timer on index change
  useEffect(() => {
    if (!visible || total === 0) return;
    progressAnim.value = 0;
    progressAnim.value = withTiming(1, { duration: AUTO_PLAY_MS });
    const t = setTimeout(goNext, AUTO_PLAY_MS);
    timerRef.current = t;
    return () => {
      clearTimeout(t);
    };
  }, [currentIndex, visible, total]);

  // Reset state when ring or visibility changes
  useEffect(() => {
    if (visible) {
      setCurrentIndex(0);
      translateY.value = 0;
    } else {
      clearTimer();
    }
  }, [ring, visible]);

  // Swipe-down dismiss gesture (native only; web uses close button)
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 500) {
        translateY.value = withTiming(SCREEN_H, { duration: 220 }, () => {
          runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20 });
      }
    });

  const containerAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: Math.max(0.2, 1 - translateY.value / SCREEN_H),
  }));

  if (!visible || !ring || total === 0) return null;

  const photo = photos[currentIndex];
  const dateStr = photo
    ? new Date(photo.createdAt).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    : '';

  const inner = (
    <Animated.View style={[styles.container, containerAnim]}>
      {/* Background */}
      <View style={StyleSheet.absoluteFill}>
        {photo?.uri ? (
          <Image
            source={{ uri: photo.uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={['#7C3AED', '#D946EF', '#FF6B8B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {/* Dim overlay */}
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(0,0,0,0.40)']}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Top HUD: progress bars + info */}
      <View style={styles.topHud}>
        <View style={styles.progressRow}>
          {photos.map((_, idx) => (
            <ProgressSegment
              key={idx}
              index={idx}
              currentIndex={currentIndex}
              progressAnim={progressAnim}
            />
          ))}
        </View>
        <View style={styles.infoRow}>
          <View>
            <Text style={styles.hashTag}>#{ring.title}</Text>
            <Text style={styles.dateText}>{dateStr}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tap zones: left 30% / right 70% */}
      <View style={styles.tapLayer} pointerEvents="box-none">
        <TouchableWithoutFeedback onPress={goPrev}>
          <View style={styles.tapLeft} />
        </TouchableWithoutFeedback>
        <TouchableWithoutFeedback onPress={handleTapNext}>
          <View style={styles.tapRight} />
        </TouchableWithoutFeedback>
      </View>

      {/* Swipe hint */}
      {Platform.OS !== 'web' && (
        <View style={styles.swipeHint} pointerEvents="none">
          <Text style={styles.swipeHintText}>아래로 쓸어내려 닫기</Text>
        </View>
      )}
    </Animated.View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {Platform.OS !== 'web' ? (
          <GestureDetector gesture={panGesture}>{inner}</GestureDetector>
        ) : (
          inner
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
  },
  topHud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingHorizontal: 12,
    gap: 10,
    zIndex: 10,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hashTag: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  dateText: {
    color: 'rgba(255,255,255,0.80)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.40)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  tapLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 80,
    flexDirection: 'row',
    zIndex: 5,
  },
  tapLeft: {
    width: SCREEN_W * 0.30,
    height: '100%',
  },
  tapRight: {
    flex: 1,
    height: '100%',
  },
  swipeHint: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  swipeHintText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },
});
