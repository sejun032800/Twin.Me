import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext } from '../../../src/context/AppContext';
import { FontSize, FontWeight, Radius, Spacing, TabBar } from '../../../src/styles/theme';

const SECTIONS = [
  {
    title: '1. 수집하는 개인정보 항목',
    body: 'Twin.me는 서비스 제공을 위해 이름, 이메일 주소, 생년월일, 대화 데이터(말투 학습용) 및 선택적으로 위치 정보를 수집합니다.',
  },
  {
    title: '2. 개인정보의 수집 및 이용목적',
    body: '수집된 정보는 AI 말투 학습, 데이트 코스 추천, 서비스 개선 및 개인화된 경험 제공에만 사용됩니다. 제3자에게 판매하거나 마케팅 목적으로 사용하지 않습니다.',
  },
  {
    title: '3. 개인정보의 보유 및 이용기간',
    body: '회원 탈퇴 또는 데이터 삭제 요청 시 즉시 파기합니다. 단, 관련 법령에 따라 일정 기간 보관이 필요한 정보는 해당 기간 동안 안전하게 보관됩니다.',
  },
  {
    title: '4. 개인정보의 제3자 제공',
    body: 'Twin.me는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 법령에 의한 경우 또는 이용자가 사전에 동의한 경우에만 제공됩니다.',
  },
  {
    title: '5. 이용자의 권리',
    body: '이용자는 언제든지 자신의 개인정보를 조회, 수정, 삭제 또는 처리 정지를 요청할 수 있습니다. 계정 센터 > 내 정보 및 권한에서 직접 관리할 수 있습니다.',
  },
];

export default function PrivacyPolicyScreen() {
  const { themeTokens: t } = useAppContext();
  const router = useRouter();

  return (
    <SafeAreaView edges={['top']} style={[s.container, { backgroundColor: t.bg }]}>
      <View style={[s.header, { borderBottomColor: t.cardBorder }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Text style={[s.backText, { color: t.text }]}>‹</Text>
        </Pressable>
        <Text style={[s.title, { color: t.text }]}>개인정보 처리방침</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={[s.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
          <Text style={[s.lastUpdated, { color: t.textMuted }]}>최종 업데이트: 2026년 6월 12일</Text>
          <Text style={[s.intro, { color: t.textSecondary }]}>
            Twin.me(이하 "회사")는 이용자의 개인정보를 소중히 여기며, 개인정보 보호법 등 관련 법령을 준수합니다.
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
