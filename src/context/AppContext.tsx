import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { DARK_THEME, LIGHT_THEME, ThemeMode, ThemeTokens } from '../styles/theme';
import type { Photo, MemoryRing } from '../types/gallery';
import type { UserAccount, LinkedProvider } from '../types/auth';
import { DEFAULT_USER_ACCOUNT } from '../types/auth';
import { handleAccountLink } from '../utils/authSync';
import { generateTopMemoryRings } from '../utils/photoAnalyzer';
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
  type PlanId,
  DEFAULT_SUBSCRIPTION_STATUS,
} from '../services/iapService';
import {
  broadcastCoupleEntitlement,
  subscribeToCoupleEntitlement,
} from '../services/coupleEntitlementService';
import type { KakaoSyncRecord } from '../services/kakaoUploadService';
import type { HighlightCard } from '../services/kakaoHighlightService';
import { loadHighlightCards } from '../services/kakaoHighlightService';
import {
  type OverflowStatus,
  computeMasterBase,
} from '../utils/scoreCalculator';
import {
  type EventCode,
  type EventContext as MatchEventContext,
  type OverflowSeverity,
  type ATick,
  type LoggedEvent,
  type FrequencyState,
  processTick,
  createFrequencyState,
  computeSLive,
  settleMidnight,
  detectRapidSwing,
  detectCombos,
  shouldActivateCrisisMemory,
  resolveActiveCapPlus,
  todayKey,
} from '../engine/metrics';
import {
  loadMatchEngineState,
  saveMatchEngineState,
  clearMatchEngineState,
  type ScoreHistoryEntry,
} from '../services/matchEngineStore';
import {
  evaluateGate,
  createGateState,
  type GateState,
  type GateContext,
  type Detection,
  type SelfAiNotifyItem,
} from '../engine/twinResponseEngine';

export type { ScoreHistoryEntry };
export type { Detection, SelfAiNotifyItem };

export type { PartnerAiMoodTag };
export type { PartnerSensitiveConfig };
export type { WeeklyReportData };
export type { SubscriptionStatus };

export type { ChatStyleProfile };
export type { KakaoSyncRecord };
export type { HighlightCard };
export type { OverflowStatus };
export type { EventCode, OverflowSeverity };
export type { Photo, MemoryRing };
export type { UserAccount, LinkedProvider };

// ── Map Layer System (FUN-HIS-006) ────────────────────────────────────────────
export type LayerType = 'HISTORY' | 'PLAN' | 'SECRET';
export interface MapLayer {
  id: string;
  name: string;
  type: LayerType;
  order: number;
  isVisible: boolean;
}

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
  // Layer assignment (PLAN layer, FUN-HIS-006). Undefined = auto HISTORY layer.
  layerId?: string;
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
  // FUN-PAY-001 §1: 커플 단위 엔타이틀먼트 — 결제 직후 호출해 로컬 반영 + 파트너 기기 동기화
  applyCoupleSubscription: (status: SubscriptionStatus) => Promise<void>;
  // FUN-PAY-001 §2: 상대에게 프리미엄 선물하기 — 동기화 + 파트너 채팅방 선물 카드 트리거
  giftPremiumToPartner: (status: SubscriptionStatus) => Promise<void>;
  // Cross-tab: 설정 탭 선물 완료 → 채팅 탭 파트너 룸에 선물 카드 렌더링
  pendingGiftCard: { planId: PlanId | null; giftedAt: number } | null;
  setPendingGiftCard: (v: { planId: PlanId | null; giftedAt: number } | null) => void;
  // FUN-PAY-001 §3: 실시간 EXCESS_GAIN 단건 결제 모먼트 — 하이라이트 카드 즉시 언락
  oneTimeHighlightUnlocked: boolean;
  setOneTimeHighlightUnlocked: (v: boolean) => void;
  // FUN-REP-003: 커플 Wrapped — 일자별 S_Current 히스토리(최고점 산출) + 회복 서사 누적 횟수
  scoreHistory: ScoreHistoryEntry[];
  comboRecoveryCount: number;
  // KakaoTalk incremental sync — AI-selected touching moments (Step #50)
  memorySentences: KakaoSyncRecord[];
  addMemorySentences: (records: KakaoSyncRecord[]) => void;
  lastKakaoSyncTimestamp: string | null;
  setLastKakaoSyncTimestamp: (ts: string | null) => void;
  // 4-emotion AI highlight cards archive (Step #53)
  highlightCards: HighlightCard[];
  setHighlightCards: (cards: HighlightCard[]) => void;
  addHighlightCards: (cards: HighlightCard[]) => void;
  // ── DNA 일치율 코어 엔진 v2.2 (Real-Time Pulse Edition) ─────────────────────
  // S_Base: 성격 상성 기반 정규분포 초기 점수
  baseScore: number;
  setBaseScore: (score: number) => void;
  // Bonus_Interview: 10분 음성 인터뷰 가산점 (0.0 ~ 5.0)
  interviewBonus: number;
  setInterviewBonus: (bonus: number) => void;
  // S_Current: 자정 1회 정산되어 영구 저장되는 공식 일치율 (10단계 티어·페이월 기준)
  currentScore: number;
  setCurrentScore: (score: number) => void;
  // S_Live: 화면 상단 게이지 전용 실시간 값 (non-persistent, 이벤트마다 즉시 재계산)
  sLive: number;
  // 오버플로우 상태(호환용) + 3단계 심각도(MINOR/MAJOR/CRITICAL)
  overflowStatus: OverflowStatus;
  setOverflowStatus: (status: OverflowStatus) => void;
  overflowSeverity: OverflowSeverity;
  // 3일 연속 CRITICAL_LOSS 위기 메모리 — 활성 시 가산 캡 1.0으로 임시 하향
  crisisMemoryActive: boolean;
  // 30분 내 A_t가 −1.5 미만 급락 (Rapid-Swing) — FUN-CHA-003 강제 민감도 상향 트리거
  rapidSwingActive: boolean;
  // 실시간 틱 단위 이벤트 처리 파이프라인 (§4.2) — 채팅 메시지 분류기가 호출
  processLiveEvent: (code: EventCode, ctx?: MatchEventContext) => void;
  // Cross-tab: 홈 탭 CRITICAL_LOSS 배너 → 채팅 탭 FUN-CHA-003 강제 트리거
  triggerMirrorMode: boolean;
  setTriggerMirrorMode: (v: boolean) => void;
  // ── 트윈 AI 응답 생성 엔진 (Twin Response Logic) ──────────────────────────
  // 개입 점수 I(u) → 발화 게이트(θ=0.12) → 채널 라우팅(WARN/ADVISE/NOTIFY) →
  // 피로도(EMA)/쿨다운 판정까지 한 번에 수행하고 Detection(또는 null)을 반환한다.
  evaluateIntervention: (code: EventCode, ctx?: GateContext) => Detection | null;
  // NOTIFY 채널 산출물(사후 인정 발화·배치 요약) 큐 — 룸 2/3이 마운트될 때 드레인한다.
  selfAiNotifyQueue: SelfAiNotifyItem[];
  setSelfAiNotifyQueue: React.Dispatch<React.SetStateAction<SelfAiNotifyItem[]>>;
  // FUN-HIS-005: AI 뮤즈에서 선택한 전역 OOTD/무드 — 무드 피드 필터링에 구독됨
  currentOOTD: string | null;
  setCurrentOOTD: (v: string | null) => void;
  currentMood: string | null;
  setCurrentMood: (v: string | null) => void;
  // Gallery photo archive + AI-curated memory rings (FUN-HOM-004)
  galleryPhotos: Photo[];
  memoryRings: MemoryRing[];
  addGalleryPhotos: (photos: Photo[]) => void;
  // Social account linking + data migration pipeline (Step #56)
  userAccount: UserAccount;
  linkSocialAccount: (provider: LinkedProvider) => Promise<void>;
  // Resets all session state to initial defaults (Step #43 — logout pipeline)
  resetSession: () => void;
  // Purges ALL user data to empty defaults — used by account deletion pipeline
  purgeAccount: () => void;
  // SRS 보강판 #1 §B.5: 커플 연결만 해제 — 공유 메모리(추억/스코어)는 유예(Grace)
  // 기간 동안 보존되며 purgeAccount처럼 개인 데이터를 지우지 않음
  unlinkCouple: () => void;
  // ── Map Layer System (FUN-HIS-006) ─────────────────────────────────────────
  planLayers: MapLayer[];
  layerVisibility: Record<string, boolean>; // key → false means hidden; undefined/true = visible
  secretCourses: DateCourse[];             // local-only, never synced to partner device
  addPlanLayer: (name: string) => void;
  removePlanLayer: (id: string) => void;
  renamePlanLayer: (id: string, name: string) => void;
  movePlanLayerUp: (id: string) => void;
  movePlanLayerDown: (id: string) => void;
  toggleLayerVisible: (id: string) => void;
  addSecretCourse: (course: DateCourse) => void;
  removeSecretCourse: (id: string) => void;
}

// ── Gallery seed data: 15 dummy photos for FUN-HOM-004 ───────────────────────
// Tags are pre-assigned for deterministic ring clustering during development.
// Replace with analyzeAndCategorizePhoto() results once Vision API is wired.
const MOCK_GALLERY_PHOTOS: Photo[] = [
  { id: 'g1',  uri: 'https://picsum.photos/seed/paris1/600/800',   createdAt: new Date('2024-01-15').getTime(), extractedTags: ['#파리여행', '#sns용사진'] },
  { id: 'g2',  uri: 'https://picsum.photos/seed/paris2/600/800',   createdAt: new Date('2024-01-20').getTime(), extractedTags: ['#파리여행', '#분위기맛집'] },
  { id: 'g3',  uri: 'https://picsum.photos/seed/cafe1/600/800',    createdAt: new Date('2024-02-10').getTime(), extractedTags: ['#카페투어', '#sns용사진'] },
  { id: 'g4',  uri: 'https://picsum.photos/seed/couple1/600/800',  createdAt: new Date('2024-02-14').getTime(), extractedTags: ['#카페투어', '#커플엽사'] },
  { id: 'g5',  uri: 'https://picsum.photos/seed/paris3/600/800',   createdAt: new Date('2024-03-05').getTime(), extractedTags: ['#파리여행', '#전시관'] },
  { id: 'g6',  uri: 'https://picsum.photos/seed/gallery1/600/800', createdAt: new Date('2024-03-20').getTime(), extractedTags: ['#전시관', '#sns용사진'] },
  { id: 'g7',  uri: 'https://picsum.photos/seed/romantic/600/800', createdAt: new Date('2024-04-01').getTime(), extractedTags: ['#커플엽사', '#분위기맛집'] },
  { id: 'g8',  uri: 'https://picsum.photos/seed/hangang1/600/800', createdAt: new Date('2024-05-02').getTime(), extractedTags: ['#한강피크닉', '#sns용사진'] },
  { id: 'g9',  uri: 'https://picsum.photos/seed/hangang2/600/800', createdAt: new Date('2024-05-03').getTime(), extractedTags: ['#한강피크닉', '#커플엽사'] },
  { id: 'g10', uri: 'https://picsum.photos/seed/hongdae/600/800',  createdAt: new Date('2024-07-20').getTime(), extractedTags: ['#홍대', '#분위기맛집'] },
  { id: 'g11', uri: 'https://picsum.photos/seed/seongsu/600/800',  createdAt: new Date('2024-08-05').getTime(), extractedTags: ['#성수동', '#카페투어'] },
  { id: 'g12', uri: 'https://picsum.photos/seed/cafeduo/600/800',  createdAt: new Date('2024-09-12').getTime(), extractedTags: ['#카페투어', '#커플엽사'] },
  { id: 'g13', uri: 'https://picsum.photos/seed/paris4/600/800',   createdAt: new Date('2024-10-03').getTime(), extractedTags: ['#파리여행', '#분위기맛집'] },
  { id: 'g14', uri: 'https://picsum.photos/seed/museum/600/800',   createdAt: new Date('2024-11-07').getTime(), extractedTags: ['#전시관', '#커플엽사'] },
  { id: 'g15', uri: 'https://picsum.photos/seed/winter/600/800',   createdAt: new Date('2024-12-15').getTime(), extractedTags: ['#커플엽사', '#sns용사진'] },
];

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
  applyCoupleSubscription: async () => {},
  giftPremiumToPartner: async () => {},
  pendingGiftCard: null,
  setPendingGiftCard: () => {},
  oneTimeHighlightUnlocked: false,
  setOneTimeHighlightUnlocked: () => {},
  scoreHistory: [],
  comboRecoveryCount: 0,
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
  sLive: 70.0,
  overflowStatus: 'NONE',
  setOverflowStatus: () => {},
  overflowSeverity: 'NONE',
  crisisMemoryActive: false,
  rapidSwingActive: false,
  processLiveEvent: () => {},
  triggerMirrorMode: false,
  setTriggerMirrorMode: () => {},
  evaluateIntervention: () => null,
  selfAiNotifyQueue: [],
  setSelfAiNotifyQueue: () => {},
  currentOOTD: null,
  setCurrentOOTD: () => {},
  currentMood: null,
  setCurrentMood: () => {},
  resetSession: () => {},
  purgeAccount: () => {},
  unlinkCouple: () => {},
  planLayers: [],
  layerVisibility: {},
  secretCourses: [],
  addPlanLayer: () => {},
  removePlanLayer: () => {},
  renamePlanLayer: () => {},
  movePlanLayerUp: () => {},
  movePlanLayerDown: () => {},
  toggleLayerVisible: () => {},
  addSecretCourse: () => {},
  removeSecretCourse: () => {},
  galleryPhotos: [],
  memoryRings: [],
  addGalleryPhotos: () => {},
  userAccount: DEFAULT_USER_ACCOUNT,
  linkSocialAccount: async () => {},
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
  const [pendingGiftCard, setPendingGiftCard] = useState<{ planId: PlanId | null; giftedAt: number } | null>(null);
  const [oneTimeHighlightUnlocked, setOneTimeHighlightUnlocked] = useState<boolean>(false);
  const [scoreHistory, setScoreHistory] = useState<ScoreHistoryEntry[]>([]);
  const [comboRecoveryCount, setComboRecoveryCount] = useState<number>(0);
  const [memorySentences, setMemorySentences] = useState<KakaoSyncRecord[]>([]);
  const [lastKakaoSyncTimestamp, setLastKakaoSyncTimestamp] = useState<string | null>(null);
  const [highlightCards, setHighlightCards] = useState<HighlightCard[]>([]);
  // ── DNA 일치율 코어 엔진 v2.2 상태 ───────────────────────────────────────────
  const [baseScore, setBaseScore] = useState<number>(70.0);
  const [interviewBonus, setInterviewBonus] = useState<number>(0.0);
  const [currentScore, setCurrentScore] = useState<number>(70.0);
  const [sLive, setSLive] = useState<number>(70.0);
  const [sTodayOpen, setSTodayOpen] = useState<number>(70.0);
  const [overflowStatus, setOverflowStatus] = useState<OverflowStatus>('NONE');
  const [overflowSeverity, setOverflowSeverity] = useState<OverflowSeverity>('NONE');
  const [crisisMemoryActive, setCrisisMemoryActive] = useState<boolean>(false);
  const [rapidSwingActive, setRapidSwingActive] = useState<boolean>(false);
  const [triggerMirrorMode, setTriggerMirrorMode] = useState<boolean>(false);
  // 틱 엔진 비-리액티브 상태 (재렌더 불필요 — S_Live/overflow만 state로 반영)
  const aRef = React.useRef<number>(0);
  const aHistoryRef = React.useRef<ATick[]>([]);
  const recentEventLogRef = React.useRef<LoggedEvent[]>([]);
  const freqStateRef = React.useRef<FrequencyState>(createFrequencyState());
  const dailyStatusHistoryRef = React.useRef<OverflowStatus[]>([]);
  const lastSettledDayRef = React.useRef<string>(todayKey());
  // ── 트윈 AI 응답 생성 엔진 상태 (피로도 EMA/쿨다운/반복패턴 로그 — 비-리액티브) ──
  const gateStateRef = React.useRef<GateState>(createGateState());
  const [selfAiNotifyQueue, setSelfAiNotifyQueue] = useState<SelfAiNotifyItem[]>([]);
  const matchEngineHydratedRef = React.useRef<boolean>(false);
  // FUN-REP-003: 커플 Wrapped 데이터 소스
  const scoreHistoryRef = React.useRef<ScoreHistoryEntry[]>([]);
  const comboRecoveryCountRef = React.useRef<number>(0);
  // FUN-HIS-005: AI 뮤즈 선택값 — 무드 피드 필터 구독용
  const [currentOOTD, setCurrentOOTD] = useState<string | null>(null);
  const [currentMood, setCurrentMood] = useState<string | null>(null);
  // FUN-HOM-004: Gallery photos + AI memory rings
  const [galleryPhotos, setGalleryPhotos] = useState<Photo[]>(MOCK_GALLERY_PHOTOS);
  const [memoryRings, setMemoryRings] = useState<MemoryRing[]>(() =>
    generateTopMemoryRings(MOCK_GALLERY_PHOTOS),
  );
  // Social account (Step #56)
  const [userAccount, setUserAccount] = useState<UserAccount>(DEFAULT_USER_ACCOUNT);

  useEffect(() => {
    setMemoryRings(generateTopMemoryRings(galleryPhotos));
  }, [galleryPhotos]);

  const addGalleryPhotos = (photos: Photo[]) =>
    setGalleryPhotos((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const newOnly = photos.filter((p) => !existingIds.has(p.id));
      return [...prev, ...newOnly];
    });

  // FUN-HIS-006: 멀티 레이어 시스템
  const [planLayers, setPlanLayers] = useState<MapLayer[]>([]);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [secretCourses, setSecretCourses] = useState<DateCourse[]>([
    {
      id: 'secret-demo-1',
      title: '🤫 제주도 서프라이즈 여행 (기밀)',
      date: '2026-07-14',
      latitude: 33.4996,
      longitude: 126.5312,
      myRating: 0,
      myReview: '기념일 깜짝 여행 계획 중 🤫',
      partnerRating: 0,
      partnerReview: '',
    },
  ]);

  const setCoupleInfo = (info: Partial<CoupleInfo>) =>
    setCoupleInfoState((prev) => ({ ...prev, ...info }));

  // ── FUN-HIS-006: Map Layer CRUD ──────────────────────────────────────────────
  const addPlanLayer = (name: string) => {
    const newLayer: MapLayer = {
      id: `plan-${Date.now()}`,
      name,
      type: 'PLAN',
      order: planLayers.length,
      isVisible: true,
    };
    setPlanLayers((prev) => [...prev, newLayer]);
  };
  const removePlanLayer = (id: string) =>
    setPlanLayers((prev) => prev.filter((l) => l.id !== id));
  const renamePlanLayer = (id: string, name: string) =>
    setPlanLayers((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
  const movePlanLayerUp = (id: string) => {
    setPlanLayers((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((l) => l.id === id);
      if (idx <= 0) return prev;
      return sorted.map((l, i) => {
        if (i === idx - 1) return { ...l, order: sorted[idx].order };
        if (i === idx)     return { ...l, order: sorted[idx - 1].order };
        return l;
      });
    });
  };
  const movePlanLayerDown = (id: string) => {
    setPlanLayers((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((l) => l.id === id);
      if (idx < 0 || idx >= sorted.length - 1) return prev;
      return sorted.map((l, i) => {
        if (i === idx)     return { ...l, order: sorted[idx + 1].order };
        if (i === idx + 1) return { ...l, order: sorted[idx].order };
        return l;
      });
    });
  };
  // Toggle: if currently visible (undefined or true) → false; if false → true
  const toggleLayerVisible = (id: string) =>
    setLayerVisibility((prev) => ({ ...prev, [id]: prev[id] !== false ? false : true }));
  const addSecretCourse = (course: DateCourse) =>
    setSecretCourses((prev) => [{ ...course, id: `secret-${course.id}-${Date.now()}` }, ...prev]);
  const removeSecretCourse = (id: string) =>
    setSecretCourses((prev) => prev.filter((c) => c.id !== id));
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

  // ── v2.2 자정 정산: S_Today_Open → S_Current, 항상성 감쇠 + 위기 메모리 갱신 ──
  const settleMidnightIfNeeded = React.useCallback(() => {
    const key = todayKey();
    if (lastSettledDayRef.current === key) return;

    const sMasterBase = computeMasterBase(baseScore, interviewBonus);
    const result = settleMidnight(
      sTodayOpen,
      aRef.current,
      sMasterBase,
      resolveActiveCapPlus(crisisMemoryActive),
    );

    const nextHistory = [...dailyStatusHistoryRef.current, result.overflowStatus].slice(-3);
    dailyStatusHistoryRef.current = nextHistory;
    const nextCrisisMemory = shouldActivateCrisisMemory(nextHistory);

    aRef.current = 0;
    aHistoryRef.current = [];
    recentEventLogRef.current = [];
    freqStateRef.current = createFrequencyState();
    lastSettledDayRef.current = key;

    // FUN-REP-003: 커플 Wrapped 최고점 일자 산출용 — 최근 400일만 보존
    const nextScoreHistory = [...scoreHistoryRef.current, { date: key, score: result.sCurrent }].slice(-400);
    scoreHistoryRef.current = nextScoreHistory;

    setCurrentScore(result.sCurrent);
    setSTodayOpen(result.sCurrent);
    setSLive(result.sCurrent);
    setOverflowStatus(result.overflowStatus);
    setOverflowSeverity(result.severity);
    setCrisisMemoryActive(nextCrisisMemory);
    setRapidSwingActive(false);
    setScoreHistory(nextScoreHistory);

    saveMatchEngineState({
      sCurrent: result.sCurrent,
      sTodayOpen: result.sCurrent,
      lastSettledDay: key,
      dailyStatusHistory: nextHistory,
      crisisMemoryActive: nextCrisisMemory,
      scoreHistory: nextScoreHistory,
      comboRecoveryCount: comboRecoveryCountRef.current,
    });
  }, [baseScore, interviewBonus, sTodayOpen, crisisMemoryActive]);

  // 앱 구동 중 자정을 넘기는 경우를 잡기 위한 1분 간격 폴링
  useEffect(() => {
    const timer = setInterval(settleMidnightIfNeeded, 60_000);
    return () => clearInterval(timer);
  }, [settleMidnightIfNeeded]);

  // 앱 최초 구동 시 영속화된 v2.2 엔진 상태 하이드레이션 (Step DNA-Core v2.2)
  useEffect(() => {
    loadMatchEngineState().then((persisted) => {
      matchEngineHydratedRef.current = true;
      if (!persisted) return;
      lastSettledDayRef.current = persisted.lastSettledDay;
      dailyStatusHistoryRef.current = persisted.dailyStatusHistory;
      setCurrentScore(persisted.sCurrent);
      setSTodayOpen(persisted.sTodayOpen);
      setSLive(persisted.sCurrent);
      setCrisisMemoryActive(persisted.crisisMemoryActive);
      scoreHistoryRef.current = persisted.scoreHistory ?? [];
      setScoreHistory(scoreHistoryRef.current);
      comboRecoveryCountRef.current = persisted.comboRecoveryCount ?? 0;
      setComboRecoveryCount(comboRecoveryCountRef.current);
      // 하이드레이션 이후 자정 경과 여부 즉시 재검사
      settleMidnightIfNeeded();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── FUN-PAY-001 §1: 커플 단위 엔타이틀먼트 실시간 동기화 ──────────────────────
  useEffect(() => {
    if (!coupleId) return;
    const unsubscribe = subscribeToCoupleEntitlement(coupleId, (entitlement) => {
      setSubscriptionStatus({
        isPremium: entitlement.isPremium,
        planId: entitlement.planId,
        expiresAt: entitlement.expiresAt,
      });
    });
    return unsubscribe;
  }, [coupleId]);

  // 결제 성공 직후 호출 — 로컬 반영 + Supabase로 파트너 기기에 커플 단위 전파
  const applyCoupleSubscription = React.useCallback(async (status: SubscriptionStatus) => {
    setSubscriptionStatus(status);
    await broadcastCoupleEntitlement(coupleId, status, 'me');
  }, [coupleId]);

  // FUN-PAY-001 §2: 상대에게 프리미엄 선물하기 — 동기화 + 파트너 채팅방 선물 카드 트리거
  const giftPremiumToPartner = React.useCallback(async (status: SubscriptionStatus) => {
    setSubscriptionStatus(status);
    await broadcastCoupleEntitlement(coupleId, status, 'me');
    setPendingGiftCard({ planId: status.planId, giftedAt: Date.now() });
  }, [coupleId]);

  // ── v2.2 실시간 틱 파이프라인: 이벤트 감지 → A_t 누적 → S_Live 즉시 재계산 ──
  const processLiveEvent = React.useCallback((code: EventCode, ctx: MatchEventContext = {}) => {
    const now = ctx.timestamp ?? Date.now();
    const inConflict = overflowStatus === 'CRITICAL_LOSS' || ctx.inConflict;

    const tick = processTick(code, freqStateRef.current, { ...ctx, inConflict });
    aRef.current += tick.deltaFinal;
    recentEventLogRef.current = [...recentEventLogRef.current, { code, t: now }].slice(-40);

    // 시퀀스 콤보 (κ·γ 미적용 특례 가산)
    const combos = detectCombos(recentEventLogRef.current, now);
    for (const combo of combos) {
      aRef.current += combo.bonus;
      // FUN-REP-003: 회복 서사(C-ARC) 콤보 발생 시 커플 Wrapped용 카운터 누적
      if (combo.code === 'C-ARC-001' || combo.code === 'C-ARC-002') {
        comboRecoveryCountRef.current += 1;
        setComboRecoveryCount(comboRecoveryCountRef.current);
      }
    }

    aHistoryRef.current = [...aHistoryRef.current, { t: now, aValue: aRef.current }].filter(
      (h) => now - h.t <= 24 * 60 * 60 * 1000,
    );

    const swing = detectRapidSwing(aHistoryRef.current, aRef.current, now);
    setRapidSwingActive(swing);

    const capPlus = resolveActiveCapPlus(crisisMemoryActive);
    setSLive(computeSLive(sTodayOpen, aRef.current, capPlus));
  }, [overflowStatus, crisisMemoryActive, sTodayOpen]);

  // ── 트윈 AI 응답 생성 엔진: 개입 게이트 판정 (채팅 탭 실시간 스트림이 호출) ──
  const evaluateIntervention = React.useCallback((code: EventCode, ctx: GateContext = {}): Detection | null => {
    const { detection, nextState } = evaluateGate(code, gateStateRef.current, ctx);
    gateStateRef.current = nextState;
    return detection;
  }, []);

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

  // Social account link — bundles local data and ships to server (Step #56)
  const linkSocialAccount = async (provider: LinkedProvider): Promise<void> => {
    await handleAccountLink(provider, {
      currentScore,
      dateCourses,
      weeklyReportData,
      userAccount,
      setUserAccount,
    });
  };

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
    setPendingGiftCard(null);
    setOneTimeHighlightUnlocked(false);
    scoreHistoryRef.current = [];
    setScoreHistory([]);
    comboRecoveryCountRef.current = 0;
    setComboRecoveryCount(0);
    setMemorySentences([]);
    setLastKakaoSyncTimestamp(null);
    setHighlightCards([]);
    setBaseScore(70.0);
    setInterviewBonus(0.0);
    setCurrentScore(70.0);
    setSLive(70.0);
    setSTodayOpen(70.0);
    setOverflowStatus('NONE');
    setOverflowSeverity('NONE');
    setCrisisMemoryActive(false);
    setRapidSwingActive(false);
    aRef.current = 0;
    aHistoryRef.current = [];
    recentEventLogRef.current = [];
    freqStateRef.current = createFrequencyState();
    dailyStatusHistoryRef.current = [];
    lastSettledDayRef.current = todayKey();
    setTriggerMirrorMode(false);
    gateStateRef.current = createGateState();
    setSelfAiNotifyQueue([]);
    setCurrentOOTD(null);
    setCurrentMood(null);
    setPlanLayers([]);
    setLayerVisibility({});
    setSecretCourses([]);
    setGalleryPhotos(MOCK_GALLERY_PHOTOS);
    setUserAccount(DEFAULT_USER_ACCOUNT);
  };

  // Permanently purges all user data to zero/empty state (account deletion pipeline).
  // Differs from resetSession: dateCourses/scores/gallery are cleared to [] / 0, not seeded with mocks.
  const purgeAccount = () => {
    setAccuracyBannerVisible(true);
    setMyProfile({ name: '', gender: '', mbti: '', enneagram: '' });
    setPartnerProfile({ name: '', gender: '', mbti: '' });
    setInviteCode('');
    setCoupleId(null);
    setTrainingResult(null);
    setRawKakaoText(null);
    setChatStyleProfile(DEFAULT_CHAT_STYLE_PROFILE);
    setPrivacyLevel(3);
    setDateCourses([]);
    setTriggerAddCourse(false);
    setHasCompletedInterview(false);
    setWeeklyMetrics({ currentScore: 0, prevScore: 0, partnerScore: 0, weeklyMessageCount: 0, avgReplyTimeMin: 0 });
    setPartnerAiMood([]);
    setIsEarlyDatingMode(false);
    setRoomEarlyModeState({});
    setPartnerSensitiveConfig(DEFAULT_PARTNER_SENSITIVE_CONFIG);
    setWeeklyReportData(null);
    setCoupleInfoState({ startedAt: null });
    setUploadedMediaCount(0);
    setSubscriptionStatus(DEFAULT_SUBSCRIPTION_STATUS);
    setPendingGiftCard(null);
    setOneTimeHighlightUnlocked(false);
    scoreHistoryRef.current = [];
    setScoreHistory([]);
    comboRecoveryCountRef.current = 0;
    setComboRecoveryCount(0);
    setMemorySentences([]);
    setLastKakaoSyncTimestamp(null);
    setHighlightCards([]);
    setBaseScore(0);
    setInterviewBonus(0);
    setCurrentScore(0);
    setSLive(0);
    setSTodayOpen(0);
    setOverflowStatus('NONE');
    setOverflowSeverity('NONE');
    setCrisisMemoryActive(false);
    setRapidSwingActive(false);
    aRef.current = 0;
    aHistoryRef.current = [];
    recentEventLogRef.current = [];
    freqStateRef.current = createFrequencyState();
    dailyStatusHistoryRef.current = [];
    lastSettledDayRef.current = todayKey();
    clearMatchEngineState();
    setTriggerMirrorMode(false);
    gateStateRef.current = createGateState();
    setSelfAiNotifyQueue([]);
    setCurrentOOTD(null);
    setCurrentMood(null);
    setPlanLayers([]);
    setLayerVisibility({});
    setSecretCourses([]);
    setGalleryPhotos([]);
    setUserAccount(DEFAULT_USER_ACCOUNT);
  };

  // SRS 보강판 #1 §B.5 — 우아한 해지(Churn): 커플 연결만 끊는다.
  // purgeAccount와 달리 개인 학습 데이터(myProfile/trainingResult/chatStyleProfile 등)와
  // 공유 아카이브(dateCourses/galleryPhotos/memorySentences/highlightCards/scoreHistory)는
  // 즉시 지우지 않고 유예(Grace) 기간 동안 보존한다 — 실제 만료 처리는 서버 스케줄러가
  // requestCoupleUnlinkToServer() 호출 시점을 기준으로 수행(placeholder, TODO 서버 연동).
  const unlinkCouple = () => {
    setCoupleId(null);
    setInviteCode('');
    setPartnerProfile({ name: '', gender: '', mbti: '' });
    setCoupleInfoState({ startedAt: null });
    setRoomEarlyModeState({});
    setPartnerAiMood([]);
    setPartnerSensitiveConfig(DEFAULT_PARTNER_SENSITIVE_CONFIG);
    setWeeklyReportData(null);
    setPendingGiftCard(null);
    setOneTimeHighlightUnlocked(false);
    // 구독은 Couple_ID 단위 엔타이틀먼트이므로 연결 해제 시 개인 상태로 리셋
    setSubscriptionStatus(DEFAULT_SUBSCRIPTION_STATUS);
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
        applyCoupleSubscription,
        giftPremiumToPartner,
        pendingGiftCard,
        setPendingGiftCard,
        oneTimeHighlightUnlocked,
        setOneTimeHighlightUnlocked,
        scoreHistory,
        comboRecoveryCount,
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
        sLive,
        overflowStatus,
        setOverflowStatus,
        overflowSeverity,
        crisisMemoryActive,
        rapidSwingActive,
        processLiveEvent,
        triggerMirrorMode,
        setTriggerMirrorMode,
        evaluateIntervention,
        selfAiNotifyQueue,
        setSelfAiNotifyQueue,
        currentOOTD,
        setCurrentOOTD,
        currentMood,
        setCurrentMood,
        resetSession,
        purgeAccount,
        unlinkCouple,
        planLayers,
        layerVisibility,
        secretCourses,
        addPlanLayer,
        removePlanLayer,
        renamePlanLayer,
        movePlanLayerUp,
        movePlanLayerDown,
        toggleLayerVisible,
        addSecretCourse,
        removeSecretCourse,
        galleryPhotos,
        memoryRings,
        addGalleryPhotos,
        userAccount,
        linkSocialAccount,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useAppContext = () => useContext(AppContext);
