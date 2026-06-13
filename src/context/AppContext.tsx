import React, { createContext, useContext, useState } from 'react';
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

export type { PartnerAiMoodTag };
export type { PartnerSensitiveConfig };

export type { ChatStyleProfile };

// ── Privacy Level ─────────────────────────────────────────────────────────────
// 3 = 완전복제(Full Clone, default) · 2 = 최적화(Optimized) · 1 = 보호(Protected)
export type PrivacyLevel = 1 | 2 | 3;

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
  partnerRating: number;  // 1–5 (mocked until real partner sync)
  partnerReview: string;
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
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [accuracyBannerVisible, setAccuracyBannerVisible] = useState(true);
  const [myProfile, setMyProfile] = useState<UserProfile>(defaultMyProfile);
  const [partnerProfile, setPartnerProfile] = useState<PartnerProfile>(defaultPartnerProfile);
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
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
  const setRoomEarlyMode = (roomId: string, value: boolean) =>
    setRoomEarlyModeState((prev) => ({ ...prev, [roomId]: value }));

  const themeTokens = themeMode === 'light' ? LIGHT_THEME : DARK_THEME;

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
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useAppContext = () => useContext(AppContext);
