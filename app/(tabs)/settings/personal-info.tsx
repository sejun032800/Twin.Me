import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppContext } from '../../../src/context/AppContext';
import { updateUserProfile } from '../../../src/services/profileService';
import { FontSize, FontWeight, Radius, Spacing, TabBar } from '../../../src/styles/theme';

const NAME_MAX = 12;
const STATUS_MAX = 50;

export default function PersonalInfoScreen() {
  const { themeTokens: t, myProfile, setMyProfile } = useAppContext();
  const router = useRouter();

  const [name, setName] = useState(myProfile.name);
  const [statusMessage, setStatusMessage] = useState(myProfile.statusMessage ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const snackbarOpacity = useRef(new Animated.Value(0)).current;
  const snackbarY = useRef(new Animated.Value(16)).current;

  const showSnackbar = useCallback(() => {
    snackbarOpacity.setValue(0);
    snackbarY.setValue(16);
    Animated.parallel([
      Animated.spring(snackbarY, { toValue: 0, useNativeDriver: true, bounciness: 8 }),
      Animated.timing(snackbarOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.timing(snackbarOpacity, { toValue: 0, duration: 280, useNativeDriver: true }).start();
      }, 1800);
    });
  }, [snackbarOpacity, snackbarY]);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedStatus = statusMessage.trim();

    if (!trimmedName) {
      Alert.alert('트윈이가 뭐라 불러야 할지 모르겠어요 🥺', '이름을 입력해 주시면 트윈이가 더 친근하게 대화할 수 있어요!');
      return;
    }
    if (trimmedName.length > NAME_MAX) {
      Alert.alert('이름이 조금 길어요 ✂️', '12자 이내로 줄여주세요. 닉네임도 좋아요!');
      return;
    }
    if (trimmedStatus.length > STATUS_MAX) {
      Alert.alert('상태 메시지가 너무 길어요', `상태 메시지는 최대 ${STATUS_MAX}자까지 입력 가능합니다.`);
      return;
    }

    setIsSaving(true);
    let succeeded = false;
    try {
      await updateUserProfile({ name: trimmedName, statusMessage: trimmedStatus });
      setMyProfile({ ...myProfile, name: trimmedName, statusMessage: trimmedStatus });
      succeeded = true;
    } catch {
      Alert.alert(
        '저장 실패',
        '프로필을 변경하지 못했습니다. 네트워크 연결을 확인해 주세요 🌐',
        [{ text: '확인', style: 'default' }],
      );
    } finally {
      if (!succeeded) setIsSaving(false);
    }

    if (succeeded) {
      showSnackbar();
      setTimeout(() => router.back(), 1600);
    }
  }, [name, statusMessage, myProfile, setMyProfile, router, showSnackbar]);

  const nameOverflow = name.trim().length > NAME_MAX;
  const statusOverflow = statusMessage.length > STATUS_MAX;

  return (
    <SafeAreaView edges={['top']} style={[s.container, { backgroundColor: t.bg }]}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[s.header, { borderBottomColor: t.cardBorder }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Text style={[s.backText, { color: t.text }]}>‹</Text>
        </Pressable>
        <Text style={[s.headerTitle, { color: t.text }]}>개인 정보</Text>
        <Pressable onPress={handleSave} disabled={isSaving} hitSlop={8} style={s.headerSaveBtn}>
          {isSaving
            ? <ActivityIndicator size="small" color="#7C3AED" />
            : <Text style={s.headerSaveText}>저장</Text>}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: TabBar.height + 48 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── 섹션 타이틀 ──────────────────────────────────────────────── */}
          <Text style={[s.sectionTitle, { color: t.textSecondary }]}>기본 정보</Text>

          {/* ── 이름 ─────────────────────────────────────────────────────── */}
          <View style={[s.fieldCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <View style={s.fieldLabelRow}>
              <Text style={[s.fieldLabel, { color: t.textSecondary }]}>이름</Text>
              <Text style={[s.counter, { color: nameOverflow ? '#EF4444' : t.textSecondary }]}>
                {name.length} / {NAME_MAX}
              </Text>
            </View>
            <TextInput
              style={[
                s.input,
                {
                  color: t.text,
                  borderColor: nameOverflow ? '#EF4444' : t.cardBorder,
                  backgroundColor: t.bg,
                },
              ]}
              value={name}
              onChangeText={setName}
              placeholder="이름을 입력하세요"
              placeholderTextColor={t.textSecondary}
              returnKeyType="next"
              autoComplete="name"
              editable={!isSaving}
            />
            {nameOverflow && (
              <Text style={s.errorHint}>이름은 최대 {NAME_MAX}자까지 입력 가능합니다.</Text>
            )}
          </View>

          {/* ── 상태 메시지 ─────────────────────────────────────────────── */}
          <View style={[s.fieldCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <View style={s.fieldLabelRow}>
              <Text style={[s.fieldLabel, { color: t.textSecondary }]}>상태 메시지</Text>
              <Text style={[s.counter, { color: statusOverflow ? '#EF4444' : t.textSecondary }]}>
                {statusMessage.length} / {STATUS_MAX}
              </Text>
            </View>
            <TextInput
              style={[
                s.input,
                s.inputMultiline,
                {
                  color: t.text,
                  borderColor: statusOverflow ? '#EF4444' : t.cardBorder,
                  backgroundColor: t.bg,
                },
              ]}
              value={statusMessage}
              onChangeText={setStatusMessage}
              placeholder="나를 한 줄로 표현해보세요 ✨"
              placeholderTextColor={t.textSecondary}
              multiline
              numberOfLines={2}
              returnKeyType="done"
              textAlignVertical="top"
              editable={!isSaving}
            />
            {statusOverflow && (
              <Text style={s.errorHint}>상태 메시지는 최대 {STATUS_MAX}자까지 입력 가능합니다.</Text>
            )}
          </View>

          {/* ── 저장 버튼 ────────────────────────────────────────────────── */}
          <Pressable
            style={({ pressed }) => [s.saveBtn, { opacity: pressed || isSaving ? 0.72 : 1 }]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.saveBtnText}>저장하기</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── 성공 스낵바 (neon violet glow) ─────────────────────────────── */}
      <Animated.View
        style={[s.snackbar, { opacity: snackbarOpacity, transform: [{ translateY: snackbarY }] }]}
        pointerEvents="none"
      >
        <Text style={s.snackbarText}>개인 정보가 안전하게 변경되었어요 ✨</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },

  // ── Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 44, alignItems: 'flex-start' },
  backText: { fontSize: 30, lineHeight: 34, fontWeight: '300' },
  headerTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  headerSaveBtn: { width: 44, alignItems: 'flex-end', justifyContent: 'center', minHeight: 36 },
  headerSaveText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: '#7C3AED' },

  // ── Scroll content
  scroll: {
    padding: Spacing.base,
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },

  // ── Field card
  fieldCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  counter: { fontSize: FontSize.xs },
  errorHint: { fontSize: FontSize.xs, color: '#EF4444', marginTop: -2 },

  // ── Inputs
  input: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontSize: FontSize.base,
  },
  inputMultiline: {
    minHeight: 72,
    paddingTop: Spacing.md,
  },

  // ── Save button (neon violet)
  saveBtn: {
    borderRadius: Radius.pill,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    marginTop: Spacing.xl,
    backgroundColor: '#7C3AED',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 7,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },

  // ── Snackbar (neon violet glow)
  snackbar: {
    position: 'absolute',
    bottom: 48,
    left: Spacing.base,
    right: Spacing.base,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    backgroundColor: 'rgba(124,58,237,0.93)',
    borderWidth: 1,
    borderColor: 'rgba(217,70,239,0.5)',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 22,
    elevation: 14,
  },
  snackbarText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
});
