import { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import type { DateCourse } from '../context/AppContext';

// ─── Valence Pattern Library ──────────────────────────────────────────────────
// Each pattern contributes a score; the highest-scoring tag wins as the card label.

interface ValencePattern {
  pattern: RegExp;
  score: number;
  tag: string;
}

const VALENCE_PATTERNS: ValencePattern[] = [
  { pattern: /사랑해|사랑한다|사랑스러워|사랑이야|사랑해요/,         score: 10, tag: '💕 사랑'    },
  { pattern: /좋아해|좋아한다|너를 좋아|많이 좋아|좋아하는/,         score: 9,  tag: '💕 좋아'    },
  { pattern: /약속해|약속할게|약속이야|영원히|평생 함께|함께 있을게/, score: 9,  tag: '🤝 약속'    },
  { pattern: /행복해|행복하다|행복했어|행복이야|너무 행복|너무행복/,  score: 8,  tag: '😊 행복'    },
  { pattern: /보고싶어|보고싶다|보고파|보고 싶어|보고 싶다/,         score: 8,  tag: '🌙 그리움'  },
  { pattern: /설레|두근|심쿵|떨려|설렌다|설렜어|두근거려|두근두근/,  score: 7,  tag: '💓 설렘'    },
  { pattern: /예쁘다|예뻐|예쁨|이쁘다|이뻐|잘생겼어|잘생겼다|멋있어|멋있다|멋져/, score: 7, tag: '✨ 칭찬' },
  { pattern: /감사해|감사합니다|고마워|고맙다|너무 고마/,            score: 7,  tag: '🙏 감사'    },
  { pattern: /최고야|최고다|최고임|세상에서 제일|세상 최고|짱이야/,   score: 7,  tag: '🏆 최고'    },
  { pattern: /기억할게|기억해|잊지 못해|잊을 수 없어|평생 기억/,     score: 7,  tag: '📸 추억'    },
  { pattern: /함께라서|같이 있어서|옆에 있어|곁에 있어|네 곁에/,    score: 7,  tag: '🤗 함께'    },
  { pattern: /완벽해|완벽하다|딱이야|찰떡이야|딱 맞아/,             score: 6,  tag: '💯 완벽'    },
  { pattern: /처음 봤는데|처음 만났|첫 만남|처음 본|처음이야/,       score: 6,  tag: '🌟 첫 만남' },
  { pattern: /안아주고|안겨|따뜻해|포근해|따뜻하다|포근하다/,        score: 6,  tag: '🫂 온기'    },
  { pattern: /웃음이|미소가|웃는 모습|웃겨서|방긋|웃음꽃/,          score: 5,  tag: '😄 웃음'    },
];

const MIN_VALENCE_SCORE = 5;

// ─── Parser regexes ───────────────────────────────────────────────────────────

// KakaoTalk date section header:
//   --------------- 2024년 1월 20일 토요일 ---------------
const DATE_HEADER_RE = /(\d{4})년 (\d{1,2})월 (\d{1,2})일/;

// KakaoTalk message line:
//   [이름] [오전/오후 HH:MM] content
const MSG_RE = /^\[(.+?)\] \[(오전|오후) (\d{1,2}):(\d{2})\] (.+)$/;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface MemoryNode {
  id: string;
  date: string;         // display: '2024.01.20'
  rawDate: Date;
  quote: string;
  tag: string;
  speaker: 'me' | 'partner';
  valenceScore: number;
  imageUri: string | null;  // real photo URI, or null for gradient fallback
}

// ─── Scoring engine ───────────────────────────────────────────────────────────

function scoreMessage(text: string): { score: number; tag: string } {
  let totalScore = 0;
  let bestTag = '';
  let bestScore = 0;

  for (const { pattern, score, tag } of VALENCE_PATTERNS) {
    if (pattern.test(text)) {
      totalScore += score;
      if (score > bestScore) {
        bestScore = score;
        bestTag = tag;
      }
    }
  }

  // Longer sweet sentences carry more emotional weight
  if (totalScore > 0) {
    if (text.length > 20) totalScore += 2;
    if (text.length > 40) totalScore += 2;
  }

  return { score: totalScore, tag: bestTag || '💬 대화' };
}

// ─── Image matcher ────────────────────────────────────────────────────────────

function findClosestImage(msgDate: Date, courses: DateCourse[]): string | null {
  const withImage = courses.filter((c) => c.imageUrl);
  if (!withImage.length) return null;

  const msgTime = msgDate.getTime();
  const closest = withImage.reduce((prev, curr) => {
    const pd = Math.abs(new Date(prev.date).getTime() - msgTime);
    const cd = Math.abs(new Date(curr.date).getTime() - msgTime);
    return cd < pd ? curr : prev;
  });

  return closest.imageUrl ?? null;
}

// ─── Core extraction function (exported for unit-testability) ─────────────────

export function extractSweetSentences(
  rawText: string,
  myName: string,
  courses: DateCourse[],
  maxCount = 7,
): MemoryNode[] {
  const lines = rawText.split('\n');
  let currentDate = new Date(2020, 0, 1);
  const candidates: MemoryNode[] = [];
  // Deduplicate by exact quote so re-used sentences don't dominate
  const seenQuotes = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    const dateMatch = line.match(DATE_HEADER_RE);
    if (dateMatch) {
      const [, y, m, d] = dateMatch;
      currentDate = new Date(Number(y), Number(m) - 1, Number(d));
      continue;
    }

    const msgMatch = line.match(MSG_RE);
    if (!msgMatch) continue;

    const [, speaker, , , , content] = msgMatch;
    const isMine = speaker === myName;

    const { score, tag } = scoreMessage(content);
    if (score < MIN_VALENCE_SCORE) continue;

    const normalised = content.trim();
    if (seenQuotes.has(normalised)) continue;
    seenQuotes.add(normalised);

    const y    = String(currentDate.getFullYear());
    const mo   = String(currentDate.getMonth() + 1).padStart(2, '0');
    const d    = String(currentDate.getDate()).padStart(2, '0');

    candidates.push({
      id: `mem-${i}`,
      date: `${y}.${mo}.${d}`,
      rawDate: new Date(currentDate),
      quote: normalised,
      tag,
      speaker: isMine ? 'me' : 'partner',
      valenceScore: score,
      imageUri: findClosestImage(currentDate, courses),
    });
  }

  return candidates
    .sort((a, b) => b.valenceScore - a.valenceScore)
    .slice(0, maxCount);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMemoryWall(maxCount = 7): MemoryNode[] {
  const { rawKakaoText, myProfile, dateCourses } = useAppContext();

  return useMemo(() => {
    if (!rawKakaoText) return [];
    return extractSweetSentences(rawKakaoText, myProfile.name, dateCourses, maxCount);
  }, [rawKakaoText, myProfile.name, dateCourses, maxCount]);
}
