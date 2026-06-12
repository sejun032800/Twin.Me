import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
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
  FadeInRight,
  FadeOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext } from '../../src/context/AppContext';
import { TwinGradient } from '../../src/components/ui/TwinGradient';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../src/styles/theme';

const TOTAL_STEPS = 4;

const MBTI_OPTIONS = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
  '모름',
];

// ─── Progress Dots ────────────────────────────────────────────────────────────

function ProgressDots({ step }: { step: number }) {
  return (
    <View style={s.dotsRow}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[s.dot, i < step ? s.dotActive : i === step - 1 ? s.dotCurrent : s.dotInactive]}
        />
      ))}
    </View>
  );
}

// ─── Gender Selector ──────────────────────────────────────────────────────────

function GenderSelector({
  value,
  onChange,
}: {
  value: 'M' | 'F' | '';
  onChange: (v: 'M' | 'F') => void;
}) {
  return (
    <View style={s.genderRow}>
      {(['M', 'F'] as const).map((g) => (
        <Pressable
          key={g}
          style={[s.genderCard, value === g && s.genderCardActive]}
          onPress={() => onChange(g)}
        >
          <Text style={s.genderEmoji}>{g === 'M' ? '🙋‍♂️' : '🙋‍♀️'}</Text>
          <Text style={[s.genderLabel, value === g && s.genderLabelActive]}>
            {g === 'M' ? '남성' : '여성'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── MBTI Grid ────────────────────────────────────────────────────────────────

function MBTIGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={s.mbtiGrid}>
      {MBTI_OPTIONS.map((m) => (
        <Pressable
          key={m}
          style={[s.mbtiChip, value === m && s.mbtiChipActive]}
          onPress={() => onChange(m)}
        >
          <Text style={[s.mbtiChipText, value === m && s.mbtiChipTextActive]}>{m}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Name Input ───────────────────────────────────────────────────────────────

function NameInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [focused, setFocused] = useState(false);
  const glow = useSharedValue(0);

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: glow.value === 1 ? Colors.GRADIENT_START : Colors.DIVIDER_DARK,
    shadowOpacity: glow.value * 0.45,
  }));

  return (
    <Animated.View style={[s.inputWrapper, borderStyle]}>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.TEXT_MUTED}
        onFocus={() => { glow.value = withTiming(1, { duration: 200 }); setFocused(true); }}
        onBlur={() => { glow.value = withTiming(0, { duration: 200 }); setFocused(false); }}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={Keyboard.dismiss}
        selectionColor={Colors.GRADIENT_START}
        keyboardAppearance="dark"
      />
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const { setMyProfile, setPartnerProfile } = useAppContext();

  const [step, setStep] = useState(1);

  // My profile state
  const [myName, setMyName] = useState('');
  const [myGender, setMyGender] = useState<'M' | 'F' | ''>('');
  const [myMbti, setMyMbti] = useState('');

  // Partner profile state
  const [partnerName, setPartnerName] = useState('');
  const [partnerGender, setPartnerGender] = useState<'M' | 'F' | ''>('');
  const [partnerMbti, setPartnerMbti] = useState('');

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

  const canAdvance = (): boolean => {
    if (step === 1) return myName.trim().length > 0;
    if (step === 2) return myGender !== '' && myMbti !== '';
    if (step === 3) return partnerName.trim().length > 0;
    if (step === 4) return partnerGender !== '' && partnerMbti !== '';
    return false;
  };

  const handleNext = async () => {
    if (!canAdvance()) return;
    Keyboard.dismiss();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
    } else {
      // Save and proceed
      setMyProfile({ name: myName.trim(), gender: myGender as 'M' | 'F', mbti: myMbti, enneagram: '' });
      setPartnerProfile({ name: partnerName.trim(), gender: partnerGender as 'M' | 'F', mbti: partnerMbti });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(auth)/ingestion');
    }
  };

  const STEP_CONTENT: Record<number, { question: string; body: React.ReactNode }> = {
    1: {
      question: '안녕하세요!\n이름이 뭔가요?',
      body: (
        <NameInput
          value={myName}
          onChange={setMyName}
          placeholder="내 이름을 입력해주세요"
        />
      ),
    },
    2: {
      question: '성별과 MBTI를\n알려주세요',
      body: (
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          <Text style={s.subLabel}>성별</Text>
          <GenderSelector value={myGender} onChange={setMyGender} />
          <Text style={[s.subLabel, { marginTop: Spacing.lg }]}>MBTI</Text>
          <MBTIGrid value={myMbti} onChange={setMyMbti} />
        </ScrollView>
      ),
    },
    3: {
      question: '연인의 이름은요?',
      body: (
        <NameInput
          value={partnerName}
          onChange={setPartnerName}
          placeholder="연인의 이름을 입력해주세요"
        />
      ),
    },
    4: {
      question: '연인의 정보도\n알려주세요',
      body: (
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          <Text style={s.subLabel}>연인 성별</Text>
          <GenderSelector value={partnerGender} onChange={setPartnerGender} />
          <Text style={[s.subLabel, { marginTop: Spacing.lg }]}>연인 MBTI</Text>
          <MBTIGrid value={partnerMbti} onChange={setPartnerMbti} />
        </ScrollView>
      ),
    },
  };

  const content = STEP_CONTENT[step];

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={s.inner}>
            {/* Progress */}
            <ProgressDots step={step} />

            {/* Step counter */}
            <Text style={s.stepCounter}>{step} / {TOTAL_STEPS}</Text>

            {/* Question */}
            <Animated.View
              key={`q-${step}`}
              entering={FadeInRight.duration(280)}
              exiting={FadeOutLeft.duration(200)}
            >
              <Text style={s.question}>{content.question}</Text>
            </Animated.View>

            {/* Body */}
            <Animated.View
              key={`b-${step}`}
              entering={FadeInRight.delay(60).duration(280)}
              exiting={FadeOutLeft.duration(200)}
              style={s.bodyWrapper}
            >
              {content.body}
            </Animated.View>

            {/* CTA */}
            <Pressable
              onPress={handleNext}
              onPressIn={() => { btnScale.value = withTiming(0.97, { duration: 60 }); }}
              onPressOut={() => { btnScale.value = withTiming(1, { duration: 80 }); }}
              style={!canAdvance() && s.ctaDisabled}
              disabled={!canAdvance()}
            >
              <Animated.View style={btnStyle}>
                <TwinGradient preset="TWIN_PRIMARY" style={s.ctaButton}>
                  <Text style={s.ctaText}>
                    {step < TOTAL_STEPS ? '다음 →' : '완료! Twin.me 시작하기 →'}
                  </Text>
                </TwinGradient>
              </Animated.View>
            </Pressable>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BG_DARK_MIDNIGHT,
  },
  inner: {
    flex: 1,
    paddingHorizontal: Spacing['2xl'],
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },

  // Progress
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: { backgroundColor: Colors.GRADIENT_END },
  dotCurrent: { backgroundColor: Colors.GRADIENT_START, width: 20 },
  dotInactive: { backgroundColor: Colors.DIVIDER_DARK },
  stepCounter: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 1,
  },

  // Question
  question: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    lineHeight: 34,
    letterSpacing: -0.5,
  },

  // Body
  bodyWrapper: {
    flex: 1,
    gap: Spacing.md,
  },
  subLabel: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },

  // Name input
  inputWrapper: {
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.DIVIDER_DARK,
    backgroundColor: Colors.CARD_DARK_SLATE,
    height: 60,
    paddingHorizontal: Spacing.base,
    justifyContent: 'center',
    shadowColor: Colors.GRADIENT_START,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    elevation: 0,
  },
  input: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },

  // Gender
  genderRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  genderCard: {
    flex: 1,
    backgroundColor: Colors.CARD_DARK_SLATE,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.DIVIDER_DARK,
  },
  genderCardActive: {
    borderColor: Colors.GRADIENT_START,
    backgroundColor: 'rgba(124,58,237,0.12)',
  },
  genderEmoji: { fontSize: 28 },
  genderLabel: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  genderLabelActive: {
    color: Colors.TEXT_ON_DARK,
    fontWeight: FontWeight.bold,
  },

  // MBTI
  mbtiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  mbtiChip: {
    backgroundColor: Colors.CARD_DARK_SLATE,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.DIVIDER_DARK,
    minWidth: 72,
    alignItems: 'center',
  },
  mbtiChipActive: {
    backgroundColor: 'rgba(124,58,237,0.18)',
    borderColor: Colors.GRADIENT_START,
  },
  mbtiChipText: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  mbtiChipTextActive: {
    color: Colors.TEXT_ON_DARK,
    fontWeight: FontWeight.bold,
  },

  // CTA
  ctaButton: {
    height: 56,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flex: undefined,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  ctaDisabled: { opacity: 0.38 },
});
