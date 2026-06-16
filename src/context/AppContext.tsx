import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { DARK_THEME, LIGHT_THEME, ThemeMode, ThemeTokens } from '../styles/theme';
import {
  ChatStyleProfile,
  DEFAULT_CHAT_STYLE_PROFILE,
} from '../lib/kakaoParser';
import {
  FALLBACK_MOOD_TAGS,
  PartnerAiMoodTag,
} from '../services/partnerMoodService';
import {
  PartnerSensitiveConfig,
  DEFAULT_PARTNER_SENSITIVE_CONFIG,
} from '../services/partnerSensitiveService';
import type { WeeklyReportData } from '../services/weeklyReportService';
import { seedReviewStore } from '../services/partnerReviewService';
import {
  type SubscriptionStatus,
  DEFAULT_SUBSCRIPTION_STATUS,
} from '../services/iapService';
import type { KakaoSyncRecord } from '../services/kakaoUploadService';
import type { HighlightCard } from '../services/kakaoHighlightService';
import { loadHighlightCards } from '../services/kakaoHighlightService';
import {
  type MicroEventCode,
  type OverflowStatus,
  computeDailyDelta,
  applyScoreDelta,
  computeMasterBase,
} from '../utils/scoreCalculator';

export type { PartnerAiMoodTag };
export type { PartnerSensitiveConfig };
export type { WeeklyReportData };
export type { SubscriptionStatus };

export type { ChatStyleProfile };
export type { KakaoSyncRecord };
export type { HighlightCard };
export type { MicroEventCode, OverflowStatus };

// ── Privacy Level ─────────────────────────────────────────────────────────────
// 3 = 완전복제(Full Clone, default) · 2 = 최적화(Optimized) · 1 = 보호(Protected)
export type PrivacyLevel = 1 | 2 | 3;

// ── Couple Info ───────────────────────────────────────────────────────────────
// startedAt: ISO date string (YYYY-MM-DD) set during onboarding partner-match step.
// null means not yet configured → stats bar shows "D+?" placeholder.
export interface CoupleInfo {
  startedAt: string | null;
}

// PII masking pipeline: runs in Lv3 before any text is stored
export function maskPII(text: string): string {
  return text
    // Korean mobile / landline phone numbers
    .replace(/\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '***')
    // Bank account numbers (e.g. 110-123456-78-901)
    .replace(/\d{3,6}[-\s]\d{6,10}[-\s]\d{2,3}(?:[-\s]\d{1,3})?/g, '***')
    // Korean resident registration number (YYMMDD-NNNNNNN)
    .replace(/\d{6}[-\s]\d{7}/g, '***')
    // Card numbers (16-digit groups)
    .replace(/\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/g, '***')
    // Bare long numeric strings (8+ digits — potential IDs / accounts)
    .replace(/\b\d{8,}\b/g, '***');
}

export interface DateCourse {
  id: string;
  title: string;
  date: string;           // YYYY-MM-DD
  latitude: number;
  longitude: number;
  myRating: number;       // 1–5 (0 = pending visit)
  myReview: string;
  partnerRating: number;  // 1–5 (0 = partner hasn't reviewed yet)
  partnerReview: string;
  // Kakao place ID — set when the course is created via the Kakao place search.
  // Used by usePartnerPlaceReview to correlate partner reviews with places.
  kakaoPlaceId?: string;
  // Memory ring metadata
  imageUrl?: string;
  myOotd?: string;
  partnerOotd?: string;
  isRead?: boolean;
}

export interface RecommendedPlace {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  reason: string;
  estimatedTime: string;
  category: string;
}

export interface UserProfile {
  name: string;
  gender: 'M' | 'F' | 'other' | '';
  mbti: string;
  enneagram: string;
  avatarUrl?: string;
  statusMessage?: string;
}

export interface PartnerProfile {
  name: string;
  gender: 'M' | 'F' | '';
  mbti: string;
}

// Result produced by the loading screen's parsing engine
export interface TrainingResult {
  drips: string[];       // top-3 signature expression tokens
  tags: string[];        // derived persona tags (e.g. '#공감형')
  myLineCount: number;   // total own-utterance lines parsed
  maskedCount: number;   // PII items masked
}

// Weekly emotion analysis scores (0-100) feeding the temperature engine
export interface WeeklyMetrics {
  currentScore: number;       // my this week's aggregated sentiment (0–100)
  prevScore: number;          // my last week's score for delta computation
  partnerScore: number;       // partner's current week sentiment (0–100)
  weeklyMessageCount: number; // total messages sent this week (density proxy)
  avgReplyTimeMin: number;    // average reply turnaround in minutes
}

interface AppContextValue {
  accuracyBannerVisible: boolean;
  dismissAccuracyBanner: () => void;
  myProfile: UserProfile;
  partnerProfile: PartnerProfile;
  setMyProfile: (p: UserProfile) => void;
  setPartnerProfile: (p: PartnerProfile) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  themeTokens: ThemeTokens;
  // Onboarding pipeline data
  inviteCode: string;
  setInviteCode: (code: string) => void;
  // Couple_ID — set after successful partner code match, used for data isolation
  coupleId: string | null;
  setCoupleId: (id: string | null) => void;
  trainingResult: TrainingResult | null;
  setTrainingResult: (result: TrainingResult) => void;
  // Raw KakaoTalk file text — set by ingestion screen, consumed by loading screen
  rawKakaoText: string | null;
  setRawKakaoText: (text: string | null) => void;
  // Chat rhythm profile — derived from KakaoTalk analysis, updated via rolling avg
  chatStyleProfile: ChatStyleProfile;
  setChatStyleProfile: (p: ChatStyleProfile) => void;
  // Privacy control (FUN-SET-001)
  privacyLevel: PrivacyLevel;
  setPrivacyLevel: (level: PrivacyLevel) => void;
  // Date course archive
  dateCourses: DateCourse[];
  addDateCourse: (course: DateCourse) => void;
  removeDateCourse: (id: string) => void;
  bulkAddDateCourses: (courses: DateCourse[]) => void;
  markCourseAsRead: (id: string) => void;
  // Cross-tab trigger: home [+추가] → history AddCourseSheet
  triggerAddCourse: boolean;
  setTriggerAddCourse: (v: boolean) => void;
  // 10-min AI interview completion — drives +20% accuracy weight
  hasCompletedInterview: boolean;
  setHasCompletedInterview: (v: boolean) => void;
  // Weekly emotion metrics — drives temperature engine on home tab
  weeklyMetrics: WeeklyMetrics;
  setWeeklyMetrics: (m: WeeklyMetrics) => void;
  // Partner AI real-time mood tags (A2A sync, P2 pipeline)
  partnerAiMood: PartnerAiMoodTag[];
  setPartnerAiMood: (tags: PartnerAiMoodTag[]) => void;
  // Early Dating Mode — prompt modifier + chat UI state (Step #16)
  isEarlyDatingMode: boolean;
  setIsEarlyDatingMode: (v: boolean) => void;
  // Room-level Early Dating Mode — per-room independent toggle (Step #19)
  // Key is RoomType ('ai' | 'analyst'), value is whether the room-specific toggle is on.
  // Survives ChatRoomView unmount since it lives in AppContext.
  roomEarlyModeMap: Record<string, boolean>;
  setRoomEarlyMode: (roomId: string, value: boolean) => void;
  // Partner sensitive keyword config — synced from server by useChatStream (Step #20)
  partnerSensitiveConfig: PartnerSensitiveConfig;
  setPartnerSensitiveConfig: (config: PartnerSensitiveConfig) => void;
  // Weekly report data — computed by weeklyReportService, scheduled by useReportScheduler (Step #22)
  weeklyReportData: WeeklyReportData | null;
  setWeeklyReportData: (data: WeeklyReportData | null) => void;
  // Couple metadata — drives D-Day counter in history stats bar (Step #25)
  coupleInfo: CoupleInfo;
  setCoupleInfo: (info: Partial<CoupleInfo>) => void;
  // Accumulated chat-media upload count — drives photo counter in history stats bar (Step #25)
  // Incremented by chat.tsx whenever a user successfully sends an image/video bubble.
  uploadedMediaCount: number;
  addUploadedMedia: (delta?: number) => void;
  // IAP subscription status — updated on successful receipt verification (Step #39)
  subscriptionStatus: SubscriptionStatus;
  setSubscriptionStatus: (status: SubscriptionStatus) => void;
  // KakaoTalk incremental sync — AI-selected touching moments (Step #50)
  memorySentences: KakaoSyncRecord[];
  addMemorySentences: (records: KakaoSyncRecord[]) => void;
  lastKakaoSyncTimestamp: string | null;
  setLastKakaoSyncTimestamp: (ts: string | null) => void;
  // 4-emotion AI highlight cards archive (Step #53)
  highlightCards: HighlightCard[];
  setHighlightCards: (cards: HighlightCard[]) => void;
  addHighlightCards: (cards: HighlightCard[]) => void;
  // ── DNA 일치율 엔진 (Step DNA-Core) ─────────────────────────────────────────
  // S_Base: 성격 상성 기반 정규분포 초기 점수
  baseScore: number;
  setBaseScore: (score: number) => void;
  // Bonus_Interview: 10분 음성 인터뷰 가산점 (0.0 ~ 5.0)
  interviewBonus: number;
  setInterviewBonus: (bonus: number) => void;
  // S_Current: 실시간 가·감산 반영 최종 현재 일치율
  currentScore: number;
  setCurrentScore: (score: number) => void;
  // 클램프 필터 오버플로우 상태
  overflowStatus: OverflowStatus;
  setOverflowStatus: (status: OverflowStatus) => void;
  // 24개 마이크로 이벤트 일괄 적용 (clamp + overflow 자동 처리)
  applyDailyEvents: (events: MicroEventCode[]) => void;
  // Cross-tab: 홈 탭 CRITICAL_LOSS 배너 → 채팅 탭 FUN-CHA-003 강제 트리거
  triggerMirrorMode: boolean;
  setTriggerMirrorMode: (v: boolean) => void;
  // FUN-HIS-005: AI 뮤즈에서 선택한 전역 OOTD/무드 — 무드 피드 필터링에 구독됨
  currentOOTD: string | null;
  setCurrentOOTD: (v: string | null) => void;
  currentMood: string | null;
  setCurrentMood: (v: string | null) => void;
  // Resets all session state to initial defaults (Step #43 — logout pipeline)
  resetSession: () => void;
}

const defaultMyProfile: UserProfile = { name: '세준', gender: 'M', mbti: 'ENFJ', enneagram: '3' };
const defaultPartnerProfile: PartnerProfile = { name: '서영', gender: 'F', mbti: 'INTJ' };

const MOCK_COURSES: DateCourse[] = [
  {
    id: 'c1',
    title: '성수동 카페 투어',
    date: '2024-03-15',
    latitude: 37.5445,
    longitude: 127.0557,
    myRating: 5,
    myReview: '분위기 미쳤다 진짜',
    partnerRating: 4,
    partnerReview: '커피가 좀 쓴데 분위기는 찰떡',
    imageUrl: 'https://picsum.photos/seed/cafe/400/300',
    myOotd: '흰 린넨 셔츠 + 슬랙스',
    partnerOotd: '플로럴 원피스',
    isRead: true,
  },
  {
    id: 'c2',
    title: '한강공원 피크닉',
    date: '2024-05-02',
    latitude: 37.5285,
    longitude: 126.9313,
    myRating: 5,
    myReview: '100일 기념 최고였어',
    partnerRating: 5,
    partnerReview: '영원히 이 순간 기억할게',
    imageUrl: 'https://picsum.photos/seed/hangang/400/300',
    myOotd: '네이비 스트라이프 티 + 청바지',
    partnerOotd: '크림 니트 + 와이드 팬츠',
    isRead: false,
  },
  {
    id: 'c3',
    title: '홍대 이자카야 탐방',
    date: '2024-07-20',
    latitude: 37.5566,
    longitude: 126.9236,
    myRating: 4,
    myReview: '안주가 진짜 맛있었음',
    partnerRating: 5,
    partnerReview: '술이 술술 들어가던 밤',
    imageUrl: 'https://picsum.photos/seed/izakaya/400/300',
    myOotd: '블랙 반팔 + 카고 팬츠',
    partnerOotd: '레드 슬리브리스 + 미니스커트',
    isRead: false,
  },
];

const AppContext = createContext<AppContextValue>({
  accuracyBannerVisible: true,
  dismissAccuracyBanner: () => {},
  myProfile: defaultMyProfile,
  partnerProfile: defaultPartnerProfile,
  setMyProfile: () => {},
  setPartnerProfile: () => {},
  themeMode: 'light',
  setThemeMode: () => {},
  themeTokens: LIGHT_THEME,
  inviteCode: '',
  setInviteCode: () => {},
  coupleId: null,
  setCoupleId: () => {},
  trainingResult: null,
  setTrainingResult: () => {},
  rawKakaoText: null,
  setRawKakaoText: () => {},
  chatStyleProfile: DEFAULT_CHAT_STYLE_PROFILE,
  setChatStyleProfile: () => {},
  privacyLevel: 3,
  setPrivacyLevel: () => {},
  dateCourses: MOCK_COURSES,
  addDateCourse: () => {},
  removeDateCourse: () => {},
  bulkAddDateCourses: () => {},
  markCourseAsRead: () => {},
  triggerAddCourse: false,
  setTriggerAddCourse: () => {},
  hasCompletedInterview: false,
  setHasCompletedInterview: () => {},
  weeklyMetrics: { currentScore: 65, prevScore: 62, partnerScore: 52, weeklyMessageCount: 145, avgReplyTimeMin: 7 },
  setWeeklyMetrics: () => {},
  partnerAiMood: FALLBACK_MOOD_TAGS,
  setPartnerAiMood: () => {},
  isEarlyDatingMode: false,
  setIsEarlyDatingMode: () => {},
  roomEarlyModeMap: {},
  setRoomEarlyMode: () => {},
  partnerSensitiveConfig: DEFAULT_PARTNER_SENSITIVE_CONFIG,
  setPartnerSensitiveConfig: () => {},
  weeklyReportData: null,
  setWeeklyReportData: () => {},
  coupleInfo: { startedAt: '2024-01-14' },
  setCoupleInfo: () => {},
  uploadedMediaCount: 0,
  addUploadedMedia: () => {},
  subscriptionStatus: DEFAULT_SUBSCRIPTION_STATUS,
  setSubscriptionStatus: () => {},
  memorySentences: [],
  addMemorySentences: () => {},
  lastKakaoSyncTimestamp: null,
  setLastKakaoSyncTimestamp: () => {},
  highlightCards: [],
  setHighlightCards: () => {},
  addHighlightCards: () => {},
  baseScore: 70.0,
  setBaseScore: () => {},
  interviewBonus: 0.0,
  setInterviewBonus: () => {},
  currentScore: 70.0,
  setCurrentScore: () => {},
  overflowStatus: 'NONE',
  setOverflowStatus: () => {},
  applyDailyEvents: () => {},
  triggerMirrorMode: false,
  setTriggerMirrorMode: () => {},
  currentOOTD: null,
  setCurrentOOTD: () => {},
  currentMood: null,
  setCurrentMood: () => {},
  resetSession: () => {},
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  // System colour-scheme used as initial value; manual setThemeMode overrides it.
  const systemScheme = useColorScheme();
  const [accuracyBannerVisible, setAccuracyBannerVisible] = useState(true);
  const [myProfile, setMyProfile] = useState<UserProfile>(defaultMyProfile);
  const [partnerProfile, setPartnerProfile] = useState<PartnerProfile>(defaultPartnerProfile);
  const [themeMode, setThemeMode] = useState<ThemeMode>(systemScheme === 'dark' ? 'dark' : 'light');
  const [inviteCode, setInviteCode] = useState('');
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [trainingResult, setTrainingResult] = useState<TrainingResult | null>(null);
  const [rawKakaoText, setRawKakaoText] = useState<string | null>(null);
  const [chatStyleProfile, setChatStyleProfile] = useState<ChatStyleProfile>(DEFAULT_CHAT_STYLE_PROFILE);
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>(3);
  const [dateCourses, setDateCourses] = useState<DateCourse[]>(MOCK_COURSES);
  const [triggerAddCourse, setTriggerAddCourse] = useState(false);
  const [hasCompletedInterview, setHasCompletedInterview] = useState(false);
  const [weeklyMetrics, setWeeklyMetrics] = useState<WeeklyMetrics>({ currentScore: 65, prevScore: 62, partnerScore: 52, weeklyMessageCount: 145, avgReplyTimeMin: 7 });
  const [partnerAiMood, setPartnerAiMood] = useState<PartnerAiMoodTag[]>(FALLBACK_MOOD_TAGS);
  const [isEarlyDatingMode, setIsEarlyDatingMode] = useState(false);
  const [roomEarlyModeMap, setRoomEarlyModeState] = useState<Record<string, boolean>>({});
  const [partnerSensitiveConfig, setPartnerSensitiveConfig] = useState<PartnerSensitiveConfig>(DEFAULT_PARTNER_SENSITIVE_CONFIG);
  const [weeklyReportData, setWeeklyReportData] = useState<WeeklyReportData | null>(null);
  const [coupleInfo, setCoupleInfoState] = useState<CoupleInfo>({ startedAt: '2024-01-14' });
  const [uploadedMediaCount, setUploadedMediaCount] = useState(0);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>(DEFAULT_SUBSCRIPTION_STATUS);
  const [memorySentences, setMemorySentences] = useState<KakaoSyncRecord[]>([]);
  const [lastKakaoSyncTimestamp, setLastKakaoSyncTimestamp] = useState<string | null>(null);
  const [highlightCards, setHighlightCards] = useState<HighlightCard[]>([]);
  // ── DNA 일치율 엔진 상태 ─────────────────────────────────────────────────────
  const [baseScore, setBaseScore] = useState<number>(70.0);
  const [interviewBonus, setInterviewBonus] = useState<number>(0.0);
  const [currentScore, setCurrentScore] = useState<number>(70.0);
  const [overflowStatus, setOverflowStatus] = useState<OverflowStatus>('NONE');
  const [triggerMirrorMode, setTriggerMirrorMode] = useState<boolean>(false);
  // FUN-HIS-005: AI 뮤즈 선택값 — 무드 피드 필터 구독용
  const [currentOOTD, setCurrentOOTD] = useState<string | null>(null);
  const [currentMood, setCurrentMood] = useState<string | null>(null);

  const setCoupleInfo = (info: Partial<CoupleInfo>) =>
    setCoupleInfoState((prev) => ({ ...prev, ...info }));
  const addUploadedMedia = (delta = 1) =>
    setUploadedMediaCount((prev) => prev + delta);
  const setRoomEarlyMode = (roomId: string, value: boolean) =>
    setRoomEarlyModeState((prev) => ({ ...prev, [roomId]: value }));
  const addHighlightCards = (cards: HighlightCard[]) =>
    setHighlightCards((prev) => {
      const existingIds = new Set(prev.map((c) => c.id));
      const newOnly = cards.filter((c) => !existingIds.has(c.id));
      return [...newOnly, ...prev];
    });

  const addMemorySentences = (records: KakaoSyncRecord[]) =>
    setMemorySentences((prev) => {
      const existingIds = new Set(prev.map((r) => r.id));
      const newOnly = records.filter((r) => !existingIds.has(r.id));
      return [...newOnly, ...prev];
    });

  // 24개 마이크로 이벤트 일괄 적용: clamp delta + overflow 감지 + currentScore 갱신
  const applyDailyEvents = (events: MicroEventCode[]) => {
    const { clamped, overflowStatus: newStatus } = computeDailyDelta(events);
    setOverflowStatus(newStatus);
    setCurrentScore((prev) => applyScoreDelta(prev, clamped));
  };

  // 인터뷰 완료 시 +5.0% 가산점 즉시 currentScore에 누적
  useEffect(() => {
    if (hasCompletedInterview && interviewBonus === 0) {
      const bonus = 5.0;
      setInterviewBonus(bonus);
      setCurrentScore((prev) => {
        const updated = computeMasterBase(baseScore, bonus);
        // 이미 누적 delta가 있을 수 있으므로 prev와 updated 중 더 높은 값을 사용
        return Math.max(prev, updated);
      });
    }
  }, [hasCompletedInterview]);

  // Resets every state slice back to its initial default (Step #43 — logout pipeline).
  // Deliberately preserves themeMode so the display preference survives re-login.
  const resetSession = () => {
    setAccuracyBannerVisible(true);
    setMyProfile(defaultMyProfile);
    setPartnerProfile(defaultPartnerProfile);
    setInviteCode('');
    setCoupleId(null);
    setTrainingResult(null);
    setRawKakaoText(null);
    setChatStyleProfile(DEFAULT_CHAT_STYLE_PROFILE);
    setPrivacyLevel(3);
    setDateCourses(MOCK_COURSES);
    setTriggerAddCourse(false);
    setHasCompletedInterview(false);
    setWeeklyMetrics({ currentScore: 65, prevScore: 62, partnerScore: 52, weeklyMessageCount: 145, avgReplyTimeMin: 7 });
    setPartnerAiMood(FALLBACK_MOOD_TAGS);
    setIsEarlyDatingMode(false);
    setRoomEarlyModeState({});
    setPartnerSensitiveConfig(DEFAULT_PARTNER_SENSITIVE_CONFIG);
    setWeeklyReportData(null);
    setCoupleInfoState({ startedAt: '2024-01-14' });
    setUploadedMediaCount(0);
    setSubscriptionStatus(DEFAULT_SUBSCRIPTION_STATUS);
    setMemorySentences([]);
    setLastKakaoSyncTimestamp(null);
    setHighlightCards([]);
    setBaseScore(70.0);
    setInterviewBonus(0.0);
    setCurrentScore(70.0);
    setOverflowStatus('NONE');
    setTriggerMirrorMode(false);
    setCurrentOOTD(null);
    setCurrentMood(null);
  };

  const themeTokens = themeMode === 'light' ? LIGHT_THEME : DARK_THEME;

  // Hydrate persisted highlight cards from AsyncStorage on app launch (Step #53)
  useEffect(() => {
    loadHighlightCards().then((cards) => {
      if (cards.length > 0) setHighlightCards(cards);
    });
  }, []);

  // Seed the partner-review service store whenever dateCourses changes.
  // Courses that already carry a kakaoPlaceId and a real partnerRating
  // are registered so AddCourseSheet can display them reactively.
  useEffect(() => {
    seedReviewStore(dateCourses);
  }, [dateCourses]);

  const addDateCourse = (course: DateCourse) =>
    setDateCourses((prev) => [course, ...prev]);
  const removeDateCourse = (id: string) =>
    setDateCourses((prev) => prev.filter((c) => c.id !== id));
  const bulkAddDateCourses = (courses: DateCourse[]) =>
    setDateCourses((prev) => [...courses, ...prev]);
  const markCourseAsRead = (id: string) =>
    setDateCourses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isRead: true } : c))
    );

  return (
    <AppContext.Provider
      value={{
        accuracyBannerVisible,
        dismissAccuracyBanner: () => setAccuracyBannerVisible(false),
        myProfile,
        partnerProfile,
        setMyProfile,
        setPartnerProfile,
        themeMode,
        setThemeMode,
        themeTokens,
        inviteCode,
        setInviteCode,
        coupleId,
        setCoupleId,
        trainingResult,
        setTrainingResult,
        rawKakaoText,
        setRawKakaoText,
        chatStyleProfile,
        setChatStyleProfile,
        privacyLevel,
        setPrivacyLevel,
        dateCourses,
        addDateCourse,
        removeDateCourse,
        bulkAddDateCourses,
        markCourseAsRead,
        triggerAddCourse,
        setTriggerAddCourse,
        hasCompletedInterview,
        setHasCompletedInterview,
        weeklyMetrics,
        setWeeklyMetrics,
        partnerAiMood,
        setPartnerAiMood,
        isEarlyDatingMode,
        setIsEarlyDatingMode,
        roomEarlyModeMap,
        setRoomEarlyMode,
        partnerSensitiveConfig,
        setPartnerSensitiveConfig,
        weeklyReportData,
        setWeeklyReportData,
        coupleInfo,
        setCoupleInfo,
        uploadedMediaCount,
        addUploadedMedia,
        subscriptionStatus,
        setSubscriptionStatus,
        memorySentences,
        addMemorySentences,
        lastKakaoSyncTimestamp,
        setLastKakaoSyncTimestamp,
        highlightCards,
        setHighlightCards,
        addHighlightCards,
        baseScore,
        setBaseScore,
        interviewBonus,
        setInterviewBonus,
        currentScore,
        setCurrentScore,
        overflowStatus,
        setOverflowStatus,
        applyDailyEvents,
        triggerMirrorMode,
        setTriggerMirrorMode,
        currentOOTD,
        setCurrentOOTD,
        currentMood,
        setCurrentMood,
        resetSession,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useAppContext = () => useContext(AppContext);
