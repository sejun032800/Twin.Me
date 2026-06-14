// HelpCenter.tsx — Step #42: 인앱 내장형 도움말 센터 + 1:1 CS 티켓 엔진
// 설계 원칙:
//   - 오프라인 완전 동작 (FAQ 로컬 임베딩)
//   - LayoutAnimation + Reanimated 분리로 60fps 아코디언
//   - expo-web-browser 폴백: remoteUrl 존재 시 인앱 브라우저 모달로 안전 오픈
//   - CS 티켓: appVersion·deviceId·세션메타 자동 패킹 → POST /api/v1/support/ticket

import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../../context/AppContext';
import { submitSupportTicket } from '../../services/supportService';
import {
  FontSize,
  FontWeight,
  Radius,
  Spacing,
  ThemeTokens,
} from '../../styles/theme';

// LayoutAnimation을 Android에서 활성화
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { height: SCREEN_H } = Dimensions.get('window');

const VIOLET = '#7C3AED';
const BG_DEEP = '#0D0D0D';

// ── FAQ 데이터 스펙 ────────────────────────────────────────────────────────────

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  remoteUrl?: string;
}

interface FAQCategory {
  id: string;
  icon: string;
  title: string;
  items: FAQItem[];
}

const FAQ_CATEGORIES: FAQCategory[] = [
  {
    id: 'account',
    icon: '👤',
    title: '계정 및 커플 연결',
    items: [
      {
        id: 'acc-1',
        question: '초대 코드를 잃어버렸어요. 어떻게 하나요?',
        answer:
          '설정 탭 → 계정 센터 → 개인 정보에서 새 초대 코드를 재발급받을 수 있어요. 기존 코드는 자동으로 만료되며, 새 코드로 파트너를 다시 초대해 주세요.',
      },
      {
        id: 'acc-2',
        question: '파트너를 변경하거나 연결을 해제할 수 있나요?',
        answer:
          '계정 센터 → 보안 설정에서 커플 연결 해제 기능을 찾을 수 있어요. 연결 해제 시 공유 메모리는 90일간 보존 후 영구 삭제됩니다.',
      },
      {
        id: 'acc-3',
        question: '두 기기에서 동시에 로그인할 수 있나요?',
        answer:
          '하나의 계정당 하나의 기기 로그인만 지원해요. 새 기기에서 로그인하면 기존 세션은 자동 종료됩니다.',
      },
    ],
  },
  {
    id: 'ai',
    icon: '🤖',
    title: 'AI 학습 및 말투',
    items: [
      {
        id: 'ai-1',
        question: 'AI가 내 말투를 제대로 따라 하지 않아요.',
        answer:
          '카카오톡 대화 파일을 다시 업로드하거나, 홈 탭에서 10분 인터뷰를 완료하면 AI 정확도가 95%까지 향상돼요. 설정 탭 → 프라이버시가 완전복제 모드인지 확인해 주세요.',
      },
      {
        id: 'ai-2',
        question: '카카오톡 파일은 어떻게 업로드하나요?',
        answer:
          '카카오톡 → 대화방 메뉴(⋯) → 대화 내용 내보내기 → .txt 파일 저장 후, Twin.me 홈 탭 → [카카오톡 연동] 버튼으로 업로드하세요.',
      },
      {
        id: 'ai-3',
        question: '파트너 대화도 AI가 학습하나요?',
        answer:
          '아니요. 파싱 단계에서 파트너 대화는 기기 내에서 즉시 삭제됩니다. 오직 내 말투 패턴만 추출되며, 원본 파일은 서버에 전송되지 않아요.',
      },
    ],
  },
  {
    id: 'payment',
    icon: '💳',
    title: '인앱 결제 및 구독',
    items: [
      {
        id: 'pay-1',
        question: '구독 후 기능이 활성화되지 않아요.',
        answer:
          '앱을 완전히 종료 후 재시작해 주세요. 그래도 해결되지 않으면 앱스토어/플레이스토어에서 구매 복원을 눌러 주세요. 48시간 이내 해결되지 않으면 아래 1:1 문의를 이용해 주세요.',
      },
      {
        id: 'pay-2',
        question: '구독을 해지하고 싶어요.',
        answer:
          'iOS: 설정 → Apple ID → 구독 → Twin.me → 구독 취소\nAndroid: 플레이스토어 → 구독 → Twin.me → 취소\n현재 결제 주기 만료일까지는 서비스가 유지됩니다.',
      },
      {
        id: 'pay-3',
        question: '환불이 가능한가요?',
        answer:
          '결제일로부터 7일 이내, 서비스 이용 이력이 없으면 환불 신청이 가능해요. 아래 1:1 문의로 주문 번호와 함께 요청해 주세요.',
      },
    ],
  },
  {
    id: 'privacy',
    icon: '🛡️',
    title: '프라이버시 및 기억 삭제',
    items: [
      {
        id: 'priv-1',
        question: '프라이버시 단계별 차이점이 뭔가요?',
        answer:
          '💖 완전복제: 실시간 말투 학습 활성\n🎭 최적화: 말투 학습 중단, 데이트 컨텍스트만 수집\n🤫 보호: 모든 실시간 수집 차단, 온보딩 데이터만 사용',
      },
      {
        id: 'priv-2',
        question: '삭제한 기억은 복구할 수 있나요?',
        answer:
          '기억 삭제는 벡터 DB에서 해당 임베딩을 영구 파기합니다. 복구가 불가능하므로 신중하게 선택해 주세요.',
      },
      {
        id: 'priv-3',
        question: '내 데이터가 제3자에게 공유되나요?',
        answer:
          '절대 공유되지 않습니다. 개인 식별 정보는 기기 내에서 마스킹 처리되며, 비식별화된 패턴 데이터만 AI 추론에 활용됩니다.',
      },
    ],
  },
  {
    id: 'error',
    icon: '🔧',
    title: '오류 및 기술 지원',
    items: [
      {
        id: 'err-1',
        question: '앱이 자주 튕겨요.',
        answer:
          '앱을 최신 버전으로 업데이트 후 기기를 재시작해 주세요. 해결되지 않으면 아래 1:1 문의를 이용해 주세요.',
      },
      {
        id: 'err-2',
        question: '지도가 표시되지 않아요.',
        answer:
          '기기 설정 → Twin.me → 위치 권한을 "앱 사용 중 허용"으로 변경해 주세요. 인터넷 연결도 확인해 주세요.',
      },
      {
        id: 'err-3',
        question: '푸시 알림이 오지 않아요.',
        answer:
          '기기 설정 → 알림 → Twin.me → 알림 허용을 켜주세요. 주간 리포트 알림은 매주 일요일 밤 10시에 발송됩니다.',
      },
    ],
  },
];

// ── 아코디언 아이템 ────────────────────────────────────────────────────────────

function AccordionItem({
  item,
  isExpanded,
  onToggle,
}: {
  item: FAQItem;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  // Reanimated로 화살표 회전만 부드럽게 처리 (높이는 LayoutAnimation)
  const rotation = useSharedValue(isExpanded ? 90 : 0);

  useEffect(() => {
    rotation.value = withTiming(isExpanded ? 90 : 0, { duration: 220 });
  }, [isExpanded]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const handlePress = () => {
    LayoutAnimation.configureNext({
      duration: 240,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle();
  };

  const handleRemotePress = async (url: string) => {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    });
  };

  return (
    <View
      style={[
        accS.item,
        isExpanded && {
          borderColor: VIOLET + '55',
          shadowColor: VIOLET,
          shadowRadius: 10,
          shadowOpacity: 0.28,
          shadowOffset: { width: 0, height: 0 },
          elevation: 6,
        },
      ]}
    >
      <Pressable
        style={({ pressed }) => [accS.questionRow, pressed && { opacity: 0.75 }]}
        onPress={handlePress}
      >
        <Text style={accS.questionText}>{item.question}</Text>
        <Animated.Text style={[accS.chevron, chevronStyle]}>›</Animated.Text>
      </Pressable>

      {isExpanded && (
        <View style={accS.answerBox}>
          <LinearGradient
            colors={['rgba(124,58,237,0.10)', 'rgba(124,58,237,0.02)']}
            style={StyleSheet.absoluteFill}
          />
          <Text style={accS.answerText}>{item.answer}</Text>
          {item.remoteUrl ? (
            <Pressable
              style={accS.remoteLink}
              onPress={() => item.remoteUrl && handleRemotePress(item.remoteUrl)}
            >
              <Text style={accS.remoteLinkText}>자세히 보기 ↗</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const accS = StyleSheet.create({
  item: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    gap: Spacing.sm,
  },
  questionText: {
    flex: 1,
    color: '#CBD5E1',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    lineHeight: 20,
  },
  chevron: {
    color: '#475569',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: FontWeight.regular,
  },
  answerBox: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 14,
    gap: 8,
    overflow: 'hidden',
  },
  answerText: {
    color: '#64748B',
    fontSize: FontSize.sm,
    lineHeight: 22,
  },
  remoteLink: { alignSelf: 'flex-start' },
  remoteLinkText: {
    color: VIOLET,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
});

// ── CS 티켓 폼 ────────────────────────────────────────────────────────────────

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

function CSTicketForm({
  userName,
  subscriptionPlanId,
}: {
  userName?: string;
  subscriptionPlanId?: string;
}) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');

  const appVersion = Constants.expoConfig?.version ?? '2.4.0';
  const deviceId = `${Platform.OS}-${Constants.sessionId ?? 'unknown'}`;
  const canSubmit =
    subject.trim().length > 0 && message.trim().length > 3 && submitState === 'idle';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitState('loading');
    try {
      await submitSupportTicket({
        appVersion,
        deviceId,
        sessionMeta: { userId: userName, subscriptionPlanId },
        subject: subject.trim(),
        message: message.trim(),
        timestamp: new Date().toISOString(),
      });
      setSubmitState('success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setSubmitState('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => setSubmitState('idle'), 4500);
    }
  };

  if (submitState === 'success') {
    return (
      <View style={csS.successBox}>
        <LinearGradient
          colors={['rgba(124,58,237,0.15)', 'rgba(217,70,239,0.06)']}
          style={StyleSheet.absoluteFill}
        />
        <Text style={csS.successEmoji}>✅</Text>
        <Text style={csS.successTitle}>문의가 접수되었어요!</Text>
        <Text style={csS.successSub}>
          담당자 검토 후 가입하신 이메일로{'\n'}2~3 영업일 내에 답변 드릴게요 💌
        </Text>
      </View>
    );
  }

  return (
    <View style={csS.form}>
      <TextInput
        style={csS.input}
        placeholder="문의 제목을 입력해 주세요"
        placeholderTextColor="#334155"
        value={subject}
        onChangeText={setSubject}
        editable={submitState !== 'loading'}
        maxLength={80}
        returnKeyType="next"
      />
      <TextInput
        style={[csS.input, csS.textarea]}
        placeholder={
          '문의 내용을 자세히 작성해 주세요.\n(앱 버전, 발생 상황 등을 포함하면 더 빠르게 해결됩니다)'
        }
        placeholderTextColor="#334155"
        value={message}
        onChangeText={setMessage}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        editable={submitState !== 'loading'}
        maxLength={1000}
      />

      {/* 자동 패킹된 메타데이터 미리보기 */}
      <View style={csS.metaBadge}>
        <Text style={csS.metaText}>
          📱 {Platform.OS === 'ios' ? 'iOS' : 'Android'} · v{appVersion}
        </Text>
        {userName ? <Text style={csS.metaText}>· {userName}</Text> : null}
        {subscriptionPlanId ? (
          <Text style={csS.metaText}>· {subscriptionPlanId}</Text>
        ) : null}
      </View>

      {submitState === 'error' ? (
        <Text style={csS.errorText}>
          ⚠️ 문의 전송에 실패했어요. 잠시 후 다시 시도해 주세요.
        </Text>
      ) : null}

      <Pressable
        style={[csS.submitBtn, !canSubmit && csS.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
      >
        {submitState === 'loading' ? (
          <View style={csS.loadingRow}>
            <ActivityIndicator size="small" color="#FFF" />
            <Text style={csS.submitText}>접수 중...</Text>
          </View>
        ) : (
          <LinearGradient
            colors={['#7C3AED', '#D946EF']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={csS.submitGrad}
          >
            <Text style={csS.submitText}>✉️ 트윈이 고객센터에 1:1 문의하기</Text>
          </LinearGradient>
        )}
      </Pressable>
    </View>
  );
}

const csS = StyleSheet.create({
  form: { gap: 10, width: '100%' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#E2E8F0',
    fontSize: FontSize.sm,
  },
  textarea: { minHeight: 100, paddingTop: 12 },
  metaBadge: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: 'rgba(124,58,237,0.08)',
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.2)',
  },
  metaText: {
    color: '#7C3AED',
    fontSize: 11,
    fontWeight: FontWeight.medium,
  },
  errorText: {
    color: '#EF4444',
    fontSize: FontSize.xs,
    textAlign: 'center',
  },
  submitBtn: { borderRadius: Radius.md, overflow: 'hidden', width: '100%' },
  submitBtnDisabled: { opacity: 0.38 },
  submitGrad: { paddingVertical: 15, alignItems: 'center' },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: VIOLET,
    paddingVertical: 15,
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  submitText: {
    color: '#FFF',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.2,
  },
  successBox: {
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.3)',
    width: '100%',
  },
  successEmoji: { fontSize: 36 },
  successTitle: {
    color: '#E2E8F0',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  successSub: {
    color: '#475569',
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});

// ── 메인 HelpCenter 모달 ──────────────────────────────────────────────────────

export function HelpCenter({
  visible,
  onClose,
  t: _t,
}: {
  visible: boolean;
  onClose: () => void;
  t: ThemeTokens;
}) {
  const { myProfile, subscriptionStatus } = useAppContext();
  const insets = useSafeAreaInsets();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showTicketForm, setShowTicketForm] = useState(false);

  // 슬라이드 업 애니메이션
  const slideY = useSharedValue(SCREEN_H);

  useEffect(() => {
    if (visible) {
      slideY.value = withSpring(0, { damping: 22, stiffness: 240, mass: 0.9 });
    } else {
      slideY.value = withTiming(SCREEN_H, {
        duration: 280,
        easing: Easing.in(Easing.quad),
      });
      // 닫힐 때 내부 상태 초기화 (애니메이션 후)
      setTimeout(() => {
        setExpandedId(null);
        setShowTicketForm(false);
      }, 300);
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value }],
  }));

  const toggleFAQ = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleToggleTicket = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowTicketForm((prev) => !prev);
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      {/* 딤 백드롭 */}
      <Pressable style={hcS.backdrop} onPress={handleClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={hcS.kavWrapper}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            hcS.sheet,
            sheetStyle,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          {/* 네온 바이올렛 상단 라인 */}
          <LinearGradient
            colors={['#7C3AED', '#D946EF', '#FF6B8B']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={hcS.topLine}
          />

          {/* 헤더 */}
          <View style={hcS.header}>
            <View style={{ gap: 3 }}>
              <Text style={hcS.title}>도움말 센터</Text>
              <Text style={hcS.subtitle}>자주 묻는 질문 · FAQ</Text>
            </View>
            <Pressable
              style={({ pressed }) => [hcS.closeBtn, pressed && { opacity: 0.65 }]}
              onPress={handleClose}
              hitSlop={8}
            >
              <Text style={hcS.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* FAQ 스크롤 영역 */}
          <ScrollView
            style={hcS.scroll}
            contentContainerStyle={hcS.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces
          >
            {/* 카테고리별 FAQ 아코디언 */}
            {FAQ_CATEGORIES.map((cat) => (
              <View key={cat.id} style={hcS.categorySection}>
                <View style={hcS.catHeader}>
                  <View style={hcS.catIconWrap}>
                    <Text style={hcS.catIcon}>{cat.icon}</Text>
                  </View>
                  <Text style={hcS.catTitle}>{cat.title}</Text>
                </View>
                <View style={hcS.faqList}>
                  {cat.items.map((item) => (
                    <AccordionItem
                      key={item.id}
                      item={item}
                      isExpanded={expandedId === item.id}
                      onToggle={() => toggleFAQ(item.id)}
                    />
                  ))}
                </View>
              </View>
            ))}

            {/* 1:1 CS 허브 */}
            <View style={hcS.csHub}>
              <LinearGradient
                colors={['rgba(124,58,237,0.13)', 'rgba(124,58,237,0.03)']}
                style={StyleSheet.absoluteFill}
              />
              <Text style={hcS.csHubEmoji}>✉️</Text>
              <Text style={hcS.csHubTitle}>원하는 답변을 찾지 못하셨나요?</Text>
              <Text style={hcS.csHubSub}>
                트윈이 고객센터에 직접 문의하시면{'\n'}2~3 영업일 내에 답변 드려요.
              </Text>

              <Pressable
                style={({ pressed }) => [hcS.csToggleBtn, pressed && { opacity: 0.82 }]}
                onPress={handleToggleTicket}
              >
                <LinearGradient
                  colors={
                    showTicketForm
                      ? (['#1E293B', '#1E293B'] as const)
                      : (['#7C3AED', '#D946EF'] as const)
                  }
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={hcS.csToggleBtnGrad}
                >
                  <Text style={hcS.csToggleBtnText}>
                    {showTicketForm ? '문의 폼 접기 ↑' : '트윈이 고객센터에 1:1 문의하기 →'}
                  </Text>
                </LinearGradient>
              </Pressable>

              {showTicketForm && (
                <CSTicketForm
                  userName={myProfile?.name}
                  subscriptionPlanId={
                    subscriptionStatus.isPremium ? (subscriptionStatus.planId ?? undefined) : undefined
                  }
                />
              )}
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────

const hcS = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  kavWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
    pointerEvents: 'box-none',
  },
  sheet: {
    backgroundColor: BG_DEEP,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_H * 0.92,
    overflow: 'hidden',
    // 바이올렛 외부 글로우
    shadowColor: VIOLET,
    shadowRadius: 24,
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  topLine: {
    height: 3,
    width: '100%',
    opacity: 0.9,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    color: '#F1F5F9',
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  subtitle: {
    color: '#334155',
    fontSize: FontSize.xs,
    marginTop: 3,
    letterSpacing: 0.2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: FontWeight.bold,
    lineHeight: 16,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: Spacing.base,
    gap: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  categorySection: { gap: 8 },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  catIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(124,58,237,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catIcon: { fontSize: 14 },
  catTitle: {
    color: '#94A3B8',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  faqList: { gap: 5 },
  csHub: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.22)',
    padding: Spacing.base,
    alignItems: 'center',
    gap: Spacing.sm,
    overflow: 'hidden',
  },
  csHubEmoji: { fontSize: 30 },
  csHubTitle: {
    color: '#CBD5E1',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  csHubSub: {
    color: '#475569',
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  csToggleBtn: {
    width: '100%',
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginTop: 4,
  },
  csToggleBtnGrad: { paddingVertical: 14, alignItems: 'center' },
  csToggleBtnText: {
    color: '#FFF',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.2,
  },
});
