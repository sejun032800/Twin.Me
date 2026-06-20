import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Image,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext } from '../../../src/context/AppContext';
import {
  activate2FA,
  changePassword,
  deactivate2FA,
  setup2FA,
  Setup2FAResult,
} from '../../../src/services/securityService';
import {
  FontSize,
  FontWeight,
  Radius,
  Spacing,
  TabBar,
  ThemeTokens,
} from '../../../src/styles/theme';

// ── Constants ──────────────────────────────────────────────────────────────────

const VIOLET = '#7C3AED';
const NEON_GREEN = '#22C55E';
const HOT_PINK = '#FF3366';

const PWD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+[\]{};':",.<>/?\\|`~]).{8,}$/;

type SetupPhase = 'qr' | 'otp' | 'backup';

// ── OTP Input ──────────────────────────────────────────────────────────────────

interface OTPInputProps {
  value: string;
  onChange: (v: string) => void;
  hasError: boolean;
  autoFocus?: boolean;
}

function OTPInput({ value, onChange, hasError, autoFocus = true }: OTPInputProps) {
  const ref = useRef<TextInput>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const task = InteractionManager.runAfterInteractions(() => {
      ref.current?.focus();
    });
    return () => task.cancel();
  }, [autoFocus]);

  return (
    <Pressable style={s.otpRow} onPress={() => ref.current?.focus()}>
      <TextInput
        ref={ref}
        style={s.hiddenInput}
        value={value}
        onChangeText={(raw) => onChange(raw.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        textContentType="oneTimeCode"
        caretHidden
      />
      {Array.from({ length: 6 }).map((_, i) => (
        <View
          key={i}
          style={[
            s.otpCell,
            !hasError && i === value.length && s.otpCellCursor,
            !hasError && !!value[i] && s.otpCellFilled,
            hasError && s.otpCellError,
          ]}
        >
          <Text style={[s.otpText, hasError && { color: HOT_PINK }]}>{value[i] ?? ''}</Text>
        </View>
      ))}
    </Pressable>
  );
}

// ── Password Field ─────────────────────────────────────────────────────────────

interface PwdFieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  t: ThemeTokens;
}

function PwdField({ label, value, onChangeText, show, onToggleShow, t }: PwdFieldProps) {
  return (
    <View style={s.fieldWrap}>
      <Text style={[s.fieldLabel, { color: t.textSecondary }]}>{label}</Text>
      <View style={[s.inputRow, { backgroundColor: t.inputBg }]}>
        <TextInput
          style={[s.input, { color: t.text }]}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={label}
          placeholderTextColor={t.textMuted}
        />
        <Pressable onPress={onToggleShow} hitSlop={8} style={s.eyeBtn}>
          <Text style={{ fontSize: 16 }}>{show ? '🙈' : '👁️'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function SecurityScreen() {
  const { themeTokens: t } = useAppContext();
  const router = useRouter();

  // Password change
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [conPwd, setConPwd] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showCon, setShowCon] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [isPwdBusy, setIsPwdBusy] = useState(false);

  // 2FA
  const [is2FA, setIs2FA] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [setupPhase, setSetupPhase] = useState<SetupPhase>('qr');
  const [setupData, setSetupData] = useState<Setup2FAResult | null>(null);
  const [otpValue, setOtpValue] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [deactivateCred, setDeactivateCred] = useState('');
  const [deactivateType, setDeactivateType] = useState<'password' | 'otp'>('password');
  const [showDeactPwd, setShowDeactPwd] = useState(false);
  const [is2FABusy, setIs2FABusy] = useState(false);
  const [twoFAError, setTwoFAError] = useState('');
  const [showExitDefense, setShowExitDefense] = useState(false);

  // AppState refs — preserve setup state across background/foreground transitions
  const appStateRef = useRef(AppState.currentState);
  const showSetupRef = useRef(false);
  const setupPhaseRef = useRef<SetupPhase>('qr');

  // Animations
  const shieldPulse = useSharedValue(0);
  const pwdFlash = useSharedValue(0);
  const otpShake = useSharedValue(0);
  const snackY = useSharedValue(100);

  useEffect(() => {
    shieldPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, []);

  // Keep refs in sync for stale-closure-free AppState handler
  useEffect(() => { showSetupRef.current = showSetup; }, [showSetup]);
  useEffect(() => { setupPhaseRef.current = setupPhase; }, [setupPhase]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      // Foreground 복귀 시 setup이 진행 중이었다면 모달·페이즈 상태 복원
      if (prev !== 'active' && nextState === 'active' && showSetupRef.current) {
        setShowSetup(true);
        setSetupPhase(setupPhaseRef.current);
      }
    });
    return () => sub.remove();
  }, []);

  const shieldGlowStyle = useAnimatedStyle(() => ({
    shadowColor: is2FA ? NEON_GREEN : VIOLET,
    shadowOpacity: 0.3 + shieldPulse.value * 0.5,
    shadowRadius: 8 + shieldPulse.value * 20,
    elevation: 8 + Math.round(shieldPulse.value * 8),
  }));

  const pwdFlashStyle = useAnimatedStyle(() => ({
    opacity: pwdFlash.value,
  }));

  const otpShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: otpShake.value }],
  }));

  const snackStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: snackY.value }],
  }));

  function flashPwd() {
    pwdFlash.value = withSequence(
      withTiming(1, { duration: 80 }),
      withTiming(1, { duration: 380 }),
      withTiming(0, { duration: 380 }),
    );
  }

  function shakeOtp() {
    otpShake.value = withSequence(
      withTiming(-9, { duration: 55 }),
      withTiming(9, { duration: 55 }),
      withTiming(-7, { duration: 55 }),
      withTiming(7, { duration: 55 }),
      withTiming(0, { duration: 55 }),
    );
  }

  function showSnack() {
    snackY.value = withSequence(
      withTiming(0, { duration: 300 }),
      withTiming(0, { duration: 2400 }),
      withTiming(100, { duration: 300 }),
    );
  }

  // ── Password handlers ──────────────────────────────────────────────────────

  async function handleChangePwd() {
    Keyboard.dismiss();
    setPwdError('');

    if (!curPwd) {
      setPwdError('현재 비밀번호를 입력해주세요.');
      flashPwd();
      return;
    }
    if (!PWD_REGEX.test(newPwd)) {
      setPwdError('새 비밀번호는 8자 이상, 영문 대소문자·숫자·특수문자를 각각 1개 이상 포함해야 해요.');
      flashPwd();
      return;
    }
    if (newPwd !== conPwd) {
      setPwdError('새 비밀번호가 일치하지 않아요 ⚠️');
      flashPwd();
      return;
    }

    setIsPwdBusy(true);
    try {
      await changePassword(curPwd, newPwd);
      setCurPwd('');
      setNewPwd('');
      setConPwd('');
      setPwdError('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showSnack();
    } catch (err: any) {
      setPwdError(
        err?.statusCode === 401
          ? '현재 비밀번호가 일치하지 않아요 ⚠️'
          : '비밀번호 변경에 실패했어요. 잠시 후 다시 시도해주세요.',
      );
      flashPwd();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsPwdBusy(false);
    }
  }

  // ── 2FA handlers ───────────────────────────────────────────────────────────

  async function handleToggle(enabled: boolean) {
    if (enabled) {
      setIs2FABusy(true);
      try {
        const data = await setup2FA();
        setSetupData(data);
        setSetupPhase('qr');
        setOtpValue('');
        setTwoFAError('');
        setShowSetup(true);
      } catch {
        // stays false
      } finally {
        setIs2FABusy(false);
      }
    } else {
      setDeactivateCred('');
      setDeactivateType('password');
      setTwoFAError('');
      setShowDeactivate(true);
    }
  }

  async function handleVerifyOTP() {
    if (otpValue.length < 6) {
      setTwoFAError('6자리 인증 코드를 모두 입력해주세요.');
      shakeOtp();
      return;
    }
    setIs2FABusy(true);
    setTwoFAError('');
    try {
      const result = await activate2FA(otpValue);
      setBackupCodes(result.backupCodes);
      setSetupPhase('backup');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setTwoFAError(
        err?.statusCode === 403
          ? '인증 코드가 일치하지 않아요 ⚠️'
          : '인증에 실패했어요. 다시 시도해주세요.',
      );
      shakeOtp();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIs2FABusy(false);
    }
  }

  function handleFinishSetup() {
    setIs2FA(true);
    setShowSetup(false);
  }

  async function handleCopyBackupCodes() {
    await Share.share({
      message: `Twin.me 2FA 비상 복구 코드\n\n${backupCodes.join('\n')}\n\n이 코드를 안전한 곳에 보관하세요.`,
    });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function handleDeactivate() {
    if (!deactivateCred || (deactivateType === 'otp' && deactivateCred.length < 6)) {
      setTwoFAError('인증 정보를 정확히 입력해주세요.');
      shakeOtp();
      return;
    }
    setIs2FABusy(true);
    setTwoFAError('');
    try {
      await deactivate2FA(deactivateCred, deactivateType);
      setIs2FA(false);
      setShowDeactivate(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const code = err?.statusCode;
      setTwoFAError(
        code === 401 || code === 403
          ? '인증 코드가 일치하지 않아요 ⚠️'
          : '처리에 실패했어요. 다시 시도해주세요.',
      );
      shakeOtp();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIs2FABusy(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView edges={['top']} style={[s.container, { backgroundColor: t.bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: t.cardBorder }]}>
        <Pressable onPress={() => router.back()} style={s.headerSide} hitSlop={12}>
          <Text style={[s.backChevron, { color: t.text }]}>‹</Text>
        </Pressable>
        <Text style={[s.headerTitle, { color: t.text }]}>비밀번호 및 보안</Text>
        <View style={s.headerSide} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Shield Status Badge */}
          <Animated.View style={[s.shieldWrap, shieldGlowStyle]}>
            <LinearGradient
              colors={
                is2FA
                  ? ['#15803D', '#16A34A', '#22C55E']
                  : ['#4C1D95', '#6D28D9', '#7C3AED']
              }
              style={s.shieldCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={s.shieldEmoji}>🛡️</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.shieldTitle}>{is2FA ? '보안 강화됨' : '기본 보안'}</Text>
                <Text style={s.shieldSub}>
                  {is2FA
                    ? '2단계 인증(TOTP)이 활성화되어 있어요'
                    : '2단계 인증으로 계정을 이중 보호하세요'}
                </Text>
              </View>
              <View style={[s.shieldBadge, { backgroundColor: is2FA ? NEON_GREEN : VIOLET }]}>
                <Text style={s.shieldBadgeText}>{is2FA ? '안전' : '보통'}</Text>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Password Change */}
          <View style={[s.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <Animated.View
              style={[StyleSheet.absoluteFill, s.flashRing, { borderColor: HOT_PINK }, pwdFlashStyle]}
              pointerEvents="none"
            />
            <Text style={[s.cardTitle, { color: t.text }]}>🔑 비밀번호 변경</Text>

            <PwdField
              label="현재 비밀번호"
              value={curPwd}
              onChangeText={(v) => { setCurPwd(v); setPwdError(''); }}
              show={showCur}
              onToggleShow={() => setShowCur((p) => !p)}
              t={t}
            />
            <PwdField
              label="새 비밀번호"
              value={newPwd}
              onChangeText={(v) => { setNewPwd(v); setPwdError(''); }}
              show={showNew}
              onToggleShow={() => setShowNew((p) => !p)}
              t={t}
            />
            <PwdField
              label="새 비밀번호 확인"
              value={conPwd}
              onChangeText={(v) => { setConPwd(v); setPwdError(''); }}
              show={showCon}
              onToggleShow={() => setShowCon((p) => !p)}
              t={t}
            />

            <Text style={[s.hintText, { color: t.textMuted }]}>
              8자 이상 · 영문 대소문자 · 숫자 · 특수문자 각각 1개 이상 포함
            </Text>

            {!!pwdError && <Text style={s.errorText}>{pwdError}</Text>}

            <Pressable
              onPress={handleChangePwd}
              disabled={isPwdBusy}
              style={[s.btnWrap, isPwdBusy && { opacity: 0.6 }]}
            >
              <LinearGradient
                colors={['#7C3AED', '#D946EF', '#FF6B8B']}
                style={s.gradBtn}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={s.gradBtnText}>
                  {isPwdBusy ? '변경 중...' : '비밀번호 변경 완료'}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>

          {/* 2FA Toggle */}
          <View style={[s.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <View style={s.rowBetween}>
              <View style={{ flex: 1, marginRight: Spacing.base }}>
                <Text style={[s.cardTitle, { color: t.text }]}>🛡️ 2단계 인증 (2FA)</Text>
                <Text style={[s.hintText, { color: t.textSecondary, marginTop: 4 }]}>
                  {is2FA
                    ? 'Google Authenticator로 로그인을 보호 중이에요.'
                    : 'OTP 앱을 연동해 계정을 이중으로 보호하세요.'}
                </Text>
              </View>
              <Switch
                value={is2FA}
                onValueChange={handleToggle}
                disabled={is2FABusy}
                trackColor={{ false: '#475569', true: NEON_GREEN }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#475569"
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Success Snackbar */}
      <Animated.View style={[s.snackbar, snackStyle]} pointerEvents="none">
        <LinearGradient
          colors={['#15803D', '#22C55E']}
          style={s.snackGrad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={s.snackText}>새 비밀번호로 바꿨어요 🔒 아무도 모르는 우리만의 자물쇠예요</Text>
        </LinearGradient>
      </Animated.View>

      {/* ── 2FA Setup Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={showSetup}
        transparent
        animationType="slide"
        onRequestClose={() => {}}
      >
        <Pressable style={s.overlay} onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%' }}
          >
            <View style={[s.sheet, { backgroundColor: t.card }]}>
              {/* Handle row — X 버튼 포함 (backup 페이즈는 X 없음) */}
              <View style={s.sheetTopRow}>
                <View style={{ width: 28 }} />
                <View style={[s.sheetHandle, { backgroundColor: t.textMuted }]} />
                <View style={{ width: 28, alignItems: 'flex-end' }}>
                  {setupPhase !== 'backup' && (
                    <Pressable onPress={() => setShowExitDefense(true)} hitSlop={12}>
                      <Text style={[s.sheetCloseX, { color: t.textMuted }]}>✕</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Phase 1: QR + Secret Key */}
              {setupPhase === 'qr' && (
                <>
                  <Text style={[s.sheetTitle, { color: t.text }]}>Google OTP 앱에 등록</Text>
                  <Text style={[s.hintText, { color: t.textSecondary }]}>
                    아래 QR 코드를 스캔하거나 비밀키를 OTP 앱에 수동으로 입력하세요.
                  </Text>

                  {setupData?.qrCodeBase64 ? (
                    <Image
                      source={{ uri: `data:image/png;base64,${setupData.qrCodeBase64}` }}
                      style={s.qrImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[s.qrPlaceholder, { backgroundColor: t.inputBg }]}>
                      <Text style={{ fontSize: 40 }}>📱</Text>
                      <Text style={[s.hintText, { color: t.textMuted, textAlign: 'center' }]}>
                        서버 연동 후 QR 코드가 표시됩니다
                      </Text>
                    </View>
                  )}

                  {/* QR 스캔 후 복귀 안내 — 항상 노출 */}
                  <Text style={[s.qrReturnHint, { color: VIOLET }]}>
                    인증 앱에서 이 QR을 스캔하고 다시 여기로 돌아와 주세요 ↩
                  </Text>

                  <Text style={[s.fieldLabel, { color: t.textSecondary }]}>수동 입력 비밀키</Text>
                  <View style={[s.secretBox, { backgroundColor: t.inputBg }]}>
                    <Text style={[s.secretKey, { color: VIOLET }]} selectable>
                      {setupData?.secretKey ?? '---'}
                    </Text>
                  </View>

                  <Pressable onPress={() => setSetupPhase('otp')} style={s.btnWrap}>
                    <LinearGradient
                      colors={['#7C3AED', '#D946EF']}
                      style={s.gradBtn}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Text style={s.gradBtnText}>앱 등록 완료 → OTP 인증으로</Text>
                    </LinearGradient>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowExitDefense(true)}
                    style={s.textLinkBtn}
                  >
                    <Text style={[s.textLink, { color: t.textMuted }]}>나중에 설정하기</Text>
                  </Pressable>
                </>
              )}

              {/* Phase 2: OTP Verification */}
              {setupPhase === 'otp' && (
                <>
                  <Text style={[s.sheetTitle, { color: t.text }]}>6자리 코드 입력</Text>
                  <Text style={[s.hintText, { color: t.textSecondary }]}>
                    OTP 앱에서 생성된 6자리 숫자를 입력하세요.
                  </Text>

                  <Animated.View style={otpShakeStyle}>
                    <OTPInput
                      value={otpValue}
                      onChange={(v) => { setOtpValue(v); setTwoFAError(''); }}
                      hasError={!!twoFAError}
                    />
                  </Animated.View>

                  {!!twoFAError && <Text style={s.errorText}>{twoFAError}</Text>}

                  <Pressable
                    onPress={handleVerifyOTP}
                    disabled={is2FABusy || otpValue.length < 6}
                    style={[s.btnWrap, (is2FABusy || otpValue.length < 6) && { opacity: 0.5 }]}
                  >
                    <LinearGradient
                      colors={['#7C3AED', '#D946EF']}
                      style={s.gradBtn}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Text style={s.gradBtnText}>
                        {is2FABusy ? '인증 중...' : '인증 확인'}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                  <Pressable onPress={() => setSetupPhase('qr')} style={s.textLinkBtn}>
                    <Text style={[s.textLink, { color: t.textMuted }]}>← QR 코드로 돌아가기</Text>
                  </Pressable>
                </>
              )}

              {/* Phase 3: Backup Codes */}
              {setupPhase === 'backup' && (
                <>
                  <Text style={[s.sheetTitle, { color: t.text }]}>🔑 비상 백업 코드 저장</Text>
                  <Text style={[s.hintText, { color: t.textSecondary }]}>
                    OTP 앱을 분실했을 때 사용하는 1회용 코드예요. 안전한 곳에 반드시 보관하세요.
                  </Text>

                  <View style={[s.backupBox, { backgroundColor: t.inputBg }]}>
                    {backupCodes.map((code, i) => (
                      <Text key={i} style={[s.backupCode, { color: t.text }]}>
                        {i + 1}. {code}
                      </Text>
                    ))}
                  </View>

                  <Pressable onPress={handleCopyBackupCodes} style={s.btnWrap}>
                    <View style={[s.outlineBtn, { borderColor: VIOLET }]}>
                      <Text style={[s.outlineBtnText, { color: VIOLET }]}>
                        📋 코드 복사 / 공유하기
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable onPress={handleFinishSetup} style={s.btnWrap}>
                    <LinearGradient
                      colors={['#15803D', '#22C55E']}
                      style={s.gradBtn}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Text style={s.gradBtnText}>저장 완료 → 2FA 활성화 🔒</Text>
                    </LinearGradient>
                  </Pressable>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ── Exit Defense Modal ────────────────────────────────────────────────── */}
      <Modal visible={showExitDefense} transparent animationType="fade" statusBarTranslucent>
        <View style={s.exitDefenseOverlay}>
          <View style={[s.exitDefenseBox, { backgroundColor: t.card }]}>
            <Text style={[s.exitDefenseTitle, { color: t.text }]}>
              보안 인증 설정을 여기서 중단할까요?
            </Text>
            <Text style={[s.exitDefenseDesc, { color: t.textSecondary }]}>
              지금 나가셔도 언제든 다시 시작할 수 있어요.
            </Text>
            <Pressable
              style={s.exitDefenseContinueWrap}
              onPress={() => setShowExitDefense(false)}
            >
              <LinearGradient
                colors={['#7C3AED', '#D946EF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.exitDefenseContinueGrad}
              >
                <Text style={s.exitDefenseContinueText}>계속 설정할래요</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              style={s.exitDefenseLeaveBtn}
              onPress={() => {
                setShowExitDefense(false);
                setShowSetup(false);
                setSetupPhase('qr');
                setOtpValue('');
                setTwoFAError('');
              }}
            >
              <Text style={[s.exitDefenseLeaveText, { color: t.textMuted }]}>잠시 접어두기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Deactivate 2FA Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={showDeactivate}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDeactivate(false)}
      >
        <Pressable style={s.overlay} onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%' }}
          >
            <View style={[s.sheet, { backgroundColor: t.card }]}>
              <View style={[s.sheetHandle, { backgroundColor: t.textMuted }]} />
              <Text style={[s.sheetTitle, { color: t.text }]}>2단계 인증 비활성화</Text>
              <Text style={[s.hintText, { color: t.textSecondary }]}>
                보안을 위해 현재 비밀번호 또는 OTP 코드로 본인 확인 후 비활성화됩니다.
              </Text>

              {/* Type Selector */}
              <View style={s.typeRow}>
                {(['password', 'otp'] as const).map((type) => (
                  <Pressable
                    key={type}
                    style={[
                      s.typeChip,
                      {
                        borderColor: deactivateType === type ? VIOLET : t.cardBorder,
                        backgroundColor:
                          deactivateType === type ? 'rgba(124,58,237,0.12)' : 'transparent',
                      },
                    ]}
                    onPress={() => {
                      setDeactivateType(type);
                      setDeactivateCred('');
                      setTwoFAError('');
                    }}
                  >
                    <Text
                      style={[
                        s.typeChipText,
                        { color: deactivateType === type ? VIOLET : t.textSecondary },
                      ]}
                    >
                      {type === 'password' ? '비밀번호' : 'OTP 코드'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {deactivateType === 'password' ? (
                <View style={s.fieldWrap}>
                  <View style={[s.inputRow, { backgroundColor: t.inputBg }]}>
                    <TextInput
                      style={[s.input, { color: t.text }]}
                      placeholder="현재 비밀번호"
                      placeholderTextColor={t.textMuted}
                      secureTextEntry={!showDeactPwd}
                      value={deactivateCred}
                      onChangeText={(v) => { setDeactivateCred(v); setTwoFAError(''); }}
                      autoCapitalize="none"
                    />
                    <Pressable
                      onPress={() => setShowDeactPwd((p) => !p)}
                      hitSlop={8}
                      style={s.eyeBtn}
                    >
                      <Text style={{ fontSize: 16 }}>{showDeactPwd ? '🙈' : '👁️'}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Animated.View style={otpShakeStyle}>
                  <OTPInput
                    value={deactivateCred}
                    onChange={(v) => { setDeactivateCred(v); setTwoFAError(''); }}
                    hasError={!!twoFAError}
                  />
                </Animated.View>
              )}

              {!!twoFAError && <Text style={s.errorText}>{twoFAError}</Text>}

              <View style={s.modalBtnRow}>
                <Pressable
                  onPress={() => { setShowDeactivate(false); setTwoFAError(''); }}
                  style={[s.halfBtn, { backgroundColor: t.inputBg }]}
                >
                  <Text style={[s.halfBtnText, { color: t.textSecondary }]}>취소</Text>
                </Pressable>
                <Pressable
                  onPress={handleDeactivate}
                  disabled={is2FABusy}
                  style={[
                    s.halfBtn,
                    { backgroundColor: 'rgba(255,51,102,0.12)' },
                    is2FABusy && { opacity: 0.6 },
                  ]}
                >
                  <Text style={[s.halfBtnText, { color: HOT_PINK }]}>
                    {is2FABusy ? '처리 중...' : '비활성화'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: { width: 44, alignItems: 'flex-start' },
  backChevron: { fontSize: 30, lineHeight: 34, fontWeight: '300' },
  headerTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  scroll: {
    padding: Spacing.base,
    paddingBottom: TabBar.height + 32,
    gap: Spacing.base,
  },

  // Shield
  shieldWrap: {
    borderRadius: Radius.xl,
    shadowOffset: { width: 0, height: 6 },
  },
  shieldCard: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  shieldEmoji: { fontSize: 38 },
  shieldTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  shieldSub: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 3,
  },
  shieldBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  shieldBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },

  // Card
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
    overflow: 'hidden',
  },
  flashRing: {
    borderRadius: Radius.xl,
    borderWidth: 2,
  },
  cardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  // Form
  fieldWrap: { gap: Spacing.xs },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? Spacing.md : Spacing.sm,
  },
  input: { flex: 1, fontSize: FontSize.sm },
  eyeBtn: { padding: 4 },
  hintText: { fontSize: FontSize.xs, lineHeight: 17 },
  errorText: {
    fontSize: FontSize.xs,
    color: HOT_PINK,
    fontWeight: FontWeight.semibold,
  },

  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // Buttons
  btnWrap: { marginTop: Spacing.xs },
  gradBtn: {
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  gradBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  outlineBtn: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  outlineBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  textLinkBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  textLink: { fontSize: FontSize.sm },

  // Snackbar
  snackbar: {
    position: 'absolute',
    bottom: TabBar.height + 16,
    left: Spacing.base,
    right: Spacing.base,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  snackGrad: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    alignItems: 'center',
  },
  snackText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: Spacing.xl,
    paddingBottom: 44,
    gap: Spacing.md,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  sheetTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  // QR & Secret
  qrImage: { width: 200, height: 200, alignSelf: 'center' },
  qrPlaceholder: {
    width: 200,
    height: 200,
    alignSelf: 'center',
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.base,
  },
  secretBox: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  secretKey: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: 3,
  },

  // OTP
  otpRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  otpCell: {
    width: 44,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,41,59,0.45)',
  },
  otpCellCursor: {
    borderColor: VIOLET,
    shadowColor: VIOLET,
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 3,
  },
  otpCellFilled: {
    borderColor: VIOLET,
    backgroundColor: 'rgba(124,58,237,0.12)',
  },
  otpCellError: {
    borderColor: HOT_PINK,
    backgroundColor: 'rgba(255,51,102,0.08)',
  },
  otpText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: '#F1F5F9',
  },

  // Backup codes
  backupBox: {
    borderRadius: Radius.lg,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  backupCode: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    letterSpacing: 1.5,
    fontVariant: ['tabular-nums'],
  },

  // Deactivate
  typeRow: { flexDirection: 'row', gap: Spacing.sm },
  typeChip: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  typeChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  modalBtnRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  halfBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  halfBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  // ── Sheet top row (handle + X) ─────────────────────────────────────────
  sheetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sheetCloseX: {
    fontSize: 17,
    fontWeight: FontWeight.bold,
    lineHeight: 22,
  },

  // ── QR return hint ─────────────────────────────────────────────────────
  qrReturnHint: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    letterSpacing: 0.1,
    opacity: 0.8,
    marginVertical: Spacing.xs,
  },

  // ── Exit defense modal ─────────────────────────────────────────────────
  exitDefenseOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(10,13,26,0.65)',
    padding: Spacing.xl,
  },
  exitDefenseBox: {
    width: '100%',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(124,58,237,0.20)',
  },
  exitDefenseTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
    lineHeight: 24,
  },
  exitDefenseDesc: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  exitDefenseContinueWrap: {
    width: '100%',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginTop: Spacing.sm,
  },
  exitDefenseContinueGrad: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  exitDefenseContinueText: {
    color: '#FFFFFF',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  exitDefenseLeaveBtn: {
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  exitDefenseLeaveText: {
    fontSize: FontSize.base,
  },
});
