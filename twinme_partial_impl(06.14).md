# Twin.me 부분구현 항목 집중 관리 시트

> 작성일: 2026-06-14
> 출처: `twinme_gap_analysis(06.12).md` 전수 재오디팅 결과
> 대상: ⚠️ 부분구현 상태인 8개 항목 — 프로덕션 전환 전 해소 필요

---

## 1. 카카오 SDK 공유 (온보딩 Step 2)

| 항목 | 내용 |
| :--- | :--- |
| **위치** | `app/(auth)/matching.tsx` → `src/services/kakaoShareService.ts` |
| **현재 동작** | `kakaoShareService.ts:51` `require('@react-native-kakao/share')` 동적 로드. 패키지 미설치 시 OS 기본 `Share.share()` 폴백 자동 실행. |
| **미완성 이유** | `@react-native-kakao/share`, `@react-native-kakao/core` 두 패키지가 `package.json` 미등록. 네이티브 모듈이므로 Expo Go에서 실행 불가, EAS Build 필요. |
| **전환 조치** | 1. `npx expo install @react-native-kakao/share @react-native-kakao/core` <br> 2. `.env` `EXPO_PUBLIC_KAKAO_APP_KEY` 실제 값 설정 <br> 3. `eas build` 로 네이티브 모듈 포함 빌드 |

---

## 2. [🎙️ 10분 인터뷰] OpenAI Realtime API (홈 탭)

| 항목 | 내용 |
| :--- | :--- |
| **위치** | `src/components/home/InterviewCallModal.tsx:75-98` |
| **현재 동작** | 전화 수신 풀스크린 UI, 마이크 권한 요청, 3단계 질문 전환 — 모두 완성. `startAiVoiceInterviewSession()` 함수가 `MOCK_QUESTIONS` 8초 타이머 기반으로 시뮬레이션 동작. 인터뷰 완료 시 `setHasCompletedInterview(true)` → 정확도 95% 전환까지 연결됨. |
| **미완성 이유** | `InterviewCallModal.tsx:75-78` WebSocket 실제 연결부 주석: <br>`// const ws = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17');` <br> 오디오 스트림 in/out 파이프라인 미작성. |
| **전환 조치** | 1. OpenAI API Key 발급 후 환경변수 추가 (`EXPO_PUBLIC_OPENAI_API_KEY`) <br> 2. `startAiVoiceInterviewSession()` 함수 본문을 WebSocket 연결 + `session.create` 이벤트 전송 + 오디오 델타 스트림 수신으로 교체 <br> 3. `expo-av` 또는 `react-native-audio-recorder-player` 로 마이크 입력 캡처 연결 |

---

## 3. ✅ 실시간 커플 채팅 메시지 수신 (채팅 탭) — Step #47 완료

| 항목 | 내용 |
| :--- | :--- |
| **완료일** | 2026-06-14 |
| **구현 증적** | `src/lib/supabaseClient.ts` 신규 (env 가드 + 싱글톤). `realtimeService.ts` 전면 교체: `setTimeout` 시뮬레이션 소각, `postgres_changes` Realtime 구독 활성화, 지수 백오프 재연결(MAX_RETRIES=5), Supabase Storage `twinme-media` 버킷 업로드 + CDN URL 반환. `chat.tsx` AppContext `coupleId` 실값 바인딩. |
| **잔여 선결 조건** | `.env` `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` 실 값 설정 + Supabase 프로젝트 내 `messages` 테이블 + `twinme-media` 버킷 생성 (DDL은 `realtimeService.ts` 상단 주석 참고). env 미설정 시 자동 시뮬레이션 폴백 유지. |

---

## 4. 파트너 별점·리뷰 실시간 동기화 (히스토리 탭)

| 항목 | 내용 |
| :--- | :--- |
| **위치** | `src/services/partnerReviewService.ts`, `src/hooks/usePartnerPlaceReview.ts` |
| **현재 동작** | `fetchPartnerReviewAndRating()` 내부 `setTimeout(220ms)` 시뮬레이션. 인메모리 store + listeners 구조 완성. `usePartnerPlaceReview(placeId)` 훅과 `kakaoPlaceId` 바인딩까지 연결됨. |
| **미완성 이유** | 실제 Supabase/Firebase 백엔드 미연동. 파트너가 별점을 남겨도 현재는 상대방 화면에 실시간 반영 안 됨. |
| **전환 조치** | 1. Supabase `place_reviews` 테이블 + RLS 정책 설정 <br> 2. `partnerReviewService.ts`의 `setTimeout` 시뮬레이션을 `supabase.from('place_reviews').select(...)` 쿼리로 교체 <br> 3. `subscribeToPartnerReview()` 내부를 Supabase Realtime 채널 구독으로 교체 |

---

## 5. AI 데이트 뮤즈 Kakao 반경 검색 활성화 (히스토리 탭)

| 항목 | 내용 |
| :--- | :--- |
| **위치** | `src/services/aiMuseService.ts:12, 40-48` |
| **현재 동작** | `isMockMode = REST_KEY === 'MOCK_REST_KEY' \|\| REST_KEY === ''` 조건으로 `.env`의 키가 Mock이면 `MOCK_NEARBY_SPOTS` 7개 고정 장소 폴백. 실제 Kakao REST 키 설정 시 반경 검색 + `MUSE_CORE_PROTOCOL` Anthropic LLM 호출 전면 활성화. |
| **미완성 이유** | `.env` `EXPO_PUBLIC_KAKAO_REST_KEY="MOCK_REST_KEY"` 현재 Mock 값. |
| **전환 조치** | 1. [Kakao Developers](https://developers.kakao.com/) 에서 REST API 키 발급 <br> 2. `.env` `EXPO_PUBLIC_KAKAO_REST_KEY="실제_키_값"` 으로 교체 <br> 3. 앱 재시작만으로 즉시 활성화 (코드 변경 불필요) |

---

## 6. 프로필 아바타 서버 스토리지 업로드 (설정 탭)

| 항목 | 내용 |
| :--- | :--- |
| **위치** | `app/(tabs)/settings/index.tsx:1664` 이후 업로드 처리 블록 |
| **현재 동작** | `ImagePicker.launchImageLibraryAsync()` 로 로컬 크롭까지 완성. 이후 서버 업로드 부분이 `await new Promise(resolve => setTimeout(resolve, 500))` 500ms stub. 로컬 미리보기는 정상 동작. |
| **미완성 이유** | 아바타 스토리지 API 엔드포인트 미결정. 주석에 "replace with actual storage API" 명시. |
| **전환 조치** | 1. Supabase Storage 또는 S3 버킷 설정 <br> 2. `settings/index.tsx` 업로드 stub을 `multipart/form-data` PUT 요청으로 교체 <br> 3. 성공 시 반환된 CDN URL을 `setMyProfile({ avatarUrl: cdnUrl })` 로 AppContext 갱신 |

---

## 7. IAP 인앱 결제 활성화 (설정 탭)

| 항목 | 내용 |
| :--- | :--- |
| **위치** | `src/services/iapService.ts:43-54`, `src/components/settings/ThemeShop.tsx:64` |
| **현재 동작** | `purchaseSubscription()`, `initIAP()`, `teardownIAP()` 함수 구현 완료. `react-native-iap` 동적 `require()` — 패키지 미설치 시 에러 메시지 토스트 출력. `ThemeShop.tsx` 에서도 동일 패턴으로 `'인앱 결제는 EAS Build가 필요합니다.'` 안내. |
| **미완성 이유** | `react-native-iap` `package.json` 미등록. 네이티브 모듈이므로 Expo Go 실행 불가. App Store / Play Store 상품 SKU 미등록. `iapService.ts:97` 영수증 검증 엔드포인트 `https://api.twin.me/api/v1/billing/verify-receipt` 하드코딩(환경변수화 필요). |
| **전환 조치** | 1. `npx expo install react-native-iap` <br> 2. `eas build` (네이티브 모듈 포함 빌드) <br> 3. App Store Connect / Google Play Console 에서 구독 상품 SKU 등록 <br> 4. `iapService.ts` 영수증 검증 URL을 `EXPO_PUBLIC_API_BASE_URL` 기반으로 변경 |

---

## ✅ 8. 로그아웃 로컬 토큰 삭제 (설정 탭)

| 항목 | 내용 |
| :--- | :--- |
| **위치** | `src/services/authService.ts:54-58` |
| **현재 동작** | `clearLocalAuthData()` 함수 자체는 존재하며 로그아웃 플로우(`Promise.allSettled → resetSession → router.replace`)에 정상 연결됨. 함수 내부가 no-op 스텁. |
| **미완성 이유** | 프로젝트에 아직 SecureStore / AsyncStorage 기반 토큰 퍼시스턴스 레이어가 미구현. 저장된 토큰이 없으므로 삭제할 대상 없음 — 의도적 플레이스홀더. |
| **전환 조치** | 1. `expo-secure-store` 설치 후 로그인 시 토큰 저장 로직 구현 <br> 2. `authService.ts:55-57` 주석 코드 (`SecureStore.deleteItemAsync('auth_token')` 등) 활성화 <br> 3. `AsyncStorage.multiRemove([...])` 로 기타 세션 키 일괄 삭제 |

---

## 요약 우선순위표

| 우선순위 | 항목 | 코드 변경 여부 | 선결 조건 |
| :---: | :--- | :---: | :--- |
| 🔴 즉시 | AI 데이트 뮤즈 Kakao 키 활성화 (#5) | ❌ (환경변수만) | Kakao REST 키 발급 |
| 🔴 즉시 | Anthropic API Key 설정 (LLM 전체) | ❌ (환경변수만) | Anthropic 콘솔 키 발급 |
| 🟡 단기 | 실시간 커플 채팅 (#3) | ✅ (주석 해제) | Supabase 프로젝트 프로비저닝 |
| 🟡 단기 | 파트너 별점·리뷰 실시간 동기화 (#4) | ✅ (쿼리 교체) | Supabase 테이블 설정 |
| 🟡 단기 | 프로필 아바타 서버 업로드 (#6) | ✅ (stub 교체) | 스토리지 API 엔드포인트 |
| 🟡 단기 | 로그아웃 로컬 토큰 삭제 (#8) | ✅ (주석 해제) | 토큰 퍼시스턴스 레이어 구현 |
| 🟢 중기 | IAP 인앱 결제 (#7) | ✅ (EAS Build) | App Store/Play SKU 등록 |
| 🟢 중기 | 카카오 SDK 공유 (#1) | ✅ (EAS Build) | Kakao 앱 등록 |
| 🔵 장기 | 10분 인터뷰 Realtime API (#2) | ✅ (신규 구현) | OpenAI Realtime API 접근 |
