// Step #46 — Data & Permissions Screen
// Replaces the "Coming Soon" placeholder with:
//   1. Personal-data archive download (POST /api/v1/user/data/export, 24h guard)
//   2. Camera / Location / Notifications permission switches backed by real OS APIs
//   3. AppState listener — re-syncs switch states when the user returns from
//      the system settings app after changing a permission externally

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { useAppContext } from '../../../src/context/AppContext';
import { FontSize, FontWeight, Radius, Spacing, TabBar } from '../../../src/styles/theme';
import {
  getAllPermissions,
  openSystemSettings,
  PermissionState,
  PermissionStatus,
  requestCamera,
  requestDataArchive,
  requestLocation,
} from '../../../src/services/permissionManager';

// ─── Design tokens (Step #46 neon palette) ───────────────────────────────────
const VIOLET_ACTIVE = '#BC84EE';
const VIOLET_GLOW = 'rgba(188,132,238,0.15)';
const GRADIENT_COLORS: [string, string, string] = ['#7C3AED', '#D946EF', '#FF6B8B'];

// ─── Permission row descriptor ────────────────────────────────────────────────

type PermKey = keyof PermissionState;

interface PermItem {
  key: PermKey;
  icon: string;
  label: string;
  guide: string;
  // false for notifications: expo-notifications is not installed, so the
  // OS dialog cannot be triggered in-app. The toggle always opens settings.
  canRequest: boolean;
}

const PERM_ITEMS: PermItem[] = [
  {
    key: 'camera',
    icon: '📷',
    label: '카메라',
    guide: '채팅방 즉석 사진 촬영 및 추억 아카이브 업로드를 위해 필요합니다.',
    canRequest: true,
  },
  {
    key: 'location',
    icon: '📍',
    label: '위치 (정밀)',
    guide: '연인과의 실시간 거리 확인 및 AI 데이트 코스 추천을 위해 필수적입니다.',
    canRequest: true,
  },
  {
    key: 'notifications',
    icon: '🔔',
    label: '푸시 알림',
    guide: '채팅방 내 즉각적인 피드백 알림 및 AI 코칭 리포트를 전송합니다.',
    canRequest: false,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function DataPermissionsScreen() {
  const { themeTokens: t } = useAppContext();
  const router = useRouter();

  const [permissions, setPermissions] = useState<PermissionState>({
    camera: 'undetermined',
    location: 'undetermined',
    notifications: 'undetermined',
  });
  const [loadingPerms, setLoadingPerms] = useState(true);
  const [pendingKey, setPendingKey] = useState<PermKey | null>(null);

  // Data archive: isProcessing = in-flight; isDone = completed this session (24h guard)
  const [archiveProcessing, setArchiveProcessing] = useState(false);
  const [archiveDone, setArchiveDone] = useState(false);

  // "Go to Settings" modal
  const [settingsModal, setSettingsModal] = useState<PermKey | null>(null);

  const appStateRef = useRef(AppState.currentState);

  // ── Permission refresh ─────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const state = await getAllPermissions();
      setPermissions(state);
    } finally {
      setLoadingPerms(false);
    }
  }, []);

  // Initial load + AppState listener: re-query when returning from settings app
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appStateRef.current !== 'active' && next === 'active') {
        refresh();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [refresh]);

  // ── Toggle handler ─────────────────────────────────────────────────────────
  const handleToggle = useCallback(
    async (item: PermItem, value: boolean) => {
      if (pendingKey) return;

      const current = permissions[item.key];

      // Turning OFF: cannot revoke programmatically — must use settings
      if (!value) {
        setSettingsModal(item.key);
        return;
      }

      // Already granted — nothing to do
      if (current === 'granted') return;

      // Denied or notifications (no in-app dialog available) → settings
      if (current === 'denied' || !item.canRequest) {
        setSettingsModal(item.key);
        return;
      }

      // undetermined + canRequest → trigger OS permission dialog
      setPendingKey(item.key);
      try {
        let result: PermissionStatus = 'undetermined';
        if (item.key === 'camera') result = await requestCamera();
        if (item.key === 'location') result = await requestLocation();
        setPermissions((prev) => ({ ...prev, [item.key]: result }));
        // If the user tapped Deny in the OS dialog, offer the settings shortcut
        if (result === 'denied') setSettingsModal(item.key);
      } catch {
        // ignore transient errors
      } finally {
        setPendingKey(null);
      }
    },
    [pendingKey, permissions],
  );

  // ── Data archive ───────────────────────────────────────────────────────────
  const handleArchive = useCallback(async () => {
    if (archiveProcessing || archiveDone) return;
    setArchiveProcessing(true);
    try {
      await requestDataArchive();
      setArchiveDone(true);
      Alert.alert(
        '📬 데이터 백업 요청 완료',
        '데이터 백업 파일 준비가 시작되었어요. 완료되면 연동된 이메일로 다운로드 링크를 보내드릴게요.',
        [{ text: '확인' }],
      );
    } catch (err: any) {
      Alert.alert('요청 실패', err?.message ?? '잠시 후 다시 시도해 주세요.');
    } finally {
      setArchiveProcessing(false);
    }
  }, [archiveProcessing, archiveDone]);

  // ── Derived style helpers ──────────────────────────────────────────────────
  const inactiveTrack = t.isLight ? '#D1D5DB' : '#374151';

  return (
    <SafeAreaView edges={['top']} style={[s.root, { backgroundColor: t.bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: t.cardBorder }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Text style={[s.backText, { color: t.text }]}>‹</Text>
        </Pressable>
        <Text style={[s.headerTitle, { color: t.text }]}>내 정보 및 권한</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: TabBar.height + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 데이터 주권 ──────────────────────────────────── */}
        <Card t={t}>
          <Row>
            <Text style={s.cardIcon}>🗄️</Text>
            <Text style={[s.cardTitle, { color: t.text }]}>데이터 주권</Text>
          </Row>

          <Text style={[s.cardDesc, { color: t.textSecondary }]}>
            Twin.me에 보관된 내 모든 데이터의 사본을 요청할 수 있어요. 준비가 완료되면 연동된
            이메일로 안전한 다운로드 링크를 보내드릴게요.
          </Text>

          <Pressable
            onPress={handleArchive}
            disabled={archiveProcessing || archiveDone}
            style={({ pressed }) => [s.dlBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={archiveDone ? ['#374151', '#4B5563'] : GRADIENT_COLORS}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={s.dlGradient}
            >
              {archiveProcessing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.dlBtnText}>
                  {archiveDone
                    ? '✅  요청 완료 · 이메일을 확인해 주세요'
                    : '📦  내 데이터 전체 다운로드'}
                </Text>
              )}
            </LinearGradient>
          </Pressable>

          {archiveDone && (
            <Text style={[s.archiveHint, { color: t.textMuted }]}>
              요청은 24시간에 한 번만 가능합니다.
            </Text>
          )}
        </Card>

        {/* ── 앱 권한 관리 ─────────────────────────────────── */}
        <Card t={t}>
          <Row>
            <Text style={s.cardIcon}>🔐</Text>
            <Text style={[s.cardTitle, { color: t.text }]}>앱 권한 관리</Text>
          </Row>

          <Text style={[s.cardDesc, { color: t.textSecondary }]}>
            각 기능에 필요한 권한을 선택적으로 허용할 수 있어요. 스위치를 끄려면 기기 설정에서 변경해
            주세요.
          </Text>

          {loadingPerms ? (
            <View style={s.loadingRow}>
              <ActivityIndicator color={VIOLET_ACTIVE} size="small" />
              <Text style={[s.loadingText, { color: t.textSecondary }]}>권한 상태 확인 중…</Text>
            </View>
          ) : (
            PERM_ITEMS.map((item, idx) => {
              const status = permissions[item.key];
              const granted = status === 'granted';
              const denied = status === 'denied';
              const spinning = pendingKey === item.key;

              return (
                <View key={item.key}>
                  {idx > 0 && (
                    <View style={[s.sep, { backgroundColor: t.cardBorder }]} />
                  )}
                  <View style={s.permRow}>
                    {/* Icon bubble */}
                    <View
                      style={[
                        s.permIconWrap,
                        {
                          backgroundColor: granted
                            ? VIOLET_GLOW
                            : t.isLight
                            ? '#F3F4F6'
                            : '#1F2937',
                        },
                      ]}
                    >
                      <Text style={s.permIcon}>{item.icon}</Text>
                    </View>

                    {/* Label + guide text */}
                    <View style={s.permBody}>
                      <Text style={[s.permLabel, { color: t.text }]}>{item.label}</Text>
                      <Text style={[s.permGuide, { color: t.textSecondary }]}>{item.guide}</Text>

                      {/* Status badge */}
                      {status !== 'undetermined' && (
                        <View
                          style={[
                            s.badge,
                            {
                              backgroundColor: granted
                                ? VIOLET_GLOW
                                : 'rgba(239,68,68,0.10)',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              s.badgeText,
                              { color: granted ? VIOLET_ACTIVE : '#EF4444' },
                            ]}
                          >
                            {granted ? '허용됨' : '거부됨'}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Switch / spinner */}
                    {spinning ? (
                      <ActivityIndicator size="small" color={VIOLET_ACTIVE} style={s.spinner} />
                    ) : (
                      <Switch
                        value={granted}
                        onValueChange={(v) => handleToggle(item, v)}
                        trackColor={{ false: inactiveTrack, true: VIOLET_ACTIVE }}
                        thumbColor={granted ? '#fff' : t.isLight ? '#9CA3AF' : '#6B7280'}
                        ios_backgroundColor={inactiveTrack}
                      />
                    )}
                  </View>
                </View>
              );
            })
          )}
        </Card>
      </ScrollView>

      {/* ── "설정 열기" Modal ─────────────────────────────── */}
      <Modal
        visible={settingsModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsModal(null)}
      >
        <View style={s.overlay}>
          <View
            style={[
              s.modalCard,
              {
                backgroundColor: t.card,
                shadowColor: '#7C3AED',
              },
            ]}
          >
            <Text style={s.modalEmoji}>🛠️</Text>
            <Text style={[s.modalTitle, { color: t.text }]}>
              설정에서 권한을 켜야 기능을 이용할 수 있어요
            </Text>
            <Text style={[s.modalDesc, { color: t.textSecondary }]}>
              {settingsModal === 'camera' &&
                '카메라 권한이 없으면 채팅 사진 촬영 기능을 사용할 수 없어요. 기기 설정에서 허용해 주세요.'}
              {settingsModal === 'location' &&
                '위치 권한이 없으면 연인과의 실시간 거리 확인 기능이 차단돼요. 기기 설정에서 허용해 주세요.'}
              {settingsModal === 'notifications' &&
                '알림 권한이 없으면 채팅 알림 및 AI 코칭 리포트를 받을 수 없어요. 기기 설정에서 허용해 주세요.'}
            </Text>
            <View style={s.modalBtns}>
              <Pressable
                style={[s.cancelBtn, { borderColor: t.cardBorder }]}
                onPress={() => setSettingsModal(null)}
              >
                <Text style={[s.cancelText, { color: t.textSecondary }]}>취소</Text>
              </Pressable>
              <Pressable
                style={s.settingsBtn}
                onPress={async () => {
                  setSettingsModal(null);
                  await openSystemSettings();
                }}
              >
                <LinearGradient
                  colors={GRADIENT_COLORS}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={s.settingsBtnGradient}
                >
                  <Text style={s.settingsBtnText}>설정 열기</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Card({ t, children }: { t: any; children: React.ReactNode }) {
  return (
    <View style={[s.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={s.row}>{children}</View>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  // Header
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

  // Scroll
  content: {
    padding: Spacing.base,
    gap: Spacing.md,
  },

  // Card
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.base,
    gap: Spacing.md,
  },

  // Row helper
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },

  // Card header
  cardIcon: { fontSize: 20 },
  cardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  cardDesc: { fontSize: FontSize.sm, lineHeight: 20 },

  // Download button
  dlBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  dlGradient: {
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: Spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dlBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.2,
  },
  archiveHint: { fontSize: FontSize.xs, textAlign: 'center' },

  // Permissions loading
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  loadingText: { fontSize: FontSize.sm },

  // Permission row
  sep: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.sm },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    gap: Spacing.md,
  },
  permIconWrap: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  permIcon: { fontSize: 20 },
  permBody: { flex: 1, gap: 4 },
  permLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, lineHeight: 20 },
  permGuide: { fontSize: FontSize.xs, lineHeight: 16 },

  // Status badge
  badge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  badgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  spinner: { marginRight: 4 },

  // Modal overlay
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 16,
  },
  modalEmoji: { fontSize: 40 },
  modalTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
    lineHeight: 24,
  },
  modalDesc: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  modalBtns: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
    marginTop: Spacing.xs,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  settingsBtn: { flex: 1.4, borderRadius: Radius.lg, overflow: 'hidden' },
  settingsBtnGradient: { paddingVertical: 14, alignItems: 'center' },
  settingsBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});
