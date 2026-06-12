import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext } from '../../src/context/AppContext';
import { analyzeChatRhythm, parseKakaoExport } from '../../src/lib/kakaoParser';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../src/styles/theme';

// ─── Demo corpus — richly seeded to produce meaningful topDrips ───────────────
// In production this would be the user-uploaded .txt file text.

const DEMO_CORPUS = `2024년 3월 15일 금요일
[세준] [오전 9:15] 야 오늘 날씨 완전 좋다 ㄹㅇ
[서영] [오전 9:16] 그치 ㅋㅋ 봄이 왔나봐
[세준] [오전 9:18] ㄹㅇ 나 오늘 기분 너무 좋아 ㅋㅋ
[세준] [오전 9:20] 그니까 내 말이 진짜 ㅋㅋ
[서영] [오전 9:21] ㅋㅋ 갑자기 왜
[세준] [오전 9:23] 그냥 ㅋㅋ 완전 대박 이야 오늘
[세준] [오전 9:25] 자니? ㅎㅎ
[서영] [오전 9:26] 아니 깨있어 ㅋㅋ
[세준] [오전 10:02] 오늘 점심 같이 먹자 ㄹㅇ
[서영] [오전 10:03] 어디 가고 싶어
[세준] [오전 10:05] 파스타 어때 완전 좋지 않아
[세준] [오전 10:06] ㄹㅇ 요즘 파스타 완전 땡기더라 ㅋㅋ
[서영] [오전 10:08] 좋아 ㅋㅋ 1시에 나가자
[세준] [오전 10:09] ㅇㅋ ㅋㅋ 기대된다 완전
[세준] [오전 10:12] 그니까 내 말이 ㅋㅋ
[세준] [오전 11:30] 야 근데 그거 봤어
[서영] [오전 11:31] 뭐
[세준] [오전 11:33] 아 그 영상 ㄹㅇ 완전 대박 이었음 ㅋㅋ
[서영] [오전 11:34] 어떤거
[세준] [오전 11:35] 나중에 보여줄게 ㅋㅋ
2024년 3월 16일 토요일
[세준] [오전 10:00] 자니? ㅎㅎ
[서영] [오전 10:02] 방금 일어났어 ㅋㅋ
[세준] [오전 10:03] ㅋㅋ 귀엽다 완전
[세준] [오전 10:05] 오늘 뭐해
[서영] [오전 10:06] 아직 모르겠어
[세준] [오전 10:08] 그니까 내 말이 나도 ㅋㅋ
[세준] [오전 10:10] 완전 대박 이다 오늘 날씨
[서영] [오전 10:11] ㄹㅇ 너무 좋다
[세준] [오전 10:14] ㅋㅋ 같이 나갈까
[서영] [오전 10:15] ㅇㅋ ㅋㅋ
[세준] [오후 2:30] 야 나 지금 너 생각했어
[서영] [오후 2:31] ㅋㅋ 왜
[세준] [오후 2:33] 그냥 ㅋㅋ 갑자기 ㄹㅇ
[세준] [오후 2:35] 자니? ㅎㅎ
[서영] [오후 2:36] 아니 ㅋㅋ 여기있어
[세준] [오후 2:38] ㅋㅋ 좋아
[세준] [오후 5:00] 그니까 내 말이 ㅋㅋ 완전
[서영] [오후 5:01] ㅋㅋ 맞아
[세준] [오후 8:30] 완전 대박 인 하루였다 ㄹㅇ
[서영] [오후 8:31] ㅋㅋ 좋겠다
[세준] [오후 8:33] ㄹㅇ 행복해 ㅋㅋ`.trim();

// ─── Tag derivation from drip tokens ─────────────────────────────────────────

function deriveTagsFromDrips(drips: string[]): string[] {
  const joined = drips.join(' ');
  const result: string[] = [];

  if (/ㅋ|ㅎ/.test(joined)) result.push('#웃음부자');
  if (/그니까|맞아|공감/.test(joined)) result.push('#공감형');
  if (/자니|밤|새벽/.test(joined)) result.push('#새벽감성');
  if (/완전|진짜|ㄹㅇ/.test(joined)) result.push('#극공감러');
  if (/대박|좋아/.test(joined)) result.push('#긍정에너지');

  const fallbacks = ['#공감형', '#새벽감성', '#이모지대장', '#극공감러', '#웃음부자'];
  for (const fb of fallbacks) {
    if (result.length >= 3) break;
    if (!result.includes(fb)) result.push(fb);
  }

  return result.slice(0, 3);
}

// ─── Spinning Donut Ring ──────────────────────────────────────────────────────

const RING_SIZE = 168;
const RING_STROKE = 16;
const INNER_SIZE = RING_SIZE - RING_STROKE * 2;

function DonutRing({ pct }: { pct: number }) {
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(360, { duration: 1600, easing: Easing.linear }),
      -1,
    );
  }, []);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  return (
    <View style={ring.container}>
      <View style={ring.track} />
      <Animated.View style={[ring.arc, spinStyle]} />
      <View style={ring.center}>
        <Text style={ring.pctNum}>{pct}%</Text>
        <Text style={ring.pctLabel}>TRAINING</Text>
      </View>
    </View>
  );
}

const ring = StyleSheet.create({
  container: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_STROKE,
    borderColor: 'rgba(217,70,239,0.14)',
  },
  arc: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_STROKE,
    borderTopColor: '#D946EF',
    borderRightColor: '#FF6B8B',
    borderBottomColor: 'rgba(255,107,139,0.28)',
    borderLeftColor: 'transparent',
  },
  center: {
    position: 'absolute',
    top: RING_STROKE,
    left: RING_STROKE,
    width: INNER_SIZE,
    height: INNER_SIZE,
    borderRadius: INNER_SIZE / 2,
    backgroundColor: Colors.BG_DARK_MIDNIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pctNum: {
    color: Colors.GRADIENT_END,
    fontSize: 30,
    fontWeight: FontWeight.extrabold,
    letterSpacing: -1,
  },
  pctLabel: {
    color: Colors.TEXT_MUTED,
    fontSize: 9,
    fontWeight: FontWeight.bold,
    letterSpacing: 2.5,
  },
});

// ─── Progress Bar Card ────────────────────────────────────────────────────────

type Status = 'waiting' | 'running' | 'done';

function ProgressBarCard({
  label,
  status,
  progress,
  delay,
}: {
  label: string;
  status: Status;
  progress: number;
  delay: number;
}) {
  const STATUS_TEXT: Record<Status, string> = {
    waiting: '준비 중',
    running: '진행 중',
    done: '완료 ✓',
  };
  const STATUS_COLOR: Record<Status, string> = {
    waiting: Colors.TEXT_MUTED,
    running: Colors.GRADIENT_MID,
    done: Colors.GRADIENT_END,
  };

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(500)} style={pb.card}>
      <View style={pb.row}>
        <Text style={pb.label}>{label}</Text>
        <Text style={[pb.status, { color: STATUS_COLOR[status] }]}>
          {STATUS_TEXT[status]}
        </Text>
      </View>
      <View style={pb.track}>
        <View
          style={[
            pb.fill,
            {
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: status === 'done' ? Colors.GRADIENT_END : Colors.GRADIENT_MID,
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const pb = StyleSheet.create({
  card: {
    backgroundColor: Colors.CARD_DARK_SLATE,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  status: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.4,
  },
  track: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

// Timing constants (ms)
const TONE_PHASE_MS = 3200;   // line-by-line scan phase
const PERSONA_PHASE_MS = 2000; // persona building phase
const PERSONA_STEPS = 32;

export default function LoadingScreen() {
  const router = useRouter();
  const { myProfile, setTrainingResult, setChatStyleProfile, rawKakaoText, setRawKakaoText } = useAppContext();

  const [pct, setPct] = useState(0);
  const [toneStatus, setToneStatus] = useState<Status>('running');
  const [personaStatus, setPersonaStatus] = useState<Status>('waiting');
  const [toneProgress, setToneProgress] = useState(0);
  const [personaProgress, setPersonaProgress] = useState(0);
  // Live feed: shows which line is currently being scanned
  const [feedLine, setFeedLine] = useState('');

  const toneRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const personaRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const myName = myProfile.name || '세준';

    // Use real uploaded file if available, otherwise demo corpus
    const corpus = rawKakaoText ?? DEMO_CORPUS;

    // ── Run the actual parse synchronously (result is ready immediately) ──
    const parsed = parseKakaoExport(corpus, myName);
    // Extract chat rhythm profile from the same corpus
    const chatProfile = analyzeChatRhythm(corpus, myName);

    // ── Phase 1: Tone Extraction — replay line-by-line at human pace ──
    const rawLines = corpus.split('\n').filter((l) => l.trim().length > 0);
    const totalLines = rawLines.length;
    const msPerLine = TONE_PHASE_MS / totalLines;

    let lineIdx = 0;

    toneRef.current = setInterval(() => {
      lineIdx++;

      const ratio = Math.min(lineIdx / totalLines, 1);
      setToneProgress(ratio);
      // Tone phase covers 0→62% of total counter
      setPct(Math.round(ratio * 62));

      // Live feed: show speaker tag + truncated content
      const currentRaw = rawLines[Math.min(lineIdx, rawLines.length - 1)];
      const isMyLine = currentRaw.includes(`[${myName}]`);
      if (isMyLine) {
        // Truncate at 28 chars for readability
        const truncated = currentRaw.length > 28
          ? currentRaw.slice(0, 28) + '...'
          : currentRaw;
        setFeedLine(truncated);
      } else {
        setFeedLine('[파트너 대화 라인 파기 중...]');
      }

      if (lineIdx >= totalLines) {
        clearInterval(toneRef.current!);
        setToneStatus('done');
        setPersonaStatus('running');

        // ── Phase 2: Persona Building ──
        let step = 0;

        personaRef.current = setInterval(() => {
          step++;
          const ratio2 = Math.min(step / PERSONA_STEPS, 1);
          setPersonaProgress(ratio2);
          // Persona covers 62→100% of total counter
          setPct(62 + Math.round(ratio2 * 38));

          if (step >= PERSONA_STEPS) {
            clearInterval(personaRef.current!);
            setPersonaStatus('done');
            setPct(100);
            setFeedLine('');

            // ── Commit training result to global context ──
            const drips =
              parsed.topDrips.length >= 3
                ? parsed.topDrips.slice(0, 3)
                : ['추출1', '추출2', '추출3'];

            setChatStyleProfile(chatProfile);
            setTrainingResult({
              drips,
              tags: deriveTagsFromDrips(drips),
              myLineCount: parsed.myLines.length,
              maskedCount: parsed.maskedCount,
            });

            // Clear raw file text from context — no longer needed after parsing
            setRawKakaoText(null);

            setTimeout(() => router.replace('/(auth)/complete'), 520);
          }
        }, PERSONA_PHASE_MS / PERSONA_STEPS);
      }
    }, msPerLine);

    return () => {
      if (toneRef.current) clearInterval(toneRef.current);
      if (personaRef.current) clearInterval(personaRef.current);
    };
  }, []);

  return (
    <SafeAreaView style={s.container}>
      {/* ── Spinning Donut ── */}
      <Animated.View entering={FadeInDown.duration(600)}>
        <DonutRing pct={pct} />
      </Animated.View>

      {/* ── Status Text + Live Feed ── */}
      <Animated.View entering={FadeInDown.delay(200).duration(600)} style={s.statusBlock}>
        <Text style={s.statusTitle}>AI 말투 학습 중...</Text>
        <Text style={s.statusDesc}>
          개인정보 보호를 위해 기기 내부에서{'\n'}상대방 대화 파싱 중...
        </Text>
        {feedLine.length > 0 && (
          <View style={s.feedBox}>
            <Text style={s.feedText} numberOfLines={1}>{feedLine}</Text>
          </View>
        )}
      </Animated.View>

      {/* ── Progress Bars ── */}
      <View style={s.barsBlock}>
        <ProgressBarCard
          label="Tone Extraction"
          status={toneStatus}
          progress={toneProgress}
          delay={300}
        />
        <ProgressBarCard
          label="Persona Building"
          status={personaStatus}
          progress={personaProgress}
          delay={500}
        />
      </View>

      {/* ── Lock Footer ── */}
      <Animated.View entering={FadeInUp.delay(600).duration(600)} style={s.lockRow}>
        <Text style={s.lockIcon}>🔒</Text>
        <Text style={s.lockText}>End-to-End Encrypted  On-Device Learning</Text>
      </Animated.View>

      {/* ── Step Dots ── */}
      <View style={s.stepRow}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              s.stepDot,
              i === 3 ? s.stepDotActive : i < 3 ? s.stepDotDone : s.stepDotInactive,
            ]}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BG_DARK_MIDNIGHT,
    justifyContent: 'center',
    gap: Spacing['2xl'],
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: Spacing['2xl'],
  },

  statusBlock: { alignItems: 'center', gap: 8 },
  statusTitle: {
    color: Colors.TEXT_ON_DARK,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  statusDesc: {
    color: Colors.TEXT_ON_DARK_SECONDARY,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  feedBox: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: 'rgba(56,189,248,0.07)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.15)',
    maxWidth: 280,
  },
  feedText: {
    color: Colors.BADGE_AI_BLUE,
    fontSize: 10,
    fontWeight: FontWeight.medium,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.2,
  },

  barsBlock: { gap: Spacing.md },

  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
    backgroundColor: 'rgba(56,189,248,0.06)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.16)',
  },
  lockIcon: { fontSize: 13 },
  lockText: {
    color: Colors.BADGE_AI_BLUE,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  stepRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  stepDot: { height: 6, borderRadius: 3 },
  stepDotActive: { width: 22, backgroundColor: Colors.GRADIENT_END },
  stepDotDone: { width: 6, backgroundColor: Colors.GRADIENT_MID },
  stepDotInactive: { width: 6, backgroundColor: 'rgba(255,255,255,0.18)' },
});
