// ─── Aura Share Card Engine (§8.3 SNS 공유 카드) ──────────────────────────────
// docs/genesis_interview.md §8.3 — "사람은 광고는 안 퍼뜨려도 자기 정체성은 퍼뜨린다."
// shareEngine.ts(주간 리포트 카드)와 동일한 web/native 캡처 전략을 따르되,
// 프라이버시 가드를 위해 이 카드는 오직 다음만 사용한다:
//   - auraStoryPool.ts의 사전 큐레이션된 title(감성 칭호) — 실제 대화 원문 절대 미참조
//   - AuraVector의 HSL 색상(전역 테마 픽셀 에셋)
// 대화 발췌·구체 스탯 등 "결과 라벨 텍스트" 이외의 정보는 이 카드에 절대 포함하지 않는다.
//
// Web:    dom-to-image-more → PNG Blob → <a> download
// Native: styled HTML string → expo-file-system temp file → expo-sharing sheet

import { Platform } from 'react-native';
import type { AuraChannel } from '../types/genesis';

export interface AuraShareData {
  meshStops: AuraChannel[];
  dominantTitle: string; // 예: "흔들리지 않는 온도" — auraStoryPool의 curated title만 허용
}

function toHsl({ hue, saturation, lightness }: AuraChannel): string {
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function buildAuraShareCardHTML({ meshStops, dominantTitle }: AuraShareData): string {
  const stops = meshStops.map((c) => toHsl(c)).join(', ');
  const swatches = meshStops
    .map((c) => `<div class="swatch" style="background:${toHsl(c)}"></div>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>나의 연애 색 — Twin.me</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:360px;height:640px;overflow:hidden;font-family:-apple-system,sans-serif;
    background:#0A0D1A}
  .card{position:relative;width:360px;height:640px;padding:32px 26px;display:flex;
    flex-direction:column;justify-content:space-between;overflow:hidden}
  .aura{position:absolute;inset:0;opacity:0.55;filter:blur(40px);
    background:linear-gradient(160deg, ${stops})}
  .logo{position:relative;color:#E2D9FF;font-size:16px;font-weight:800}
  .logo span{color:#D946EF}
  .center{position:relative;flex:1;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:18px}
  .title{color:#F1F5F9;font-size:24px;font-weight:800;text-align:center;line-height:1.4}
  .swatches{display:flex;gap:6px}
  .swatch{width:32px;height:32px;border-radius:16px;border:2px solid rgba(255,255,255,0.25)}
  .tag{color:#94A3B8;font-size:12px}
  .footer{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px}
  .brand{color:#64748B;font-size:9px;letter-spacing:0.5px}
</style>
</head>
<body>
<div class="card">
  <div class="aura"></div>
  <div class="logo">Twin<span>.me</span> 🎨</div>
  <div class="center">
    <div class="swatches">${swatches}</div>
    <div class="title">"${dominantTitle}"</div>
    <div class="tag">이게 나의 연애 색이야</div>
  </div>
  <div class="footer">
    <div class="brand">TWIN.ME · 나의 연애 색 찾기</div>
  </div>
</div>
</body>
</html>`;
}

async function captureWeb(domNode: Element): Promise<void> {
  const mod = await import('dom-to-image-more');
  const domtoimage = (mod as any).default ?? mod;
  const blob: Blob = await domtoimage.toBlob(domNode, { scale: 2, bgcolor: '#0A0D1A' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `twinme_aura_${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function captureNative(data: AuraShareData): Promise<void> {
  const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  const Sharing = await import('expo-sharing');

  const html = buildAuraShareCardHTML(data);
  const file = new File(Paths.cache, `twinme_aura_${Date.now()}.html`);
  file.write(html);

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/html',
      dialogTitle: '🎨 나의 연애 색 공유',
      UTI: 'public.html',
    });
  }
}

export interface AuraShareOptions extends AuraShareData {
  /** On web: the DOM node of the rendered AuraShareCard. Ignored on native. */
  domRef?: Element | null;
}

export async function captureAndShareAura(opts: AuraShareOptions): Promise<void> {
  if (Platform.OS === 'web') {
    if (!opts.domRef) throw new Error('domRef required on web');
    await captureWeb(opts.domRef);
  } else {
    await captureNative(opts);
  }
}
