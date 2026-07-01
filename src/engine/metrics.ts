// ─── 일치율 코어 엔진 v2.2 (Real-Time Pulse Edition) ──────────────────────────
// docs/Twin.me.md §4 — v2.1(하드 클램프·24개 이벤트)을 완전히 대체(Override)한다.
//
// 핵심 변경:
//   · 점수 2층 구조: S_Live(실시간 게이지, non-persistent) / S_Current(자정 정산, 영구)
//   · tanh 소프트 포화형 일일 제한 (비대칭 A_cap⁺=2.0 / A_cap⁻=2.5)
//   · 이벤트 단위 파이프라인: 유효 변동치 → 부정성 가중(κ) → 반파밍 감쇠(γ) → 누적(A_t)
//   · 오버플로우 3단계 심각도 + 실시간 급락(Rapid-Swing) 위기 감지
//   · 약 100종 이벤트(10개 군) + 5종 시퀀스 콤보
//
// ⚠️ 윤리 가드레일: 본 파일의 모든 수치(δ, κ, γ, A_cap 등)는 검증된 심리측정값이
// 아니라 자기성찰·게이미피케이션을 위한 설계 구조물이다. L-HRS 등 중대 지표의
// 텍스트 분류는 근사치이며, 실제 임상적 진단으로 오인되지 않도록 UI 카피에서
// 항상 "재미·성찰 도구" 포지셔닝을 유지해야 한다. δ/κ/γ/A_cap/빈도캡은 출시 후
// 실사용 로그 기반 A/B 보정 대상이다.

import type { OverflowStatus } from '../utils/scoreCalculator';

// ── 이벤트 그룹 & 코드 타입 ────────────────────────────────────────────────────

export type EventGroup =
  | 'G-CON' | 'G-REG' | 'G-HUM' | 'G-FUT' | 'G-RES' | 'G-INT'
  | 'L-MIC' | 'L-CRU' | 'L-HRS' | 'L-NEG' | 'C';

export type EventCode =
  // G-CON · 갈등 회복·교정 (10)
  | 'G-CON-001' | 'G-CON-002' | 'G-CON-003' | 'G-CON-004' | 'G-CON-005'
  | 'G-CON-006' | 'G-CON-007' | 'G-CON-008' | 'G-CON-009' | 'G-CON-010'
  // G-REG · 일상 다정함 (12)
  | 'G-REG-001' | 'G-REG-002' | 'G-REG-003' | 'G-REG-004' | 'G-REG-005' | 'G-REG-006'
  | 'G-REG-007' | 'G-REG-008' | 'G-REG-009' | 'G-REG-010' | 'G-REG-011' | 'G-REG-012'
  // G-HUM · 유머·놀이·티키타카 (10)
  | 'G-HUM-001' | 'G-HUM-002' | 'G-HUM-003' | 'G-HUM-004' | 'G-HUM-005'
  | 'G-HUM-006' | 'G-HUM-007' | 'G-HUM-008' | 'G-HUM-009' | 'G-HUM-010'
  // G-FUT · 미래·결속·서사 (8)
  | 'G-FUT-001' | 'G-FUT-002' | 'G-FUT-003' | 'G-FUT-004'
  | 'G-FUT-005' | 'G-FUT-006' | 'G-FUT-007' | 'G-FUT-008'
  // G-RES · 반응성·존재감 (8)
  | 'G-RES-001' | 'G-RES-002' | 'G-RES-003' | 'G-RES-004'
  | 'G-RES-005' | 'G-RES-006' | 'G-RES-007' | 'G-RES-008'
  // G-INT · 친밀·자기개방·애정 (8)
  | 'G-INT-001' | 'G-INT-002' | 'G-INT-003' | 'G-INT-004'
  | 'G-INT-005' | 'G-INT-006' | 'G-INT-007' | 'G-INT-008'
  // L-MIC · 매너리즘·미세 저해 (12)
  | 'L-MIC-001' | 'L-MIC-002' | 'L-MIC-003' | 'L-MIC-004' | 'L-MIC-005' | 'L-MIC-006'
  | 'L-MIC-007' | 'L-MIC-008' | 'L-MIC-009' | 'L-MIC-010' | 'L-MIC-011' | 'L-MIC-012'
  // L-CRU · 균열·의도적 파괴 (12) — 중대 이벤트(γ=0.8)
  | 'L-CRU-001' | 'L-CRU-002' | 'L-CRU-003' | 'L-CRU-004' | 'L-CRU-005' | 'L-CRU-006'
  | 'L-CRU-007' | 'L-CRU-008' | 'L-CRU-009' | 'L-CRU-010' | 'L-CRU-011' | 'L-CRU-012'
  // L-HRS · 4 호스맨 패턴 (8) — 중대 이벤트(γ=0.8), 윈도우 단위 탐지
  | 'L-HRS-001' | 'L-HRS-002' | 'L-HRS-003' | 'L-HRS-004'
  | 'L-HRS-005' | 'L-HRS-006' | 'L-HRS-007' | 'L-HRS-008'
  // L-NEG · 방치·무관심·비동기 (8)
  | 'L-NEG-001' | 'L-NEG-002' | 'L-NEG-003' | 'L-NEG-004'
  | 'L-NEG-005' | 'L-NEG-006' | 'L-NEG-007' | 'L-NEG-008';

export type ComboCode = 'C-ARC-001' | 'C-ARC-002' | 'C-SYN-001' | 'C-SYN-002' | 'C-DSP-001';

export interface EventDefinition {
  code: EventCode;
  group: EventGroup;
  label: string;
  condition: string;
  delta: number; // δ_base — κ/승수 적용 이전 기본값
  isMajor: boolean; // true → γ=0.8 (완만한 반파밍 감쇠), false → γ=0.5
}

// ── 100종 이벤트 딕셔너리 (docs/Twin.me.md §4.4 그대로 이식) ───────────────────

export const EVENT_REGISTRY: Record<EventCode, EventDefinition> = {
  // ── G-CON · 갈등 회복·교정 ──
  'G-CON-001': { code: 'G-CON-001', group: 'G-CON', label: '성찰 후 재개', condition: '성찰 팝업 후 10분 내 나-전달법으로 먼저 시작', delta: 0.25, isMajor: false },
  'G-CON-002': { code: 'G-CON-002', group: 'G-CON', label: '명시적 사과', condition: '자기 실수 인정·사과 어휘', delta: 0.25, isMajor: false },
  'G-CON-003': { code: 'G-CON-003', group: 'G-CON', label: '안정화 제안', condition: '"전화로 차분히 풀자"식 완충 제안', delta: 0.20, isMajor: false },
  'G-CON-004': { code: 'G-CON-004', group: 'G-CON', label: '고위험 극복', condition: '이별 뉘앙스 후 30분 내 적극 공감 봉합', delta: 0.30, isMajor: false },
  'G-CON-005': { code: 'G-CON-005', group: 'G-CON', label: '감정 명명', condition: '비난 없이 자기 감정 언어화', delta: 0.20, isMajor: false },
  'G-CON-006': { code: 'G-CON-006', group: 'G-CON', label: '휴전 존중', condition: '"잠깐 쉬자" 후 재자극 없이 침묵 유지', delta: 0.15, isMajor: false },
  'G-CON-007': { code: 'G-CON-007', group: 'G-CON', label: '책임 분담', condition: '"우리 둘 다 예민했네"식 공동 책임', delta: 0.20, isMajor: false },
  'G-CON-008': { code: 'G-CON-008', group: 'G-CON', label: '선제적 화해', condition: '갈등 후 먼저 "아까 미안" 손길', delta: 0.22, isMajor: false },
  'G-CON-009': { code: 'G-CON-009', group: 'G-CON', label: '관점 수용', condition: '"네 말도 일리 있어" 인정', delta: 0.18, isMajor: false },
  'G-CON-010': { code: 'G-CON-010', group: 'G-CON', label: '애정 재확인', condition: '갈등 후 "그래도 사랑해" 봉합', delta: 0.20, isMajor: false },

  // ── G-REG · 일상 다정함 ──
  'G-REG-001': { code: 'G-REG-001', group: 'G-REG', label: 'T형 감정 미러링', condition: '하소연에 공감 단어 3문장+ 연속', delta: 0.10, isMajor: false },
  'G-REG-002': { code: 'G-REG-002', group: 'G-REG', label: '칭찬·지지', condition: '구체적 형용사 긍정 강화', delta: 0.10, isMajor: false },
  'G-REG-003': { code: 'G-REG-003', group: 'G-REG', label: '문체 동기화', condition: '이모티콘·어미 유사 지수 20%+ 상승', delta: 0.05, isMajor: false },
  'G-REG-004': { code: 'G-REG-004', group: 'G-REG', label: '공동 서사 마커', condition: "'우리'·미래형 어미 빈도 상승(경량)", delta: 0.05, isMajor: false },
  'G-REG-005': { code: 'G-REG-005', group: 'G-REG', label: '장문 밀도 케어', condition: '상대 장문에 밀도 균형(0.8~1.2) 답장', delta: 0.15, isMajor: false },
  'G-REG-006': { code: 'G-REG-006', group: 'G-REG', label: '선제 일상 공유', condition: '단절 종료 직후 먼저 안부 보고', delta: 0.05, isMajor: false },
  'G-REG-007': { code: 'G-REG-007', group: 'G-REG', label: '디테일 기억', condition: '며칠 전 흘린 정보 기억해 먼저 챙김', delta: 0.12, isMajor: false },
  'G-REG-008': { code: 'G-REG-008', group: 'G-REG', label: '약점 공개(경량)', condition: '불안·콤플렉스 가볍게 공유', delta: 0.10, isMajor: false },
  'G-REG-009': { code: 'G-REG-009', group: 'G-REG', label: '명시적 감사', condition: '"고마워, 덕분에" 등', delta: 0.08, isMajor: false },
  'G-REG-010': { code: 'G-REG-010', group: 'G-REG', label: '케어 제안', condition: '"밥 먹었어? 뭐 시켜줄까"', delta: 0.10, isMajor: false },
  'G-REG-011': { code: 'G-REG-011', group: 'G-REG', label: '화해 시도 수용', condition: '상대 리페어(농담·사과) 받아줌', delta: 0.12, isMajor: false },
  'G-REG-012': { code: 'G-REG-012', group: 'G-REG', label: '컨디션 체크', condition: '"잘 잤어?" "오늘 안 힘들어?"', delta: 0.06, isMajor: false },

  // ── G-HUM · 유머·놀이·티키타카 ──
  'G-HUM-001': { code: 'G-HUM-001', group: 'G-HUM', label: '드립 성공', condition: '내 톡 뒤 상대 폭소(ㅋㅋㅋ/ㅎㅎ)', delta: 0.10, isMajor: false },
  'G-HUM-002': { code: 'G-HUM-002', group: 'G-HUM', label: '받아치기', condition: '상대 농담에 합 맞춘 응수', delta: 0.10, isMajor: false },
  'G-HUM-003': { code: 'G-HUM-003', group: 'G-HUM', label: '인사이드 조크', condition: '둘만 아는 밈·별명 사용', delta: 0.08, isMajor: false },
  'G-HUM-004': { code: 'G-HUM-004', group: 'G-HUM', label: '밈·짤 공유', condition: '웃긴 콘텐츠 자발 공유', delta: 0.05, isMajor: false },
  'G-HUM-005': { code: 'G-HUM-005', group: 'G-HUM', label: '애정 장난', condition: '애정 담긴 가벼운 놀림(긍정 반응 동반)', delta: 0.07, isMajor: false },
  'G-HUM-006': { code: 'G-HUM-006', group: 'G-HUM', label: '분위기 환기', condition: '어색·침묵 깨는 유머', delta: 0.08, isMajor: false },
  'G-HUM-007': { code: 'G-HUM-007', group: 'G-HUM', label: '티키타카 연쇄', condition: '5턴+ 빠른 합 핑퐁', delta: 0.12, isMajor: false },
  'G-HUM-008': { code: 'G-HUM-008', group: 'G-HUM', label: '가사·노래 놀이', condition: '가사 인용 주고받기', delta: 0.04, isMajor: false },
  'G-HUM-009': { code: 'G-HUM-009', group: 'G-HUM', label: '이모지 합주', condition: '같은 이모지로 주거니받거니', delta: 0.04, isMajor: false },
  'G-HUM-010': { code: 'G-HUM-010', group: 'G-HUM', label: '셀프 디스', condition: '자기 낮춤 개그로 긴장 완화', delta: 0.05, isMajor: false },

  // ── G-FUT · 미래·결속·서사 ──
  'G-FUT-001': { code: 'G-FUT-001', group: 'G-FUT', label: '데이트 선제 제안', condition: '"주말에 ~갈래?" 먼저 제안', delta: 0.12, isMajor: false },
  'G-FUT-002': { code: 'G-FUT-002', group: 'G-FUT', label: '장기 계획', condition: '"여름엔 여행" 등 미래 동반', delta: 0.10, isMajor: false },
  'G-FUT-003': { code: 'G-FUT-003', group: 'G-FUT', label: "'우리' 결속", condition: '복수대명사·미래형 빈도 강한 상승', delta: 0.06, isMajor: false },
  'G-FUT-004': { code: 'G-FUT-004', group: 'G-FUT', label: '기념일 챙김', condition: '기념일 예고·준비 언급', delta: 0.12, isMajor: false },
  'G-FUT-005': { code: 'G-FUT-005', group: 'G-FUT', label: '동반 서사', condition: '진지한 미래 동반(동거 등) 언급', delta: 0.10, isMajor: false },
  'G-FUT-006': { code: 'G-FUT-006', group: 'G-FUT', label: '위시리스트', condition: '같이 하고 싶은 것 공동 작성', delta: 0.08, isMajor: false },
  'G-FUT-007': { code: 'G-FUT-007', group: 'G-FUT', label: '약속 이행', condition: '지난 약속 실제 지킴 확인', delta: 0.10, isMajor: false },
  'G-FUT-008': { code: 'G-FUT-008', group: 'G-FUT', label: '목표 응원', condition: '상대 커리어·시험 등 지지', delta: 0.08, isMajor: false },

  // ── G-RES · 반응성·존재감 ──
  'G-RES-001': { code: 'G-RES-001', group: 'G-RES', label: '신속 응답', condition: '평소 패턴 대비 빠른 회신', delta: 0.06, isMajor: false },
  'G-RES-002': { code: 'G-RES-002', group: 'G-RES', label: '굿모닝/굿나잇', condition: '아침·잠자리 인사 루틴', delta: 0.05, isMajor: false },
  'G-RES-003': { code: 'G-RES-003', group: 'G-RES', label: '단절 후 선보고', condition: '업무·수업 종료 직후 먼저 연락(타이밍)', delta: 0.05, isMajor: false },
  'G-RES-004': { code: 'G-RES-004', group: 'G-RES', label: '실시간 동행감', condition: '"지금 ~하는 중" 일상 중계', delta: 0.04, isMajor: false },
  'G-RES-005': { code: 'G-RES-005', group: 'G-RES', label: '부재 예고', condition: '"이제 회의라 못 봐" 사전 고지', delta: 0.05, isMajor: false },
  'G-RES-006': { code: 'G-RES-006', group: 'G-RES', label: '보이스 전환 제안', condition: '텍스트→통화·음성 제안', delta: 0.08, isMajor: false },
  'G-RES-007': { code: 'G-RES-007', group: 'G-RES', label: '즉시 리액션', condition: '읽씹 없이 바로 반응', delta: 0.05, isMajor: false },
  'G-RES-008': { code: 'G-RES-008', group: 'G-RES', label: '늦은 답장 케어', condition: '"자느라 늦었어ㅠ" 사과·설명', delta: 0.06, isMajor: false },

  // ── G-INT · 친밀·자기개방·애정 ──
  'G-INT-001': { code: 'G-INT-001', group: 'G-INT', label: '애칭 사용', condition: '"자기야/애기야" 등', delta: 0.06, isMajor: false },
  'G-INT-002': { code: 'G-INT-002', group: 'G-INT', label: '그리움 표현', condition: '"보고싶다" 직접 표현', delta: 0.08, isMajor: false },
  'G-INT-003': { code: 'G-INT-003', group: 'G-INT', label: '사랑 재확인', condition: '"사랑해" 고백', delta: 0.10, isMajor: false },
  'G-INT-004': { code: 'G-INT-004', group: 'G-INT', label: '신체언어 텍스트', condition: '"안아주고 싶다" 등', delta: 0.06, isMajor: false },
  'G-INT-005': { code: 'G-INT-005', group: 'G-INT', label: '셀카·사진 공유', condition: '얼굴·일상 사진', delta: 0.06, isMajor: false },
  'G-INT-006': { code: 'G-INT-006', group: 'G-INT', label: '위치 자발 공유', condition: '안심 위치 공유', delta: 0.05, isMajor: false },
  'G-INT-007': { code: 'G-INT-007', group: 'G-INT', label: '깊은 자기개방', condition: '취약·고민 진지하게 털어놓기', delta: 0.12, isMajor: false },
  'G-INT-008': { code: 'G-INT-008', group: 'G-INT', label: '음성·영상 메시지', condition: '고친밀 채널 사용', delta: 0.08, isMajor: false },

  // ── L-MIC · 매너리즘·미세 저해 ──
  'L-MIC-001': { code: 'L-MIC-001', group: 'L-MIC', label: 'F형 서운함 무시', condition: '서운함 명시에도 팩트·해결책 일관', delta: -0.15, isMajor: false },
  'L-MIC-002': { code: 'L-MIC-002', group: 'L-MIC', label: '영혼없는 단답', condition: '장문에 "ㅇㅇ/웅" 단답·단일 이모지', delta: -0.10, isMajor: false },
  'L-MIC-003': { code: 'L-MIC-003', group: 'L-MIC', label: '대화 독점', condition: '점유율 한쪽 80%+ 쏠림', delta: -0.05, isMajor: false },
  'L-MIC-004': { code: 'L-MIC-004', group: 'L-MIC', label: '읽씹 방치', condition: '폰 이용 흔적에도 1시간+ 무시', delta: -0.10, isMajor: false },
  'L-MIC-005': { code: 'L-MIC-005', group: 'L-MIC', label: '수동공격 어미', condition: '"알았어 그럼", "ㅋ", "ㅇㄴ"', delta: -0.05, isMajor: false },
  'L-MIC-006': { code: 'L-MIC-006', group: 'L-MIC', label: '업무형 텍스트', condition: '애칭 소멸·핵심 정보만 딱딱', delta: -0.10, isMajor: false },
  'L-MIC-007': { code: 'L-MIC-007', group: 'L-MIC', label: '화제 가로채기', condition: '상대 주제 무시하고 자기 얘기 전환', delta: -0.08, isMajor: false },
  'L-MIC-008': { code: 'L-MIC-008', group: 'L-MIC', label: '비교 언어', condition: '타인·전 연인과 미세 비교', delta: -0.10, isMajor: false },
  'L-MIC-009': { code: 'L-MIC-009', group: 'L-MIC', label: '건성 사과', condition: '"미안한데 너도~" 즉시 반격', delta: -0.12, isMajor: false },
  'L-MIC-010': { code: 'L-MIC-010', group: 'L-MIC', label: '약속 대화 방치', condition: '약속된 통화 시간 반복 읽씹', delta: -0.10, isMajor: false },
  'L-MIC-011': { code: 'L-MIC-011', group: 'L-MIC', label: '리액션 인플레', condition: '"ㅇㅇ"·"ㅎ" 무의미 반복', delta: -0.06, isMajor: false },
  'L-MIC-012': { code: 'L-MIC-012', group: 'L-MIC', label: '일정 미루기', condition: '데이트 제안 계속 회피', delta: -0.10, isMajor: false },

  // ── L-CRU · 균열·의도적 파괴 (중대 이벤트 · γ=0.8) ──
  'L-CRU-001': { code: 'L-CRU-001', group: 'L-CRU', label: '의도적 교착', condition: '날선 단어 후 3시간+ 전면 단절', delta: -0.30, isMajor: true },
  'L-CRU-002': { code: 'L-CRU-002', group: 'L-CRU', label: '위협 최후통첩', condition: '"헤어지든가" 등 존속 위협', delta: -0.30, isMajor: true },
  'L-CRU-003': { code: 'L-CRU-003', group: 'L-CRU', label: '비난·가스라이팅', condition: "\"너 맨날\" '너' 중심 인격 비난", delta: -0.25, isMajor: true },
  'L-CRU-004': { code: 'L-CRU-004', group: 'L-CRU', label: '비속어·억압', condition: '욕설·"입 닫아" 명령조', delta: -0.25, isMajor: true },
  'L-CRU-005': { code: 'L-CRU-005', group: 'L-CRU', label: '안읽씹 6시간+', condition: '장문 서운함을 안 연 채 6시간+', delta: -0.20, isMajor: true },
  'L-CRU-006': { code: 'L-CRU-006', group: 'L-CRU', label: '과거 소환', condition: '종결된 과거 잘못 무기화', delta: -0.20, isMajor: true },
  'L-CRU-007': { code: 'L-CRU-007', group: 'L-CRU', label: '침묵 처벌', condition: '길들이기용 표적적 무응답', delta: -0.25, isMajor: true },
  'L-CRU-008': { code: 'L-CRU-008', group: 'L-CRU', label: '삼각화', condition: '"내 친구도 다 너 이상하대"', delta: -0.22, isMajor: true },
  'L-CRU-009': { code: 'L-CRU-009', group: 'L-CRU', label: '최후통첩 반복', condition: '위협 어휘 24h 내 재발(누적 ×1.2)', delta: -0.30, isMajor: true },
  'L-CRU-010': { code: 'L-CRU-010', group: 'L-CRU', label: '약점 무기화', condition: '공개된 트라우마 키워드 공격 사용', delta: -0.35, isMajor: true },
  'L-CRU-011': { code: 'L-CRU-011', group: 'L-CRU', label: '조롱·비웃음', condition: '"ㅋ 수준 보소"식 경멸', delta: -0.28, isMajor: true },
  'L-CRU-012': { code: 'L-CRU-012', group: 'L-CRU', label: '차단·단절 협박', condition: '"차단한다" 관계 단절 협박', delta: -0.30, isMajor: true },

  // ── L-HRS · 4 호스맨 패턴 (중대 이벤트 · γ=0.8, 윈도우 단위 근사 탐지) ──
  'L-HRS-001': { code: 'L-HRS-001', group: 'L-HRS', label: '비난(Criticism)', condition: '"넌 항상/맨날" 일반화 비난 반복', delta: -0.18, isMajor: true },
  'L-HRS-002': { code: 'L-HRS-002', group: 'L-HRS', label: '경멸(Contempt)', condition: '빈정·우월적 조롱·눈굴림 이모지 누적', delta: -0.30, isMajor: true },
  'L-HRS-003': { code: 'L-HRS-003', group: 'L-HRS', label: '방어(Defensiveness)', condition: '모든 지적에 "내 탓 아냐" 역공', delta: -0.15, isMajor: true },
  'L-HRS-004': { code: 'L-HRS-004', group: 'L-HRS', label: '담쌓기(Stonewalling)', condition: '대화 중 일방적 셧다운 반복', delta: -0.20, isMajor: true },
  'L-HRS-005': { code: 'L-HRS-005', group: 'L-HRS', label: '비난→방어 루프', condition: '두 패턴 악순환 사이클 감지', delta: -0.22, isMajor: true },
  'L-HRS-006': { code: 'L-HRS-006', group: 'L-HRS', label: '경멸 주간 임계 돌파', condition: '경멸성 지표 주간 누적 임계 초과', delta: -0.40, isMajor: true },
  'L-HRS-007': { code: 'L-HRS-007', group: 'L-HRS', label: '피로성 회피', condition: '갈등 시마다 화제 전환·도망', delta: -0.12, isMajor: true },
  'L-HRS-008': { code: 'L-HRS-008', group: 'L-HRS', label: '감정 묵살', condition: '"또 시작이네"식 일축', delta: -0.16, isMajor: true },

  // ── L-NEG · 방치·무관심·비동기 ──
  'L-NEG-001': { code: 'L-NEG-001', group: 'L-NEG', label: '응답 지연 누적', condition: '평소 대비 현저히 느린 회신 패턴', delta: -0.08, isMajor: false },
  'L-NEG-002': { code: 'L-NEG-002', group: 'L-NEG', label: '선톡 비대칭', condition: '한쪽이 항상 먼저(투자 불균형)', delta: -0.10, isMajor: false },
  'L-NEG-003': { code: 'L-NEG-003', group: 'L-NEG', label: '질문 무응답', condition: '상대 질문 스킵하고 진행', delta: -0.10, isMajor: false },
  'L-NEG-004': { code: 'L-NEG-004', group: 'L-NEG', label: '단발 종결', condition: '매번 대화를 빨리 끊음', delta: -0.07, isMajor: false },
  'L-NEG-005': { code: 'L-NEG-005', group: 'L-NEG', label: '관심 비대칭', condition: '상대 일상에 무반응 지속', delta: -0.10, isMajor: false },
  'L-NEG-006': { code: 'L-NEG-006', group: 'L-NEG', label: '약속 노쇼·취소', condition: '약속 일방 취소·노쇼 통보', delta: -0.20, isMajor: false },
  'L-NEG-007': { code: 'L-NEG-007', group: 'L-NEG', label: '기념일 무시', condition: '기념일 무인지·무반응', delta: -0.18, isMajor: false },
  'L-NEG-008': { code: 'L-NEG-008', group: 'L-NEG', label: '디지털 회피', condition: '온라인인데 의도적 무응답', delta: -0.12, isMajor: false },
};

export const ALL_EVENT_CODES = Object.keys(EVENT_REGISTRY) as EventCode[];

// ── 콤보 (κ·γ 미적용 특례) ─────────────────────────────────────────────────────

export interface ComboDefinition {
  code: ComboCode;
  sequenceHint: string;
  bonus: number;
}

export const COMBO_REGISTRY: Record<ComboCode, ComboDefinition> = {
  'C-ARC-001': { code: 'C-ARC-001', sequenceHint: '갈등→쿨다운→나-전달법→사과→상호 다정함', bonus: 0.20 },
  'C-ARC-002': { code: 'C-ARC-002', sequenceHint: '고위험 단절 후 30분 내 공감 봉합', bonus: 0.15 },
  'C-SYN-001': { code: 'C-SYN-001', sequenceHint: 'G-REG 3종 이상 1세션 내 상호 발생', bonus: 0.10 },
  'C-SYN-002': { code: 'C-SYN-002', sequenceHint: '티키타카 연쇄(G-HUM-007) 지속', bonus: 0.12 },
  'C-DSP-001': { code: 'C-DSP-001', sequenceHint: 'L-HRS 루프 + 단절 (부정 콤보)', bonus: -0.25 },
};

// ── 물리 상수 (docs/Twin.me.md §4.6 튜닝 파라미터 요약) ────────────────────────

export const KAPPA = 1.5;              // 부정성 가중
export const GAMMA_NORMAL = 0.5;       // 동일 코드 체감 감쇠 (일반)
export const GAMMA_MAJOR = 0.8;       // 동일 코드 체감 감쇠 (L-CRU/L-HRS)
export const A_CAP_PLUS = 2.0;        // 일일 가산 점근 상한
export const A_CAP_MINUS = 2.5;       // 일일 감산 점근 하한 (비대칭 — '손상은 빠르다')
export const A_CAP_PLUS_CRISIS = 1.0; // 3일 연속 CRITICAL_LOSS 시 임시 하향
export const LAMBDA_DECAY = 0.02;     // 항상성 감쇠
export const GLOBAL_FLOOR = 50.5;
export const GLOBAL_CEIL = 100.0;
export const RAPID_SWING_THRESHOLD = -1.5;
export const RAPID_SWING_WINDOW_MS = 30 * 60 * 1000;
export const COOLING_BLEED_IDLE_MIN = 90;

// ── 승수 계산 컨텍스트 ─────────────────────────────────────────────────────────

export interface EventContext {
  timestamp?: number;   // 기본 Date.now()
  intensity?: number;   // M_intensity 0.5~1.5 (NLP 강도·확신도), 기본 1.0
  inConflict?: boolean; // M_context: 갈등 중이면 1.5
  isReciprocal?: boolean; // M_reciprocity: 상호 발생이면 1.2
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ── [수식] 유효 변동치: δ_eff = δ_base × M_intensity × M_context × M_reciprocity × M_time ──

export function computeEffectiveDelta(def: EventDefinition, ctx: EventContext = {}): number {
  const mIntensity = clamp(ctx.intensity ?? 1.0, 0.5, 1.5);
  const mContext = ctx.inConflict ? 1.5 : 1.0;
  const mReciprocity = ctx.isReciprocal ? 1.2 : 1.0;

  const hour = new Date(ctx.timestamp ?? Date.now()).getHours();
  const isVulnerableHour = hour >= 0 && hour < 4; // 00:00~04:00 취약시간
  const mTime = isVulnerableHour ? (def.delta >= 0 ? 1.2 : 1.3) : 1.0;

  return def.delta * mIntensity * mContext * mReciprocity * mTime;
}

// ── [수식] 부정성 가중: δ_w = δ_eff (양수) | κ·δ_eff (음수) ────────────────────

export function applyNegativityWeight(deltaEff: number): number {
  return deltaEff > 0 ? deltaEff : KAPPA * deltaEff;
}

// ── [수식] 반파밍 감쇠: δ_final = δ_w · γ^(n-1), 빈도캡 N 초과 시 0 ────────────
// N(코드별 일일 빈도 캡)은 명세서 원칙("코드별 상이")에 따른 튜닝 가능 기본값이다.

export function getFrequencyCap(def: EventDefinition): number {
  if (def.isMajor) return 3;
  return def.delta >= 0 ? 6 : 5;
}

export function applyFrequencyDecay(
  deltaW: number,
  occurrenceIndex: number, // n (1-based, 당일 해당 코드 발생 순번)
  def: EventDefinition,
): { deltaFinal: number; cappedByFrequency: boolean } {
  const cap = getFrequencyCap(def);
  if (occurrenceIndex > cap) return { deltaFinal: 0, cappedByFrequency: true };
  const gamma = def.isMajor ? GAMMA_MAJOR : GAMMA_NORMAL;
  return { deltaFinal: deltaW * Math.pow(gamma, occurrenceIndex - 1), cappedByFrequency: false };
}

// ── 일일 빈도 트래커 (코드별 n 및 자정 리셋) ──────────────────────────────────

export interface FrequencyState {
  day: string; // YYYY-MM-DD (로컬 자정 기준 날짜 키)
  counts: Partial<Record<EventCode, number>>;
}

export function todayKey(now: number = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function createFrequencyState(now: number = Date.now()): FrequencyState {
  return { day: todayKey(now), counts: {} };
}

/** 당일 발생 순번(n)을 반환하고 카운트를 1 증가시킨다. 날짜가 바뀌면 자동 리셋. */
export function bumpOccurrence(state: FrequencyState, code: EventCode, now: number = Date.now()): number {
  const key = todayKey(now);
  if (state.day !== key) {
    state.day = key;
    state.counts = {};
  }
  const next = (state.counts[code] ?? 0) + 1;
  state.counts[code] = next;
  return next;
}

// ── [수식] tanh 소프트 포화형 일일 제한: Δ_intraday(A) = cap · tanh(A/cap) ───

export function tanhSaturation(a: number, capPlusOverride?: number): number {
  const capPlus = capPlusOverride ?? A_CAP_PLUS;
  const cap = a >= 0 ? capPlus : A_CAP_MINUS;
  return cap * Math.tanh(a / cap);
}

// ── S_Live 실시간 게이지 ───────────────────────────────────────────────────────

export function computeSLive(sTodayOpen: number, aCurrent: number, capPlusOverride?: number): number {
  return sTodayOpen + tanhSaturation(aCurrent, capPlusOverride);
}

// ── 실시간 냉각 블리드 (표시 전용 — 정산값에는 영향 없음) ─────────────────────

export function coolingBleed(aValue: number, minutesIdle: number, beta = 0.01): number {
  if (minutesIdle < COOLING_BLEED_IDLE_MIN) return aValue;
  return aValue * Math.exp(-beta * (minutesIdle - COOLING_BLEED_IDLE_MIN));
}

// ── 오버플로우 3단계 심각도 ────────────────────────────────────────────────────

export type OverflowSeverity = 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL';

export function classifyOverflowSeverity(aEndOfDay: number): OverflowSeverity {
  const abs = Math.abs(aEndOfDay);
  if (abs <= 1.0) return 'NONE';
  if (abs <= 1.75) return 'MINOR';
  if (abs <= 2.5) return 'MAJOR';
  return 'CRITICAL';
}

export function classifyOverflowStatus(aEndOfDay: number): OverflowStatus {
  if (aEndOfDay > 1.0) return 'EXCESS_GAIN';
  if (aEndOfDay < -1.0) return 'CRITICAL_LOSS';
  return 'NONE';
}

// ── 자정 정산 & 항상성 감쇠 ────────────────────────────────────────────────────

export interface MidnightSettlementResult {
  sCurrent: number;
  deltaDaily: number;
  deltaDecay: number;
  spillover: number;
  overflowStatus: OverflowStatus;
  severity: OverflowSeverity;
}

export function settleMidnight(
  sTodayOpen: number,
  aEndOfDay: number,
  sMasterBase: number,
  capPlusOverride?: number,
): MidnightSettlementResult {
  const deltaDaily = tanhSaturation(aEndOfDay, capPlusOverride);
  const deltaDecay = -LAMBDA_DECAY * (sTodayOpen - sMasterBase);
  const sCurrentRaw = sTodayOpen + deltaDaily + deltaDecay;
  const sCurrent = clamp(sCurrentRaw, GLOBAL_FLOOR, GLOBAL_CEIL);
  const spillover = aEndOfDay - deltaDaily;

  return {
    sCurrent,
    deltaDaily,
    deltaDecay,
    spillover,
    overflowStatus: classifyOverflowStatus(aEndOfDay),
    severity: classifyOverflowSeverity(aEndOfDay),
  };
}

// ── 실시간 급락 감지 (Rapid-Swing Trigger) ────────────────────────────────────

export interface ATick { t: number; aValue: number; }

/** history 내 30분 이내 시점 대비 현재 A 값이 -1.5 미만으로 급락했는지 검사 */
export function detectRapidSwing(
  history: ATick[],
  currentA: number,
  now: number = Date.now(),
): boolean {
  return history.some(
    (h) => now - h.t <= RAPID_SWING_WINDOW_MS && h.aValue - currentA > 1.5,
  );
}

// ── 변동성 지수 (StdDev of tick deltas, 최근 24h) ─────────────────────────────

export function computeVolatilityIndex(deltas: number[]): number {
  if (deltas.length === 0) return 0;
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance = deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / deltas.length;
  return Math.sqrt(variance);
}

// ── 단일 이벤트 처리 파이프라인 (한 틱) ────────────────────────────────────────

export interface TickResult {
  code: EventCode;
  deltaBase: number;
  deltaEff: number;
  deltaWeighted: number;
  deltaFinal: number;
  occurrenceIndexToday: number;
  cappedByFrequency: boolean;
}

export function processTick(
  code: EventCode,
  freqState: FrequencyState,
  ctx: EventContext = {},
): TickResult {
  const def = EVENT_REGISTRY[code];
  const now = ctx.timestamp ?? Date.now();
  const occurrenceIndexToday = bumpOccurrence(freqState, code, now);

  const deltaEff = computeEffectiveDelta(def, ctx);
  const deltaWeighted = applyNegativityWeight(deltaEff);
  const { deltaFinal, cappedByFrequency } = applyFrequencyDecay(deltaWeighted, occurrenceIndexToday, def);

  return {
    code,
    deltaBase: def.delta,
    deltaEff,
    deltaWeighted,
    deltaFinal,
    occurrenceIndexToday,
    cappedByFrequency,
  };
}

// ── 콤보 탐지 (근사 시퀀스 매칭, κ·γ 미적용 특례) ─────────────────────────────

export interface LoggedEvent { code: EventCode; t: number; }

const NINETY_MIN_MS = 90 * 60 * 1000;
const THIRTY_MIN_MS = 30 * 60 * 1000;
const SIXTY_MIN_MS = 60 * 60 * 1000;

function within(a: number, b: number, windowMs: number): boolean {
  return Math.abs(a - b) <= windowMs;
}

/**
 * 최근 이벤트 로그(시간순)를 스캔해 5종 콤보를 근사 탐지한다.
 * 정밀한 심리학적 시퀀스 판별이 아닌, 코드 발생 순서·시간창 기반의 구조적 근사임.
 */
export function detectCombos(recent: LoggedEvent[], now: number = Date.now()): ComboDefinition[] {
  const hits: ComboDefinition[] = [];
  const window = recent.filter((e) => now - e.t <= NINETY_MIN_MS);
  const codes = window.map((e) => e.code);

  const hasGroup = (prefix: string) => window.some((e) => e.code.startsWith(prefix));
  const lastOf = (prefix: string) => [...window].reverse().find((e) => e.code.startsWith(prefix));
  const firstOf = (prefix: string) => window.find((e) => e.code.startsWith(prefix));

  // C-ARC-001: 갈등(L-CRU/L-HRS) → 쿨다운 → 나-전달법(G-CON-001) → 사과(G-CON-002) → 상호 다정함(G-REG)
  const conflictEvt = firstOf('L-CRU') ?? firstOf('L-HRS');
  const conEvt = window.find((e) => e.code === 'G-CON-001');
  const apologyEvt = window.find((e) => e.code === 'G-CON-002');
  const regEvt = lastOf('G-REG');
  if (
    conflictEvt && conEvt && apologyEvt && regEvt &&
    conflictEvt.t < conEvt.t && conEvt.t < apologyEvt.t && apologyEvt.t <= regEvt.t
  ) {
    hits.push(COMBO_REGISTRY['C-ARC-001']);
  }

  // C-ARC-002: 고위험 단절(L-CRU-002/007/012) 후 30분 내 G-CON-004 공감 봉합
  const highRisk = window.find((e) => ['L-CRU-002', 'L-CRU-007', 'L-CRU-012'].includes(e.code));
  const empathyRepair = window.find((e) => e.code === 'G-CON-004');
  if (highRisk && empathyRepair && empathyRepair.t > highRisk.t && within(empathyRepair.t, highRisk.t, THIRTY_MIN_MS)) {
    hits.push(COMBO_REGISTRY['C-ARC-002']);
  }

  // C-SYN-001: G-REG 3종 이상(서로 다른 코드) 1세션(60분) 내 발생
  const recentRegWindow = window.filter((e) => e.code.startsWith('G-REG') && now - e.t <= SIXTY_MIN_MS);
  const distinctReg = new Set(recentRegWindow.map((e) => e.code));
  if (distinctReg.size >= 3) {
    hits.push(COMBO_REGISTRY['C-SYN-001']);
  }

  // C-SYN-002: 티키타카 연쇄(G-HUM-007)가 60분 내 2회 이상 지속
  const humCount = codes.filter((c) => c === 'G-HUM-007' && now - (window.find((e) => e.code === c)?.t ?? 0) <= SIXTY_MIN_MS).length;
  if (window.filter((e) => e.code === 'G-HUM-007').length >= 2) {
    hits.push(COMBO_REGISTRY['C-SYN-002']);
  }
  void humCount;

  // C-DSP-001 (부정 콤보): L-HRS 루프 감지 후 단절(L-CRU-001/005) 발생
  const hrsEvt = firstOf('L-HRS');
  const deadlockEvt = window.find((e) => ['L-CRU-001', 'L-CRU-005'].includes(e.code));
  if (hrsEvt && deadlockEvt && deadlockEvt.t >= hrsEvt.t) {
    hits.push(COMBO_REGISTRY['C-DSP-001']);
  }

  return hits;
}

// ── 위기 메모리 (3일 연속 CRITICAL_LOSS → 가산 캡 임시 하향) ──────────────────

export function shouldActivateCrisisMemory(recentDailyStatuses: OverflowStatus[]): boolean {
  const lastThree = recentDailyStatuses.slice(-3);
  return lastThree.length === 3 && lastThree.every((s) => s === 'CRITICAL_LOSS');
}

export function resolveActiveCapPlus(crisisMemoryActive: boolean): number {
  return crisisMemoryActive ? A_CAP_PLUS_CRISIS : A_CAP_PLUS;
}
