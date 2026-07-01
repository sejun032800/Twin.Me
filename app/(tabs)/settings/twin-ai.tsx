// ─── 마이 트윈 AI 관리 센터 (FUN-HOM-001 Override) ──────────────────────────
// 제네시스 인터뷰 결과 요약 + "Why My Aura" 해설 페이지 + 재인터뷰(Re-genesis) 진입점.

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ClayTwinAvatar from '../../../src/components/home/ClayTwinAvatar';
import InterviewCallModal from '../../../src/components/home/InterviewCallModal';
import { useAppContext } from '../../../src/context/AppContext';
import { auraChannelToCss, AURA_AXIS_DIRECTIONS, toScoreBand } from '../../../src/engine/auraEngine';
import { getAuraStory } from '../../../src/data/auraStoryPool';
import { AURA_AXES, ENNEAGRAM_TYPE_NAME } from '../../../src/types/genesis';
import { FontSize, FontWeight, Radius, Spacing, TabBar } from '../../../src/styles/theme';

export default function TwinAiScreen() {
  const { themeTokens: t, personaMatrix, canRequestRegenesis, requestRegenesis } = useAppContext();
  const router = useRouter();
  const [showInterview, setShowInterview] = useState(false);
  const [showRegenesisConfirm, setShowRegenesisConfirm] = useState(false);

  const hasPersona = !!personaMatrix?.enneagramType && !!personaMatrix.auraVector;

  const handleStartInterview = () => setShowInterview(true);

  const handleRegenesisRequest = () => setShowRegenesisConfirm(true);

  const handleRegenesisProceed = () => {
    setShowRegenesisConfirm(false);
    requestRegenesis();
    setShowInterview(true);
  };

  return (
    <SafeAreaView edges={['top']} style={[s.root, { backgroundColor: t.bg }]}>
      <View style={[s.header, { borderBottomColor: t.cardBorder }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Text style={[s.backText, { color: t.text }]}>‹</Text>
        </Pressable>
        <Text style={[s.headerTitle, { color: t.text }]}>마이 트윈 AI 관리 센터</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: TabBar.height + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 상단: 트윈 요약 카드 ── */}
        <View style={[s.card, { backgroundColor: t.card, borderColor: t.cardBorder, alignItems: 'center' }]}>
          <ClayTwinAvatar
            stage={personaMatrix?.clayStage ?? 0}
            auraVector={personaMatrix?.auraVector}
            size={96}
          />
          <Text style={[s.summaryName, { color: t.text }]}>
            {hasPersona && personaMatrix?.enneagramType
              ? `${ENNEAGRAM_TYPE_NAME[personaMatrix.enneagramType]} 유형의 트윈`
              : '아직 태어나지 않은 트윈'}
          </Text>
          <Text style={[s.summaryDesc, { color: t.textSecondary }]}>
            {hasPersona
              ? `AI 정확도 95% · 확신도 ${Math.round((personaMatrix?.bayesian.confidence ?? 0) * 100)}%`
              : '제네시스 인터뷰를 완료하면 트윈이 진짜 나를 닮아가요.'}
          </Text>

          {!hasPersona && (
            <Pressable style={s.primaryBtn} onPress={handleStartInterview}>
              <LinearGradient
                colors={['#7C3AED', '#D946EF', '#FF6B8B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.primaryBtnInner}
              >
                <Text style={s.primaryBtnText}>🎙️ 제네시스 인터뷰 시작하기</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>

        {/* ── Why My Aura ── */}
        {hasPersona && personaMatrix?.auraVector && (
          <View style={[s.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <Text style={[s.sectionTitle, { color: t.text }]}>✨ Why My Aura</Text>
            <Text style={[s.sectionDesc, { color: t.textSecondary }]}>
              인터뷰에서 드러난 6가지 성향이 만든 나만의 오라예요.
            </Text>

            {AURA_AXES.map((axis) => {
              const score = personaMatrix.auraVector!.axisScores[axis];
              const band = toScoreBand(score);
              const story = getAuraStory(axis, band);
              const color = auraChannelToCss(personaMatrix.auraVector!.channels[axis]);
              const direction = band === 'low' ? AURA_AXIS_DIRECTIONS[axis].a
                : band === 'high' ? AURA_AXIS_DIRECTIONS[axis].b
                : `${AURA_AXIS_DIRECTIONS[axis].a} ↔ ${AURA_AXIS_DIRECTIONS[axis].b}`;

              return (
                <View key={axis} style={[s.auraRow, { borderColor: t.cardBorder }]}>
                  <View style={[s.auraDot, { backgroundColor: color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.auraTitle, { color: t.text }]}>{story.title}</Text>
                    <Text style={[s.auraDirection, { color: t.textMuted }]}>{direction}</Text>
                    <Text style={[s.auraLetter, { color: t.textSecondary }]}>{story.letter}</Text>
                    <Text style={[s.auraCue, { color: t.textMuted }]}>💭 {story.contextCue}</Text>
                  </View>
                </View>
              );
            })}

            {/* 종합 내레이션 — dominant 축(가장 또렷한 색) 짚어주기 + 닫는 말 */}
            {(() => {
              const dominant = [...AURA_AXES].sort(
                (a, b) => Math.abs(personaMatrix.auraVector!.axisScores[b]) - Math.abs(personaMatrix.auraVector!.axisScores[a]),
              )[0];
              const dominantStory = getAuraStory(dominant, toScoreBand(personaMatrix.auraVector!.axisScores[dominant]));
              return (
                <View style={[s.auraSummary, { borderColor: t.cardBorder }]}>
                  <Text style={[s.auraSummaryTitle, { color: t.text }]}>
                    너를 가장 잘 설명하는 색, "{dominantStory.title}"
                  </Text>
                  <Text style={[s.auraSummaryText, { color: t.textSecondary }]}>
                    이 색은 지금의 너야. 시간이 지나 네가 변하면, 나도 다시 너를 그릴게. 🪞
                  </Text>
                </View>
              );
            })()}
          </View>
        )}

        {/* ── 재인터뷰 ── */}
        {hasPersona && (
          <View style={[s.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <Text style={[s.sectionTitle, { color: t.text }]}>🔄 재인터뷰 (Re-genesis)</Text>
            <Text style={[s.sectionDesc, { color: t.textSecondary }]}>
              성향 데이터만 다시 빚어요. 학습된 말투는 그대로 유지돼요.
            </Text>
            <Pressable style={[s.secondaryBtn, { borderColor: t.cardBorder }]} onPress={handleRegenesisRequest}>
              <Text style={[s.secondaryBtnText, { color: t.text }]}>다시 인터뷰하기</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <InterviewCallModal
        visible={showInterview}
        onCompleted={() => {}}
        onClose={() => setShowInterview(false)}
      />

      {/* ── 재인터뷰 쿨다운 가드 모달 ── */}
      <Modal transparent animationType="fade" visible={showRegenesisConfirm}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: t.card }]}>
            <Text style={s.modalEmoji}>🫧</Text>
            <Text style={[s.modalTitle, { color: t.text }]}>
              {canRequestRegenesis ? '정말 다시 빚어볼까?' : '우리 만든 지 얼마 안 됐는데...'}
            </Text>
            <Text style={[s.modalDesc, { color: t.textSecondary }]}>
              {canRequestRegenesis
                ? '성향 데이터가 무채색 점토 상태로 초기화돼. 말투는 그대로 남아있어.'
                : '정말 다시 빚을까? 너를 다시 알아가는 거 좋아하긴 하는데, 너무 자주 바뀌면 나도 좀 헷갈려 🥲'}
            </Text>
            <View style={s.modalBtnRow}>
              <Pressable style={[s.modalBtn, s.modalBtnGhost, { borderColor: t.cardBorder }]} onPress={() => setShowRegenesisConfirm(false)}>
                <Text style={[s.modalBtnGhostText, { color: t.text }]}>조금 더 있다가</Text>
              </Pressable>
              <Pressable style={[s.modalBtn, s.modalBtnPrimary]} onPress={handleRegenesisProceed}>
                <Text style={s.modalBtnPrimaryText}>그래도 다시 빚을래</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 44, alignItems: 'flex-start' },
  backText: { fontSize: 28, fontWeight: '300' },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  content: { padding: Spacing.base, gap: Spacing.md },
  card: {
    borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.md, gap: Spacing.sm,
  },
  summaryName: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, marginTop: Spacing.sm },
  summaryDesc: { fontSize: FontSize.xs, textAlign: 'center' },
  primaryBtn: { marginTop: Spacing.sm, borderRadius: Radius.pill, overflow: 'hidden', width: '100%' },
  primaryBtnInner: { paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  sectionDesc: { fontSize: FontSize.xs, marginBottom: Spacing.xs },
  auraRow: {
    flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  auraDot: { width: 14, height: 14, borderRadius: 7, marginTop: 4 },
  auraTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  auraDirection: { fontSize: FontSize.xs, marginTop: 1, marginBottom: 4 },
  auraLetter: { fontSize: FontSize.xs, lineHeight: 18 },
  auraCue: { fontSize: FontSize.xs, marginTop: 4, fontStyle: 'italic' },
  auraSummary: { marginTop: Spacing.sm, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  auraSummaryTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  auraSummaryText: { fontSize: FontSize.xs, lineHeight: 18 },
  secondaryBtn: {
    marginTop: Spacing.xs, borderRadius: Radius.pill, borderWidth: 1, paddingVertical: 12, alignItems: 'center',
  },
  secondaryBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(10,13,26,0.75)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  modalCard: { width: '100%', borderRadius: Radius.xl, padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm },
  modalEmoji: { fontSize: 40 },
  modalTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, textAlign: 'center' },
  modalDesc: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  modalBtnRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, width: '100%' },
  modalBtn: { flex: 1, borderRadius: Radius.pill, paddingVertical: 12, alignItems: 'center' },
  modalBtnGhost: { borderWidth: 1 },
  modalBtnGhostText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  modalBtnPrimary: { backgroundColor: '#7C3AED' },
  modalBtnPrimaryText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
});
