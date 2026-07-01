# 📑 Twin_response_logic.md — 트윈 AI 응답 생성 엔진

> **목적:** 사용자의 말투·언어 습관·표현을 (A) 카톡 업로드 시 **배치 점검** / (B) 인앱 채팅 시 **실시간 점검**하여, 트윈(Self-AI)이 **경고·권고·알림** 메시지를 자동 발신하는 로직을 정의한다.
> **관계:** FUN-CHA-001(트윈 정의)·`Chat_logic.md`(User_Tone_Vector)·v2.2 엔진(이벤트 코드)·FUN-CHA-003(반성의 거울)을 통합 호출한다. 충돌 시 본 명세가 우선.
> **불변 원칙:** 출력 화살표는 항상 **나를 향한다**(거울). 트윈은 내 말투로 말하고(`User_Tone_Vector` 주입), 행동만 지적하며 인격은 건드리지 않는다.

---

## 0. 엔진 개관 — 듀얼 입력, 단일 두뇌, 3종 출력

```
[입력 A] 카톡 .txt 업로드  ──┐
                            ├─→ [정규화 레이어] → [탐지 엔진(v2.2)] → [트윈 응답 생성] → [출력 라우터]
[입력 B] 인앱 실시간 채팅  ──┘                                                              │
                                                                          ┌──────────────┼──────────────┐
                                                                       경고(Warn)    권고(Advise)    알림(Notify)
```

- **두뇌는 하나:** 두 입력 모두 동일한 v2.2 이벤트 탐지 + `User_Tone_Vector`를 거친다.
- **차이는 시점·지연·출력 강도뿐:** 배치는 회고적·묶음, 실시간은 즉각적·단발.

---

## 1. 입력 경로 정의

### 1.1 경로 A — 카톡 업로드 (상시·배치)

- 트리거: 사용자가 카톡 .txt 업로드(FUN-ONB-002 / 주간 동기화).
- 처리: `Chat_logic.md` Stage 0~1로 **내 발화 전체**를 파싱·마스킹 후, 각 발화에 v2.2 이벤트 코드 라벨링.
- 산출: 기간 내 내 언어 습관의 **집계 리포트** + 반복 패턴 경고. (회고적이므로 즉시성 낮음 → 주로 권고·알림으로 출력.)

### 1.2 경로 B — 인앱 실시간 채팅 (실시간·스트림)

- 트리거: 룸 1(연인 채팅방)에서 내가 메시지를 입력/전송하는 순간. 스트림이 룸 2(트윈) 엔진으로 실시간 복사(Tapping).
- 처리: 입력 버퍼(2.5초) → 이벤트 탐지 → 즉시 트윈 응답.
- 산출: 그 순간의 **단발 개입**(주로 경고·권고).

📐 **[수식 1-1] 실시간 입력 버퍼링 (FUN-CHA-001 계승)**
```
연타 메시지는 2.5초 버퍼로 합산(Aggregation) 후 1회 탐지 호출
→ 잘게 끊어 보낸 톡을 하나의 맥락으로 평가
```

---

## 2. 탐지 엔진 (Detection) — 무엇을 잡는가

### 2.1 이벤트 라벨링 (v2.2 100종 연동)

각 (버퍼링된) 발화 `u`에 대해 v2.2 이벤트 코드와 강도를 산출.

📐 **[수식 2-1]**
```
detect(u) → { code ∈ {G-*, L-*}, M_intensity ∈ [0.5,1.5], δ_base }
```

### 2.2 트윈 개입 점수 (Intervention Score)

모든 탐지에 트윈이 반응하면 잔소리가 된다. **개입할 가치가 있을 때만** 발화하도록 게이팅한다.

📐 **[수식 2-2] 개입 점수**
```
I(u) = |δ_base| · M_intensity · w_channel · (1 − fatigue)

  w_channel : 감산(L-*) 1.0 / 가산(G-*) 0.6   // 교정이 칭찬보다 우선순위 약간 높음
  fatigue   : 최근 개입 피로도 (2.5)            // 0~1, 많이 개입했으면 ↑
```

📐 **[수식 2-3] 발화 게이트**
```
트윈 발화 ⇔ I(u) ≥ θ_intervene        // θ_intervene = 0.12 (튜닝)
                 OR  중대 코드(L-CRU/L-HRS) 발생   // 중대는 게이트 무시하고 항상 개입
```

### 2.3 반복 패턴 탐지 (배치·실시간 공통)

단발이 아니라 **누적 습관**을 잡는다. 트윈의 가장 강력한 무기.

📐 **[수식 2-4]**
```
패턴 경고 ⇔ 동일 코드 c 가 윈도우 W 내 임계 m회 이상
  실시간: 최근 24h 내 m_rt = 3회
  배치:   업로드 기간 내 상위 빈발 코드 TOP 3
```

---

## 3. 출력 분기 — 경고 · 권고 · 알림 (3종)

탐지 결과를 **심각도·시점**에 따라 3개 채널로 라우팅한다.

### 3.1 라우팅 규칙

| 채널 | 트리거 조건 | 시점 | 톤 | 예시 코드군 |
|---|---|---|---|---|
| 🔴 **경고(Warn)** | 중대 코드(L-CRU/L-HRS) OR `Rapid-Swing`/`CRITICAL_LOSS` | 실시간 즉시 | 진지·묵직 | "헤어져", 비속어, 경멸 |
| 🟡 **권고(Advise)** | 일반 감산(L-MIC/L-NEG) OR `I(u) ≥ θ` | 실시간/배치 | 부드러운 넛지 | 단답, 읽씹, 수동공격 어미 |
| 🔵 **알림(Notify)** | 가산(G-*)·회복(C-ARC) OR 배치 집계 요약 | 사후/주기 | 가벼움·인정 | 칭찬·다정함·습관 리포트 |

📐 **[수식 3-1] 채널 결정 함수**
```
route(detection):
  if code ∈ {L-CRU, L-HRS} or overflow ∈ {CRITICAL_LOSS, RAPID_SWING}:
      return WARN
  elif code ∈ {L-MIC, L-NEG} or I(u) ≥ θ_intervene:
      return ADVISE
  else:                       # G-*, C-ARC, 배치 요약
      return NOTIFY
```

### 3.2 채널별 동작

**🔴 경고(Warn)**
- 실시간 즉시 발신. 입력창 상단 슬라이드 경고 + 묵직한 햅틱.
- `CRITICAL_LOSS`/`Rapid-Swing` 시 → **반성의 거울(FUN-CHA-003) 강제 발동 연동**.
- 연인 폰에는 아무것도 가지 않음(은밀한 자가 교정).

**🟡 권고(Advise)**
- 전송 전 부드러운 넛지(💡). 내 말투로 대안 제시. 무시하고 보낼 수 있음(강제 아님).
- 예: "야 또 '됐어' 나왔다 ㅋㅋ 이거 네 빌런 멘트인 거 알지? '알겠어, 근데 나 좀 서운했어'는 어때?"

**🔵 알림(Notify)**
- 사후/주기 발신. 룸 2(트윈) 또는 룸 3(분석가)로 라우팅.
- 가산 인정: "오 방금 그 공감 좋았어. 이런 거지 👍"
- 배치 요약: "이번 주 너 단답이 6번 나왔더라. 근데 위로하는 말도 23% 늘었어. 잘하고 있어."

---

## 4. 트윈 응답 생성 (Generation) — 내 말투로

### 4.1 프롬프트 조립

```
SYSTEM = buildPersonaPrompt(User_Tone_Vector)        // Chat_logic.md §4.1 (내 말투 규칙)
       + 채널별 역할 지침(WARN/ADVISE/NOTIFY 톤)
       + 웰빙 가드레일(행동만 지적 / 인격 보호 / 균형 의무)
       + 출력 프라이버시 규칙(화살표는 나를 향함)

USER   = { 탐지 코드, 문제 발화(마스킹), 맥락 요약, 패턴 누적 횟수 }
FEWSHOT= pickFewShot(...)                             // 내 실제 말투 앵커 3~5개
```

### 4.2 채널별 역할 지침 (톤 분기)

```
WARN   : "지금 멈춰. 진지하게. "  — 짧고 묵직. 드립 최소. 성찰 유도.
ADVISE : "가볍게 짚어줄게. "      — 내 평소 드립/웃음 섞어 친근하게. 대안 1개 제시.
NOTIFY : "칭찬/요약. "            — 인정 위주. 부담 없이.
```

### 4.3 웰빙 가드레일 (FUN-CHA-001 §2.4 강제)

- **균형 의무:** 경고/권고 누적 시, 같은 세션에서 가산 인정도 최소 1회 발화.
- **자기비난 차단:** 정서 취약 신호(자책 과다 등) 감지 시 꾸짖음 강도 자동 완화 → 지지 모드.
- **인격 불가침:** "넌 글러먹었어"류 금지. 항상 "이 행동/버릇 하나"로 한정.

### 4.4 아웃풋 분할 전송 (호흡 복제)

📐 **[수식 4-1] (Chat_logic.md rhythm 연동)**
```
생성된 통문장 → 문장부호/글자수로 분할
분할 개수  ≈ User_Tone_Vector.rhythm.avgBurstSize
시간차     ≈ medianGapSec 기반 0.5~1.5초, '말하는 중...' UI
```

---

## 5. 개입 피로도 제어 (Anti-Nagging) — 핵심 UX 안전장치

트윈이 너무 자주 말 걸면 "잔소리 앱"으로 삭제당한다. v2.2의 반파밍과 대칭되는 **개입 쿨다운**.

📐 **[수식 5-1] 피로도 (EMA)**
```
fatigue ← α_f · (최근 개입 발생 1/0) + (1 − α_f) · fatigue      // α_f = 0.3
개입 후 fatigue↑ → I(u) 감소(수식 2-2) → 발화 게이트 통과 어려워짐
시간 경과 시 fatigue 자연 감쇠
```

📐 **[수식 5-2] 하드 쿨다운**
```
ADVISE/NOTIFY: 동일 코드 재발해도 X분 내 1회만 발화 (예: 15분)
WARN:          쿨다운 무시(안전 우선)
```

> 단, WARN(중대)은 피로도·쿨다운과 무관하게 항상 발신.

---

## 6. 듀얼 경로 처리 흐름 요약

### 6.1 실시간 경로 (B)
```
입력 → 2.5초 버퍼 → detect(u) → I(u) 게이트 → route() →
  WARN/ADVISE: 즉시 생성·분할 전송 (+ 필요시 FUN-CHA-003)
  NOTIFY(가산): 사후 인정 발화
```

### 6.2 배치 경로 (A)
```
.txt 업로드 → 내 발화 파싱·마스킹 → 전체 라벨링 →
  반복 패턴 TOP3 추출 → NOTIFY(습관 요약) + 필요시 ADVISE(반복 교정) →
  User_Tone_Vector EMA 갱신(Chat_logic §5) → 주간 리포트(분석가 룸3) 발행
```

---

## 7. 구현 코드 골격 (TypeScript)

```ts
type Channel = 'WARN' | 'ADVISE' | 'NOTIFY';

interface Detection {
  code: string;            // v2.2 이벤트 코드
  intensity: number;       // M_intensity
  deltaBase: number;
  overflow?: 'CRITICAL_LOSS' | 'RAPID_SWING' | 'EXCESS_GAIN';
  patternCount: number;    // 윈도우 내 동일코드 누적
}

// 공통 두뇌
function detectEvents(text: string): Detection[]            // v2.2 탐지
function interventionScore(d: Detection, fatigue: number): number   // 수식 2-2
function route(d: Detection, score: number): Channel | null         // 수식 3-1
function generateTwinReply(d: Detection, ch: Channel,
                           tone: UserToneVector, ctx: Ctx): string[] // 내 말투·분할

// 실시간 경로
function onRealtimeInput(buf: string): void {
  for (const d of detectEvents(buf)) {
    const score = interventionScore(d, state.fatigue);
    const ch = route(d, score);
    if (!ch) continue;
    if (ch !== 'WARN' && onCooldown(d.code)) continue;     // 수식 5-2
    const msgs = generateTwinReply(d, ch, tone, ctx);
    sendToTwinRoom(msgs);
    if (d.overflow) maybeTriggerMirror(d.overflow);        // FUN-CHA-003
    bumpFatigue();                                         // 수식 5-1
  }
}

// 배치 경로
function onKakaoUpload(raw: string): void {
  const mine = maskAll(filterMine(parseKakao(raw)));
  const labeled = mine.map(detectEvents).flat();
  const top = topRepeatedCodes(labeled, 3);                // 수식 2-4
  sendBatchSummary(top);                                   // NOTIFY
  tone = updateVectorEMA(tone, mine);                      // Chat_logic §5
}
```

---

## 8. 파라미터 요약 & 주의

| 파라미터 | 기본값 | 역할 |
|---|---|---|
| 입력 버퍼 | 2.5초 | 실시간 연타 합산 |
| `θ_intervene` | 0.12 | 트윈 발화 게이트 |
| `w_channel` | L 1.0 / G 0.6 | 교정 우선 가중 |
| 패턴 임계 `m_rt` | 24h 3회 | 실시간 반복 경고 |
| `α_f` (피로도) | 0.3 | 개입 피로 EMA |
| 하드 쿨다운 | 15분 | 동일코드 재발화 제한 |

**주의**
- **잔소리 리스크가 최대 적.** §5 피로도·쿨다운이 없으면 트윈은 삭제 1순위가 된다. WARN만 예외, 나머진 보수적으로.
- WARN 남발 금지: 중대 코드/오버플로우에만. 일반 마찰을 WARN으로 띄우면 '불안 판매'로 인식.
- 모든 생성·요약은 **마스킹된 내 발화**만 사용. 연인 발화 원문·추정 속마음은 출력 금지(거울 원칙).
- 정서 취약 신호 시 즉시 지지 모드 전환(웰빙 우선).
- `θ`·`α_f`·쿨다운은 출시 후 실로그로 A/B 튜닝.
