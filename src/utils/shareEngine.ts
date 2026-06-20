// ─── Viral Share Card Engine (FUN-REP-001 extension) ─────────────────────────
//
// Web:    dom-to-image-more → PNG Blob → <a> download
// Native: styled HTML string → expo-file-system temp file → expo-sharing sheet
//
// No react-native-view-shot required (managed Expo workflow compatible).

import { Platform } from 'react-native';
import type { WeeklyReportData } from '../services/weeklyReportService';

// ── MBTI-style tagline generator ──────────────────────────────────────────────

export function getRelationshipMbti(score: number, topics: string[]): string {
  if (score >= 90) return '환상 속의 신화적 결합 👑';
  if (score >= 80) return '별빛 아래 완벽한 케미스트리 ✨';
  if (score >= 70) return '뜨거운 감자 같은 설레는 연인 🔥';
  if (score >= 60) return '달콤 쌉싸름한 매력의 밀당러 🍋';
  if (score >= 50) return '성장하는 두 별의 궤도 여행 🌙';
  return '서로를 이해하는 용감한 탐험가 🗺️';
}

export function getYellowCardLine(fouls: number, name: string): string {
  if (fouls === 0) return `${name}의 공감 만점 클린 플레이 💚`;
  if (fouls === 1) return `${name}의 공감 차단 반칙: 1회 옐로카드 🟨`;
  if (fouls <= 3) return `${name}의 공감 차단 반칙: ${fouls}회 옐로카드 🟨`;
  return `${name}의 공감 차단 반칙: ${fouls}회 레드카드 🟥`;
}

// ── HTML share card generator (native fallback) ───────────────────────────────

function buildShareCardHTML(
  reportData: WeeklyReportData,
  myName: string,
  partnerName: string,
): string {
  const { overallScore, radarAxes, radarValues, topTopics, matchStats, weekLabel } = reportData;
  const mbti = getRelationshipMbti(overallScore, topTopics);
  const fouls = matchStats?.fouls.me ?? 0;
  const yellowCard = getYellowCardLine(fouls, myName);
  const bars = radarAxes
    .map((ax, i) => {
      const pct = Math.round(radarValues[i] * 100);
      const color = ['#FF6B8B', '#D946EF', '#7C3AED', '#38BDF8', '#4ADE80'][i % 5];
      return `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="color:#94A3B8;font-size:11px">${ax}</span>
          <span style="color:${color};font-size:11px;font-weight:700">${pct}%</span>
        </div>
        <div style="background:rgba(255,255,255,0.08);border-radius:4px;height:7px;overflow:hidden">
          <div style="width:${pct}%;height:100%;border-radius:4px;background:linear-gradient(90deg,${color},${color}88)"></div>
        </div>
      </div>`;
    })
    .join('');

  const scoreColor = overallScore >= 80 ? '#4ADE80' : overallScore >= 60 ? '#FF6B8B' : '#F97316';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Twin.me 주간 연애 리포트</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:360px;height:640px;overflow:hidden;font-family:-apple-system,sans-serif;
    background:linear-gradient(160deg,#050312 0%,#130824 40%,#0D1544 100%)}
  .card{position:relative;width:360px;height:640px;padding:28px 24px;display:flex;
    flex-direction:column;justify-content:space-between;overflow:hidden}
  .glow1{position:absolute;top:-60px;right:-40px;width:220px;height:220px;border-radius:50%;
    background:radial-gradient(circle,#7C3AED44,transparent 70%);pointer-events:none}
  .glow2{position:absolute;bottom:-80px;left:-50px;width:280px;height:280px;border-radius:50%;
    background:radial-gradient(circle,#D946EF33,transparent 70%);pointer-events:none}
  .top-bar{display:flex;align-items:center;justify-content:space-between}
  .logo{color:#E2D9FF;font-size:18px;font-weight:800;letter-spacing:-0.3px}
  .logo span{color:#D946EF}
  .week-badge{background:rgba(124,58,237,0.25);border:1px solid rgba(124,58,237,0.45);
    border-radius:20px;padding:3px 10px;color:#A78BFA;font-size:9px;font-weight:700}
  .title{color:#94A3B8;font-size:11px;margin-top:4px}
  .score-ring{align-self:center;width:100px;height:100px;border-radius:50%;
    background:rgba(124,58,237,0.12);border:3px solid;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    box-shadow:0 0 28px ${scoreColor}66}
  .score-num{color:${scoreColor};font-size:32px;font-weight:900;line-height:1}
  .score-label{color:#94A3B8;font-size:10px;margin-top:2px}
  .copy-block{display:flex;flex-direction:column;gap:10px}
  .copy-pill{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);
    border-radius:12px;padding:10px 14px}
  .copy-label{color:#64748B;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:3px}
  .copy-value{color:#F1F5F9;font-size:13px;font-weight:700;line-height:1.4}
  .bars{display:flex;flex-direction:column}
  .footer{display:flex;flex-direction:column;align-items:center;gap:8px}
  .cta-text{color:#E2D9FF;font-size:11px;font-weight:600}
  .cta-arrow{color:#D946EF;font-size:11px}
  .brand{color:#64748B;font-size:9px;letter-spacing:0.5px}
  .divider{height:1px;background:rgba(255,255,255,0.08);width:100%}
</style>
</head>
<body>
<div class="card">
  <div class="glow1"></div>
  <div class="glow2"></div>

  <div>
    <div class="top-bar">
      <div>
        <div class="logo">Twin<span>.me</span> 🧬</div>
        <div class="title">이번 주 우리의 연애 결산</div>
      </div>
      <div class="week-badge">${weekLabel}</div>
    </div>
  </div>

  <div class="score-ring" style="border-color:${scoreColor}">
    <div class="score-num">${overallScore.toFixed(1)}</div>
    <div class="score-label">애정 지수</div>
  </div>

  <div class="copy-block">
    <div class="copy-pill">
      <div class="copy-label">우리의 연애 MBTI</div>
      <div class="copy-value">${mbti}</div>
    </div>
    <div class="copy-pill">
      <div class="copy-label">이번 주 판정</div>
      <div class="copy-value">${yellowCard}</div>
    </div>
  </div>

  <div class="bars">${bars}</div>

  <div class="divider"></div>
  <div class="footer">
    <div class="cta-text">나도 내 연인과 분석해보기 <span class="cta-arrow">➔</span></div>
    <div class="brand">TWIN.ME · AI 연애 분석 서비스</div>
  </div>
</div>
</body>
</html>`;
}

// ── Web capture ───────────────────────────────────────────────────────────────

async function captureWeb(domNode: Element): Promise<void> {
  // Dynamic import avoids SSR / RN bundler errors
  const mod = await import('dom-to-image-more');
  const domtoimage = (mod as any).default ?? mod;

  const blob: Blob = await domtoimage.toBlob(domNode, {
    scale: 2,
    bgcolor: '#050312',
    style: { borderRadius: '0px' },
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `twinme_weekly_${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Native capture ────────────────────────────────────────────────────────────

async function captureNative(
  reportData: WeeklyReportData,
  myName: string,
  partnerName: string,
): Promise<void> {
  // SDK 56 new File/Paths API (native-only)
  const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  const Sharing = await import('expo-sharing');

  const html = buildShareCardHTML(reportData, myName, partnerName);
  const filename = `twinme_card_${Date.now()}.html`;
  const file = new File(Paths.cache, filename);
  file.write(html);

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/html',
      dialogTitle: '📊 Twin.me 주간 연애 리포트 공유',
      UTI: 'public.html',
    });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ShareCardOptions {
  /** On web: the DOM node of the rendered ViralShareCard. Ignored on native. */
  domRef?: Element | null;
  reportData: WeeklyReportData;
  myName: string;
  partnerName: string;
}

export async function captureAndShare(opts: ShareCardOptions): Promise<void> {
  if (Platform.OS === 'web') {
    if (!opts.domRef) throw new Error('domRef required on web');
    await captureWeb(opts.domRef);
  } else {
    await captureNative(opts.reportData, opts.myName, opts.partnerName);
  }
}
