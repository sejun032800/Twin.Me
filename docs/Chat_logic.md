# 📑 Chat_logic.md — 말투 학습 엔진 (User_Tone_Vector Builder)

> **목적:** 사용자의 카카오톡 대화에서 **시그니처 드립·웃음 빈도·어미·이모티콘·호흡**까지 정량 추출하여, 트윈 AI(FUN-CHA-001)가 "내 말투 그대로" 말하도록 만드는 `User_Tone_Vector`를 생성한다.
> **관계:** 기존 FUN-ONB-002(온디바이스 말투 학습)의 **구현 상세 보강**. FUN-CHA-001 트윈의 페르소나 입력원. FUN-SET-001(프라이버시 슬라이더)이 본 엔진의 갱신 동작을 제어한다.
> **원칙:** 모든 연산은 **온디바이스(클라이언트)**. 연인 발화는 추출 전 Drop. 민감정보는 서버 전송 전 마스킹.

---

## 0. 파이프라인 개관

```
[.txt 원본]
  → Stage 0  파싱·필터·마스킹     (내 발화만 남김)
  → Stage 1  피처 추출 (수학)      (웃음·어미·드립·이모지·호흡·어휘)
  → Stage 2  User_Tone_Vector 조립 (구조화 JSON)
  → Stage 3  프롬프트 주입          (벡터 → 트윈 말투)
  → Stage 4  지속 학습 (EMA)        (privacy Lv3에서 실시간 갱신)
```

설계 철학: 트윈이 LLM이므로 **밀집 임베딩이 아니라 해석 가능한 구조화 프로파일**을 만든다. 사람이 읽고 검증 가능하며, 프롬프트에 자연어로 주입하기 쉽다.

---

## 1. Stage 0 — 파싱 · 필터 · 마스킹

### 1.1 카카오톡 라인 파싱 (Regex)

카카오톡 내보내기 포맷을 정규식으로 분해한다.

```
# Android/PC: "2024. 6. 15. 오후 11:23, 창업가 : 메시지"
^(?<date>\d{4}\.\s?\d{1,2}\.\s?\d{1,2}\.)\s?(?<ampm>오전|오후)\s?(?<time>\d{1,2}:\d{2}),\s?(?<speaker>.+?)\s?:\s?(?<text>.*)$

# iOS: "[창업가] [오후 11:23] 메시지"
^\[(?<speaker>.+?)\]\s?\[(?<ampm>오전|오후)\s?(?<time>\d{1,2}:\d{2})\]\s?(?<text>.*)$
```

- 멀티라인 메시지(개행 포함)는 다음 화자 라인 전까지 이어붙임.
- 시스템 라인("님이 들어왔습니다" 등)은 제거.

### 1.2 화자 필터 (프라이버시 1차)

```
U = { text | speaker == ME }          // 내 발화만 보존
DROP all lines where speaker != ME    // 연인 발화는 즉시 폐기 (서버 전송 X)
```

### 1.3 PII 마스킹

```
전화번호  /01[0-9]-?\d{3,4}-?\d{4}/         → ***
계좌/카드 /\d{2,6}-?\d{2,6}-?\d{2,6}/        → ***
주민번호  /\d{6}-?[1-4]\d{6}/               → ***
```

**Stage 0 출력:** 마스킹된 내 발화 배열 `U = [u₁, u₂, ..., u_N]` (N = 내 메시지 수).

---

## 2. Stage 1 — 피처 추출 (수학)

### 2.1 웃음 프로파일 (Laughter Profile)

한국어 웃음은 자모 단위 반복이 핵심 시그니처다.

📐 **[수식 2-1] 웃음 토큰 탐지**
```
laughRegex = /(ㅋ{2,}|ㅎ{2,}|ㅡㅋ|크{2,}|키{2,}|푸하+|ㅍㅎ|kkk+|lol|lmao)/g
```

각 웃음 토큰 t에 대해 유형 `τ(t) ∈ {ㅋ, ㅎ, 크, 키, ...}` 와 길이 `ℓ(t)`(자모 반복 수)를 추출.

📐 **[수식 2-2] 핵심 지표**
```
웃음 빈도        f_laugh = |{ u ∈ U : u에 웃음 토큰 포함 }| / N
유형 분포        P(τ) = count(τ) / Σ count(·)          // {ㅋ:0.72, ㅎ:0.21, ...}
평균 길이        μ_ℓ = mean( ℓ(t) for all t )
시그니처 웃음     sigLaugh = argmax_{(τ, ℓ)} count(τ, ℓ)   // 예: ("ㅋ", 3) → "ㅋㅋㅋ"
```

📐 **[수식 2-3] 웃음 에스컬레이션 경향 (선택)**
긍정 강도(느낌표·긍정 이모지 수)를 proxy `a(u)`로 두고, 웃음 길이와의 상관:
```
ρ_escalate = Pearson( ℓ(t),  a(u(t)) )      // ρ↑ → 신날수록 ㅋ를 길게 씀
```

### 2.2 어미 프로파일 (Sentence Ending Profile)

어미는 말투의 인격을 가장 강하게 드러낸다.

📐 **[수식 2-4] 어미 추출**
각 발화의 말미에서 어미 후보를 정규식으로 추출(구두점·웃음·이모지 제거 후 마지막 1~4음절).
```
endingCandidates = /(자나|거든|는데|ㅇㅇ|ㄱㄱ|넹|뇽|셈|삼|함|임|음|지|징|당|용|어|아|야|냐|까|쥐|쪙)$/
```

📐 **[수식 2-5] 어미 분포 & Top-K**
```
E = { (eᵢ, pᵢ) },   pᵢ = count(eᵢ) / Σ count(·)
sigEndings = TopK(E by pᵢ, K=5)
```

📐 **[수식 2-6] 반말/존댓말 격식 지수**
어미를 클래스 c ∈ {존댓말(+1), 반말(0), 축약/신조(−1)}로 매핑, 가중 평균 후 [0,1] 정규화:
```
F_formality = ( Σ pᵢ · w(c(eᵢ)) + 1 ) / 2        // 0=극축약체, 1=존댓말체
```

### 2.3 시그니처 드립 (Signature Drips) — TF-IDF 기반 (핵심·최고난도)

"이 사람만 쓰는 입버릇"을 찾는다. 핵심은 **사용자에겐 자주 + 일반 한국어엔 드문** 표현.

📐 **[수식 2-7] n-gram 후보 생성**
- 어절 단위 1~3-gram + 문자 단위 2~5-gram 모두 생성.
- 웃음/이모지/순수 자음(ㅇㅇ 등)은 제외(별도 프로파일에서 처리).

📐 **[수식 2-8] 드립 점수 (TF-IDF 변형)**
앱에 동봉한 **베이스라인 한국어 빈도 테이블**(일반 대화 코퍼스 n-gram 빈도 `cf_base`)과 비교.
```
tf_user(g)  = count_U(g) / N
idf_base(g) = log( (1 + Σcf_base) / (1 + cf_base(g)) ) + 1     // OOV(미등재)면 idf 최대
score(g)    = tf_user(g) · idf_base(g)
```

📐 **[수식 2-9] 필터링 & 랭킹**
```
유효 조건:  count_U(g) ≥ θ_freq   (예: N의 0.5% 또는 최소 5회)
            len(g) ≥ θ_len        (의미 없는 1음절 차단)
sigDrips = TopK( {g : 유효} by score(g), K=10 )
```

> 직관: 일반인이 잘 안 쓰는데(높은 idf) 내가 반복하는(높은 tf) 표현 → 시그니처 드립. 베이스라인에 아예 없는 신조어/조합은 idf가 최대치라 강하게 포착된다.

### 2.4 이모지/이모티콘 프로파일

📐 **[수식 2-10]**
```
이모지 밀도   e_density = (총 이모지 수) / N
Top 이모지    TopK(이모지 빈도, K=5)
스타일 분류   style = argmax( P(emoji 😊), P(자소형 ㅎㅎ/^^), P(특수 ;;/ㅠㅠ) )
```

### 2.5 호흡/버스트 프로파일 (Rhythm) — FUN-CHA-001 분할 전송 연동

타임스탬프로 "어떻게 끊어 보내는지"를 학습 → 트윈의 아웃풋 스플리터에 주입.

📐 **[수식 2-11] 버스트 탐지**
연속한 내 메시지의 도착 간격 `Δtᵢ`. `Δtᵢ < τ_burst`(예 30초)면 같은 버스트로 묶음.
```
avgBurstSize  = mean( 버스트당 메시지 수 )
avgCharsPerMsg = mean( len(uᵢ) )
medianGap     = median( Δtᵢ )      // 분할 전송 시간차 베이스
```

### 2.6 어휘·문체 통계

📐 **[수식 2-12]**
```
타입-토큰 비율  TTR = |고유 어절| / |전체 어절|        // 어휘 다양성
질문율          q_rate = |{u : '?' 포함}| / N
감탄율          x_rate = |{u : '!' 포함}| / N
순수자음 메시지율 c_rate = |{u : 자음만}| / N            // ㅇㅇ, ㄱㄱ
비속어 빈도     f_profanity = |{u : 비속어 사전 매칭}| / N
```

### 2.7 신뢰도 (Confidence) — 샘플 수 기반

데이터가 적으면 프로파일을 약하게 신뢰해야 한다(과적합 방지).

📐 **[수식 2-13]**
```
confidence = min( 1,  N / N_target )       // N_target = 500 (권장)
또는  confidence = 1 − e^(−N / N₀),  N₀ = 300
```

신뢰도가 낮으면 트윈 프롬프트에서 말투 강제 강도를 약화(§5.2).

---

## 3. Stage 2 — User_Tone_Vector 스키마

```ts
interface UserToneVector {
  meta: {
    messageCount: number;            // N
    dateRange: [string, string];
    confidence: number;              // 0~1  (수식 2-13)
    updatedAt: string;
  };
  laughter: {
    frequency: number;               // f_laugh
    signatureToken: string;          // "ㅋㅋㅋ"
    typeDistribution: Record<string, number>; // {"ㅋ":0.72,"ㅎ":0.21}
    meanLength: number;              // μ_ℓ
    escalation: number;              // ρ_escalate (-1~1)
  };
  endings: {
    top: { pattern: string; p: number }[];   // sigEndings
    formality: number;               // F_formality 0~1
  };
  drips: { phrase: string; score: number; count: number }[]; // sigDrips
  emoji: {
    density: number;                 // e_density
    top: { token: string; p: number }[];
    style: 'emoji' | 'jaso' | 'special';
  };
  rhythm: {
    avgCharsPerMsg: number;
    avgBurstSize: number;
    medianGapSec: number;
  };
  lexical: {
    ttr: number;
    questionRate: number;
    exclamationRate: number;
    consonantOnlyRate: number;
    profanityRate: number;
  };
}
```

---

## 4. Stage 3 — 프롬프트 주입 (벡터 → 트윈 말투)

구조화 벡터를 **자연어 페르소나 지침 + Few-Shot 앵커**로 변환하여 트윈 LLM 호출 시 system 프롬프트에 주입한다.

### 4.1 페르소나 프롬프트 빌더 (템플릿)

```
너는 사용자 '본인'의 말투를 복제한 분신(트윈)이다.
아래 말투 규칙을 반드시 지켜 사용자처럼 말해라.

[웃음]  주로 "{signatureToken}"를 쓴다. 웃음 비중 {frequency*100}%.
        (ㅋ:{ㅋ%} / ㅎ:{ㅎ%})  신날수록 길어짐: {escalation>0.3 ? "있음":"적음"}
[어미]  자주 쓰는 어미: {top endings join ", "}.  말투 격식: {formality<0.3?"반말/축약체":formality>0.7?"존댓말체":"편한 반말"}
[시그니처 드립]  이 표현들을 자연스럽게 섞어라: {sigDrips join ", "}
[이모지]  스타일 {style}, 평균 {density}/메시지, 자주: {top emoji}
[호흡]  메시지를 평균 {avgBurstSize}개로 끊어 보냄. 한 메시지 평균 {avgCharsPerMsg}자.
[성향]  질문 {questionRate}, 감탄 {exclamationRate}, 자음단답 {consonantOnlyRate}, 비속어 {profanityRate}.
```

### 4.2 Few-Shot 스타일 앵커

- 마스킹된 실제 사용자 발화 중 **드립·시그니처 웃음이 포함된 대표 발화 3~5개**를 예시로 첨부(원문 그대로가 가장 강한 앵커).
- 신뢰도(confidence)가 낮으면 강제 어조를 완화: "가능하면 ~" 수준으로 톤다운.

### 4.3 호흡 연동

`rhythm.avgBurstSize` / `medianGapSec`를 FUN-CHA-001 §4 아웃풋 스플리터의 분할 개수·시간차 파라미터로 직접 매핑.

---

## 5. Stage 4 — 지속 학습 (Continuous Learning) & 프라이버시 연동

### 5.1 지수이동평균(EMA) 갱신

새 메시지 유입 시 전체 재학습 없이 분포를 점진 갱신(최근 말투에 가중).

📐 **[수식 5-1]**
```
p_new = α · p_observed_batch + (1 − α) · p_old      // α = 0.2 (튜닝)
```
- 빈도형 지표(웃음 분포, 어미 분포, 이모지)는 EMA로 갱신.
- 드립은 카운트 누적 후 주기적으로 score 재계산(예: 일 1회 배치).

### 5.2 프라이버시 슬라이더(FUN-SET-001) 연동

```
Lv3 완전복제 : EMA 실시간 갱신 ON.  말투 전면 학습.
Lv2 최적화   : 말투 EMA 갱신 PAUSE.  키워드/관심사만 추출(드립·어미 동결).
Lv1 보호     : 리스너 종료.  온보딩 시점 스냅샷 벡터만 사용(갱신 없음).
```

---

## 6. 구현 코드 골격 (TypeScript · 온디바이스)

```ts
// ── Stage 0
function parseKakao(raw: string): Msg[]                  // regex 파싱
function filterMine(msgs: Msg[], me: string): string[]   // 연인 발화 Drop
function maskPII(text: string): string

// ── Stage 1 (각 추출기: 순수 함수)
function extractLaughter(U: string[]): UserToneVector['laughter']
function extractEndings(U: string[]): UserToneVector['endings']
function extractDrips(U: string[], baseFreq: FreqTable): UserToneVector['drips']
function extractEmoji(U: string[]): UserToneVector['emoji']
function extractRhythm(msgs: Msg[]): UserToneVector['rhythm']
function extractLexical(U: string[], profanityLex: Set<string>): UserToneVector['lexical']

// ── Stage 2
function assembleVector(parts, meta): UserToneVector

// ── Stage 3
function buildPersonaPrompt(v: UserToneVector): string
function pickFewShot(U: string[], v: UserToneVector, k=5): string[]

// ── Stage 4
function updateVectorEMA(old: UserToneVector, batch: string[], alpha=0.2): UserToneVector
```

**온디바이스 제약 및 의존성**
- 모든 추출은 순수 JS 정규식·집계로 동작(무거운 형태소 분석기 불필요). 어미/드립은 패턴+빈도 기반 근사.
- **동봉 에셋:** ① 베이스라인 한국어 n-gram 빈도 테이블(`baseFreq`, 압축 JSON) ② 비속어 사전(`profanityLex`) ③ 웃음/이모티콘 패턴 테이블.
- 베이스라인 테이블은 드립 추출(idf)의 품질을 좌우 → 상위 수만 개 n-gram으로 구성 권장.
- 원본 .txt 및 연인 발화는 추출 직후 **기기·서버에서 영구 파기**(FUN-ONB-002 원칙 계승).

---

## 7. 파라미터 요약 & 주의

| 파라미터 | 기본값 | 역할 |
|---|---|---|
| `τ_burst` | 30초 | 버스트 묶음 간격 |
| `θ_freq` | max(5, 0.5%·N) | 드립 최소 출현 |
| `θ_len` | 2음절 | 드립 최소 길이 |
| `K(드립/어미/이모지)` | 10 / 5 / 5 | Top-K |
| `N_target` | 500 | 신뢰도 포화 기준 |
| `α (EMA)` | 0.2 | 지속 학습 가중 |

**주의**
- 드립 추출의 핵심은 **베이스라인 빈도 테이블 품질**. 이게 빈약하면 흔한 표현이 드립으로 오인됨.
- 신뢰도(N)가 낮을 때 말투를 강하게 강제하면 트윈이 어색해짐 → §5.2/§4.2로 강도 자동 조절.
- 모든 Few-Shot 앵커·공유 산출물은 PII 마스킹 후에만 사용(연인 원문 비노출).
- 어미/드립 패턴 테이블은 지역·연령대별 말투 차이가 크므로 출시 후 실데이터로 보강 대상.
