// ─── KakaoTalk .txt Pre-processing Pipeline ──────────────────────────────────
//
// Security contract:
//   1. All lines that begin with "[<partner name>]" are DROPPED before any
//      analysis — partner's utterances never leave the device in raw form.
//   2. Phone numbers and account numbers are masked with "***".
//   3. The raw file string is never stored; only the sanitised output is kept
//      and only the extracted persona tokens are sent to the server.

export interface ParseResult {
  myLines: string[];
  droppedPartnerLines: number;
  maskedCount: number;
  topDrips: string[];        // top-3 signature expressions
}

// ─── Chat Style Profile ───────────────────────────────────────────────────────

export interface ChatStyleProfile {
  burstInterval: number;          // ms to wait before AI responds after rapid sends
  avgCharsPerBubble: number;      // avg chars per message bubble
  splitTriggerPatterns: string[]; // top-5 user endings that signal a new bubble
  typingSpeedFactor: number;      // ms per character for delay calculation
}

export const DEFAULT_CHAT_STYLE_PROFILE: ChatStyleProfile = {
  burstInterval: 2000,
  avgCharsPerBubble: 15,
  splitTriggerPatterns: ['ㅋㅋ', 'ㅠㅠ', '근데', '음', '!', '?'],
  typingSpeedFactor: 60,
};

// ── Phone & account number patterns ──────────────────────────────────────────

// Korean mobile: 010-XXXX-XXXX, 010.XXXX.XXXX, 01012345678
const PHONE_RE =
  /(?:01[016789])[-.\s]?\d{3,4}[-.\s]?\d{4}/g;

// Korean landline: 02-XXXX-XXXX, 031-XXX-XXXX etc.
const LANDLINE_RE =
  /0\d{1,2}[-.\s]\d{3,4}[-.\s]\d{4}/g;

// Bank account numbers: XX-XXXXXX-XXXXX (hypen-separated, 3 segments)
// Middle segment: 3-8 digits to cover banks like NH(3), KB(6), etc.
const ACCOUNT_RE =
  /\d{2,4}[-–]\d{3,8}[-–]\d{2,6}/g;

function maskSensitive(text: string): [string, number] {
  let count = 0;
  let result = text
    .replace(PHONE_RE, () => { count++; return '***'; })
    .replace(LANDLINE_RE, () => { count++; return '***'; })
    .replace(ACCOUNT_RE, () => { count++; return '***'; });
  return [result, count];
}

// ── KakaoTalk line classifier ─────────────────────────────────────────────────
//
// Two export formats are supported:
//   iOS:         [이름] [오전/오후 HH:MM] message content
//   Android/PC:  2024. 6. 15. 오후 11:23, 이름 : message content
//
// System lines (date headers, entry/exit notices) look like:
//   --------------- 2024년 1월 1일 월요일 ---------------
//   홍길동 님이 들어왔습니다.

const IOS_MSG_RE = /^\[(.+?)\] \[(오전|오후) (\d{1,2}):(\d{2})\] (.*)$/;
const ANDROID_MSG_RE =
  /^\d{4}\.\s?\d{1,2}\.\s?\d{1,2}\.\s?(오전|오후)\s?(\d{1,2}):(\d{2}),\s?(.+?)\s?:\s?(.*)$/;

export interface ParsedKakaoLine {
  speaker: string;
  content: string;
  hour: number;   // 24h
  minute: number;
}

function to24h(ampm: string, hourStr: string): number {
  let h = parseInt(hourStr, 10);
  if (ampm === '오후' && h < 12) h += 12;
  if (ampm === '오전' && h === 12) h = 0;
  return h;
}

// Parses a single raw line from either export format. Returns null for
// system lines (date headers, join/exit notices) that carry no message.
export function parseKakaoLine(raw: string): ParsedKakaoLine | null {
  const ios = raw.match(IOS_MSG_RE);
  if (ios) {
    const [, speaker, ampm, hourStr, minStr, content] = ios;
    return { speaker, content, hour: to24h(ampm, hourStr), minute: parseInt(minStr, 10) };
  }

  const android = raw.match(ANDROID_MSG_RE);
  if (android) {
    const [, ampm, hourStr, minStr, speaker, content] = android;
    return { speaker: speaker.trim(), content, hour: to24h(ampm, hourStr), minute: parseInt(minStr, 10) };
  }

  return null;
}

// ── Signature drip extraction ─────────────────────────────────────────────────
//
// Counts token frequency in own messages. Tokens: Korean slang atoms,
// emoticons, shortened words (2-6 chars). Returns top-3 by frequency.

function extractTopDrips(lines: string[]): string[] {
  const freq = new Map<string, number>();

  // Slang / emotional expression candidates: ≥2 chars, allow Korean+punctuation
  const TOKEN_RE = /[ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9!?ㅋㅎㄷ]{2,6}/g;

  for (const line of lines) {
    const tokens = line.match(TOKEN_RE) ?? [];
    for (const t of tokens) {
      // Filter out purely numeric tokens and very common particles
      if (/^\d+$/.test(t)) continue;
      if (['그래서', '그러면', '근데', '그리고', '하지만', '그런데'].includes(t)) continue;
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }

  return [...freq.entries()]
    .filter(([, v]) => v >= 3)          // must appear at least 3 times
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([token]) => token);
}

// ── Main parse entry point ────────────────────────────────────────────────────

export function parseKakaoExport(
  rawText: string,
  myName: string,
): ParseResult {
  const lines = rawText.split('\n');
  const myLines: string[] = [];
  let droppedPartnerLines = 0;
  let totalMasked = 0;

  for (const raw of lines) {
    const parsed = parseKakaoLine(raw);

    if (!parsed) {
      // System line (date header, join/exit notice) — skip silently
      continue;
    }

    if (parsed.speaker !== myName) {
      // Partner's line — DROP entirely, never process further
      droppedPartnerLines++;
      continue;
    }

    // Own line — mask sensitive data
    const [sanitised, masked] = maskSensitive(parsed.content);
    totalMasked += masked;
    myLines.push(sanitised);
  }

  const topDrips = extractTopDrips(myLines);

  return {
    myLines,
    droppedPartnerLines,
    maskedCount: totalMasked,
    topDrips,
  };
}

// ── Unit-testable pure helper (exported for tests) ────────────────────────────

export function maskPII(text: string): string {
  return maskSensitive(text)[0];
}

// ─── Chat Rhythm Analysis Engine ──────────────────────────────────────────────
//
// Extracts ChatStyleProfile from a KakaoTalk export by analysing only the
// user's own messages. No partner data is read.

export function analyzeChatRhythm(
  rawText: string,
  myName: string,
): ChatStyleProfile {
  interface TimedMsg {
    minuteOfDay: number;
    charCount: number;
    ending: string;
  }

  const msgs: TimedMsg[] = [];

  for (const raw of rawText.split('\n')) {
    const parsed = parseKakaoLine(raw);
    if (!parsed || parsed.speaker !== myName) continue;

    const minuteOfDay = parsed.hour * 60 + parsed.minute;
    const charCount = parsed.content.replace(/\s/g, '').length;
    const ending = parsed.content.trimEnd().slice(-3).trim();
    msgs.push({ minuteOfDay, charCount, ending });
  }

  if (msgs.length < 3) return DEFAULT_CHAT_STYLE_PROFILE;

  // 1. burstInterval — how densely the user sends consecutive messages
  let burstCount = 0;
  for (let i = 1; i < msgs.length; i++) {
    const diff = msgs[i].minuteOfDay - msgs[i - 1].minuteOfDay;
    if (diff >= 0 && diff <= 2) burstCount++;
  }
  const burstRatio = burstCount / msgs.length;
  const burstInterval =
    burstRatio > 0.4  ? 1400 :
    burstRatio > 0.25 ? 1800 :
    burstRatio > 0.1  ? 2200 : 2700;

  // 2. avgCharsPerBubble
  const totalChars = msgs.reduce((s, msg) => s + msg.charCount, 0);
  const avgCharsPerBubble = Math.max(5, Math.round(totalChars / msgs.length));

  // 3. splitTriggerPatterns — most common message endings (top-5)
  const endFreq = new Map<string, number>();
  for (const { ending } of msgs) {
    if (ending.length > 0) endFreq.set(ending, (endFreq.get(ending) ?? 0) + 1);
  }
  const extracted = [...endFreq.entries()]
    .filter(([k, v]) => v >= 2 && k.trim().length > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);

  const splitTriggerPatterns =
    extracted.length >= 2
      ? extracted
      : [...extracted, ...DEFAULT_CHAT_STYLE_PROFILE.splitTriggerPatterns].slice(0, 5);

  // 4. typingSpeedFactor — proportional to avg message length
  const typingSpeedFactor = Math.max(
    30,
    Math.min(120, Math.round(35 + avgCharsPerBubble * 1.4)),
  );

  return { burstInterval, avgCharsPerBubble, splitTriggerPatterns, typingSpeedFactor };
}
