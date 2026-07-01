// ─── User_Tone_Vector Builder ─────────────────────────────────────────────────
// Chat_logic.md — 말투 학습 엔진. Stage 1(피처 추출) → Stage 2(벡터 조립) →
// Stage 3(프롬프트 주입) → Stage 4(EMA 지속 학습).
//
// Consumes the already-filtered/masked "my lines only" output of
// kakaoParser.parseKakaoExport (partner utterances never reach this module).
// Rhythm/burst stats are intentionally NOT duplicated here — those already
// live in ChatStyleProfile (kakaoParser.analyzeChatRhythm + chat.tsx's
// rolling-average EMA); this module covers laughter/endings/drips/emoji/lexical.

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Public schema (§3) ────────────────────────────────────────────────────────

export interface UserToneVector {
  meta: {
    messageCount: number;
    confidence: number;   // 0~1, §2.7
    updatedAt: string;
  };
  laughter: {
    frequency: number;                        // f_laugh
    signatureToken: string;                    // e.g. "ㅋㅋㅋ"
    typeDistribution: Record<string, number>;  // { "ㅋ": 0.72, "ㅎ": 0.21, ... }
    meanLength: number;                        // μ_ℓ
  };
  endings: {
    top: { pattern: string; p: number }[];
    formality: number;   // 0(축약/신조) ~ 1(존댓말체)
  };
  drips: { phrase: string; score: number; count: number }[];
  emoji: {
    density: number;   // tokens per message
    top: { token: string; p: number }[];
    style: 'emoji' | 'jaso' | 'special';
  };
  lexical: {
    ttr: number;                // 어휘 다양성 (type-token ratio)
    questionRate: number;
    exclamationRate: number;
    consonantOnlyRate: number;  // ㅇㅇ, ㄱㄱ 등 순수자음 메시지 비율
  };
}

const N_TARGET = 500; // §2.7

export function computeConfidence(n: number): number {
  return round4(Math.min(1, n / N_TARGET));
}

// ── §2.1 Laughter profile ─────────────────────────────────────────────────────

const LAUGH_RE = /(ㅋ{2,}|ㅎ{2,}|크{2,}|키{2,}|푸하+|ㅍㅎ|kkk+|lol|lmao)/gi;

function classifyLaughType(token: string): string {
  const t = token.toLowerCase();
  if (/^ㅋ+$/.test(t)) return 'ㅋ';
  if (/^ㅎ+$/.test(t)) return 'ㅎ';
  if (/^크+$/.test(t)) return '크';
  if (/^키+$/.test(t)) return '키';
  if (/^푸하+$/.test(t)) return '푸하';
  if (/^ㅍㅎ$/.test(t)) return 'ㅍㅎ';
  return '기타';
}

export function extractLaughter(lines: string[]): UserToneVector['laughter'] {
  let linesWithLaugh = 0;
  const tokenCount = new Map<string, number>();
  const typeTotals = new Map<string, number>();
  const lengths: number[] = [];

  for (const line of lines) {
    const matches = line.match(LAUGH_RE);
    if (!matches || matches.length === 0) continue;
    linesWithLaugh++;
    for (const raw of matches) {
      const token = raw.toLowerCase();
      tokenCount.set(token, (tokenCount.get(token) ?? 0) + 1);
      const type = classifyLaughType(token);
      typeTotals.set(type, (typeTotals.get(type) ?? 0) + 1);
      lengths.push(raw.length);
    }
  }

  const totalTokens = [...typeTotals.values()].reduce((a, b) => a + b, 0);
  const typeDistribution: Record<string, number> = {};
  for (const [type, count] of typeTotals) {
    typeDistribution[type] = totalTokens > 0 ? round4(count / totalTokens) : 0;
  }

  let signatureToken = 'ㅋㅋ';
  let best = -1;
  for (const [token, count] of tokenCount) {
    if (count > best) {
      best = count;
      signatureToken = token;
    }
  }

  const meanLength =
    lengths.length > 0 ? round2(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0;

  return {
    frequency: lines.length > 0 ? round4(linesWithLaugh / lines.length) : 0,
    signatureToken,
    typeDistribution,
    meanLength,
  };
}

// ── §2.2 / §2.6 Sentence-ending profile + formality ──────────────────────────

const ENDING_TAIL_RE =
  /(자나|거든|는데|ㅇㅇ|ㄱㄱ|넹|뇽|셈|삼|함|임|음|지|징|당|용|어|아|야|냐|까|쥐|쪙)$/;

// 신조/축약체 어미 — 격식 지수 계산 시 -1
const SLANG_ENDINGS = new Set([
  'ㅇㅇ', 'ㄱㄱ', '넹', '뇽', '셈', '삼', '함', '임', '음', '징', '당', '용', '쥐', '쪙',
]);

function stripTrailingDecoration(text: string): string {
  return text.replace(/[!?.,~ㅋㅎㅠㅜ\s]+$/gu, '').trim();
}

// +1 존댓말 / 0 반말 / -1 축약·신조체
function classifyFormality(ending: string): number {
  if (ending.endsWith('요') || ending.endsWith('니다')) return 1;
  if (SLANG_ENDINGS.has(ending)) return -1;
  return 0;
}

export function extractEndings(lines: string[]): UserToneVector['endings'] {
  const freq = new Map<string, number>();

  for (const raw of lines) {
    const stripped = stripTrailingDecoration(raw);
    if (!stripped) continue;
    const tail = stripped.slice(-4);
    const match = tail.match(ENDING_TAIL_RE);
    const ending = match ? match[0] : stripped.slice(-1);
    if (!ending) continue;
    freq.set(ending, (freq.get(ending) ?? 0) + 1);
  }

  const total = [...freq.values()].reduce((a, b) => a + b, 0);
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pattern, count]) => ({ pattern, p: total > 0 ? round4(count / total) : 0 }));

  let weightedSum = 0;
  let totalCount = 0;
  for (const [ending, count] of freq) {
    weightedSum += classifyFormality(ending) * count;
    totalCount += count;
  }
  const formality = totalCount > 0 ? round4((weightedSum / totalCount + 1) / 2) : 0.5;

  return { top, formality };
}

// ── §2.3 Signature drips (TF-IDF against an embedded baseline table) ────────
//
// A full Korean-corpus n-gram frequency table isn't practical to embed
// on-device here, so a small set of extremely common connective/filler
// words stands in as the idf floor (§2.3's "베이스라인 한국어 빈도 테이블").
// Any gram absent from this table is treated as OOV → max idf, so rare
// user-specific coinages still surface as signature drips.

const BASELINE_FREQ: Record<string, number> = {
  '그래서': 500, '그러면': 400, '근데': 900, '그리고': 600, '하지만': 300, '그런데': 500,
  '나는': 800, '너는': 700, '이거': 600, '저거': 400, '오늘': 700, '진짜': 650,
  '그냥': 700, '많이': 500, '너무': 800, '완전': 400, '아니': 900, '그래': 600,
  '알겠어': 300, '그래도': 400, '있어': 700, '없어': 700, '했어': 600,
  '거야': 500, '하는데': 300, '했는데': 300, '이제': 400, '먼저': 200, '만약': 150,
};
const BASELINE_TOTAL = Object.values(BASELINE_FREQ).reduce((a, b) => a + b, 0);

const WORD_TOKEN_RE = /[가-힣a-zA-Z0-9]+/g;
const STOP_GRAM_RE = /^(그래서|그러면|근데|그리고|하지만|그런데)$/;

function generateWordNgrams(line: string, maxN = 2): string[] {
  const words = line.match(WORD_TOKEN_RE) ?? [];
  const grams: string[] = [];
  for (let n = 1; n <= maxN; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      grams.push(words.slice(i, i + n).join(' '));
    }
  }
  return grams;
}

function scoreDrip(gram: string, count: number, n: number): number {
  const tf = count / Math.max(n, 1);
  const cfBase = BASELINE_FREQ[gram] ?? 0;
  const idf = Math.log((1 + BASELINE_TOTAL) / (1 + cfBase)) + 1;
  return round4(tf * idf);
}

export function extractDrips(lines: string[]): UserToneVector['drips'] {
  const countU = new Map<string, number>();

  for (const line of lines) {
    for (const gram of generateWordNgrams(line)) {
      if (gram.length < 2) continue;
      if (STOP_GRAM_RE.test(gram)) continue;
      countU.set(gram, (countU.get(gram) ?? 0) + 1);
    }
  }

  const n = Math.max(lines.length, 1);
  const thetaFreq = Math.max(5, Math.round(n * 0.005));

  return [...countU.entries()]
    .filter(([, count]) => count >= thetaFreq)
    .map(([phrase, count]) => ({ phrase, count, score: scoreDrip(phrase, count, n) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

// ── §2.4 Emoji / emoticon profile ─────────────────────────────────────────────

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const JASO_STYLE_RE = /(\^\^|ㅠㅠ|ㅜㅜ|;;)/g;

export function extractEmoji(lines: string[]): UserToneVector['emoji'] {
  let emojiTotal = 0;
  let jasoTotal = 0;
  const tokenCount = new Map<string, number>();

  for (const line of lines) {
    const emojis = line.match(EMOJI_RE) ?? [];
    emojiTotal += emojis.length;
    for (const e of emojis) tokenCount.set(e, (tokenCount.get(e) ?? 0) + 1);

    const jasoMatches = line.match(JASO_STYLE_RE) ?? [];
    jasoTotal += jasoMatches.length;
    for (const j of jasoMatches) tokenCount.set(j, (tokenCount.get(j) ?? 0) + 1);
  }

  const totalTokens = emojiTotal + jasoTotal;
  const top = [...tokenCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([token, count]) => ({ token, p: totalTokens > 0 ? round4(count / totalTokens) : 0 }));

  const style: UserToneVector['emoji']['style'] =
    emojiTotal === 0 && jasoTotal === 0 ? 'special' : emojiTotal >= jasoTotal ? 'emoji' : 'jaso';

  return {
    density: lines.length > 0 ? round4(totalTokens / lines.length) : 0,
    top,
    style,
  };
}

// ── §2.6 Lexical / style stats ────────────────────────────────────────────────

const CONSONANT_ONLY_RE = /^[ㄱ-ㅎ]+$/;

export function extractLexical(lines: string[]): UserToneVector['lexical'] {
  const n = Math.max(lines.length, 1);
  let questionCount = 0;
  let exclCount = 0;
  let consonantOnlyCount = 0;
  const wordSet = new Set<string>();
  let totalWords = 0;

  for (const line of lines) {
    if (line.includes('?')) questionCount++;
    if (line.includes('!')) exclCount++;
    if (CONSONANT_ONLY_RE.test(line.trim())) consonantOnlyCount++;

    const words = line.match(WORD_TOKEN_RE) ?? [];
    totalWords += words.length;
    for (const w of words) wordSet.add(w);
  }

  return {
    ttr: totalWords > 0 ? round4(wordSet.size / totalWords) : 0,
    questionRate: round4(questionCount / n),
    exclamationRate: round4(exclCount / n),
    consonantOnlyRate: round4(consonantOnlyCount / n),
  };
}

// ── Stage 2 — assembler ───────────────────────────────────────────────────────

export function buildUserToneVector(myLines: string[]): UserToneVector {
  const n = myLines.length;
  return {
    meta: {
      messageCount: n,
      confidence: computeConfidence(n),
      updatedAt: new Date().toISOString(),
    },
    laughter: extractLaughter(myLines),
    endings: extractEndings(myLines),
    drips: extractDrips(myLines),
    emoji: extractEmoji(myLines),
    lexical: extractLexical(myLines),
  };
}

// ── Stage 3 — prompt injection (§4.1) ────────────────────────────────────────

export function buildToneVectorPromptSection(v: UserToneVector): string {
  const lines: string[] = [];
  const soft = v.meta.confidence < 0.4; // §2.7 — 저신뢰 시 강제 톤 완화

  const laughPct = Math.round(v.laughter.frequency * 100);
  const typeStr = Object.entries(v.laughter.typeDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([type, p]) => `${type}:${Math.round(p * 100)}%`)
    .join(' / ');

  lines.push(
    `[웃음] 주로 "${v.laughter.signatureToken}"를 쓴다. 웃음 비중 ${laughPct}%.${typeStr ? ` (${typeStr})` : ''}`,
  );

  if (v.endings.top.length > 0) {
    const endingsStr = v.endings.top.map((e) => e.pattern).join(', ');
    const formalityLabel =
      v.endings.formality < 0.3 ? '반말/축약체' : v.endings.formality > 0.7 ? '존댓말체' : '편한 반말';
    lines.push(`[어미] 자주 쓰는 어미: ${endingsStr}. 말투 격식: ${formalityLabel}`);
  }

  if (v.drips.length > 0) {
    lines.push(
      `[시그니처 드립] 이 표현들을 자연스럽게 섞어라: ${v.drips.slice(0, 5).map((d) => d.phrase).join(', ')}`,
    );
  }

  if (v.emoji.top.length > 0) {
    lines.push(
      `[이모지] 스타일 ${v.emoji.style}, 평균 ${v.emoji.density.toFixed(2)}/메시지, 자주: ${v.emoji.top
        .map((e) => e.token)
        .join(' ')}`,
    );
  }

  lines.push(
    `[성향] 질문 ${Math.round(v.lexical.questionRate * 100)}%, 감탄 ${Math.round(
      v.lexical.exclamationRate * 100,
    )}%, 자음단답 ${Math.round(v.lexical.consonantOnlyRate * 100)}%`,
  );

  if (soft) {
    lines.push('[주의] 학습 데이터가 아직 적어(신뢰도 낮음) 위 말투 특징은 참고만 하고 가능한 선에서만 반영하세요.');
  }

  return lines.join('\n');
}

// ── Stage 3 — few-shot style anchors (§4.2) ──────────────────────────────────
// Picks up to k real (already-masked) lines that best exemplify the detected
// signature drips/laughter, to use as few-shot anchors in the LLM prompt.

export function pickFewShotAnchors(lines: string[], v: UserToneVector, k = 5): string[] {
  const dripPhrases = v.drips.slice(0, 5).map((d) => d.phrase);

  const scored = lines
    .map((line) => {
      let score = 0;
      if ((line.match(LAUGH_RE) ?? []).length > 0) score += 1;
      for (const phrase of dripPhrases) {
        if (line.includes(phrase)) score += 2;
      }
      return { line, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, k).map((s) => s.line);
}

// ── Stage 4 — continuous learning (EMA, §5.1) ────────────────────────────────
//
// Frequency-type fields (laughter distribution, endings, emoji) are updated
// via exponential moving average. Drips accumulate raw counts and have their
// score recomputed against the merged corpus size, per §5.1's note that drip
// scores are batch-recomputed rather than EMA-blended directly.

export function updateToneVectorEMA(
  old: UserToneVector,
  batchLines: string[],
  alpha = 0.2,
): UserToneVector {
  if (batchLines.length === 0) return old;

  const batch = buildUserToneVector(batchLines);
  const mergedN = old.meta.messageCount + batchLines.length;

  // Laughter
  const mergedTypeDist: Record<string, number> = { ...old.laughter.typeDistribution };
  for (const [type, p] of Object.entries(batch.laughter.typeDistribution)) {
    mergedTypeDist[type] = round4((mergedTypeDist[type] ?? 0) * (1 - alpha) + p * alpha);
  }
  const laughter: UserToneVector['laughter'] = {
    frequency: round4(old.laughter.frequency * (1 - alpha) + batch.laughter.frequency * alpha),
    signatureToken: batch.laughter.meanLength > 0 ? batch.laughter.signatureToken : old.laughter.signatureToken,
    typeDistribution: mergedTypeDist,
    meanLength: round2(
      old.laughter.meanLength * (1 - alpha) + (batch.laughter.meanLength || old.laughter.meanLength) * alpha,
    ),
  };

  // Endings — blend weighted rank, re-take top-5
  const endingWeights = new Map<string, number>();
  for (const e of old.endings.top) endingWeights.set(e.pattern, e.p * (1 - alpha));
  for (const e of batch.endings.top) {
    endingWeights.set(e.pattern, (endingWeights.get(e.pattern) ?? 0) + e.p * alpha);
  }
  const endings: UserToneVector['endings'] = {
    top: [...endingWeights.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern, p]) => ({ pattern, p: round4(p) })),
    formality: round4(old.endings.formality * (1 - alpha) + batch.endings.formality * alpha),
  };

  // Drips — accumulate counts, recompute score against merged N
  const dripCounts = new Map<string, number>();
  for (const d of old.drips) dripCounts.set(d.phrase, d.count);
  for (const d of batch.drips) dripCounts.set(d.phrase, (dripCounts.get(d.phrase) ?? 0) + d.count);
  const drips = [...dripCounts.entries()]
    .map(([phrase, count]) => ({ phrase, count, score: scoreDrip(phrase, count, mergedN) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  // Emoji
  const emojiWeights = new Map<string, number>();
  for (const e of old.emoji.top) emojiWeights.set(e.token, e.p * (1 - alpha));
  for (const e of batch.emoji.top) {
    emojiWeights.set(e.token, (emojiWeights.get(e.token) ?? 0) + e.p * alpha);
  }
  const emoji: UserToneVector['emoji'] = {
    density: round4(old.emoji.density * (1 - alpha) + batch.emoji.density * alpha),
    top: [...emojiWeights.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([token, p]) => ({ token, p: round4(p) })),
    style: batch.emoji.top.length > 0 ? batch.emoji.style : old.emoji.style,
  };

  // Lexical
  const lexical: UserToneVector['lexical'] = {
    ttr: round4(old.lexical.ttr * (1 - alpha) + batch.lexical.ttr * alpha),
    questionRate: round4(old.lexical.questionRate * (1 - alpha) + batch.lexical.questionRate * alpha),
    exclamationRate: round4(old.lexical.exclamationRate * (1 - alpha) + batch.lexical.exclamationRate * alpha),
    consonantOnlyRate: round4(
      old.lexical.consonantOnlyRate * (1 - alpha) + batch.lexical.consonantOnlyRate * alpha,
    ),
  };

  return {
    meta: {
      messageCount: mergedN,
      confidence: computeConfidence(mergedN),
      updatedAt: new Date().toISOString(),
    },
    laughter,
    endings,
    drips,
    emoji,
    lexical,
  };
}
