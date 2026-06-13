import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import HistoryKakaoMapView from '../../src/components/history/KakaoMapView';
import { DateCourse, RecommendedPlace, useAppContext } from '../../src/context/AppContext';
import { HistoryProvider, useHistoryContext } from '../../src/context/HistoryContext';
import { usePhotoMetadata } from '../../src/hooks/usePhotoMetadata';
import {
  FontSize,
  FontWeight,
  Radius,
  Spacing,
  TabBar,
  ThemeTokens,
} from '../../src/styles/theme';

const { width: SW, height: SH } = Dimensions.get('window');

// ─── Mock Polaroid Data ───────────────────────────────────────────────────────

const MEMORIES = [
  { id: '1', date: '2024.01.20', quote: '처음 봤는데 왜 이렇게 편하지..?',           tag: '첫 만남'   },
  { id: '2', date: '2024.02.14', quote: '빼빼로 내가 살게 ㅎㅎ 기다려',              tag: '발렌타인'  },
  { id: '3', date: '2024.03.31', quote: '한복 입으면 진짜 너무 예쁠 것 같은데',        tag: '봄 나들이'  },
  { id: '4', date: '2024.05.02', quote: '벌써 100일이야 시간 왜 이렇게 빠르지',        tag: '100일'     },
  { id: '5', date: '2024.07.27', quote: '파도 소리 들으면서 영원히 있고 싶다',          tag: '여름 여행'  },
  { id: '6', date: '2024.12.24', quote: '내년에도 여기 같이 오자 약속',               tag: '크리스마스' },
  { id: '7', date: '2025.01.20', quote: '1년 동안 옆에 있어줘서 진짜 고마워',          tag: '1주년'     },
];

const FOOD_CHIPS = ['🍣 일식', '🍜 중식', '🥩 한식', '🍕 양식', '🧋 카페'];
const MOOD_CHIPS = ['💃 액티비티', '🌿 힐링', '🎬 문화생활', '🍻 술자리'];
const OOTD_OPTIONS = [
  { icon: '👗', label: '캐주얼' },
  { icon: '💼', label: '정장' },
  { icon: '👫', label: '시밀러룩' },
];

// ─── FUN-CHA-004: AI Date Muse Constants ─────────────────────────────────────

const AI_OOTD_CHIPS = ['캐주얼', '시크', '스트릿', '페미닌'];
const AI_MOOD_CHIPS = ['차분함', '신남', '로맨틱', '힐링'];

interface SpotTemplate {
  title: string;
  category: string;
  lat: number;
  lng: number;
  ootdTags: string[];
  moodTags: string[];
  reasonTemplate: string;
}

const SPOT_POOL: SpotTemplate[] = [
  {
    title: '성수 어니언 (인더스트리얼 카페)',
    category: '☕ 카페',
    lat: 37.5448, lng: 127.0558,
    ootdTags: ['시크', '캐주얼'],
    moodTags: ['차분함', '로맨틱'],
    reasonTemplate: '{ootd} 무드에 완벽한 인더스트리얼 감성 공간이에요. "{favTitle}" 방문 이력과 취향 패턴이 딱 맞아요.',
  },
  {
    title: '한남 그라운드 루프탑 다이닝',
    category: '🍽️ 레스토랑',
    lat: 37.5338, lng: 127.0014,
    ootdTags: ['시크', '페미닌'],
    moodTags: ['로맨틱', '신남'],
    reasonTemplate: '야경이 펼쳐지는 루프탑에서 {mood} 분위기를 만끽할 수 있어요. "{favTitle}" 별점 패턴과 일치하는 프리미엄 코스예요.',
  },
  {
    title: '삼청동 더오르 갤러리 카페',
    category: '🎨 갤러리·카페',
    lat: 37.5814, lng: 126.9808,
    ootdTags: ['시크', '페미닌'],
    moodTags: ['차분함', '힐링'],
    reasonTemplate: '아트와 카페가 만나는 삼청동의 숨겨진 명소예요. {ootd} 스타일에 딱 맞는 공간입니다.',
  },
  {
    title: '홍대 스카이랩 루프탑바',
    category: '🍹 루프탑바',
    lat: 37.5540, lng: 126.9213,
    ootdTags: ['스트릿', '캐주얼'],
    moodTags: ['신남', '로맨틱'],
    reasonTemplate: '홍대 권역 방문 이력이 많으시네요. 루프탑에서 {mood} 분위기로 밤을 마무리해 보세요!',
  },
  {
    title: '연남동 땡스오트 (비건 브런치)',
    category: '🥗 브런치',
    lat: 37.5601, lng: 126.9249,
    ootdTags: ['캐주얼', '페미닌'],
    moodTags: ['힐링', '차분함'],
    reasonTemplate: '한적한 골목의 감성 브런치예요. {mood} 무드로 하루를 시작하기에 최적의 코스입니다.',
  },
  {
    title: '반포 달빛무지개분수 야경',
    category: '🌊 한강 야경',
    lat: 37.5125, lng: 127.0046,
    ootdTags: ['캐주얼', '스트릿'],
    moodTags: ['로맨틱', '신남'],
    reasonTemplate: '두 분의 한강 방문 이력이 확인돼요. 야간 분수쇼와 함께 {mood} 데이트 하이라이트로 딱이에요!',
  },
  {
    title: '망원 이자카야 긴자',
    category: '🍶 이자카야',
    lat: 37.5553, lng: 126.9009,
    ootdTags: ['스트릿', '캐주얼'],
    moodTags: ['신남', '차분함'],
    reasonTemplate: '"{favTitle}" 방문 때 술자리를 즐기셨던 패턴이 보여요. 망원 감성 이자카야에서 {mood} 무드를 이어가 보세요.',
  },
  {
    title: '서울숲 피크닉 & 팝업마켓',
    category: '🌳 피크닉',
    lat: 37.5444, lng: 127.0377,
    ootdTags: ['캐주얼', '스트릿'],
    moodTags: ['힐링', '신남'],
    reasonTemplate: '{ootd} 차림으로 피크닉하기에 완벽해요. 주말 팝업마켓까지 함께하면 {mood} 분위기 완성!',
  },
  {
    title: '압구정 플레이그라운드 디저트',
    category: '🍰 디저트',
    lat: 37.5273, lng: 127.0253,
    ootdTags: ['페미닌', '시크'],
    moodTags: ['로맨틱', '힐링'],
    reasonTemplate: '인스타 감성 디저트 공간이에요. {ootd} 룩과 함께 포토포인트를 공략해 보세요 📸',
  },
  {
    title: '이태원 와인바 아빠구름',
    category: '🍷 와인바',
    lat: 37.5349, lng: 126.9959,
    ootdTags: ['시크', '페미닌'],
    moodTags: ['로맨틱', '차분함'],
    reasonTemplate: '차분하고 감성적인 와인 공간이에요. {mood} 데이트를 우아하게 마무리하기에 완벽한 코스입니다.',
  },
  {
    title: '북서울꿈의숲 야경 전망대',
    category: '🌿 전망대',
    lat: 37.6295, lng: 127.0547,
    ootdTags: ['캐주얼', '페미닌'],
    moodTags: ['힐링', '로맨틱'],
    reasonTemplate: '서울 북부의 숨겨진 야경 명소예요. {mood} 분위기로 긴 산책을 즐기기에 최적의 장소입니다.',
  },
  {
    title: '을지로 힙지로 카페 투어',
    category: '☕ 힙카페',
    lat: 37.5657, lng: 126.9928,
    ootdTags: ['스트릿', '시크'],
    moodTags: ['차분함', '신남'],
    reasonTemplate: '을지로 특유의 레트로·힙 감성이 {ootd} 스타일과 환상 조합이에요. "{favTitle}" 분위기와 비슷한 바이브가 나요.',
  },
];

// ─── FUN-CHA-004: LLM Orchestration Mock ─────────────────────────────────────

async function fetchAIDateCourse(
  dateCourses: DateCourse[],
  ootd: string,
  mood: string,
): Promise<RecommendedPlace[]> {
  // Simulate LLM API round-trip latency (2.4s realistic wait)
  await new Promise<void>((resolve) => setTimeout(resolve, 2400));

  // ── Context Aggregation (Few-Shot Context Packing) ────────────────────────
  const sortedByRating = [...dateCourses].sort(
    (a, b) => (b.myRating + b.partnerRating) - (a.myRating + a.partnerRating),
  );
  const favTitle = sortedByRating[0]?.title ?? '성수동';

  const visitedTitles = new Set(dateCourses.map((c) => c.title.split(' ')[0]));

  // ── Pattern Matching & Scoring ────────────────────────────────────────────
  const candidates = SPOT_POOL
    .filter((s) => !visitedTitles.has(s.title.split(' ')[0]))
    .map((s) => ({
      ...s,
      score:
        (s.ootdTags.includes(ootd) ? 2 : 0) +
        (s.moodTags.includes(mood) ? 2 : 0) +
        Math.random() * 0.7,
    }))
    .sort((a, b) => b.score - a.score);

  // Fallback: if pool exhausted, reuse all
  const pool = candidates.length >= 3 ? candidates : SPOT_POOL.slice(0, 3).map((s) => ({ ...s, score: 0 }));
  const top3 = pool.slice(0, 3);

  const labels = ['도보 5~8분', '도보 12~15분', '대중교통 15~20분'];

  return top3.map((s, i) => ({
    id: `ai-${Date.now()}-${i}`,
    title: s.title,
    latitude: s.lat + (Math.random() - 0.5) * 0.0008,
    longitude: s.lng + (Math.random() - 0.5) * 0.0008,
    reason: s.reasonTemplate
      .replace('{favTitle}', favTitle)
      .replace('{ootd}', ootd)
      .replace('{mood}', mood),
    estimatedTime: labels[i],
    category: s.category,
  }));
}

const PARTNER_MOCK_REVIEWS = [
  '분위기가 너무 좋았어',
  '다음에 또 오고 싶다',
  '음식이 진짜 맛있었어',
  '같이 와서 더 좋았어',
  '여기 내 최애 장소됐어',
];

// ─── Layout Constants ─────────────────────────────────────────────────────────

const CARD_W   = 162;
const CARD_IMG = CARD_W - 16;
const H_PAD    = 12;
const USABLE_X = Math.max(0, SW - CARD_W - H_PAD * 2);

const SCATTER = [
  { xFrac: 0.02, y: 10,  rot: -5.2 },
  { xFrac: 0.94, y: 28,  rot:  4.1 },
  { xFrac: 0.44, y: 195, rot: -1.8 },
  { xFrac: 0.06, y: 228, rot:  6.5 },
  { xFrac: 0.90, y: 392, rot: -3.7 },
  { xFrac: 0.04, y: 422, rot:  2.3 },
  { xFrac: 0.50, y: 580, rot: -6.1 },
];

const WALL_H      = 580 + 255;
const STATS_BAR_H = 106;
const MAP_H       = Math.min(SH * 0.46, 360);

// ─── Segmented Control ────────────────────────────────────────────────────────

type TabKey = 'archive' | 'map';

function SegmentedControl({
  active,
  onChange,
  t,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  t: ThemeTokens;
}) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'archive', label: '📸  추억 월' },
    { key: 'map',     label: '🗺️  데이트 지도' },
  ];

  return (
    <View style={[segS.track, { backgroundColor: t.segmentTrack }]}>
      {tabs.map((tab) => {
        const isOn = active === tab.key;
        return (
          <Pressable key={tab.key} style={segS.segWrap} onPress={() => onChange(tab.key)}>
            {isOn ? (
              <LinearGradient
                colors={t.gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={segS.activeItem}
              >
                <Text style={segS.activeTxt}>{tab.label}</Text>
              </LinearGradient>
            ) : (
              <View style={segS.inactiveItem}>
                <Text style={[segS.inactiveTxt, { color: t.textMuted }]}>{tab.label}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const segS = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: 3,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.md,
  },
  segWrap: { flex: 1 },
  activeItem: {
    borderRadius: Radius.pill,
    paddingVertical: 9,
    alignItems: 'center',
  },
  inactiveItem: {
    borderRadius: Radius.pill,
    paddingVertical: 9,
    alignItems: 'center',
  },
  activeTxt:  { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  inactiveTxt: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});

// ─── PolaroidCard ─────────────────────────────────────────────────────────────

function PolaroidCard({
  node, index, isActive, onActivate,
}: {
  node: typeof MEMORIES[0];
  index: number;
  isActive: boolean;
  onActivate: (id: string | null) => void;
}) {
  const scale = useSharedValue(1);
  const { xFrac, y, rot } = SCATTER[index];
  const left = H_PAD + xFrac * USABLE_X;

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: rot + 'deg' }, { scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        polaS.card,
        { left, top: y, zIndex: isActive ? 999 : index + 1, elevation: isActive ? 24 : 6 + index },
        animStyle,
      ]}
    >
      <Pressable
        onPressIn={() => { scale.value = withSpring(1.06, { damping: 10, stiffness: 260 }); }}
        onPressOut={() => { scale.value = withSpring(1.0, { damping: 14, stiffness: 220 }); }}
        onPress={() => onActivate(isActive ? null : node.id)}
        onLongPress={() => onActivate(node.id)}
      >
        <Image
          source={{ uri: 'https://picsum.photos/seed/twin' + node.id + '/320/320' }}
          style={polaS.photo}
          resizeMode="cover"
        />
        <View style={polaS.caption}>
          <Text style={polaS.tagText}>{node.tag}</Text>
          <Text style={polaS.quote} numberOfLines={2}>"{node.quote}"</Text>
          <Text style={polaS.date}>{node.date}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const polaS = StyleSheet.create({
  card: {
    position: 'absolute',
    width: CARD_W,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    padding: 8,
    paddingBottom: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 2, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
  },
  photo: { width: CARD_IMG, height: CARD_IMG, backgroundColor: '#E2E8F0' },
  caption: { paddingTop: 8, paddingBottom: 14, gap: 3 },
  tagText: {
    fontSize: 9, color: '#7C3AED', fontWeight: '600',
    letterSpacing: 0.6, textTransform: 'uppercase',
  },
  quote: { fontSize: 11, fontStyle: 'italic', color: '#1E293B', lineHeight: 15 },
  date:  { fontSize: 9, color: '#94A3B8', fontWeight: '500' },
});

// ─── HeartPulse ───────────────────────────────────────────────────────────────

function HeartPulse() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.28, { duration: 720, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={style}><Text style={{ fontSize: 18 }}>❤️</Text></Animated.View>;
}

// ─── StatsBar ─────────────────────────────────────────────────────────────────

const STATS_DATA = [
  { heart: true,  icon: '',   label: '우리 1주년', value: 'D+365' },
  { heart: false, icon: '📸', label: '업로드 사진', value: '1,248' },
  { heart: false, icon: '📍', label: '방문 장소',   value: '42'   },
];

function StatsBar({ t }: { t: ThemeTokens }) {
  return (
    <View style={statsS.wrapper}>
      <LinearGradient
        colors={
          t.isLight
            ? ['rgba(255,245,247,0.95)', 'rgba(255,240,248,0.97)']
            : ['rgba(10,13,26,0.92)', 'rgba(15,23,42,0.97)']
        }
        style={statsS.row}
      >
        {STATS_DATA.map((s, i) => (
          <View
            key={i}
            style={[
              statsS.card,
              {
                borderColor: t.isLight ? 'rgba(200,150,180,0.28)' : 'rgba(124,58,237,0.22)',
                backgroundColor: t.isLight ? 'rgba(255,255,255,0.72)' : 'rgba(30,41,59,0.52)',
              },
            ]}
          >
            <View style={statsS.iconBox}>
              {s.heart ? <HeartPulse /> : <Text style={{ fontSize: 18 }}>{s.icon}</Text>}
            </View>
            <Text style={[statsS.value, { color: t.text }]}>{s.value}</Text>
            <Text style={[statsS.label, { color: t.textMuted }]}>{s.label}</Text>
          </View>
        ))}
      </LinearGradient>
    </View>
  );
}

const statsS = StyleSheet.create({
  wrapper: {
    position: 'absolute', bottom: TabBar.height, left: 0, right: 0,
    overflow: 'hidden', borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(124,58,237,0.22)',
  },
  row: {
    flexDirection: 'row', height: STATS_BAR_H, alignItems: 'center',
    paddingHorizontal: Spacing.md, gap: Spacing.sm,
  },
  card: {
    flex: 1, height: STATS_BAR_H - 22, alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.lg, borderWidth: 1, gap: 2,
  },
  iconBox: { height: 26, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  label: { fontSize: 10, textAlign: 'center' },
});

// ─── ScreenHeader ─────────────────────────────────────────────────────────────

function ScreenHeader({ t }: { t: ThemeTokens }) {
  return (
    <View style={headS.wrap}>
      <Text style={[headS.title, { color: t.text }]}>우리만의 시간</Text>
      <Text style={[headS.sub, { color: t.textMuted }]}>
        카카오톡이 기억하는 가장 다정한 순간들
      </Text>
    </View>
  );
}

const headS = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: Spacing.base,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, letterSpacing: -0.5 },
  sub:   { fontSize: FontSize.sm, fontStyle: 'italic', marginTop: 4 },
});

// ─── StarRating ───────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  readonly = false,
  size = 28,
}: {
  value: number;
  onChange?: (v: number) => void;
  readonly?: boolean;
  size?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => !readonly && onChange?.(star)}
          disabled={readonly}
        >
          <Text style={{ fontSize: size, opacity: star <= value ? 1 : 0.25 }}>⭐</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── AddCourseSheet ───────────────────────────────────────────────────────────

function AddCourseSheet({
  visible,
  onClose,
  partnerName,
}: {
  visible: boolean;
  onClose: () => void;
  partnerName: string;
}) {
  const { addDateCourse } = useAppContext();
  const [title, setTitle]     = useState('');
  const [date, setDate]       = useState('');
  const [myRating, setMyRating]   = useState(0);
  const [myReview, setMyReview]   = useState('');

  const slideY = useSharedValue(600);

  useEffect(() => {
    slideY.value = visible
      ? withSpring(0, { damping: 22, stiffness: 180 })
      : withTiming(600, { duration: 260 });
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value }],
  }));

  const mockPartnerRating = useRef(
    [3, 3.5, 4, 4.5, 5][Math.floor(Math.random() * 5)]
  ).current;
  const mockPartnerReview = useRef(
    PARTNER_MOCK_REVIEWS[Math.floor(Math.random() * PARTNER_MOCK_REVIEWS.length)]
  ).current;

  const handleSave = () => {
    if (!title.trim() || !date.trim() || myRating === 0) return;

    const course: DateCourse = {
      id: Date.now().toString(),
      title: title.trim(),
      date: date.trim(),
      // Default to Gangnam area; real implementation would use geolocation
      latitude: 37.498 + (Math.random() - 0.5) * 0.06,
      longitude: 127.028 + (Math.random() - 0.5) * 0.06,
      myRating,
      myReview: myReview.trim(),
      partnerRating: mockPartnerRating,
      partnerReview: mockPartnerReview,
    };

    addDateCourse(course);
    setTitle('');
    setDate('');
    setMyRating(0);
    setMyReview('');
    onClose();
  };

  const canSave = title.trim().length > 0 && date.trim().length > 0 && myRating > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={sheetS.backdrop} />
        </TouchableWithoutFeedback>

        <Animated.View style={[sheetS.sheet, sheetStyle]}>
          <LinearGradient
            colors={['rgba(30,41,59,0.99)', 'rgba(10,13,26,1)']}
            style={sheetS.inner}
          >
            {/* Handle */}
            <View style={sheetS.handle} />

            {/* Title */}
            <LinearGradient
              colors={['#7C3AED', '#D946EF', '#FF6B8B']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={sheetS.headerBadge}
            >
              <Text style={sheetS.headerEmoji}>📍</Text>
              <Text style={sheetS.headerText}>데이트 코스 등록</Text>
            </LinearGradient>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Place name */}
              <Text style={sheetS.fieldLabel}>장소 / 코스 명칭</Text>
              <TextInput
                style={sheetS.input}
                placeholder="ex. 성수동 카페, 한강 피크닉"
                placeholderTextColor="#475569"
                value={title}
                onChangeText={setTitle}
              />

              {/* Date */}
              <Text style={sheetS.fieldLabel}>방문 날짜</Text>
              <TextInput
                style={sheetS.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#475569"
                value={date}
                onChangeText={setDate}
                keyboardType="numbers-and-punctuation"
              />

              {/* My rating */}
              <Text style={sheetS.fieldLabel}>나의 별점</Text>
              <StarRating value={myRating} onChange={setMyRating} size={32} />

              {/* My review */}
              <Text style={[sheetS.fieldLabel, { marginTop: Spacing.md }]}>나의 한 줄 후기</Text>
              <TextInput
                style={[sheetS.input, sheetS.reviewInput]}
                placeholder="이 장소의 분위기는..."
                placeholderTextColor="#475569"
                value={myReview}
                onChangeText={setMyReview}
                multiline
              />

              {/* Partner section */}
              <View style={sheetS.partnerSection}>
                <LinearGradient
                  colors={['rgba(124,58,237,0.12)', 'rgba(217,70,239,0.08)']}
                  style={sheetS.partnerCard}
                >
                  <Text style={sheetS.partnerName}>{partnerName}이의 후기</Text>
                  <Text style={sheetS.partnerStatus}>
                    🔄 실제 연인 연동 전 · 가상 데이터 미리보기
                  </Text>
                  <StarRating value={Math.round(mockPartnerRating)} readonly size={22} />
                  <Text style={sheetS.partnerReview}>"{mockPartnerReview}"</Text>
                </LinearGradient>
              </View>

              {/* Save CTA */}
              <Pressable
                onPress={handleSave}
                disabled={!canSave}
                style={[sheetS.cta, !canSave && { opacity: 0.35 }]}
              >
                <LinearGradient
                  colors={['#7C3AED', '#D946EF', '#FF6B8B']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={sheetS.ctaGrad}
                >
                  <Text style={sheetS.ctaTxt}>지도에 핀 꽂기 📌</Text>
                </LinearGradient>
              </Pressable>
            </ScrollView>
          </LinearGradient>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const sheetS = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    maxHeight: SH * 0.82,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(124,58,237,0.32)',
  },
  inner: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: 40, gap: Spacing.md },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(148,163,184,0.3)', alignSelf: 'center',
  },
  headerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: Radius.xl, paddingHorizontal: Spacing.lg,
    paddingVertical: 10, alignSelf: 'center',
  },
  headerEmoji: { fontSize: 18 },
  headerText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  fieldLabel: {
    color: '#94A3B8', fontSize: FontSize.xs, fontWeight: FontWeight.semibold,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(30,41,59,0.8)',
    color: '#F1F5F9',
    fontSize: FontSize.base,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.2)',
    marginBottom: Spacing.md,
  },
  reviewInput: { minHeight: 72, textAlignVertical: 'top' },
  partnerSection: { marginVertical: Spacing.sm },
  partnerCard: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.22)',
  },
  partnerName: { color: '#F1F5F9', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  partnerStatus: { color: '#64748B', fontSize: FontSize.xs },
  partnerReview: {
    color: '#94A3B8', fontSize: FontSize.sm, fontStyle: 'italic',
    lineHeight: 18,
  },
  cta: { borderRadius: Radius.xl, overflow: 'hidden', marginTop: Spacing.sm },
  ctaGrad: { paddingVertical: Spacing.md, alignItems: 'center' },
  ctaTxt: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});

// ─── CourseListCard ───────────────────────────────────────────────────────────

function CourseListCard({ course, t }: { course: DateCourse; t: ThemeTokens }) {
  const isPending = course.myRating === 0 && course.partnerRating === 0;
  const avg = ((course.myRating + course.partnerRating) / 2).toFixed(1);
  return (
    <View
      style={[
        cListS.card,
        {
          backgroundColor: t.isLight ? 'rgba(255,255,255,0.9)' : 'rgba(30,41,59,0.9)',
          borderColor: isPending
            ? 'rgba(255,107,139,0.4)'
            : t.isLight ? 'rgba(200,150,180,0.25)' : 'rgba(124,58,237,0.2)',
        },
      ]}
    >
      <View style={[cListS.pinDot, isPending && { backgroundColor: '#FF6B8B' }]} />
      <View style={{ flex: 1 }}>
        <Text style={[cListS.title, { color: t.text }]} numberOfLines={1}>{course.title}</Text>
        <Text style={[cListS.date, { color: t.textMuted }]}>{course.date}</Text>
      </View>
      {isPending ? (
        <View style={[cListS.ratingPill, { backgroundColor: 'rgba(255,107,139,0.14)', borderColor: 'rgba(255,107,139,0.3)' }]}>
          <Text style={[cListS.ratingText, { color: '#FF6B8B' }]}>✈️ 예정</Text>
        </View>
      ) : (
        <View style={cListS.ratingPill}>
          <Text style={cListS.ratingText}>❤️ {avg}</Text>
        </View>
      )}
    </View>
  );
}

const cListS = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
  },
  pinDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#7C3AED',
  },
  title: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  date: { fontSize: FontSize.xs, marginTop: 2 },
  ratingPill: {
    backgroundColor: 'rgba(124,58,237,0.14)',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ratingText: { fontSize: FontSize.sm, color: '#FF6B8B', fontWeight: FontWeight.bold },
});

// ─── DateShuttleModal ─────────────────────────────────────────────────────────

function DateShuttleModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [food, setFood] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [ootd, setOotd] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ready = food && mood && ootd;

  const handleFind = () => {
    if (!ready) return;
    setLoading(true);
    setTimeout(() => {
      const ootdNote =
        ootd === '캐주얼' ? '편안한 차림이시니'
        : ootd === '정장' ? '격식 있는 차림이시니'
        : '커플룩이시니';
      setResult(
        ootdNote +
          ' 분위기에 맞는 코스를 큐레이션했어요! ✨\n\n📍 10분 거리 ' +
          (food ? food.slice(2) : '') +
          ' 맛집 → ☕ 근처 루프탑 카페 → 🍮 미쉐린 추천 디저트 순으로 다녀오시면 완벽할 것 같아요.',
      );
      setLoading(false);
    }, 1500);
  };

  const handleClose = () => {
    setFood(null); setMood(null); setOotd(null);
    setResult(null); setLoading(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={shuS.backdrop} onPress={handleClose} />
      <View style={shuS.sheet}>
        <LinearGradient colors={['rgba(30,41,59,0.98)', 'rgba(10,13,26,0.99)']} style={shuS.inner}>
          <View style={shuS.handle} />
          <View style={shuS.headerRow}>
            <LinearGradient
              colors={['#7C3AED', '#D946EF', '#FF6B8B']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={shuS.sticker}
            >
              <Text style={shuS.stickerEmoji}>🗺️</Text>
              <Text style={shuS.stickerText}>이번 주말 어디서 만날까?</Text>
            </LinearGradient>
          </View>

          {result ? (
            <View style={shuS.resultCard}>
              <LinearGradient
                colors={['rgba(124,58,237,0.18)', 'rgba(255,107,139,0.1)']}
                style={shuS.resultInner}
              >
                <Text style={shuS.resultEmoji}>✨</Text>
                <Text style={shuS.resultText}>{result}</Text>
                <Pressable style={shuS.resetBtn} onPress={() => setResult(null)}>
                  <Text style={shuS.resetTxt}>다시 물어보기</Text>
                </Pressable>
              </LinearGradient>
            </View>
          ) : (
            <>
              <Text style={shuS.sectionLabel}>🍽️ 오늘 뭐 땡겨?</Text>
              <View style={shuS.chipRow}>
                {FOOD_CHIPS.map((c) => (
                  <Pressable key={c} style={[shuS.chip, food === c && shuS.chipOn]} onPress={() => setFood(c)}>
                    <Text style={[shuS.chipTxt, food === c && shuS.chipTxtOn]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={shuS.sectionLabel}>💫 오늘 데이트 무드는?</Text>
              <View style={shuS.chipRow}>
                {MOOD_CHIPS.map((c) => (
                  <Pressable key={c} style={[shuS.chip, mood === c && shuS.chipOn]} onPress={() => setMood(c)}>
                    <Text style={[shuS.chipTxt, mood === c && shuS.chipTxtOn]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={shuS.sectionLabel}>👗 오늘 서로의 OOTD는?</Text>
              <View style={shuS.ootdRow}>
                {OOTD_OPTIONS.map((o) => (
                  <Pressable key={o.label} style={[shuS.ootdBtn, ootd === o.label && shuS.ootdOn]} onPress={() => setOotd(o.label)}>
                    <Text style={shuS.ootdEmoji}>{o.icon}</Text>
                    <Text style={[shuS.ootdLabel, ootd === o.label && shuS.ootdLabelOn]}>{o.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={handleFind} style={[shuS.ctaWrap, !ready && { opacity: 0.38 }]} disabled={!ready}>
                {loading ? (
                  <View style={shuS.ctaLoading}>
                    <Text style={shuS.ctaTxt}>코스 짜는 중... ✨</Text>
                  </View>
                ) : (
                  <LinearGradient
                    colors={['#7C3AED', '#D946EF', '#FF6B8B']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={shuS.ctaGradient}
                  >
                    <Text style={shuS.ctaTxt}>데이트 코스 찾아줘 🚀</Text>
                  </LinearGradient>
                )}
              </Pressable>
            </>
          )}
        </LinearGradient>
      </View>
    </Modal>
  );
}

const shuS = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)' },
  sheet: {
    borderTopLeftRadius: Radius['2xl'], borderTopRightRadius: Radius['2xl'],
    overflow: 'hidden', borderWidth: 1, borderBottomWidth: 0,
    borderColor: 'rgba(124,58,237,0.28)',
  },
  inner: { padding: Spacing.base, paddingBottom: 44, gap: Spacing.md },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(148,163,184,0.3)', alignSelf: 'center' },
  headerRow: { alignItems: 'center' },
  sticker: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.xl, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  stickerEmoji: { fontSize: 20 },
  stickerText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },
  sectionLabel: { color: '#F1F5F9', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { backgroundColor: 'rgba(30,41,59,0.8)', borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(124,58,237,0.2)' },
  chipOn: { backgroundColor: 'rgba(124,58,237,0.22)', borderColor: '#7C3AED' },
  chipTxt: { color: '#94A3B8', fontSize: FontSize.sm },
  chipTxtOn: { color: '#F1F5F9', fontWeight: FontWeight.semibold },
  ootdRow: { flexDirection: 'row', gap: Spacing.md },
  ootdBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: 'rgba(30,41,59,0.8)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.2)', gap: 6 },
  ootdOn: { backgroundColor: 'rgba(124,58,237,0.2)', borderColor: '#7C3AED' },
  ootdEmoji: { fontSize: 26 },
  ootdLabel: { color: '#94A3B8', fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  ootdLabelOn: { color: '#F1F5F9', fontWeight: FontWeight.semibold },
  ctaWrap: { borderRadius: Radius.xl, overflow: 'hidden', marginTop: 4 },
  ctaGradient: { paddingVertical: Spacing.md, alignItems: 'center' },
  ctaLoading: { paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: '#1E293B', borderRadius: Radius.xl },
  ctaTxt: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  resultCard: { borderRadius: Radius.xl, overflow: 'hidden' },
  resultInner: { padding: Spacing.base, alignItems: 'center', gap: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, borderColor: 'rgba(124,58,237,0.28)' },
  resultEmoji: { fontSize: 32 },
  resultText: { color: '#F1F5F9', fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center' },
  resetBtn: { backgroundColor: 'rgba(30,41,59,0.8)', borderRadius: Radius.pill, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  resetTxt: { color: '#94A3B8', fontSize: FontSize.xs },
});

// ─── StarParticleOverlay ──────────────────────────────────────────────────────

const PARTICLE_DATA = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  x: Math.floor(SW * (0.05 + ((i * 79) % 85) / 100)),
  delay: i * 200,
  emoji: (['⭐', '✨', '🌟', '💫'] as const)[i % 4],
  size: 13 + (i % 3) * 4,
}));

function FloatingStar({
  x, delay, emoji, size,
}: { x: number; delay: number; emoji: string; size: number }) {
  const ty = useSharedValue(0);
  const op = useSharedValue(0);

  useEffect(() => {
    const CYCLE = 2300;
    ty.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-72, { duration: 1700, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 0 }),
          withTiming(0, { duration: 600 }),
        ),
        -1,
        false,
      ),
    );
    op.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.85, { duration: 280 }),
          withTiming(0.85, { duration: 1220 }),
          withTiming(0, { duration: 200 }),
          withTiming(0, { duration: CYCLE - 280 - 1220 - 200 }),
        ),
        -1,
        false,
      ),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateY: ty.value }],
  }));

  return (
    <Animated.Text
      style={[{ position: 'absolute', left: x, bottom: MAP_H * 0.22, fontSize: size }, style]}
    >
      {emoji}
    </Animated.Text>
  );
}

function StarParticleOverlay() {
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { zIndex: 20, backgroundColor: 'rgba(10,13,26,0.38)', alignItems: 'center', justifyContent: 'center' },
      ]}
    >
      {PARTICLE_DATA.map((p) => (
        <FloatingStar key={p.id} x={p.x} delay={p.delay} emoji={p.emoji} size={p.size} />
      ))}
      <Text style={{ color: '#F1F5F9', fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginTop: MAP_H * 0.1 }}>
        ✨ AI 뮤즈가 취향을 분석 중...
      </Text>
    </View>
  );
}

// ─── AuroraMuseFAB ────────────────────────────────────────────────────────────

function AuroraMuseFAB({ onPress, bottom }: { onPress: () => void; bottom: number }) {
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.75);

  useEffect(() => {
    glowScale.value = withRepeat(
      withTiming(1.55, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    glowOpacity.value = withRepeat(
      withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  return (
    <View
      style={{
        position: 'absolute',
        right: Spacing.base,
        bottom,
        width: 56,
        height: 56,
      }}
    >
      {/* Aurora pulse ring */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: 28 },
          glowStyle,
        ]}
      >
        <LinearGradient
          colors={['#7C3AED', '#D946EF', '#FF6B8B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, borderRadius: 28, opacity: 0.45 }}
        />
      </Animated.View>

      {/* Main button */}
      <Pressable
        onPress={onPress}
        style={{
          flex: 1,
          borderRadius: 28,
          overflow: 'hidden',
          shadowColor: '#D946EF',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.65,
          shadowRadius: 16,
          elevation: 18,
        }}
      >
        <LinearGradient
          colors={['#7C3AED', '#D946EF', '#FF6B8B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 0 }}
        >
          <Text style={{ fontSize: 22 }}>✨</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ─── RecommendationCard ───────────────────────────────────────────────────────

function RecommendationCard({ place, step }: { place: RecommendedPlace; step: number }) {
  return (
    <View style={recS.card}>
      <LinearGradient
        colors={['rgba(10,13,26,0.96)', 'rgba(30,20,46,0.97)']}
        style={recS.cardInner}
      >
        <View style={recS.stepBadge}>
          <LinearGradient
            colors={['#FF6B8B', '#D946EF']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={recS.stepGrad}
          >
            <Text style={recS.stepTxt}>{step}</Text>
          </LinearGradient>
          <Text style={recS.category}>{place.category}</Text>
        </View>
        <Text style={recS.title} numberOfLines={2}>{place.title}</Text>
        <Text style={recS.reason} numberOfLines={3}>{place.reason}</Text>
        <View style={recS.timePill}>
          <Text style={recS.timeTxt}>🚶 {place.estimatedTime}</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const recS = StyleSheet.create({
  card: {
    width: 220,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,107,139,0.35)',
    shadowColor: '#FF6B8B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  cardInner: {
    padding: Spacing.md,
    gap: 7,
    minHeight: 130,
  },
  stepBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepGrad: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  stepTxt: { color: '#fff', fontSize: 11, fontWeight: FontWeight.extrabold },
  category: { color: '#94A3B8', fontSize: 11, fontWeight: FontWeight.medium },
  title: { color: '#F1F5F9', fontSize: FontSize.sm, fontWeight: FontWeight.bold, lineHeight: 18 },
  reason: { color: '#94A3B8', fontSize: 10, lineHeight: 14 },
  timePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,107,139,0.14)',
    borderRadius: Radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,107,139,0.28)',
  },
  timeTxt: { color: '#FF6B8B', fontSize: 10, fontWeight: FontWeight.semibold },
});

// ─── AIMuseSheet ──────────────────────────────────────────────────────────────

function AIMuseSheet({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (ootd: string, mood: string) => void;
}) {
  const [ootd, setOotd] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const slideY = useSharedValue(600);

  useEffect(() => {
    slideY.value = visible
      ? withSpring(0, { damping: 22, stiffness: 180 })
      : withTiming(600, { duration: 260 });
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slideY.value }] }));

  const canSubmit = ootd !== null && mood !== null;

  const handleSubmit = () => {
    if (!ootd || !mood) return;
    setOotd(null);
    setMood(null);
    onSubmit(ootd, mood);
  };

  const handleClose = () => {
    setOotd(null);
    setMood(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={museS.backdrop} />
      </TouchableWithoutFeedback>

      <Animated.View style={[museS.sheet, sheetStyle]}>
        <LinearGradient
          colors={['rgba(22,16,40,0.99)', 'rgba(10,13,26,1)']}
          style={museS.inner}
        >
          <View style={museS.handle} />

          {/* Header */}
          <View style={museS.headerRow}>
            <LinearGradient
              colors={['#7C3AED', '#D946EF', '#FF6B8B']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={museS.headerBadge}
            >
              <Text style={museS.headerEmoji}>✨</Text>
              <Text style={museS.headerText}>AI 데이트 뮤즈</Text>
            </LinearGradient>
            <Text style={museS.headerSub}>
              오늘의 감성을 알려주시면{'\n'}우리 커플 데이터 기반으로 코스를 큐레이션해 드릴게요
            </Text>
          </View>

          {/* OOTD chips */}
          <Text style={museS.sectionLabel}>👗 오늘 OOTD 스타일</Text>
          <View style={museS.chipRow}>
            {AI_OOTD_CHIPS.map((c) => (
              <Pressable
                key={c}
                style={[museS.chip, ootd === c && museS.chipOn]}
                onPress={() => setOotd(c)}
              >
                <Text style={[museS.chipTxt, ootd === c && museS.chipTxtOn]}>{c}</Text>
              </Pressable>
            ))}
          </View>

          {/* Mood chips */}
          <Text style={museS.sectionLabel}>💫 지금 원하는 무드</Text>
          <View style={museS.chipRow}>
            {AI_MOOD_CHIPS.map((c) => (
              <Pressable
                key={c}
                style={[museS.chip, mood === c && museS.chipOn]}
                onPress={() => setMood(c)}
              >
                <Text style={[museS.chipTxt, mood === c && museS.chipTxtOn]}>{c}</Text>
              </Pressable>
            ))}
          </View>

          {/* CTA */}
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[museS.cta, !canSubmit && { opacity: 0.35 }]}
          >
            <LinearGradient
              colors={['#7C3AED', '#D946EF', '#FF6B8B']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={museS.ctaGrad}
            >
              <Text style={museS.ctaTxt}>✨ 코스 추천받기</Text>
            </LinearGradient>
          </Pressable>
        </LinearGradient>
      </Animated.View>
    </Modal>
  );
}

const museS = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(124,58,237,0.45)',
  },
  inner: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: 44, gap: Spacing.lg },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(148,163,184,0.3)', alignSelf: 'center',
  },
  headerRow: { alignItems: 'center', gap: Spacing.md },
  headerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: Radius.xl, paddingHorizontal: Spacing.lg, paddingVertical: 11,
  },
  headerEmoji: { fontSize: 20 },
  headerText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },
  headerSub: {
    color: '#64748B', fontSize: FontSize.xs, textAlign: 'center', lineHeight: 17,
  },
  sectionLabel: { color: '#F1F5F9', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderRadius: Radius.pill,
    paddingHorizontal: 18, paddingVertical: 9,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.22)',
  },
  chipOn: { backgroundColor: 'rgba(124,58,237,0.26)', borderColor: '#D946EF' },
  chipTxt: { color: '#94A3B8', fontSize: FontSize.sm },
  chipTxtOn: { color: '#F1F5F9', fontWeight: FontWeight.semibold },
  cta: { borderRadius: Radius.xl, overflow: 'hidden', marginTop: 4 },
  ctaGrad: { paddingVertical: Spacing.md, alignItems: 'center' },
  ctaTxt: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});

// ─── DateMapView ──────────────────────────────────────────────────────────────

function DateMapView({ t }: { t: ThemeTokens }) {
  const { dateCourses, partnerProfile, bulkAddDateCourses, privacyLevel, triggerAddCourse, setTriggerAddCourse } = useAppContext();
  const { historyPlaces, addHistoryPlace, mapPanTarget, panMapTo } = useHistoryContext();
  const { pickPhoto } = usePhotoMetadata();
  const [addVisible, setAddVisible]           = useState(false);

  // Open AddCourseSheet when triggered from home tab [+추가] button
  useEffect(() => {
    if (triggerAddCourse) {
      setAddVisible(true);
      setTriggerAddCourse(false);
    }
  }, [triggerAddCourse, setTriggerAddCourse]);
  const [museVisible, setMuseVisible]         = useState(false);
  const [selectedCourse, setSelectedCourse]   = useState<DateCourse | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendedPlace[] | null>(null);
  const [isLoadingAI, setIsLoadingAI]         = useState(false);

  // Map center fallback for photos without GPS: use first registered course or Seoul centre
  const mapCenter = dateCourses.length > 0
    ? { lat: dateCourses[0].latitude, lng: dateCourses[0].longitude }
    : { lat: 37.5512, lng: 126.9882 };

  // ── AI Muse orchestration (privacyLevel guard) ────────────────────────────
  // Lv3 (완전복제): full date-history context passed to AI
  // Lv2 (최적화):   context allowed — style learning is blocked in chat.tsx
  // Lv1 (보호):     context aggregation terminated → empty dataset
  const handleMuseSubmit = async (ootd: string, mood: string) => {
    setIsLoadingAI(true);
    setRecommendations(null);
    setSelectedCourse(null);
    try {
      const contextCourses = privacyLevel === 1 ? [] : dateCourses;
      const result = await fetchAIDateCourse(contextCourses, ootd, mood);
      setRecommendations(result);
    } finally {
      setIsLoadingAI(false);
    }
  };

  // ── Bulk insert recommended courses ───────────────────────────────────────
  const handleConfirmCourse = () => {
    if (!recommendations) return;
    const today = new Date().toISOString().split('T')[0];
    const newCourses: DateCourse[] = recommendations.map((r) => ({
      id: r.id,
      title: r.title,
      date: today,
      latitude: r.latitude,
      longitude: r.longitude,
      myRating: 0,
      myReview: '[ AI 추천 · 방문 예정 ]',
      partnerRating: 0,
      partnerReview: '',
    }));
    bulkAddDateCourses(newCourses);
    setRecommendations(null);
  };

  // ── Photo upload FAB handler ───────────────────────────────────────────────
  // Adds new PhotoMeta to HistoryContext, then triggers a smooth camera panTo.
  const handlePhotoUpload = () => {
    pickPhoto(
      (meta) => {
        addHistoryPlace(meta);
        panMapTo(meta.lat, meta.lng);
      },
      mapCenter,
    );
  };

  const FAB_BOTTOM        = STATS_BAR_H + TabBar.height + 16;
  const PHOTO_FAB_BOTTOM  = FAB_BOTTOM + 62;
  const MUSE_FAB_BOTTOM   = PHOTO_FAB_BOTTOM + 62;

  return (
    <View style={[mapV.root, { backgroundColor: t.bg }]}>
      {/* ── Map canvas ── */}
      <View style={[mapV.mapContainer, { height: MAP_H }]}>
        <HistoryKakaoMapView
          courses={dateCourses}
          photos={historyPlaces}
          onMarkerPress={(c) => { setSelectedCourse(c); setRecommendations(null); }}
          recommendedPlaces={recommendations ?? undefined}
          panTarget={mapPanTarget}
        />

        {/* Star particle loading overlay */}
        {isLoadingAI && <StarParticleOverlay />}

        {/* Floating recommendation cards at map bottom */}
        {recommendations && !isLoadingAI && (
          <View style={mapV.recCardRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: 10, paddingBottom: 10 }}
            >
              {recommendations.map((r, i) => (
                <RecommendationCard key={r.id} place={r} step={i + 1} />
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* ── Quick peek card (selected existing course) ── */}
      {selectedCourse && !recommendations && (
        <View
          style={[
            mapV.quickPeek,
            {
              backgroundColor: t.isLight ? 'rgba(255,255,255,0.97)' : 'rgba(30,41,59,0.97)',
              borderColor: t.isLight ? 'rgba(200,150,180,0.3)' : 'rgba(124,58,237,0.3)',
            },
          ]}
        >
          <Text style={[mapV.qTitle, { color: t.text }]}>{selectedCourse.title}</Text>
          <Text style={[mapV.qDate, { color: t.textMuted }]}>{selectedCourse.date}</Text>
          <View style={mapV.qRatings}>
            <View style={mapV.qRatingRow}>
              <Text style={[mapV.qName, { color: t.textSecondary }]}>나</Text>
              {selectedCourse.myRating === 0
                ? <Text style={{ color: '#FF6B8B', fontSize: 11 }}>방문 예정 ✈️</Text>
                : <StarRating value={selectedCourse.myRating} readonly size={14} />
              }
            </View>
            <View style={mapV.qRatingRow}>
              <Text style={[mapV.qName, { color: t.textSecondary }]}>{partnerProfile.name}</Text>
              {selectedCourse.partnerRating === 0
                ? <Text style={{ color: '#94A3B8', fontSize: 11 }}>미입력</Text>
                : <StarRating value={Math.round(selectedCourse.partnerRating)} readonly size={14} />
              }
            </View>
          </View>
          <Pressable style={mapV.qClose} onPress={() => setSelectedCourse(null)}>
            <Text style={{ color: '#94A3B8', fontSize: 12 }}>닫기 ✕</Text>
          </Pressable>
        </View>
      )}

      {/* ── Recommendation confirm panel OR course list ── */}
      {recommendations && !isLoadingAI ? (
        <View style={mapV.recPanel}>
          <Text style={[mapV.recPanelTitle, { color: t.textMuted }]}>
            ✨ AI 뮤즈가 큐레이션한 오늘의 데이트 코스
          </Text>
          <Pressable style={mapV.confirmBtn} onPress={handleConfirmCourse}>
            <LinearGradient
              colors={['#7C3AED', '#D946EF', '#FF6B8B']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={mapV.confirmGrad}
            >
              <Text style={mapV.confirmTxt}>👉 이 코스로 데이트 확정하기</Text>
            </LinearGradient>
          </Pressable>
          <Pressable style={mapV.dismissBtn} onPress={() => setRecommendations(null)}>
            <Text style={{ color: '#64748B', fontSize: FontSize.xs }}>✕ 다시 추천받기</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: Spacing.md, paddingBottom: STATS_BAR_H + TabBar.height + 80 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[mapV.listHeader, { color: t.textMuted }]}>
            📍 등록된 장소 {dateCourses.length}곳
          </Text>
          {dateCourses.map((c) => (
            <CourseListCard key={c.id} course={c} t={t} />
          ))}
        </ScrollView>
      )}

      {/* ── Privacy level badge (shown when collection is restricted) ── */}
      {privacyLevel < 3 && (
        <View
          style={{
            position: 'absolute',
            right: Spacing.base + 4,
            bottom: MUSE_FAB_BOTTOM + 60,
            backgroundColor: privacyLevel === 1 ? 'rgba(248,113,113,0.92)' : 'rgba(251,191,36,0.92)',
            borderRadius: Radius.pill,
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}
          pointerEvents="none"
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
            {privacyLevel === 1 ? '🔴 수집 차단' : '🟡 학습 일시 중단'}
          </Text>
        </View>
      )}

      {/* ── AI Muse FAB (aurora, above photo FAB) ── */}
      <AuroraMuseFAB onPress={() => setMuseVisible(true)} bottom={MUSE_FAB_BOTTOM} />

      {/* ── 📸 추억 사진 올리기 FAB ── */}
      <Pressable
        style={[mapV.fab, { bottom: PHOTO_FAB_BOTTOM }]}
        onPress={handlePhotoUpload}
      >
        <LinearGradient
          colors={['#7C3AED', '#D946EF', '#FF6B8B']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={mapV.fabGrad}
        >
          <Text style={mapV.fabTxt}>📸 추억 사진 올리기</Text>
        </LinearGradient>
      </Pressable>

      {/* ── + 코스 추가 FAB ── */}
      <Pressable
        style={[mapV.fab, { bottom: FAB_BOTTOM }]}
        onPress={() => setAddVisible(true)}
      >
        <LinearGradient
          colors={t.gradientColors}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={mapV.fabGrad}
        >
          <Text style={mapV.fabTxt}>+ 코스 추가</Text>
        </LinearGradient>
      </Pressable>

      <AIMuseSheet
        visible={museVisible}
        onClose={() => setMuseVisible(false)}
        onSubmit={handleMuseSubmit}
      />
      <AddCourseSheet
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        partnerName={partnerProfile.name}
      />
    </View>
  );
}

const mapV = StyleSheet.create({
  root: { flex: 1 },
  mapContainer: {
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(124,58,237,0.22)',
  },
  // Recommendation card row floating at map bottom
  recCardRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: 'rgba(10,13,26,0.55)',
  },
  // Recommendation confirm panel
  recPanel: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  recPanelTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  confirmBtn: { borderRadius: Radius.xl, overflow: 'hidden' },
  confirmGrad: { paddingVertical: Spacing.md, alignItems: 'center' },
  confirmTxt: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  dismissBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  quickPeek: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 6,
  },
  qTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  qDate:  { fontSize: FontSize.xs },
  qRatings: { gap: 4, marginTop: 2 },
  qRatingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  qName: { fontSize: FontSize.xs, width: 28 },
  qClose: { alignSelf: 'flex-end' },
  listHeader: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginLeft: Spacing.base,
    marginBottom: Spacing.sm,
  },
  fab: {
    position: 'absolute',
    right: Spacing.base,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 14,
  },
  fabGrad: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fabTxt: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
});

// ─── ArchiveView (Polaroid Wall) ──────────────────────────────────────────────

function ArchiveView({ t }: { t: ThemeTokens }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [shuttleVisible, setShuttleVisible] = useState(false);

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: STATS_BAR_H + TabBar.height + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ height: WALL_H }}>
          {MEMORIES.map((node, i) => (
            <PolaroidCard
              key={node.id}
              node={node}
              index={i}
              isActive={activeId === node.id}
              onActivate={setActiveId}
            />
          ))}
        </View>
      </ScrollView>

      <StatsBar t={t} />

      <Pressable
        style={[archS.fab, { bottom: STATS_BAR_H + TabBar.height + 16 }]}
        onPress={() => setShuttleVisible(true)}
      >
        <LinearGradient
          colors={t.gradientColors}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={archS.fabGrad}
        >
          <Text style={archS.fabEmoji}>🗺️</Text>
        </LinearGradient>
      </Pressable>

      <DateShuttleModal visible={shuttleVisible} onClose={() => setShuttleVisible(false)} />
    </>
  );
}

const archS = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing.base,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 14,
  },
  fabGrad: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  fabEmoji: { fontSize: 24 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

function HistoryScreenContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('archive');
  const { themeTokens } = useAppContext();
  const t = themeTokens;

  return (
    <SafeAreaView edges={['top']} style={[screenS.root, { backgroundColor: t.bg }]}>
      <ScreenHeader t={t} />
      <SegmentedControl active={activeTab} onChange={setActiveTab} t={t} />

      {activeTab === 'archive' ? (
        <ArchiveView t={t} />
      ) : (
        <DateMapView t={t} />
      )}
    </SafeAreaView>
  );
}

// HistoryProvider wraps only this screen so its state doesn't pollute the
// global AppContext and is automatically reset when the tab unmounts.
export default function HistoryScreen() {
  return (
    <HistoryProvider>
      <HistoryScreenContent />
    </HistoryProvider>
  );
}

const screenS = StyleSheet.create({
  root: { flex: 1 },
});
