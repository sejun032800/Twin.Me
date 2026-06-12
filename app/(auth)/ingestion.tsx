import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext } from '../../src/context/AppContext';
import { TwinGradient } from '../../src/components/ui/TwinGradient';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../src/styles/theme';

const MBTI_OPTIONS = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
  '모름',
];

const ENNEAGRAM_OPTIONS = ['1유형', '2유형', '3유형', '4유형', '5유형', '6유형', '7유형', '8유형', '9유형', '모름'];

const GENDER_OPTIONS = [
  { value: 'M' as const, label: '남성', emoji: '🙋‍♂️' },
  { value: 'F' as const, label: '여성', emoji: '🙋‍♀️' },
  { value: 'other' as const, label: '기타', emoji: '✨' },
];

// ─── Bottom-sheet Modal Select ────────────────────────────────────────────────

function SelectField({
  label,
  value,
  placeholder,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: string[];
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={sel.wrapper}>
      <Text style={sel.label}>{label}</Text>
      <Pressable
        style={[sel.box, value ? sel.boxFilled : undefined]}
        onPress={() => setOpen(true)}
      >
        <Text style={[sel.text, !value && sel.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Text style={sel.arrow}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <View style={sel.modalRoot}>
          {/* Backdrop */}
          <Pressable style={sel.backdrop} onPress={() => setOpen(false)} />
          {/* Sheet */}
          <View style={sel.sheet}>
            <View style={sel.handle} />
            <Text style={sel.sheetTitle}>{label} 선택</Text>
            <ScrollView
              style={sel.list}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {options.map((opt) => (
                <Pressable
                  key={opt}
                  style={[sel.option, value === opt && sel.optionActive]}
                  onPress={() => { onSelect(opt); setOpen(false); }}
                >
                  <Text style={[sel.optionText, value === opt && sel.optionTextActive]}>
                    {opt}
                  </Text>
                  {value === opt && <Text style={sel.check}>✓</Text>}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function IngestionScreen() {
  const router = useRouter();
  const { setMyProfile } = useAppContext();

  const [name, setName] = useState('');
  const [gender, setGender] = useState<'M' | 'F' | 'other' | ''>('');
  const [mbti, setMbti] = useState('');
  const [enneagram, setEnneagram] = useState('');

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));
  const nameGlow = useSharedValue(0);
  const nameCardStyle = useAnimatedStyle(() => ({
    borderColor: nameGlow.value === 1
      ? Colors.GRADIENT_START
      : 'rgba(255,255,255,0.08)',
    shadowOpacity: nameGlow.value * 0.45,
  }));

  const canProceed = name.trim().length > 0 && gender !== '';

  const handleNext = async () => {
    if (!canProceed) return;
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setMyProfile({
      name: name.trim(),
      gender,
      mbti: mbti || '모름',
      enneagram: enneagram || '모름',
    });
    router.push('/(auth)/matching');
  };

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Header ── */}
        <Animated.View entering={FadeInDown.duration(500)} style={s.headerBlock}>
          <Text style={s.heading}>반가워요! 👋</Text>
          <Text style={s.subheading}>당신에 대해 알려주세요.</Text>
          <Text style={s.caption}>
            AI가 당신의 특별한 말투를 학습하기 위한 첫 번째 단계예요.
          </Text>
        </Animated.View>

        {/* ── Name Input ── */}
        <Animated.View entering={FadeInDown.delay(120).duration(500)}>
          <Text style={s.fieldLabel}>이름 또는 닉네임</Text>
          <Animated.View style={[s.nameCard, nameCardStyle]}>
            <TextInput
              style={s.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="이름이나 닉네임을 입력해주세요"
              placeholderTextColor="rgba(255,255,255,0.22)"
              onFocus={() => { nameGlow.value = withTiming(1, { duration: 200 }); }}
              onBlur={() => { nameGlow.value = withTiming(0, { duration: 200 }); }}
              returnKeyType="done"
              selectionColor={Colors.GRADIENT_START}
              keyboardAppearance="dark"
              autoFocus
            />
          </Animated.View>
        </Animated.View>

        {/* ── Gender Chips ── */}
        <Animated.View entering={FadeInDown.delay(220).duration(500)}>
          <Text style={s.fieldLabel}>성별</Text>
          <View style={s.genderRow}>
            {GENDER_OPTIONS.map((g) => (
              <Pressable
                key={g.value}
                style={[s.genderChip, gender === g.value && s.genderChipActive]}
                onPress={() => setGender(g.value)}
              >
                <Text style={s.genderEmoji}>{g.emoji}</Text>
                <Text style={[s.genderLabel, gender === g.value && s.genderLabelActive]}>
                  {g.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* ── MBTI + Enneagram 2-Column ── */}
        <Animated.View entering={FadeInDown.delay(320).duration(500)} style={s.selectRow}>
          <View style={s.selectHalf}>
            <SelectField
              label="MBTI"
              value={mbti}
              placeholder="유형 선택"
              options={MBTI_OPTIONS}
              onSelect={setMbti}
            />
          </View>
          <View style={s.selectHalf}>
            <SelectField
              label="에니어그램"
              value={enneagram}
              placeholder="번호 선택"
              options={ENNEAGRAM_OPTIONS}
              onSelect={setEnneagram}
            />
          </View>
        </Animated.View>

        <Animated.Text
          entering={FadeInDown.delay(380).duration(500)}
          style={s.optionalHint}
        >
          MBTI / 에니어그램은 선택 항목이에요 ✨
        </Animated.Text>

        {/* ── CTA ── */}
        <Animated.View entering={FadeInDown.delay(460).duration(500)}>
          <Pressable
            onPress={handleNext}
            onPressIn={() => { btnScale.value = withTiming(0.97, { duration: 60 }); }}
            onPressOut={() => { btnScale.value = withTiming(1, { duration: 80 }); }}
            disabled={!canProceed}
            style={!canProceed ? s.ctaDisabled : undefined}
          >
            <Animated.View style={btnStyle}>
              <TwinGradient preset="TWIN_PRIMARY" style={s.ctaButton}>
                <Text style={s.ctaText}>다음 단계로 →</Text>
              </TwinGradient>
            </Animated.View>
          </Pressable>
        </Animated.View>

        {/* ── Step Dots ── */}
        <View style={s.stepRow}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[s.stepDot, i === 1 ? s.stepDotActive : s.stepDotInactive]}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── SelectField Styles ───────────────────────────────────────────────────────

const sel = StyleSheet.create({
  wrapper: { gap: 6 },
  label: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    gap: 4,
  },
  boxFilled: {
    borderColor: 'rgba(124,58,237,0.45)',
    backgroundColor: 'rgba(124,58,237,0.08)',
  },
  text: {
    flex: 1,
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  placeholder: { color: 'rgba(255,255,255,0.25)' },
  arrow: { color: Colors.TEXT_MUTED, fontSize: 12 },

  // Modal
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    backgroundColor: '#141828',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.base,
    paddingBottom: 32,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: Spacing.base,
  },
  sheetTitle: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  list: { maxHeight: 300 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    marginVertical: 2,
  },
  optionActive: { backgroundColor: 'rgba(124,58,237,0.15)' },
  optionText: { color: Colors.TEXT_ON_DARK_SECONDARY, fontSize: FontSize.base },
  optionTextActive: { color: Colors.TEXT_ON_DARK, fontWeight: FontWeight.bold },
  check: { color: Colors.GRADIENT_END, fontSize: 14, fontWeight: FontWeight.bold },
});

// ─── Screen Styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.BG_DARK_MIDNIGHT },
  scroll: {
    paddingHorizontal: Spacing['2xl'],
    paddingTop: Spacing.xl,
    paddingBottom: Spacing['4xl'],
    gap: Spacing.lg,
  },

  headerBlock: { gap: 6, marginBottom: 4 },
  heading: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.extrabold,
    letterSpacing: -0.5,
  },
  subheading: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
  },
  caption: {
    color: Colors.TEXT_ON_DARK_SECONDARY,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginTop: 4,
  },

  fieldLabel: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },

  nameCard: {
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    height: 58,
    justifyContent: 'center',
    shadowColor: Colors.GRADIENT_START,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 14,
    elevation: 0,
  },
  nameInput: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },

  genderRow: { flexDirection: 'row', gap: Spacing.md },
  genderChip: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(30,41,59,0.8)',
  },
  genderChipActive: {
    borderColor: Colors.GRADIENT_START,
    backgroundColor: 'rgba(124,58,237,0.12)',
  },
  genderEmoji: { fontSize: 22 },
  genderLabel: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  genderLabelActive: { color: Colors.TEXT_ON_DARK, fontWeight: FontWeight.bold },

  selectRow: { flexDirection: 'row', gap: Spacing.md },
  selectHalf: { flex: 1 },

  optionalHint: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: -4,
  },

  ctaButton: {
    height: 58,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flex: undefined,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },
  ctaDisabled: { opacity: 0.35 },

  stepRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 4,
  },
  stepDot: { height: 6, borderRadius: 3 },
  stepDotActive: { width: 22, backgroundColor: Colors.GRADIENT_END },
  stepDotInactive: { width: 6, backgroundColor: 'rgba(255,255,255,0.18)' },
});
