# Twin.me 전수 검수 보고서 — UI 존재 / 엔진 미실시 갭 분석

> 작성일: 2026-06-12
> 대상 브랜치: main (commit fce269f)
> 검수 범위: app/(auth)/, app/(tabs)/, src/components/, src/context/, src/hooks/, src/lib/

---

## 온보딩 플로우

| 화면 / 탭 위치 | UI 요소 및 버튼명 | 구현 현황 | 미실시 사유 및 누락된 구체적 엔진 로직 |
| :--- | :--- | :--- | :--- |
| 스플래시 화면 | DNA 이퀄라이저 + 로고 병합 애니메이션 | ✅ 완료 | — |
| 온보딩 Step 1 (ingestion.tsx) | 이름·성별·MBTI·에니어그램 입력 폼 | ✅ 완료 | — |
| ✅ 온보딩 Step 1 (ingestion.tsx) | 카카오톡 .txt 파일 업로드 기능 | ❌ 미구현 (UI Only) | 파일 선택 UI 자체가 없음. `DocumentPicker` 혹은 `expo-document-picker` 연동, 파일 바이너리 수신 파이프라인 전무. `kakaoParser.ts`의 `parseKakaoExport()` 엔진은 코드가 존재하지만 이 화면에서 단 한 번도 호출되지 않음. |
| ✅ 온보딩 Step 1 | 처리 진행 게이지 바 ("개인정보 보호를 위해 기기 내부에서 상대방 대화 파기 중...") | ❌ 미구현 (UI Only) | 진행률 게이지 컴포넌트 자체가 없음. 파싱 비동기 처리 및 진행 상태 관리 없음. | 
| ✅ 온보딩 Step 1 | 시그니처 드립 카드 팝업 (TOP 3 슬라이드업) | ❌ 미구현 (UI Only) | 파싱 완료 후 카드 팝업을 트리거하는 로직 없음. `parseKakaoExport()`가 반환하는 `topDrips[]`를 화면에 표시하는 코드 없음. |
|  ✅ 온보딩 Step 2 (matching.tsx) | 초대코드 서버 DB 등록 | ❌ 미실시 (UI Only) | `generateCode()`가 클라이언트에서 순수 랜덤 생성만 함. 코드를 서버 DB에 등록하거나 사용자 계정과 묶는 API 호출 없음. |
|✅ 온보딩 Step 2 | 상대방 초대코드 입력 폼 | ❌ 미구현 (UI Only) | 코드 발급 화면만 있고 상대방(B)이 코드를 입력해 매칭을 완료하는 화면 자체가 없음. Couple_ID 생성 및 격리 네트워크 할당 백엔드 로직 전무. |
| ✅온보딩 Step 2 | DNA 자석 결합 애니메이션 + 햅틱 | ❌ 미구현 (UI Only) | 두 나선이 화면 좌우에서 결합되는 그래픽 일러스트와 애니메이션 없음. 매칭 성공 이벤트 자체가 없으므로 트리거 불가. |
| ✅온보딩 Step 2 | 카카오톡 SDK 공유 (카카오 네이티브) | ❌ 미실시 | `Share.share()` (OS 기본 공유 시트)만 사용. 카카오 SDK(`@react-native-kakao/share`) 미연동. |
// 여기까지 모음집에 옮김
---

## 홈 탭 (연애 대시보드)

| 화면 / 탭 위치 | UI 요소 및 버튼명 | 구현 현황 | 미실시 사유 및 누락된 구체적 엔진 로직 |
| :--- | :--- | :--- | :--- |
| 홈 - 정확도 배너 | AI 정확도 수치 | ❌ 미실시 (UI Only) | `AccuracyBanner.tsx:23` `const ACCURACY = 50` 완전 하드코딩. 온보딩 완료 단계(카카오 파일 업로드 %, 인터뷰 완료 여부)를 합산해 실시간으로 계산하는 스코어링 엔진 없음. |
| 홈 - 정확도 배너 | [🎙️ 10분 인터뷰로 95%로 올리기 →] 버튼 | ❌ 미실시 (UI Only) | `handleInterviewPress()`가 배너를 dismiss할 뿐, 전화 수신 풀스크린 UI 전환 없음. Realtime API / STT 세션 개시 로직 전무. 인터뷰 완료 후 성향 매트릭스 점수 합산 없음. |
| 홈 - 추억 링 | 링 데이터 (6개 원형 아이콘) | ❌ 미실시 (UI Only) | `MemoryRingSection.tsx:18` `MEMORY_RINGS` 6개 하드코딩. DB 또는 `dateCourses` 상태에서 동적 로드하는 로직 없음. |
| 홈 - 추억 링 | 링 아이템 터치 → 팝업 (데이트 사진 + OOTD 메타데이터) | ❌ 미구현 (UI Only) | `RingItem`의 `Pressable`에 `onPress` 핸들러 없음. 터치 시 팝업 모달·오버레이 없음. |
| 홈 - 추억 링 | [+ 추가] 버튼 | ❌ 미구현 (UI Only) | `MemoryRingSection.tsx:79` `<Pressable style={styles.ringWrapper}>` — `onPress` 핸들러 없음. 새 추억 링 생성 플로우 없음. |


| 홈 - 오늘의 분위기 | 상대방 AI 실시간 해시태그 칩 | ❌ 미실시 (UI Only) | `MoodTemperatureSection.tsx:13` `MOOD_TAGS` 6개 하드코딩. 상대방 AI가 백그라운드에서 분석한 컨텍스트를 실시간 동기화하는 A2A 통신 파이프라인 없음. |
| 홈 - 온도 카드 | 우리 관계의 온도 (36.5°C) | ❌ 미실시 (UI Only) | `MoodTemperatureSection.tsx:87` `'36.5°C 따뜻함 🌡️'` 하드코딩. 주간 채팅 텍스트 감정 분석 점수(0~100)→온도 변환 연산 엔진 없음. |
| 홈 - 온도 카드 | 온도 변화 문구 (지난주보다 0.5°C 상승) | ❌ 미실시 (UI Only) | `MoodTemperatureSection.tsx:89` `'지난주보다 0.5°C 상승했어요!'` 하드코딩. 이전 주 점수와의 diff 연산 없음. |
| 홈 - 메트릭 그리드 | 채팅 지수 (High, 막대 그래프 72%) | ❌ 미실시 (UI Only) | `MetricsGrid.tsx:18` `{ label: 'High', fill: 0.72, active: true }` 하드코딩. 실제 채팅 메시지 수/빈도/반응 속도 기반 채팅 밀도 연산 없음. |
| 홈 - 메트릭 그리드 | 감정 싱크로율 (82%, 게이지 바) | ❌ 미실시 (UI Only) | `MetricsGrid.tsx:74` `const syncPct = 82` 하드코딩. 쌍방 감정 텍스트 분석 점수 상관관계 연산 없음. |
| 홈 - AI 코칭 카드 | 분석가 트윈이의 한마디 텍스트 | ❌ 미실시 (UI Only) | `AICoachingCard.tsx:24` 하드코딩 고정 문자열. 파트너 현재 상태·최근 채팅 기반 개인화 분석 없음. 갱신 주기나 조건 로직 없음. |

---

## 채팅 탭

| 화면 / 탭 위치 | UI 요소 및 버튼명 | 구현 현황 | 미실시 사유 및 누락된 구체적 엔진 로직 |
| :--- | :--- | :--- | :--- |
| 채팅 목록 헤더 | 연애 초기 모드 토글 스위치 | ❌ 미구현 (UI Only) | `chat.tsx:837~840` 더미 `View` 렌더링. `useState`, `onValueChange` 핸들러 없음. 토글 상태가 AI 응답 프롬프트에 영향을 주는 로직 없음. |
| 커플 채팅방 | 실시간 파트너 메시지 수신 | ❌ 미구현 (UI Only) | WebSocket, Firebase Realtime DB, Supabase Realtime 등 실시간 통신 인프라 전무. 파트너가 보낸 메시지를 수신하는 리스너 없음. |
| 커플 채팅방 | [📷 갤러리] 첨부 버튼 | ❌ 미구현 (UI Only) | `chat.tsx:291` `onPress={() => toast('사진')` — `Alert.alert()` 안내만 표시. `expo-image-picker` 호출 및 파일 업로드 파이프라인 없음. |
| 커플 채팅방 | [🎬 동영상] 첨부 버튼 | ❌ 미구현 (UI Only) | Alert 안내만 표시. 동영상 선택·압축·업로드 파이프라인 없음. |
| 커플 채팅방 | [📍 위치 공유] 버튼 | ❌ 미구현 (UI Only) | `chat.tsx:297` Alert 안내만 표시. `expo-location` API 호출, GPS 좌표 획득, 지도 미니뷰 임베딩 파이프라인 없음. |
| 커플 채팅방 | [🎁 선물] 버튼 | ❌ 미구현 (UI Only) | Alert 안내만 표시. 선물 상품 연동 인터페이스 없음. |
| AI 채팅방 (Self-AI) | LLM 실제 API 응답 | ❌ 미실시 (UI Only) | `chat.tsx:157~163` `mockAIReplyWithWeight()` — 4개 하드코딩 배열에서 `Math.random()` 선택. Claude/GPT Realtime API 비동기 호출 없음. |
| AI 채팅방 | 연애 초기 모드 토글 (채팅방 내) | ❌ 미구현 (UI Only) | `chat.tsx:680~684` 더미 View 렌더링. 동일하게 토글 상태 없음. |
| AI 채팅방 | 민감 주제 경고 (파트너 설정값 기반) | ❌ 미실시 (부분 UI) | `useChatStream.ts:34~47` `SENSITIVE_TOPICS` 3가지 하드코딩. 파트너가 설정 탭에서 직접 지정한 트라우마 키워드 DB 없음. 실제 파트너의 설정값 구독 없음. |
| AI 채팅방 | 말투 교정 후 AI 응답 재생성 | ❌ 미실시 | `chat.tsx:633` `mockAIReplyWithWeight()` 재호출 — 실제 LLM으로 "수정된 어조"를 반영한 재생성이 아닌 또 다른 랜덤 응답. |
| 분석가 트윈이 방 | 주간 리포트 모달 전체 데이터 | ❌ 미실시 (UI Only) | `WeeklyReportModal.tsx:22~39` `MOCK_WEEKLY_REPORT` 전체 하드코딩 (주제 비율, 7일치 감정 점수, 레이더 값, 한줄평). 실제 채팅 데이터 파싱·집계·LLM 분석 파이프라인 없음. |
| 분석가 트윈이 방 | 주간 리포트 자동 발송 스케줄러 | ❌ 미구현 | 매주 일요일 밤 10시 트리거하는 백그라운드 스케줄러/크론 없음. 카카오톡 txt 업로드 완료 시 트리거 로직도 없음. |
| 위기 감지 (Crisis Mode) | AI 매트릭스 연산 (난폭성/방어기제/공감결여) | ❌ 미실시 (부분 UI) | `chat.tsx:62~68` `CRISIS_KEYWORDS` 단순 문자열 `includes()` 검사만 실행. 24시간 대화 데이터 추출, 소통 심리학 모델 기반 다차원 수치 연산, 84% 확률값 실제 계산 없음. |

---

## 히스토리 탭

| 화면 / 탭 위치 | UI 요소 및 버튼명 | 구현 현황 | 미실시 사유 및 누락된 구체적 엔진 로직 |
| :--- | :--- | :--- | :--- |
| 추억 월 (폴라로이드 월) | 폴라로이드 카드 데이터 (7개) | ❌ 미실시 (UI Only) | `history.tsx:45~53` `MEMORIES` 7개 완전 하드코딩. 카카오톡 동기화 시 "가장 다정한 문장" 자동 추출 엔진 없음. 실제 커플 사진 연동 없음 (picsum 플레이스홀더 사용). |
| 추억 월 | 통계 바 (D+365 / 사진 1,248장 / 방문 42곳) | ❌ 미실시 (UI Only) | `history.tsx:410~414` `STATS_DATA` 하드코딩. 실제 DB에서 D-day 계산, 업로드 사진 수 집계, 등록 장소 수 집계 없음. |
| 추억 월 - FAB | 데이트 셔틀 모달 [🗺️ FAB] | ❌ 미실시 (UI Only) | `history.tsx:822~837` `handleFind()`가 `setTimeout(1500ms)` 후 하드코딩된 템플릿 문자열 반환. 실제 LLM API 호출 없음. 날씨·GPS·파트너 선호도 컨텍스트 수집 없음. |
| 지도 뷰 - 코스 추가 | 장소 좌표 자동 입력 (AddCourseSheet) | ❌ 미실시 (UI Only) | `history.tsx:565` `latitude: 37.498 + (Math.random() - 0.5) * 0.06` 강남 기준 랜덤 좌표. 주소 검색 API(카카오 로컬 API) 또는 GPS 연동 없음. |
| 지도 뷰 - 코스 추가 | 파트너 별점·리뷰 (AddCourseSheet) | ❌ 미실시 (UI Only) | `history.tsx:550~554` `mockPartnerRating`, `mockPartnerReview` 랜덤 mock 데이터. 실제 파트너와 데이터 동기화 없음. |
| 지도 뷰 - AI 뮤즈 FAB | AI 데이트 뮤즈 실제 LLM 연동 | ❌ 미실시 (UI Only) | `history.tsx:179~225` `fetchAIDateCourse()` — `SPOT_POOL` 12개 하드코딩 후보지에서 태그 매칭 점수로 정렬. 외부 LLM API 호출 없음. `await new Promise(resolve => setTimeout(resolve, 2400))` 지연 시뮬레이션만 있음. |
| 지도 뷰 - 추천 결과 | 카카오 지도 위 추천 경로 Polyline | ❌ 미구현 | 추천 장소 핀은 지도에 렌더링되나, 장소 간 이동 경로를 잇는 분홍 점선(Polyline) 없음. |
| 지도 뷰 | 날씨 API 연동 (AI 뮤즈 컨텍스트) | ❌ 미구현 | 외부 날씨 API(OpenWeather 등) 호출 없음. 날씨 데이터가 추천 로직에 반영되지 않음. |
| 지도 뷰 | GPS 실시간 현재 위치 (AI 뮤즈 컨텍스트) | ❌ 미구현 | `expo-location` 권한 요청 및 현재 좌표 획득 없음. |
| 히스토리 탭 전체 | DNA 나선 모드 (3D 헬릭스 타워 뷰) | ❌ 미구현 | SRS 명세의 핵심 뷰. 세그먼트 컨트롤에 `'archive'`와 `'map'` 두 탭만 있고 나선형 타임라인 뷰 없음. 3D 회전·카메라 시점 제어·Sentiment Ribbon 모두 미구현. |

---

## 설정 탭

| 화면 / 탭 위치 | UI 요소 및 버튼명 | 구현 현황 | 미실시 사유 및 누락된 구체적 엔진 로직 |
| :--- | :--- | :--- | :--- |
| 설정 - 프로필 헤더 | 이름 표시 ("세준 AI 관리 센터") | ❌ 미실시 (UI Only) | `settings/index.tsx:743` 하드코딩. `useAppContext().myProfile.name` 미사용. |
| 설정 - 프로필 헤더 | 프로필 아바타 사진 | ❌ 미구현 (UI Only) | `🙋‍♂️` 이모지 고정. 실제 프로필 사진 업로드/표시 없음. |
| 설정 - 프라이버시 슬라이더 | privacyLevel 전역 상태 연동 | ✅ 완료 | AppContext.privacyLevel에 저장됨. |
| 설정 - 프라이버시 슬라이더 | privacyLevel 실제 데이터 수집 차단 (백엔드) | ❌ 미실시 (부분 구현) | 슬라이더 값은 `AppContext.privacyLevel`에 저장되고 `chat.tsx`/`history.tsx` 일부 조건분기에 활용되나, 실제 서버사이드 데이터 수집 파이프라인 차단·활성화 API 없음. |
| 설정 - 기억 삭제 지우개 | 기억 항목 목록 (학습 데이터 목록) | ❌ 미실시 (UI Only) | `settings/index.tsx:441~447` `MEMORY_ITEMS` 5개 하드코딩. 실제 벡터 DB에서 학습 항목 조회 없음. |
| 설정 - 기억 삭제 지우개 | [🔥 영구 파기 실행] 버튼 | ❌ 미구현 (UI Only) | 확인 모달 → 파티클 dissolve 애니메이션만 실행. 벡터 DB에서 임베딩 삭제하는 API 호출 없음. |
| 설정 - 구독 플랜 | [구독 시작하기] 버튼 (Coffee Break / Deep Talk Night) | ❌ 미구현 (UI Only) | `settings/index.tsx:607` `Alert.alert('...시뮬레이션 모드')` 표시만. `expo-iap` 혹은 RevenueCat 인앱 결제 연동 없음. |
| 설정 - 구독 플랜 | 결제 후 기능 언락 (주간 리포트 블러 해제, 에이전트 애니메이션 등) | ❌ 미구현 | `setPurchased(true)`로 버튼 텍스트만 변경. 기능 게이팅(블러 해제, 딥챗 세션 활성화 등) 로직 없음. |
| 설정 - 구독 플랜 | 인앱 커스텀 테마 상품 (스킨·배경·폰트) | ❌ 미구현 | UI 자체가 없음. |
| 설정 - 지원 | [도움말 센터] 메뉴 | ❌ 미구현 | `Linking.openURL('https://twin.me/help')` — 실존하지 않는 URL. |
| 설정 - 하단 | [로그아웃] 버튼 | ❌ 미구현 | `settings/index.tsx:997` `// TODO: clear session & navigate to splash` — 세션 초기화 및 스플래시 이동 없음. |
| 설정 - 개인 정보 (personal-info.tsx) | 개인 정보 수정 저장 | ❌ 미실시 (추정) | 라우팅만 연결됨. 실제 `AppContext.setMyProfile()` 연동 및 서버 업데이트 없음. |
| 설정 - 보안 (security.tsx) | 비밀번호 변경 / 2단계 인증 | ❌ 미구현 | 인증 백엔드 없음. |
| 설정 - 내 정보 및 권한 (data-permissions.tsx) | 데이터 다운로드 / 앱 권한 관리 | ❌ 미구현 | 실제 권한 API(카메라·위치·알림) 요청 로직 없음. |

---

## 요약 통계

| 분류 | 완료 | 부분 / 미실시 | 미구현 |
| :--- | :---: | :---: | :---: |
| 온보딩 | 2 | 1 | 5 |
| 홈 탭 | 0 | 0 | 11 |
| 채팅 탭 | 5 | 2 | 6 |
| 히스토리 탭 | 1 | 0 | 9 |
| 설정 탭 | 2 | 1 | 10 |
| **합계** | **10** | **4** | **41** |

---

## 우선순위별 구현 로드맵 (권장)

### P0 — 코어 데이터 파이프라인 (앱의 모든 값이 여기에 의존)
1. `ingestion.tsx` — 카카오톡 `.txt` 파일 업로드 + `kakaoParser.ts` 트리거 연결
2. `AppContext` — `trainingResult` 실제 파싱 결과로 채우기
3. 홈 탭 전체 메트릭 — `trainingResult` 기반 동적 계산 (정확도, 채팅 지수, 싱크로율, 온도)

### P1 — LLM API 연동 (핵심 가치 제안)
1. `chat.tsx` Self-AI 방 — `mockAIReplyWithWeight()` → 실제 Claude API 스트리밍 교체
2. `history.tsx` `fetchAIDateCourse()` — LLM 기반 데이트 코스 추천
3. `WeeklyReportModal` — 실제 채팅 집계 + LLM 분석 데이터 연동

### P2 — 실시간 파트너 동기화
1. 커플 채팅방 실시간 메시지 수신 (Supabase Realtime 또는 Firebase)
2. `MoodTemperatureSection` 파트너 상태 실시간 동기화
3. 파트너 별점/리뷰 동기화 (`AddCourseSheet`)

### P3 — 나머지 미구현 기능
1. `matching.tsx` — 서버 DB 커플 매칭, 상대방 코드 입력 화면
2. `settings/index.tsx` — IAP 연동, 로그아웃, 벡터 DB 삭제 API
3. `AccuracyBanner` — 음성 인터뷰 세션 (STT / Realtime API)
4. 히스토리 탭 DNA 나선 모드 (3D 헬릭스 타워 뷰)
