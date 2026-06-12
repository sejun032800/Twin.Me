import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext } from '../../../src/context/AppContext';
import { FontSize, FontWeight, Radius, Spacing, TabBar } from '../../../src/styles/theme';

export default function SecurityScreen() {
  const { themeTokens: t } = useAppContext();
  const router = useRouter();

  return (
    <SafeAreaView edges={['top']} style={[s.container, { backgroundColor: t.bg }]}>
      <View style={[s.header, { borderBottomColor: t.cardBorder }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Text style={[s.backText, { color: t.text }]}>‹</Text>
        </Pressable>
        <Text style={[s.title, { color: t.text }]}>비밀번호 및 보안</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <View style={[s.placeholderCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
          <Text style={s.emoji}>🔐</Text>
          <Text style={[s.placeholderTitle, { color: t.text }]}>보안 설정</Text>
          <Text style={[s.placeholderDesc, { color: t.textSecondary }]}>
            비밀번호 변경, 2단계 인증 설정, 최근 로그인 활동을 관리하는 화면입니다.
          </Text>
          <View style={[s.comingSoon, { borderColor: 'rgba(217,70,239,0.4)', backgroundColor: 'rgba(217,70,239,0.08)' }]}>
            <Text style={[s.comingSoonText, { color: '#D946EF' }]}>Coming Soon</Text>
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
