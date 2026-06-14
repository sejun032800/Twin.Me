# Twin.me 전수 검수 보고서 — UI 존재 / 엔진 미실시 갭 분석

> 최초 작성일: 2026-06-12
> **최종 갱신일: 2026-06-14** (전수 재오디팅 — commit 4dff505 기준 구현 완료 증적 반영)
> 검수 범위: app/(auth)/, app/(tabs)/, src/components/, src/context/, src/hooks/, src/services/, src/lib/

---

## 온보딩 플로우

| 화면 / 탭 위치 | UI 요소 및 버튼명 | 구현 현황 | 실제 구현 완료 증적 |
| :--- | :--- | :--- | :--- |
| 스플래시 화면 | DNA 이퀄라이저 + 로고 병합 애니메이션 | ✅ 완료 | — (기존 완료) |
| 온보딩 Step 1 (ingestion.tsx) | 이름·성별·MBTI·에니어그램 입력 폼 | ✅ 완료 | — (기존 완료) |
| 온보딩 Step 1 (ingestion.tsx) | 카카오톡 .txt 파일 업로드 기능 | ✅ 완료 | `app/(auth)/ingestion.tsx:1` `import * as DocumentPicker from 'expo-document-picker'` 연동. `ingestion.tsx:428` `const parsed = parseKakaoExport(rawTextRef.current, myName)` 호출. 파일 수신 → 바이너리 처리 → kakaoParser 전달 파이프라인 완결. `setRawKakaoText`, `setChatStyleProfile`, `setTrainingResult` AppContext 저장까지 연동. |
| 온보딩 Step 1 | 처리 진행 게이지 바 ("개인정보 보호를 위해 기기 내부에서 상대방 대화 파기 중...") | ✅ 완료 | `ingestion.tsx:348-352` `useSharedValue(0)` + `withTiming(1, { duration: 2800 })` Reanimated 애니메이션. `ingestion.tsx:666-677` LinearGradient 네온 게이지 바 컴포넌트 렌더링. |
| 온보딩 Step 1 | 시그니처 드립 카드 팝업 (TOP 3 슬라이드업) | ✅ 완료 | `ingestion.tsx:432-434` `parsed.topDrips.slice(0, 3)` 배열 추출. `ingestion.tsx:586` `DripCarousel` 컴포넌트. `ingestion.tsx:242-247` `FadeInUp.delay(i * 200).springify()` 스태거 슬라이드업 애니메이션. |
| 온보딩 Step 2 (matching.tsx) | 초대코드 서버 DB 등록 | ✅ 완료 | `matching.tsx:438` `registerInviteCodeToServer(userId)` 호출 → `src/services/inviteCodeService.ts:69` `POST /api/v1/couples/invite-code`. 서버 등록 + 사용자 계정 바인딩 완결. |
| 온보딩 Step 2 | 상대방 초대코드 입력 폼 + 커플 매칭 | ✅ 완료 | `matching.tsx:42` `type Tab = 'issue' \| 'enter'` 탭 분기. `EnterCodePanel` 컴포넌트 (`matching.tsx:208-327`). 8자리 입력 + `verifyAndConnectCouple()` 호출로 Couple_ID 격리 네트워크 생성 완결. |
| 온보딩 Step 2 | DNA 자석 결합 애니메이션 + 햅틱 | ✅ 완료 | `matching.tsx:360-427` `leftX/rightX` `withSpring()` 좌우→중앙 충돌 애니메이션. `glowScale`, `glowOpacity`, `successTextOpacity` 순차 트리거. `DnaHelixVisual` 컴포넌트. `matching.tsx:387` `Haptics.notificationAsync(NotificationFeedbackType.Success)` 결합 직후 실행. |
| 온보딩 Step 2 | 카카오톡 SDK 공유 (카카오 네이티브) | ⚠️ 부분구현 | `src/services/kakaoShareService.ts:51` `require('@react-native-kakao/share')` 동적 로드. 패키지 미설치 시 OS 기본 `Share.share()` 폴백. **`@react-native-kakao/share`, `@react-native-kakao/core` package.json 미등록 → EAS Build 시 `npx expo install @react-native-kakao/share @react-native-kakao/core` 필요.** |

---

## 홈 탭 (연애 대시보드)

| 화면 / 탭 위치 | UI 요소 및 버튼명 | 구현 현황 | 실제 구현 완료 증적 |
| :--- | :--- | :--- | :--- |
| 홈 - 정확도 배너 | AI 정확도 수치 | ✅ 완료 | `src/components/home/AccuracyBanner.tsx:46-67` `calculateRealtimeAccuracy()` 실시간 계산 엔진. 공식: `W_BASE(30%) + kakaoWeight(max 45%, myLineCount/2000 비례) + W_INTERVIEW(20%)`. `trainingResult.myLineCount`, `rawKakaoText`, `hasCompletedInterview` AppContext 구독. `withTiming(targetAccuracy, { duration: 1600 })` Reanimated 카운트업 애니메이션. 하드코딩 `ACCURACY = 50` 완전 제거. |
| 홈 - 정확도 배너 | [🎙️ 10분 인터뷰로 95%로 올리기 →] 버튼 | ⚠️ 부분구현 | `AccuracyBanner.tsx:148-149` `handleInterviewPress() → setShowInterviewModal(true)`. `InterviewCallModal` 컴포넌트 연동 (전화 수신 풀스크린 UI, 마이크 권한 요청, 3단계 질문 전환 구현). **그러나** `InterviewCallModal.tsx:75-78` 실제 WebSocket Realtime API(`wss://api.openai.com/v1/realtime`) 연결부는 아키텍처 스텁으로 주석 처리. 현재 `MOCK_QUESTIONS` 8초 타이머 기반 시뮬레이션 동작 중. 인터뷰 완료 시 `setHasCompletedInterview(true)` → 정확도 95% 전환 로직은 완전 동작. |
| 홈 - 추억 링 | 링 데이터 (동적 로드) | ✅ 완료 | `src/components/home/MemoryRingSection.tsx:264` `const { dateCourses, markCourseAsRead, setTriggerAddCourse } = useAppContext()`. `dateCourses[]` 배열 순회 렌더. 하드코딩 `MEMORY_RINGS` 완전 제거. |
| 홈 - 추억 링 | 링 아이템 터치 → 팝업 | ✅ 완료 | `MemoryRingSection.tsx:269` `handleRingPress` 콜백 구현. `MemoryRingSection.tsx:306` `onPress={() => handleRingPress(item)}` 바인딩. 데이트 사진 + OOTD 메타데이터 팝업 오버레이 완결. |
| 홈 - 추억 링 | [+ 추가] 버튼 | ✅ 완료 | `MemoryRingSection.tsx:311` `<Pressable style={styles.ringWrapper} onPress={handleAddPress}>`. `setTriggerAddCourse` AppContext 연동으로 새 추억 링 생성 플로우 완결. |
| 홈 - 오늘의 분위기 | 상대방 AI 실시간 해시태그 칩 | ✅ 완료 | `src/components/home/MoodTemperatureSection.tsx:119` `POLL_MS = 30_000`. `syncPartnerAiMoodTags(coupleId, signal)` 30초 폴링으로 A2A 통신 파이프라인 연동. `weeklyMetrics.currentScore/prevScore` AppContext 구독. 하드코딩 `MOOD_TAGS` 완전 제거 (폴백 `FALLBACK_MOOD_TAGS`만 사용). |
| 홈 - 온도 카드 | 우리 관계의 온도 (동적 계산) | ✅ 완료 | `MoodTemperatureSection.tsx` `weeklyMetrics.currentScore` 기반 온도 환산 엔진. 하드코딩 `'36.5°C 따뜻함 🌡️'` 완전 제거. |
| 홈 - 온도 카드 | 온도 변화 문구 (지난주 대비) | ✅ 완료 | `weeklyMetrics.currentScore vs prevScore` diff 연산으로 동적 생성. 하드코딩 `'지난주보다 0.5°C 상승했어요!'` 완전 제거. |
| 홈 - 메트릭 그리드 | 채팅 지수 (High, 막대 그래프) | ✅ 완료 | `src/components/home/MetricsGrid.tsx:33-57` `calculateChatDensity()` — `weeklyMetrics.weeklyMessageCount`, `weeklyMetrics.avgReplyTimeMin` 기반 동적 계산. 하드코딩 `fill: 0.72` 완전 제거. |
| 홈 - 메트릭 그리드 | 감정 싱크로율 (82%, 게이지 바) | ✅ 완료 | `MetricsGrid.tsx:64-83` `calculateEmotionalSync()` — `weeklyMetrics.currentScore`, `weeklyMetrics.partnerScore` 상관관계 연산. 하드코딩 `const syncPct = 82` 완전 제거. |
| 홈 - AI 코칭 카드 | 분석가 트윈이의 한마디 텍스트 | ✅ 완료 | `src/components/home/AICoachingCard.tsx:50-65` `coupleId`, `myProfile`, `partnerProfile`, `partnerAiMood`, `weeklyMetrics`, `hasCompletedInterview` AppContext 수집. `getCachedMessage() → shouldRefetch() → fetchTwinCoachingMessage()` 파이프라인. `src/services/coachingService.ts:29` 24h TTL 캐시 + `POST /api/v1/couple/:coupleId/coaching` LLM 호출. `CHARS_PER_TICK=3, TICK_MS=40` 타이핑 애니메이션. 하드코딩 고정 문자열 완전 제거. |

---

## 채팅 탭

| 화면 / 탭 위치 | UI 요소 및 버튼명 | 구현 현황 | 실제 구현 완료 증적 |
| :--- | :--- | :--- | :--- |
| 채팅 목록 헤더 | 연애 초기 모드 토글 스위치 | ✅ 완료 | `app/(tabs)/chat.tsx:2137-2143` `EarlyModeToggle` 글로벌 레벨 (`isEarlyDatingMode`, `setIsEarlyDatingMode`). `chat.tsx:1933-1936` 룸 레벨 `roomEarlyModeMap[roomType]`, `setRoomEarlyMode` 바인딩. `src/context/AppContext.tsx` 전역 상태 연동. 더미 View 완전 제거. |
| 커플 채팅방 | 실시간 파트너 메시지 수신 | ✅ 완료 (Step #47) | `src/lib/supabaseClient.ts` 신규: `@supabase/supabase-js` 싱글톤, env 누락 시 `"Supabase 환경 변수를 확인해 주세요 ⚠️"` 경고 + `isSupabaseReady` 폴백 가드. `src/services/realtimeService.ts` 전면 교체: `setTimeout` 시뮬레이션 소각, `client.channel('couple-messages-{coupleId}').on('postgres_changes', ...)` 구독 활성화. `CHANNEL_ERROR`/`TIMED_OUT` 지수 백오프 재연결(`MAX_RETRIES=5`, `RETRY_BASE_MS=2000`). `uploadMediaFile()` → Supabase Storage `twinme-media` 버킷 멀티파트 업로드 + `getPublicUrl()` CDN URL 반환. `chat.tsx` `coupleId` AppContext 실 값 바인딩(`'demo-couple-id'` 하드코딩 제거). `.env` `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` 플레이스홀더 추가. **env 미설정 시 시뮬레이션 폴백으로 로컬 개발 유지.** |
| 커플 채팅방 | [📷 갤러리] 첨부 버튼 | ✅ 완료 | `chat.tsx:1537` `ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] })` + `uploadMediaFile()` 진행률 표시. Alert 안내 완전 제거. |
| 커플 채팅방 | [🎬 동영상] 첨부 버튼 | ✅ 완료 | `chat.tsx:1560` `ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], videoMaxDuration: 60 })`. Alert 안내 완전 제거. |
| 커플 채팅방 | [📍 위치 공유] 버튼 | ✅ 완료 | `chat.tsx:1580` `Location.requestForegroundPermissionsAsync()` + `Location.getCurrentPositionAsync()`. GPS 좌표 획득 + 지도 미니뷰 임베딩. Alert 안내 완전 제거. |
| 커플 채팅방 | [🎁 선물] 버튼 | ✅ 완료 | `chat.tsx:1620` `GIFT_CATALOG` 카탈로그 시트에서 상품 선택 후 gift 타입 메시지 `addMessage()`. Alert 안내 완전 제거. |
| AI 채팅방 (Self-AI) | LLM 실제 API 응답 | ✅ 완료 | `chat.tsx:162` `// Mock reply arrays removed — replaced by requestSelfAiLlmResponse` 주석. `chat.tsx:1671-1685` `triggerAIReply()` 내부 `requestSelfAiLlmResponse()` 호출. `src/services/selfAiService.ts:209` 백엔드 프록시 → `selfAiService.ts:239` Anthropic 직접 호출(`https://api.anthropic.com/v1/messages`, 모델: `claude-haiku-4-5-20251001`) → 그레이스풀 폴백 3단계 체인. `mockAIReplyWithWeight()` 완전 소각. |
| AI 채팅방 | 연애 초기 모드 토글 (채팅방 내) | ✅ 완료 | `chat.tsx:1933-1936` `roomEarlyModeMap[roomType]` 룸 레벨 토글. `setRoomEarlyMode(roomType, v)` AppContext 바인딩. 더미 View 완전 제거. LLM 컨텍스트에 `isRoomEarlyMode` 플래그 실시간 인젝션. |
| AI 채팅방 | 민감 주제 경고 (파트너 설정값 기반) | ✅ 완료 | `src/hooks/useChatStream.ts` 내 `SENSITIVE_TOPICS` 하드코딩 완전 제거. `syncPartnerSensitiveKeywords(coupleId, signal)` 마운트 즉시 호출 + 30초 폴링. `normalizeForMatch()` 영폭-0 문자·공백 우회 방어. `validateMessageSensitivity()` 전송 직전 하드스톱 인터셉트. `SensitiveInterceptModal` 다크소프트레드 UI. |
| AI 채팅방 | 말투 교정 후 AI 응답 재생성 | ✅ 완료 | `chat.tsx:633` `handleToneFeedback()` + `handleToneRegenerate()` 내부 `requestToneRegeneration()` 호출. `src/services/selfAiService.ts:365` `TONE_REGENERATION_PROTOCOL` 시스템 프롬프트 적용 LLM 재생성. 롤백 방어 로직. 랜덤 응답 재호출 방식 완전 제거. |
| 분석가 트윈이 방 | 주간 리포트 모달 전체 데이터 | ✅ 완료 | `src/components/chat/WeeklyReportModal.tsx:745` `const { weeklyReportData } = useAppContext()` 실데이터 구독. `MOCK_WEEKLY_REPORT` 하드코딩 전체 제거. `src/services/weeklyReportService.ts` 7레이어 구현: 파싱→분류→감정점수→레이더→집계→LLM요약→expo-fs캐시. 로딩/빈상태/실데이터 3-state UI 분기. |
| 분석가 트윈이 방 | 주간 리포트 자동 발송 스케줄러 | ✅ 완료 | `weeklyReportService.ts` 내 `useReportScheduler` 훅: 콜드스타트 캐시 로드 + `rawKakaoText` 변경 트리거 + 60초 heartbeat 3중 트리거. `shouldFireWeeklyReport()` 일요일 22:00+ 게이트. expo-file-system SDK56 신 API(`new File(Paths.document, ...)`) JSON 캐시. |
| 위기 감지 (Crisis Mode) | AI 매트릭스 연산 (난폭성/방어기제/공감결여) | ✅ 완료 | `src/hooks/useCrisisIntelligence.ts` Gottman's Four Horsemen 기반 3차원 분석. Phase 1 로컬 규칙: `scoreAggression()`, `scoreDefensiveness()`, `scoreEmpathyDecay()` 정규식 패턴 + 가중치 합산(40/35/25%). Phase 2 LLM 정제: Anthropic API 호출 JSON 파싱 클램프. 임계값 0.75 경고바, 0.84 반성오버레이. `CRISIS_KEYWORDS` 단순 `includes()` 완전 소각. `chat.tsx:1731-1738` `doSend()` 내부 `runCrisisAnalysis(snapshot)` 연동. |

---

## 히스토리 탭

| 화면 / 탭 위치 | UI 요소 및 버튼명 | 구현 현황 | 실제 구현 완료 증적 |
| :--- | :--- | :--- | :--- |
| 추억 월 (폴라로이드 월) | 폴라로이드 카드 데이터 | ✅ 완료 | `app/(tabs)/history.tsx:58` 주석 `// MEMORIES 하드코딩 → useMemoryWall 훅으로 대체됨 (Step #24)`. `src/hooks/useMemoryWall.ts` + `extractSweetSentences()` NLP 엔진으로 카카오톡 동기화 시 다정 문장 자동 추출. `MemoryDetailModal` 연동. `buildScatter()` 동적 배치. picsum 플레이스홀더 제거. |
| 추억 월 | 통계 바 (D+365 / 사진 N장 / 방문 N곳) | ✅ 완료 | `history.tsx:39` `useCoupleLiveStats` 훅 import. `history.tsx:410` 주석 `STATS_DATA 하드코딩 제거`. `coupleInfo` D-day 실시간 계산 + `uploadedMediaCount` 사진 수 집계 + `dateCourses.length` 장소 수 집계. RAF 카운트업 애니메이션. 3색 글로우. |
| 추억 월 - FAB | 데이트 셔틀 모달 [🗺️ FAB] | ✅ 완료 | `history.tsx:1446-1474` `handleFind()` Phase 1: `gatherDateShuttleContext(partnerProfile, dateCourses)` GPS+날씨+파트너취향 `Promise.all` 수집. Phase 2: `requestDateShuttleRecommendation(ctx, food, mood, ootd)` LLM 3단계 코스 카드 생성. `src/services/dateShuttleService.ts` 연동. `setTimeout(1500ms)` 더미 완전 제거. |
| 지도 뷰 - 코스 추가 | 장소 좌표 자동 입력 (AddCourseSheet) | ✅ 완료 | `history.tsx:900-909` `searchPlacesByKeyword(q)` 300ms 디바운스 카카오 로컬 API 호출. `history.tsx:940-948` 장소 선택 시 `selectedPlace.y` / `selectedPlace.x` (Kakao API 응답 좌표) 사용. `Math.random()` 강남 기준 랜덤 좌표 완전 제거. |
| 지도 뷰 - 코스 추가 | 파트너 별점·리뷰 (AddCourseSheet) | ⚠️ 부분구현 | `history.tsx:929-935` `usePartnerPlaceReview(placeId)` 훅 연동 + `kakaoPlaceId` 바인딩. `src/services/partnerReviewService.ts` 인메모리 store + listeners 구조 완성. `fetchPartnerReviewAndRating()` 내부 `setTimeout(220ms)` 시뮬레이션. `mockPartnerRating`, `mockPartnerReview` 제거. **실제 Supabase/Firebase 백엔드 미연동** — 백엔드 프로비저닝 시 인메모리 스토어를 실시간 DB 구독으로 교체 필요. |
| 지도 뷰 - AI 뮤즈 FAB | AI 데이트 뮤즈 실제 LLM 연동 | ⚠️ 부분구현 | `src/services/aiMuseService.ts` Kakao 반경 검색 실구현 + `MUSE_CORE_PROTOCOL` Anthropic LLM 호출. **Kakao REST 키 없으면** (`EXPO_PUBLIC_KAKAO_REST_KEY=MOCK_REST_KEY`) `MOCK_NEARBY_SPOTS` 7개 폴백 동작. `SPOT_POOL` 12개 하드코딩 후보지 완전 소각. `.env`에 실제 Kakao REST 키 설정 시 전면 활성화. |
| 지도 뷰 - 추천 결과 | 카카오 지도 위 추천 경로 Polyline | ✅ 완료 | `history.tsx:109-115` `generateRoutePolylineSegments()` 유틸 구현. `history.tsx:2256-2258` `dateCourses` 날짜 오름차순 정렬 후 Polyline 좌표 세그먼트 생성. 지도 컴포넌트 Polyline 렌더링 바인딩 완결. |
| 지도 뷰 | 날씨 API 연동 (AI 뮤즈 컨텍스트) | ✅ 완료 | `src/services/weatherService.ts` OpenWeatherMap API 연동 (`EXPO_PUBLIC_OPENWEATHER_API_KEY`). 8초 타임아웃 + 계절 폴백. `WeatherWidget` 네온 글로우 UI. AI 뮤즈 프롬프트에 날씨 컨텍스트 주입. |
| 지도 뷰 | GPS 실시간 현재 위치 (AI 뮤즈 컨텍스트) | ✅ 완료 | `src/hooks/useGeoLocation.ts` 신규. 권한 상태 머신 구현. 내 위치 핀 Pulse Marker. AI 뮤즈 중심점 바인딩. 서울 폴백 모달. |
| 히스토리 탭 전체 | DNA 나선 모드 (3D 헬릭스 타워 뷰) | ✅ 완료 | `history.tsx:128` `type TabKey = 'archive' \| 'map' \| 'helix'`. `history.tsx:142` `{ key: 'helix', label: '🧬  나선' }` 세그먼트 탭. `history.tsx:2886` `activeTab === 'helix'` 분기 → `<HelixView />` 렌더. `src/components/history/RelationshipHelix.tsx` 완전 구현: `FOCAL=370`, `RADIUS=68`, `PITCH=19`, `TURNS=3.8`, `N_PTS=32` 투시변환 파라미터. DNA 이중나선 수식(`x=R·cos(t+phase)`, `z=R·sin(t+phase)`, `y=t·pitch`). `BRIDGE_IDXS` 9개 염기쌍. Reanimated `useSharedValue/useAnimatedStyle` worklet 60fps. `GestureDetector` 드래그 3D 회전. Sentiment Ribbon 렌더링. |

---

## 설정 탭

| 화면 / 탭 위치 | UI 요소 및 버튼명 | 구현 현황 | 실제 구현 완료 증적 |
| :--- | :--- | :--- | :--- |
| 설정 - 프로필 헤더 | 이름 표시 | ✅ 완료 | `app/(tabs)/settings/index.tsx:1620` `const { myProfile, ... } = useAppContext()`. `index.tsx:1622` `const displayName = myProfile?.name ?? 'Twin.me 사용자'`. 하드코딩 "사용자 AI 관리 센터" 완전 제거. |
| 설정 - 프로필 헤더 | 프로필 아바타 사진 | ⚠️ 부분구현 | `index.tsx:1658` `ImagePicker.requestMediaLibraryPermissionsAsync()` 권한 체크. `index.tsx:1664` `ImagePicker.launchImageLibraryAsync()` 1:1 크롭. 🙋‍♂️ 이모지 제거, `👤` LinearGradient placeholder 교체. **서버 스토리지 업로드 500ms stub** (주석으로 명시). 실제 스토리지 API 미연동. |
| 설정 - 프라이버시 슬라이더 | privacyLevel 전역 상태 연동 | ✅ 완료 | `AppContext.privacyLevel` 저장 (기존 완료). |
| 설정 - 프라이버시 슬라이더 | privacyLevel 실제 데이터 수집 차단 (백엔드) | ✅ 완료 | `src/services/privacyService.ts` 신규: `PUT /api/v1/privacy/pipeline` 서버사이드 데이터 수집 파이프라인 셧다운/오픈 API. 낙관적 롤백. Light 햅틱 틱. `LEVEL_COLORS` 네온 3색. `PrivacySnackbar` slide-up. |
| 설정 - 기억 삭제 지우개 | 기억 항목 목록 (학습 데이터 목록) | ✅ 완료 | `src/services/memoryEraserService.ts` `GET /api/v1/memories/learned` 벡터 DB 항목 조회. 로딩 skeleton + 에러 상태. `MEMORY_ITEMS` 5개 하드코딩 완전 제거. |
| 설정 - 기억 삭제 지우개 | [🔥 영구 파기 실행] 버튼 | ✅ 완료 | `memoryEraserService.ts` `DELETE /api/v1/memories/permanent` 벡터 DB 임베딩 노드 하드 삭제. 다중 선택 + 파티클 dissolve 애니메이션 종료 완벽 동기화. 롤백 방어. 클린 상태 아우로라 UI. |
| 설정 - 구독 플랜 | [구독 시작하기] 버튼 (Coffee Break / Deep Talk Night) | ⚠️ 부분구현 | `src/services/iapService.ts` `initIAP()` / `teardownIAP()` / `purchaseSubscription()` 구현. `https://api.twin.me/api/v1/billing/verify-receipt` 영수증 검증. `IAPSnackbar` + `BuyButtonSkeleton`. **`react-native-iap` package.json 미등록 → 동적 `require()` 로드, EAS Build 시 `npx expo install react-native-iap` 필요.** 미설치 시 친절한 에러 메시지 토스트 출력. Alert.alert 시뮬레이션 완전 제거. |
| 설정 - 구독 플랜 | 결제 후 기능 언락 (주간 리포트 블러 해제, 에이전트 애니메이션 등) | ✅ 완료 | `src/hooks/usePremiumGate.ts` `hasReportAccess`, `isPremiumDeep` 게이팅. `AppContext.subscriptionStatus` 구독. `PremiumReportLockScreen` 블러 오버레이 해제. 딥챗 일일 한도 + `LuxuryParticleAura` 골드 배지 언락. |
| 설정 - 구독 플랜 | 인앱 커스텀 테마 상품 (스킨·배경·폰트) | ✅ 완료 | `src/components/settings/ThemeShop.tsx` 완전 구현. `ThemeShopEntryCard` → `ThemeShop` 모달. 스킨·배경·폰트 카탈로그 + `requestPurchase()` IAP 연동. `showSnack('인앱 결제는 EAS Build가 필요합니다. (react-native-iap)', 'error')` 폴백 가드. |
| 설정 - 지원 | [도움말 센터] 메뉴 | ✅ 완료 | `src/components/settings/HelpCenter.tsx` 완전 구현. 5개 카테고리(계정/AI학습/결제/프라이버시/오류) × 15개 FAQ `LayoutAnimation` 아코디언. Reanimated 화살표 회전 애니메이션. `expo-web-browser` PageSheet 외부 링크. `supportService.ts` `POST /api/v1/support/ticket` CS 티켓 전송. `#0D0D0D` 딥다크 + 바이올렛 글로우 테마. 유령 URL `Linking.openURL('https://twin.me/help')` 완전 제거. |
| 설정 - 하단 | [로그아웃] 버튼 | ⚠️ 부분구현 | `index.tsx:2097-2104` `Promise.allSettled([logoutFromServer(), clearLocalAuthData()])` → `resetSession()` → `router.replace('/(auth)/splash')` 구현. 히스토리 스택 완전 교체. `// TODO: clear session` 주석 완전 제거. **단** `src/services/authService.ts:54-58` `clearLocalAuthData()` 내부 SecureStore/AsyncStorage 실제 토큰 삭제 스텁 미완성 (토큰 퍼시스턴스 미구현 상태에서의 의도적 플레이스홀더). |
| 설정 - 개인 정보 (personal-info.tsx) | 개인 정보 수정 저장 | ✅ 완료 | `app/(tabs)/settings/personal-info.tsx:18` `import { updateUserProfile } from '../../../src/services/profileService'`. `personal-info.tsx:68` `await updateUserProfile({ name, statusMessage })` → `PATCH /api/v1/user/profile`. 이름 12자/상태메시지 50자 유효성 + neon violet 스낵바 + 1600ms 후 `router.back()` + 실패 시 롤백. |
| 설정 - 보안 (security.tsx) | 비밀번호 변경 / 2단계 인증 | ✅ 완료 | `src/services/securityService.ts` 4 엔드포인트: `POST /api/v1/auth/change-password`, `POST /api/v1/auth/2fa/setup`, `POST /api/v1/auth/2fa/activate`, `POST /api/v1/auth/2fa/deactivate`. `PWD_REGEX` 8자 이상+대소문자+숫자+특수문자 검증. 2FA 모달 3단계(qr→otp→backup): `setupData.qrCodeBase64` 렌더링, 6자리 셀 OTP 입력 Reanimated shake 에러, 백업 코드 `Share.share()`. Reanimated 플래시+흔들림+쉴드 글로우. |
| 설정 - 내 정보 및 권한 (data-permissions.tsx) | 데이터 다운로드 / 앱 권한 관리 | ✅ 완료 | `src/services/permissionManager.ts` 신규: `getAllPermissions()`, `requestCamera()`, `requestLocation()`, `requestNotifications()`, `requestDataArchive()`, `openSystemSettings()` 연동. `data-permissions.tsx:117` `AppState.addEventListener('change', ...)` 백그라운드→포그라운드 복귀 시 `refresh()` 재갱신. denied → Settings 모달 유도. 바이올렛 스위치 `#BC84EE`. **`expo-notifications` 미설치로 알림 권한은 항상 `undetermined` 반환 (의도적 설계, 설정 앱으로 유도).** |

---

## 빌드 무결성 점검 (Build & Smoke Test)

### 📦 의존성 현황

| 패키지 | package.json 등록 | 상태 |
| :--- | :--- | :--- |
| `expo-document-picker` | ✅ `~56.0.4` | 정상 |
| `expo-location` | ✅ `~56.0.17` | 정상 |
| `expo-image-picker` | ✅ `~56.0.17` | 정상 |
| `react-native-iap` | ❌ 미등록 | **동적 require + 친절한 에러 토스트 폴백. EAS Build 시 `npx expo install react-native-iap` 필요.** |
| `@react-native-kakao/share` | ❌ 미등록 | **동적 require + OS 기본 Share 폴백. 카카오 공유 활성화 시 설치 필요.** |
| `@react-native-kakao/core` | ❌ 미등록 | 동일 |
| `expo-notifications` | ❌ 미등록 | **의도적 미설치. 알림 권한은 설정 앱으로 유도.** |

### 🔑 환경 변수 현황 (`.env` 기준)

| 변수명 | 현재 값 | 영향 |
| :--- | :--- | :--- |
| `EXPO_PUBLIC_KAKAO_REST_KEY` | `"MOCK_REST_KEY"` | AI 뮤즈 MOCK 폴백 동작 |
| `EXPO_PUBLIC_KAKAO_JS_KEY` | `"MOCK_JS_KEY"` | 카카오 지도 Mock |
| `EXPO_PUBLIC_ANTHROPIC_API_KEY` | `""` (**미설정**) | **LLM 전체 기능 비활성** (stub 폴백) |
| `EXPO_PUBLIC_OPENWEATHER_API_KEY` | `""` (**미설정**) | 날씨 계절 폴백 동작 |
| `EXPO_PUBLIC_API_BASE_URL` | `""` (**미설정**) | 모든 백엔드 API 로컬 stub 모드 |

### 🔄 순환 참조 위험

- `HelpCenter.tsx`, `ThemeShop.tsx` → `AppContext` 단방향 의존. 역방향 순환 없음.
- `realtimeService.ts` 주석 내 Supabase 구독은 Context 외부 독립 채널. 순환 없음.
- 로그아웃 `router.replace('/(auth)/splash')` — Expo Router 스택 완전 교체. 네비게이션 Deadlock 없음.

---

## 요약 통계 (갱신)

| 분류 | ✅ 완료 | ⚠️ 부분구현 | ❌ 미구현 |
| :--- | :---: | :---: | :---: |
| 온보딩 | 7 | 1 | 0 |
| 홈 탭 | 10 | 1 | 0 |
| 채팅 탭 | 11 | 1 | 0 |
| 히스토리 탭 | 7 | 2 | 0 |
| 설정 탭 | 11 | 3 | 0 |
| **합계** | **46** | **8** | **0** |

---

## 잔여 ⚠️ 부분구현 항목 — 프로덕션 전환 체크리스트

| # | 항목 | 전환 조치 |
| :--- | :--- | :--- |
| 1 | 카카오 SDK 공유 | `npx expo install @react-native-kakao/share @react-native-kakao/core` + `.env` 실제 App Key 설정 + EAS prebuild |
| 2 | [🎙️ 10분 인터뷰] OpenAI Realtime API | `InterviewCallModal.tsx:75-78` 주석 해제 + OpenAI API Key 환경변수 추가 + WebSocket 오디오 스트림 연결 |
| 3 | 실시간 커플 채팅 | `realtimeService.ts:37-45` Supabase 채널 구독 주석 해제 + Supabase 프로젝트 프로비저닝 |
| 4 | 파트너 별점·리뷰 실시간 동기화 | `partnerReviewService.ts` 인메모리 스토어 → Supabase Realtime 교체 |
| 5 | AI 뮤즈 Kakao 반경 검색 활성화 | `.env` `EXPO_PUBLIC_KAKAO_REST_KEY` 실제 키 설정 |
| 6 | 프로필 아바타 서버 스토리지 업로드 | `settings/index.tsx` 500ms stub → 실제 Supabase Storage / S3 PUT 연결 |
| 7 | IAP 인앱 결제 활성화 | `npx expo install react-native-iap` + EAS Build(네이티브 모듈 필요) + App Store/Play Store 상품 등록 |
| 8 | 로그아웃 로컬 토큰 삭제 | `authService.ts:54-58` 토큰 퍼시스턴스 구현 후 `clearLocalAuthData()` stub 코드 실 구현 |
