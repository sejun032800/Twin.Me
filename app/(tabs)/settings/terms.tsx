import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext } from '../../../src/context/AppContext';
import { FontSize, FontWeight, Radius, Spacing, TabBar } from '../../../src/styles/theme';

const SECTIONS = [
  {
    title: '제1조 (목적)',
    body: '본 약관은 Twin.me(이하 "서비스")가 제공하는 AI 연애 보조 서비스의 이용조건 및 절차, 회사와 이용자 간의 권리와 의무를 규정함을 목적으로 합니다.',
  },
  {
    title: '제2조 (서비스의 내용)',
    body: 'Twin.me는 사용자의 대화 데이터를 학습하여 커플 간 AI 보조 소통 서비스, 데이트 코스 추천, 감정 분석 및 위기 감지 기능을 제공합니다.',
  },
  {
    title: '제3조 (이용자의 의무)',
    body: '이용자는 타인의 개인정보를 무단으로 수집·이용하거나, 서비스를 불법적인 용도로 사용해서는 안 됩니다. 위반 시 서비스 이용이 제한될 수 있습니다.',
  },
  {
    title: '제4조 (서비스 이용 제한)',
    body: '회사는 이용자가 본 약관을 위반하거나 서비스의 정상적인 운영을 방해하는 경우 사전 통보 없이 서비스 이용을 제한하거나 계정을 해지할 수 있습니다.',
  },
  {
    title: '제5조 (면책조항)',
    body: 'AI가 생성한 콘텐츠는 참고용이며, 실제 연애 상담을 대체하지 않습니다. 서비스 이용으로 인한 연애 관계의 변화에 대해 회사는 책임을 지지 않습니다.',
  },
  {
    title: '제6조 (약관의 변경)',
    body: '회사는 필요한 경우 본 약관을 변경할 수 있으며, 변경 시 앱 내 공지 또는 이메일을 통해 7일 전 사전 고지합니다.',
  },
];

export default function TermsScreen() {
  const { themeTokens: t } = useAppContext();
  const router = useRouter();

  return (
    <SafeAreaView edges={['top']} style={[s.container, { backgroundColor: t.bg }]}>
      <View style={[s.header, { borderBottomColor: t.cardBorder }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Text style={[s.backText, { color: t.text }]}>‹</Text>
        </Pressable>
        <Text style={[s.title, { color: t.text }]}>서비스 이용약관</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={[s.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
          <Text style={[s.lastUpdated, { color: t.textMuted }]}>시행일: 2026년 1월 1일 · 최종 개정: 2026년 6월 12일</Text>
          <Text style={[s.intro, { color: t.textSecondary }]}>
            Twin.me 서비스를 이용하기 전에 본 약관을 주의 깊게 읽어주세요. 서비스 이용은 본 약관에 동의하는 것으로 간주됩니다.
          </Text>
        </View>

        {SECTIONS.map((sec) => (
          <View key={sec.title} style={[s.section, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <Text style={[s.sectionTitle, { color: t.text }]}>{sec.title}</Text>
            <Text style={[s.sectionBody, { color: t.textSecondary }]}>{sec.body}</Text>
          </View>
        ))}
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
    gap: Spacing.md,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  lastUpdated: { fontSize: FontSize.xs },
  intro: { fontSize: FontSize.sm, lineHeight: 20 },
  section: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    lineHeight: 20,
  },
  sectionBody: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
});
