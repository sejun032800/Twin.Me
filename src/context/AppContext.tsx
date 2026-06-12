import React, { createContext, useContext, useState } from 'react';
import { DARK_THEME, LIGHT_THEME, ThemeMode, ThemeTokens } from '../styles/theme';
import {
  ChatStyleProfile,
  DEFAULT_CHAT_STYLE_PROFILE,
} from '../lib/kakaoParser';

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
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [accuracyBannerVisible, setAccuracyBannerVisible] = useState(true);
  const [myProfile, setMyProfile] = useState<UserProfile>(defaultMyProfile);
  const [partnerProfile, setPartnerProfile] = useState<PartnerProfile>(defaultPartnerProfile);
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [inviteCode, setInviteCode] = useState('');
  const [trainingResult, setTrainingResult] = useState<TrainingResult | null>(null);
  const [rawKakaoText, setRawKakaoText] = useState<string | null>(null);
  const [chatStyleProfile, setChatStyleProfile] = useState<ChatStyleProfile>(DEFAULT_CHAT_STYLE_PROFILE);
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>(3);
  const [dateCourses, setDateCourses] = useState<DateCourse[]>(MOCK_COURSES);

  const themeTokens = themeMode === 'light' ? LIGHT_THEME : DARK_THEME;

  const addDateCourse = (course: DateCourse) =>
    setDateCourses((prev) => [course, ...prev]);
  const removeDateCourse = (id: string) =>
    setDateCourses((prev) => prev.filter((c) => c.id !== id));
  const bulkAddDateCourses = (courses: DateCourse[]) =>
    setDateCourses((prev) => [...courses, ...prev]);

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
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useAppContext = () => useContext(AppContext);
