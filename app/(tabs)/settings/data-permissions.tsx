import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext } from '../../../src/context/AppContext';
import { FontSize, FontWeight, Radius, Spacing, TabBar } from '../../../src/styles/theme';

export default function DataPermissionsScreen() {
  const { themeTokens: t } = useAppContext();
  const router = useRouter();

  return (
    <SafeAreaView edges={['top']} style={[s.container, { backgroundColor: t.bg }]}>
      <View style={[s.header, { borderBottomColor: t.cardBorder }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Text style={[s.backText, { color: t.text }]}>‹</Text>
        </Pressable>
        <Text style={[s.title, { color: t.text }]}>내 정보 및 권한</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <View style={[s.placeholderCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
          <Text style={s.emoji}>🗄️</Text>
          <Text style={[s.placeholderTitle, { color: t.text }]}>데이터 및 권한 관리</Text>
          <Text style={[s.placeholderDesc, { color: t.textSecondary }]}>
            내 데이터 다운로드, 검색 기록 삭제, 앱 접근 권한(카메라·위치·알림 등)을 관리하는 화면입니다.
          </Text>
          <View style={[s.comingSoon, { borderColor: 'rgba(56,189,248,0.4)', backgroundColor: 'rgba(56,189,248,0.08)' }]}>
            <Text style={[s.comingSoonText, { color: '#38BDF8' }]}>Coming Soon</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

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
  backBtn: { width: 44, alignItems: 'flex-start' },
  backText: { fontSize: 30, lineHeight: 34, fontWeight: '300' },
  title: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  content: {
    padding: Spacing.base,
    paddingBottom: TabBar.height + 32,
    alignItems: 'center',
    gap: Spacing.lg,
    marginTop: Spacing.xl,
  },
  placeholderCard: {
    width: '100%',
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  emoji: { fontSize: 48 },
  placeholderTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, textAlign: 'center' },
  placeholderDesc: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  comingSoon: {
    marginTop: Spacing.sm,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  comingSoonText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, letterSpacing: 0.5 },
});
