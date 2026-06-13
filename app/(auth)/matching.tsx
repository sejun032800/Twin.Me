import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useAppContext } from '../../src/context/AppContext';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { shareInviteCodeViaKakao } from '../../src/services/kakaoShareService';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../src/styles/theme';
import {
  isMockMode,
  MatchPayload,
  registerInviteCodeToServer,
  verifyAndConnectCouple,
} from '../../src/services/inviteCodeService';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'issue' | 'enter';

// ─── DNA Helix Visual ─────────────────────────────────────────────────────────
// Pure RN View dots arranged in mathematical double-helix (no SVG needed).
// Front dots (sin ≥ 0) are larger/opaque; back dots are smaller/translucent
// to fake 3-D depth on a 2-D canvas.

const HELIX_N = 14;           // number of rungs per strand
const HELIX_SPACING = 18;     // px between rungs vertically
const HELIX_AMPLITUDE = 18;   // max horizontal deviation from centre
const HELIX_W = 52;           // total width of one helix column
const HELIX_H = HELIX_N * HELIX_SPACING;
const HELIX_HALF_W = HELIX_W / 2;

interface StrandDot {
  x: number; y: number; size: number; opacity: number; isFront: boolean; color: string;
}

function buildStrand(color: string, phase: number): StrandDot[] {
  return Array.from({ length: HELIX_N }, (_, i) => {
    const angle = (i / HELIX_N) * 2 * Math.PI + phase;
    const sinVal = Math.sin(angle);
    const isFront = sinVal >= 0;
    return {
      x: HELIX_HALF_W + sinVal * HELIX_AMPLITUDE,
      y: i * HELIX_SPACING,
      size: isFront ? 11 : 7,
      opacity: isFront ? 1 : 0.28,
      isFront,
      color,
    };
  });
}

function DnaHelixVisual({ color1, color2 }: { color1: string; color2: string }) {
  const strandA = buildStrand(color1, 0);
  const strandB = buildStrand(color2, Math.PI);
  // Render back dots first so front dots appear on top without z-index hacks
  const all = [...strandA, ...strandB];
  const sorted = [...all.filter(d => !d.isFront), ...all.filter(d => d.isFront)];

  return (
    <View style={{ width: HELIX_W, height: HELIX_H }}>
      {sorted.map((d, idx) => (
        <View
          key={idx}
          style={{
            position: 'absolute',
            left: d.x - d.size / 2,
            top: d.y - d.size / 2,
            width: d.size,
            height: d.size,
            borderRadius: d.size / 2,
            backgroundColor: d.color,
            opacity: d.opacity,
          }}
        />
      ))}
    </View>
  );
}

// ─── Segment Control ──────────────────────────────────────────────────────────

function SegmentControl({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <View style={seg.track}>
      {(['issue', 'enter'] as Tab[]).map((tab) => (
        <Pressable
          key={tab}
          onPress={() => onChange(tab)}
          style={[seg.pill, active === tab && seg.pillActive]}
        >
          <Text style={[seg.label, active === tab && seg.labelActive]}>
            {tab === 'issue' ? '내 코드 발급' : '코드 입력하기'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Code Card (issued) ───────────────────────────────────────────────────────

function CodeCard({
  code,
  onCopy,
  copied,
}: {
  code: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <Animated.View entering={FadeIn.duration(500)} style={codeStyles.card}>
      <View style={codeStyles.cardInner}>
        <Text style={codeStyles.cardLabel}>YOUR INVITE CODE</Text>
        <Text style={codeStyles.codeText}>{code}</Text>
        <View style={codeStyles.divider} />
        <Pressable onPress={onCopy} style={codeStyles.copyBtn}>
          <Text style={codeStyles.copyText}>
            {copied ? '✓ 복사됨!' : '📋 코드 복사하기'}
          </Text>
        </Pressable>
        {isMockMode && (
          <Text style={codeStyles.mockBadge}>⚙️ 개발 Mock 모드</Text>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Pending Card (발급 전) ────────────────────────────────────────────────────

function PendingCard({
  onIssue,
  isLoading,
}: {
  onIssue: () => void;
  isLoading: boolean;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View entering={FadeInDown.delay(200).duration(600)} style={codeStyles.card}>
      <View style={codeStyles.cardInner}>
        <Text style={codeStyles.cardLabel}>INVITE CODE</Text>
        <View style={codeStyles.pendingDashes}>
          <Text style={codeStyles.pendingText}>— — — — — —</Text>
        </View>
        <View style={codeStyles.divider} />
        <Pressable
          onPress={onIssue}
          onPressIn={() => { scale.value = withTiming(0.96, { duration: 60 }); }}
          onPressOut={() => { scale.value = withSpring(1, { damping: 12 }); }}
          disabled={isLoading}
          style={({ pressed }) => [
            codeStyles.issueBtn,
            (pressed || isLoading) && codeStyles.issueBtnPressed,
          ]}
        >
          <Animated.View style={[codeStyles.issueBtnInner, animStyle]}>
            {isLoading ? (
              <>
                <ActivityIndicator size="small" color={Colors.TEXT_ON_DARK} />
                <Text style={codeStyles.issueBtnText}>코드 발급 중…</Text>
              </>
            ) : (
              <Text style={codeStyles.issueBtnText}>✨ 코드 발급받기</Text>
            )}
          </Animated.View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Enter Code Panel ─────────────────────────────────────────────────────────

function EnterCodePanel({
  myCode,
  onSuccess,
}: {
  myCode: string | null;
  onSuccess: (coupleId: string, partnerInfo: MatchPayload['partnerInfo']) => void;
}) {
  const [rawInput, setRawInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<TextInput>(null);

  const stripped = rawInput.replace(/\s/g, '');
  const canSubmit = stripped.length === 8 && !isLoading;

  function formatDisplay(raw: string): string {
    if (raw.length <= 3) return raw;
    if (raw.length <= 6) return `${raw.slice(0, 3)} ${raw.slice(3)}`;
    return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6)}`;
  }

  function handleChangeText(text: string) {
    setErrorMsg('');
    const clean = text
      .replace(/\s/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    setRawInput(clean.slice(0, 8));
  }

  const matchBtnScale = useSharedValue(1);
  const matchBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: matchBtnScale.value }],
  }));

  async function handleMatch() {
    if (!canSubmit) return;
    Keyboard.dismiss();
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

    setIsLoading(true);
    setErrorMsg('');
    try {
      const result = await verifyAndConnectCouple(stripped, myCode);
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      onSuccess(result.coupleId, result.partnerInfo);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : '알 수 없는 오류가 발생했습니다.';
      setErrorMsg(msg);
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Animated.View entering={FadeInDown.delay(100).duration(500)} style={enterStyles.container}>
      {/* Input Box */}
      <Pressable onPress={() => inputRef.current?.focus()}>
        <View style={[enterStyles.inputBox, focused && enterStyles.inputBoxFocused]}>
          <TextInput
            ref={inputRef}
            value={formatDisplay(rawInput)}
            onChangeText={handleChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="XXX XXX XX"
            placeholderTextColor="rgba(255,255,255,0.18)"
            autoCapitalize="characters"
            autoCorrect={false}
            keyboardType="default"
            maxLength={10}
            style={enterStyles.input}
            selectionColor={Colors.GRADIENT_START}
            editable={!isLoading}
          />
        </View>
      </Pressable>

      <Text style={enterStyles.charCount}>{stripped.length} / 8</Text>

      {/* Error Message */}
      {errorMsg !== '' && (
        <Animated.Text entering={FadeIn.duration(300)} style={enterStyles.errorText}>
          {errorMsg}
        </Animated.Text>
      )}

      {/* Match Button */}
      <Pressable
        onPress={handleMatch}
        onPressIn={() => { matchBtnScale.value = withTiming(0.96, { duration: 60 }); }}
        onPressOut={() => { matchBtnScale.value = withSpring(1, { damping: 12 }); }}
        disabled={!canSubmit}
      >
        <Animated.View
          style={[
            enterStyles.matchBtn,
            !canSubmit && enterStyles.matchBtnDisabled,
            matchBtnStyle,
          ]}
        >
          {isLoading ? (
            <>
              <ActivityIndicator size="small" color={Colors.TEXT_ON_DARK} />
              <Text style={enterStyles.matchBtnText}>연결 중…</Text>
            </>
          ) : (
            <Text style={enterStyles.matchBtnText}>💕 매칭하기</Text>
          )}
        </Animated.View>
      </Pressable>

      <Text style={enterStyles.hint}>상대방이 공유한 8자리 초대코드를 입력하세요</Text>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MatchingScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const {
    myProfile,
    inviteCode,
    setInviteCode,
    setCoupleId,
    setPartnerProfile,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState<Tab>('issue');
  const [code, setCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAnim, setShowAnim] = useState(false);

  // ── Button scale values ───────────────────────────────────────────────────
  const kakaoScale = useSharedValue(1);
  const kakaoStyle = useAnimatedStyle(() => ({ transform: [{ scale: kakaoScale.value }] }));
  const skipScale = useSharedValue(1);
  const skipStyle = useAnimatedStyle(() => ({ transform: [{ scale: skipScale.value }] }));

  // ── DNA success animation shared values ──────────────────────────────────
  // leftX / rightX: translateX offset for each helix column
  // glowScale / glowOpacity: photon burst circle
  // successTextOpacity: "연결되었습니다!" fade-in
  // overlayOpacity: full-screen overlay fade
  const leftX = useSharedValue(0);
  const rightX = useSharedValue(0);
  const glowScale = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const successTextOpacity = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);

  const overlayAnim = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const leftAnim = useAnimatedStyle(() => ({ transform: [{ translateX: leftX.value }] }));
  const rightAnim = useAnimatedStyle(() => ({ transform: [{ translateX: rightX.value }] }));
  const glowAnim = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));
  const successTextAnim = useAnimatedStyle(() => ({
    opacity: successTextOpacity.value,
    transform: [{ translateY: (1 - successTextOpacity.value) * 14 }],
  }));

  // ── Navigation helper (called via runOnJS from UI thread) ─────────────────
  function navigateToHome() {
    router.replace('/(tabs)');
  }

  // ── Collision effects: runs on JS thread after spring settles ─────────────
  function fireCollisionFx() {
    //묵직한 성공 햅틱 — 나선이 물리적으로 충돌하는 바로 그 찰나
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}

    // Photon glow burst: scale up with underdamped spring → opacity fades out
    glowScale.value = withSpring(1, { damping: 6, stiffness: 70 });
    glowOpacity.value = withSequence(
      withTiming(1, { duration: 160 }),
      withDelay(480, withTiming(0, { duration: 380 })),
    );

    // Success text fades in below center
    successTextOpacity.value = withDelay(220, withTiming(1, { duration: 340 }));

    // After display hold, fade overlay and navigate to home tab
    setTimeout(() => {
      overlayOpacity.value = withTiming(0, { duration: 420 }, () => {
        runOnJS(navigateToHome)();
      });
    }, 1700);
  }

  // ── Main trigger: called the instant coupleId is received from API ────────
  function triggerMatchingSuccessAnim() {
    // Reset all values to initial state before showing overlay
    leftX.value = -screenWidth - HELIX_W;
    rightX.value = screenWidth + HELIX_W;
    glowScale.value = 0.15;
    glowOpacity.value = 0;
    successTextOpacity.value = 0;
    overlayOpacity.value = 0;

    setShowAnim(true);

    // Overlay fades in immediately
    overlayOpacity.value = withTiming(1, { duration: 260 });

    // Both helices fly toward center with elastic spring (자석 흡인력 느낌)
    // Left helix spring callback triggers collision effects once settled
    leftX.value = withSpring(0, { damping: 13, stiffness: 130, overshootClamping: false }, (finished) => {
      if (finished) runOnJS(fireCollisionFx)();
    });
    rightX.value = withSpring(0, { damping: 13, stiffness: 130, overshootClamping: false });
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleIssueCode = async () => {
    if (isLoading) return;
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setIsLoading(true);
    try {
      const userId = myProfile.name || 'anonymous';
      const payload = await registerInviteCodeToServer(userId);
      setCode(payload.code);
      setInviteCode(payload.code.replace(/\s/g, ''));
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? '요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'
          : '네트워크 연결을 확인하고 다시 시도해 주세요.';
      Alert.alert('코드 발급 실패', message, [{ text: '확인' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    try { await Haptics.selectionAsync(); } catch {}
    const raw = code.replace(/\s/g, '');
    if (Platform.OS === 'web') {
      try { await (navigator as any).clipboard.writeText(raw); } catch {}
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleKakaoShare = async () => {
    if (!code) return;
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    await shareInviteCodeViaKakao(code);
    router.push('/(auth)/loading');
  };

  const handleSkip = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    router.push('/(auth)/loading');
  };

  // 매칭 성공: coupleId · 파트너 정보를 전역 세션에 주입 → DNA 애니메이션 트리거
  const handleMatchSuccess = (
    coupleId: string,
    partnerInfo: MatchPayload['partnerInfo'],
  ) => {
    setCoupleId(coupleId);
    setPartnerProfile({
      name: partnerInfo.name,
      gender: partnerInfo.gender,
      mbti: partnerInfo.mbti,
    });
    triggerMatchingSuccessAnim();
  };

  const headingText =
    activeTab === 'issue'
      ? '당신만의 소중한 인연을\n연결할 준비가 되었습니다.'
      : '파트너의 초대코드를\n입력해주세요.';
  const subText =
    activeTab === 'issue'
      ? '아래 초대 코드를 연인에게 공유하고\n함께 Twin.me를 시작해보세요'
      : '상대방이 공유한 코드를 입력하면\n두 사람이 하나로 연결됩니다 💕';

  return (
    <SafeAreaView style={s.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.container}
      >
        {/* ── Header ── */}
        <Animated.View entering={FadeInDown.duration(500)} style={s.header}>
          <Text style={s.heading}>{headingText}</Text>
          <Text style={s.subheading}>{subText}</Text>
        </Animated.View>

        {/* ── Segment Control ── */}
        <SegmentControl active={activeTab} onChange={setActiveTab} />

        {/* ── Tab Content ── */}
        {activeTab === 'issue' ? (
          <>
            {code === null ? (
              <PendingCard onIssue={handleIssueCode} isLoading={isLoading} />
            ) : (
              <CodeCard code={code} onCopy={handleCopy} copied={copied} />
            )}

            <Animated.View entering={FadeInUp.delay(400).duration(500)}>
              <Pressable
                onPress={handleKakaoShare}
                onPressIn={() => { kakaoScale.value = withTiming(0.97, { duration: 60 }); }}
                onPressOut={() => { kakaoScale.value = withSpring(1, { damping: 12 }); }}
                disabled={code === null}
              >
                <Animated.View
                  style={[s.kakaoButton, code === null && s.kakaoButtonDisabled, kakaoStyle]}
                >
                  <Text style={s.kakaoIcon}>💬</Text>
                  <Text style={[s.kakaoText, code === null && s.kakaoTextDisabled]}>
                    카카오톡으로 공유하기
                  </Text>
                </Animated.View>
              </Pressable>
            </Animated.View>
          </>
        ) : (
          <EnterCodePanel
            myCode={inviteCode || null}
            onSuccess={handleMatchSuccess}
          />
        )}

        {/* ── Skip ── */}
        <Animated.View entering={FadeInUp.delay(550).duration(400)}>
          <Pressable
            onPress={handleSkip}
            onPressIn={() => { skipScale.value = withTiming(0.96, { duration: 60 }); }}
            onPressOut={() => { skipScale.value = withTiming(1, { duration: 80 }); }}
          >
            <Animated.Text style={[s.skipText, skipStyle]}>나중에 하기</Animated.Text>
          </Pressable>
        </Animated.View>

        {/* ── Step Dots ── */}
        <View style={s.stepRow}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                s.stepDot,
                i === 2 ? s.stepDotActive : i < 2 ? s.stepDotDone : s.stepDotInactive,
              ]}
            />
          ))}
        </View>
      </KeyboardAvoidingView>

      {/* ═══════════════════════════════════════════════════════════════════════
          DNA 자석 결합 성공 오버레이
          — 매칭 API 응답 수신 즉시 트리거됨
          — 두 나선이 좌우에서 중앙으로 스냅 → 결합 글로우 → 성공 문구 → 홈 전환
      ════════════════════════════════════════════════════════════════════════ */}
      {showAnim && (
        <Animated.View
          style={[StyleSheet.absoluteFill, anim.overlay, overlayAnim]}
        >
          {/* 광자 확산 글로우 링 — 결합 순간 팽창 */}
          <Animated.View style={[anim.glowRing, glowAnim]} />

          {/* 내 나선 (네온 바이올렛) — 왼쪽에서 중앙으로 */}
          <Animated.View style={[anim.helixPivot, leftAnim]}>
            <DnaHelixVisual
              color1={Colors.GRADIENT_START}
              color2="rgba(217,70,239,0.50)"
            />
          </Animated.View>

          {/* 상대방 나선 (피치 핑크) — 오른쪽에서 중앙으로 */}
          <Animated.View style={[anim.helixPivot, rightAnim]}>
            <DnaHelixVisual
              color1={Colors.GRADIENT_END}
              color2="rgba(255,107,139,0.50)"
            />
          </Animated.View>

          {/* 결합 완료 문구 */}
          <Animated.Text style={[anim.successText, successTextAnim]}>
            💕 우리가 연결되었습니다!
          </Animated.Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ─── Overlay Styles ───────────────────────────────────────────────────────────

const anim = StyleSheet.create({
  overlay: {
    backgroundColor: Colors.BG_DARK_MIDNIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  // Photon burst ring — centred in overlay via top/left percentage + negative margin
  glowRing: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -120,
    marginLeft: -120,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(124,58,237,0.14)',
    shadowColor: Colors.GRADIENT_MID,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 64,
    elevation: 24,
  },
  // Both helices share this base style; translateX animates them from off-screen
  helixPivot: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -(HELIX_H / 2),
    marginLeft: -(HELIX_W / 2),
  },
  successText: {
    position: 'absolute',
    bottom: 130,
    left: 0,
    right: 0,
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    textAlign: 'center',
    letterSpacing: 0.4,
  },
});

// ─── Segment Styles ───────────────────────────────────────────────────────────

const seg = StyleSheet.create({
  track: {
    flexDirection: 'row',
    marginHorizontal: Spacing['2xl'],
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.pill,
    padding: 4,
    gap: 4,
  },
  pill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: Colors.GRADIENT_START,
    shadowColor: Colors.GRADIENT_START,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 4,
  },
  label: {
    color: Colors.TEXT_ON_DARK_SECONDARY,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  labelActive: {
    color: Colors.TEXT_ON_DARK,
  },
});

// ─── Enter Panel Styles ───────────────────────────────────────────────────────

const enterStyles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing['2xl'],
    gap: Spacing.sm,
  },
  inputBox: {
    backgroundColor: Colors.CARD_DARK_SLATE,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: 'rgba(124,58,237,0.22)',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  inputBoxFocused: {
    borderColor: Colors.GRADIENT_START,
    shadowColor: Colors.GRADIENT_START,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 8,
  },
  input: {
    color: Colors.TEXT_ON_DARK,
    fontSize: 34,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 8,
    textAlign: 'center',
  },
  charCount: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.xs,
    textAlign: 'right',
    paddingRight: 4,
  },
  errorText: {
    color: Colors.ALERT_SIREN_RED,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: 2,
  },
  matchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: 60,
    borderRadius: Radius.xl,
    backgroundColor: Colors.GRADIENT_START,
    shadowColor: Colors.GRADIENT_START,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
    marginTop: Spacing.xs,
  },
  matchBtnDisabled: {
    backgroundColor: 'rgba(124,58,237,0.28)',
    shadowOpacity: 0,
    elevation: 0,
  },
  matchBtnText: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.base,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.2,
  },
  hint: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: 2,
  },
});

// ─── Code Card Styles ─────────────────────────────────────────────────────────

const codeStyles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing['2xl'],
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
  },
  cardInner: {
    backgroundColor: Colors.CARD_DARK_SLATE,
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.25)',
    paddingVertical: Spacing['3xl'],
    paddingHorizontal: Spacing['2xl'],
    alignItems: 'center',
    gap: Spacing.md,
    shadowColor: Colors.GRADIENT_START,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  cardLabel: {
    color: Colors.TEXT_MUTED,
    fontSize: 10,
    fontWeight: FontWeight.bold,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  codeText: {
    color: Colors.TEXT_ON_DARK,
    fontSize: 38,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 8,
    textAlign: 'center',
  },
  pendingDashes: {
    height: 54,
    justifyContent: 'center',
  },
  pendingText: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: 28,
    letterSpacing: 6,
    textAlign: 'center',
  },
  divider: {
    width: '80%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginVertical: 4,
  },
  copyBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  copyText: {
    color: Colors.ALERT_SIREN_RED,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  issueBtn: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  issueBtnPressed: {
    opacity: 0.8,
  },
  issueBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.GRADIENT_START,
    borderRadius: Radius.lg,
  },
  issueBtnText: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  mockBadge: {
    color: 'rgba(255,220,100,0.6)',
    fontSize: 10,
    marginTop: 2,
  },
});

// ─── Screen Styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.BG_DARK_MIDNIGHT,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.xl,
    paddingBottom: Spacing['2xl'],
  },
  header: {
    paddingHorizontal: Spacing['2xl'],
    gap: Spacing.sm,
  },
  heading: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  subheading: {
    color: Colors.TEXT_ON_DARK_SECONDARY,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  kakaoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing['2xl'],
    height: 60,
    borderRadius: Radius.xl,
    backgroundColor: '#FEE500',
    shadowColor: '#FEE500',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  kakaoButtonDisabled: {
    backgroundColor: 'rgba(254,229,0,0.35)',
    shadowOpacity: 0,
    elevation: 0,
  },
  kakaoIcon: { fontSize: 20 },
  kakaoText: {
    color: '#3A1D00',
    fontSize: FontSize.base,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.2,
  },
  kakaoTextDisabled: {
    color: 'rgba(58,29,0,0.4)',
  },
  skipText: {
    color: Colors.TEXT_MUTED,
    fontSize: FontSize.sm,
    textAlign: 'center',
    textDecorationLine: 'underline',
    paddingVertical: 4,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  stepDot: { height: 6, borderRadius: 3 },
  stepDotActive: { width: 22, backgroundColor: Colors.GRADIENT_END },
  stepDotDone: { width: 6, backgroundColor: Colors.GRADIENT_MID },
  stepDotInactive: { width: 6, backgroundColor: 'rgba(255,255,255,0.18)' },
});
