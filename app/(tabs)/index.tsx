/**
 * 홈 탭: 연애 대시보드
 *
 * 컴포넌트 배치 순서 (탑다운):
 *  1. AccuracyBanner  — hasCompletedInterview === false 시에만 렌더 (accuracyBannerVisible로 관리)
 *  2. MemoryRingSection
 *  3. MoodTemperatureSection
 *  4. MetricsGrid (채팅 지수 & 감정 싱크로율)
 *  5. AICoachingCard
 *  6. SloganFooter
 */
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AccuracyBanner from '../../src/components/home/AccuracyBanner';
import AICoachingCard from '../../src/components/home/AICoachingCard';
import MemoryRingSection from '../../src/components/home/MemoryRingSection';
import MetricsGrid from '../../src/components/home/MetricsGrid';
import MoodTemperatureSection from '../../src/components/home/MoodTemperatureSection';
import SloganFooter from '../../src/components/home/SloganFooter';
import { useAppContext } from '../../src/context/AppContext';
import { Spacing, TabBar } from '../../src/styles/theme';

export default function HomeScreen() {
  const {
    // accuracyBannerVisible === !hasCompletedInterview
    // dismissAccuracyBanner === setHasCompletedInterview(true)
    accuracyBannerVisible,
    dismissAccuracyBanner,
    myProfile,
    partnerProfile,
    themeTokens,
  } = useAppContext();

  const t = themeTokens;

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: t.bg }]}>

      {/* ── 1순위: 정확도 배너 (hasCompletedInterview === false 시에만 노출) ── */}
      {accuracyBannerVisible && (
        <AccuracyBanner
          myName={myProfile.name}
          onDismiss={dismissAccuracyBanner}
          t={t}
        />
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 2순위: 추억 링 섹션 ── */}
        <MemoryRingSection t={t} />

        {/* ── 3순위: 오늘의 분위기 & 우리 관계의 온도 ── */}
        <MoodTemperatureSection partnerName={partnerProfile.name} t={t} />

        {/* ── 4순위: 채팅 지수 & 감정 싱크로율 (2컬럼 그리드) ── */}
        <MetricsGrid t={t} />

        {/* ── 5순위: AI 코칭 한마디 ── */}
        <AICoachingCard partnerName={partnerProfile.name} t={t} />

        {/* ── 6순위: 브랜드 슬로건 푸터 ── */}
        <SloganFooter t={t} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.lg,
    paddingBottom: TabBar.height + 32,
    gap: Spacing.xl,
  },
});
