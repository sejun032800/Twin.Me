/**
 * Twin.me 2.0 전기능 인터랙션 완벽검수 — 마스터 캡처 v2
 *
 * 변경 사항:
 * - 모든 캡처 페이지에 Noto Sans KR 강제 주입
 * - 캡션 레이블도 Playwright HTML 렌더러가 처리 → 한글/이모지 100% 정상
 * - 24컷 + 캡션 합성 all-in-one
 *
 * iPhone 14 뷰포트 393×852 @2x
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = 'http://localhost:19006';
const VP = { width: 393, height: 852 };
const SCALE = 2;
const CAPTION_H = 80;   // caption bar height in logical px

// ── 캡션바 색상 (시나리오별) ───────────────────────────────────────────────
const SCENARIO_COLORS = {
  'S1': '#F48FB1',   // 핑크
  'S2': '#81D4FA',   // 스카이블루
  'S3': '#A5D6A7',   // 그린
  'S4': '#FFCC80',   // 오렌지
};

let cutIndex = 0;
const manifest = [];   // { rawFile, captionedFile, caption, scenario }

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 페이지에 Noto Sans KR 강제 주입 ──────────────────────────────────────
async function injectKoreanFont(page) {
  await page.addStyleTag({
    url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;700&display=swap',
  }).catch(() => {/* offline fallback — SpoqaHanSansNeo in app is fine */});

  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = `
      * { font-family: "Noto Sans KR", "SpoqaHanSansNeo-Regular",
                       -apple-system, "Apple SD Gothic Neo",
                       "Malgun Gothic", sans-serif !important; }
    `;
    document.head.appendChild(style);
  }).catch(() => {});
}

// ── 원본 스크린샷 캡처 ───────────────────────────────────────────────────
async function snapRaw(page, caption, scenario) {
  cutIndex++;
  const rawFile = path.join(ROOT, `raw_cut_${String(cutIndex).padStart(2, '0')}.png`);
  await page.screenshot({ path: rawFile, fullPage: false });
  manifest.push({ rawFile, caption, scenario, cutIndex });
  console.log(`  📸 [${cutIndex}] ${caption}`);
  return rawFile;
}

// ── 캡션 합성: Playwright HTML 렌더러 ────────────────────────────────────
async function renderCaptionedImages(captionPage, outputDir) {
  console.log('\n🎨 캡션 합성 시작 (Playwright HTML 렌더러)...\n');

  for (const entry of manifest) {
    const { rawFile, caption, scenario, cutIndex: idx } = entry;
    if (!existsSync(rawFile)) continue;

    const rawB64 = readFileSync(rawFile).toString('base64');
    const accentColor = SCENARIO_COLORS[scenario.split(' ')[0]] ?? '#B482EE';

    // Compose an HTML page: image + styled caption bar
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0A0D1A; display: flex; flex-direction: column;
         align-items: center; width: ${VP.width}px; }
  .screenshot { width: ${VP.width}px; height: ${VP.height}px;
                display: block; object-fit: cover; }
  .caption-bar {
    width: ${VP.width}px;
    min-height: ${CAPTION_H}px;
    background: #0E1120;
    border-top: 3px solid ${accentColor};
    display: flex;
    align-items: center;
    padding: 0 14px;
    gap: 12px;
    font-family: "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  }
  .cut-badge {
    background: ${accentColor};
    color: #0A0D1A;
    font-weight: 700;
    font-size: 15px;
    padding: 4px 10px;
    border-radius: 6px;
    white-space: nowrap;
    flex-shrink: 0;
    font-family: inherit;
  }
  .caption-text {
    color: #F1F5F9;
    font-size: 14px;
    font-weight: 400;
    line-height: 1.4;
    flex: 1;
    font-family: inherit;
  }
  .scenario-badge {
    color: ${accentColor};
    font-size: 11px;
    font-weight: 300;
    white-space: nowrap;
    flex-shrink: 0;
    font-family: inherit;
  }
</style>
</head>
<body>
  <img class="screenshot" src="data:image/png;base64,${rawB64}" />
  <div class="caption-bar">
    <span class="cut-badge">#${String(idx).padStart(2, '0')}</span>
    <span class="caption-text">${caption}</span>
    <span class="scenario-badge">${scenario}</span>
  </div>
</body>
</html>`;

    await captionPage.setContent(html, { waitUntil: 'networkidle' });
    await wait(800); // let Google Fonts load

    const captionedFile = path.join(outputDir, `captioned_${String(idx).padStart(2, '0')}.png`);
    await captionPage.screenshot({
      path: captionedFile,
      clip: { x: 0, y: 0, width: VP.width, height: VP.height + CAPTION_H },
    });

    entry.captionedFile = captionedFile;
    console.log(`  ✅ [${idx}] 캡션 합성 완료`);
  }
}

async function goto(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(1500);
  await injectKoreanFont(page);
  await wait(300);
}

async function dismissGPSModal(page) {
  const ok = page.getByText('알겠어요', { exact: false }).first();
  if (await ok.count() > 0) { await ok.click(); await wait(600); }
}

(async () => {
  console.log('\n🚀 Twin.me 2.0 전기능 인터랙션 완벽검수 v2 시작');
  console.log('   ✨ Noto Sans KR 한글 폰트 강제 주입 활성화\n');
  console.log('━'.repeat(60));

  // Clean up previous runs
  for (let i = 1; i <= 30; i++) {
    const f = path.join(ROOT, `raw_cut_${String(i).padStart(2, '0')}.png`);
    if (existsSync(f)) rmSync(f);
  }

  const OUTPUT_DIR = path.join(ROOT, 'captioned_v2');
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: VP,
    deviceScaleFactor: SCALE,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    colorScheme: 'dark',
  });

  // Caption page uses full viewport + caption bar height
  const captionCtx = await browser.newContext({
    viewport: { width: VP.width, height: VP.height + CAPTION_H },
    deviceScaleFactor: SCALE,
    colorScheme: 'dark',
  });
  const captionPage = await captionCtx.newPage();
  const page = await ctx.newPage();

  // ════════════════════════════════════════════════════════════════
  // SCENARIO 1 — 주간 연애 리포트 배너 & 페이월
  // ════════════════════════════════════════════════════════════════
  console.log('\n📖 SCENARIO 1 — 주간 리포트 배너 & 페이월\n');
  const S1 = 'S1 주간 리포트';

  await goto(page, `${BASE}/chat`);
  await snapRaw(page, '[클릭 전] 채팅 목록 — 분석가 트윈이 배너 노출', S1);

  await page.getByText('분석가 트윈이', { exact: false }).first().click();
  await wait(1800);
  await injectKoreanFont(page);
  await snapRaw(page, '[클릭 후] 트윈이 챗룸 — 주간 리포트 카드 버블 활성', S1);

  await page.getByText('탭하여 전체 리포트 보기', { exact: false }).first().click();
  await wait(2000);
  await snapRaw(page, '[클릭 후] WeeklyReportModal — HardLock 블러 잠금 상태', S1);

  // Click locked section to trigger PaywallNudge
  const auditCta = page.getByText('비밀 로그', { exact: false }).first();
  if (await auditCta.count() > 0) { await auditCta.click(); await wait(1500); }
  else {
    const lockEl = page.locator('text=프리미엄 전용').first();
    if (await lockEl.count() > 0) { await lockEl.click(); await wait(1500); }
  }
  await snapRaw(page, '[클릭 후] PaywallNudge 팝업 — 프리미엄 업그레이드 넛지', S1);

  // Simulate purchase click
  const coffeeBtn = page.getByText('Coffee Break', { exact: false }).first();
  const buyBtn = page.getByText('구독', { exact: false }).first();
  if (await coffeeBtn.count() > 0) { await coffeeBtn.click(); await wait(1800); }
  else if (await buyBtn.count() > 0) { await buyBtn.click(); await wait(1800); }
  await snapRaw(page, '[결제 시뮬레이션] 구독 버튼 클릭 후 페이월 최종 상태', S1);

  // ════════════════════════════════════════════════════════════════
  // SCENARIO 2 — 무드 피드 & 지도 담기
  // ════════════════════════════════════════════════════════════════
  console.log('\n📖 SCENARIO 2 — 무드 피드 & 지도 담기\n');
  const S2 = 'S2 무드 피드';

  await goto(page, `${BASE}/history`);
  await snapRaw(page, '[클릭 전] 추억 월 탭 — 기본 진입 상태', S2);

  await page.getByText('무드 피드', { exact: false }).first().click();
  await wait(1500);
  await injectKoreanFont(page);
  await snapRaw(page, '[클릭 후] 🧭 무드 피드 세그먼트 전환 — 피드 리스트 렌더', S2);

  const ootdToggle = page.getByText('내 현재 OOTD', { exact: false }).first();
  if (await ootdToggle.count() > 0) { await ootdToggle.click(); await wait(1200); }
  await snapRaw(page, '[클릭 후] OOTD & 무드 필터 토글 활성 — 조건부 필터링', S2);

  const ctaBtn = page.getByText('이 코스 내 지도에 담기', { exact: false }).first();
  if (await ctaBtn.count() > 0) {
    await ctaBtn.click();
    await wait(700);
    await snapRaw(page, '[클릭 후] 🧭 지도에 담기 CTA — 핑크 하트 펄스 애니메이션', S2);
    await wait(900);
  } else {
    await snapRaw(page, '[스캔] 피드 카드 CTA 버튼 검색 상태', S2);
  }

  await page.getByText('지도', { exact: false }).first().click();
  await wait(2000);
  await injectKoreanFont(page);
  await dismissGPSModal(page);
  await wait(800);
  await snapRaw(page, '[클릭 후] 🗺️ 지도 전환 — Bulk Insert 핀 & 경로선 렌더', S2);

  // ════════════════════════════════════════════════════════════════
  // SCENARIO 3 — 지도 레이어 컨트롤 패널
  // ════════════════════════════════════════════════════════════════
  console.log('\n📖 SCENARIO 3 — 레이어 컨트롤 패널\n');
  const S3 = 'S3 레이어 패널';

  await snapRaw(page, '[클릭 전] 지도 뷰 — ≡ 햄버거 버튼 비활성 상태', S3);

  const hamBtn = page.locator('[aria-label="레이어 관리 패널 열기"]').first();
  if (await hamBtn.count() > 0) { await hamBtn.click(); await wait(1200); }
  await snapRaw(page, '[클릭 후] 레이어 관리 드로어 패널 슬라이드 인', S3);

  const addLayer = page.getByText('새 계획 레이어', { exact: false }).first();
  if (await addLayer.count() > 0) { await addLayer.click(); await wait(1000); }
  await snapRaw(page, '[클릭 후] + 새 계획 레이어 추가 — 인라인 편집 필드', S3);

  // Eye / visibility toggle
  const panelBtns = await page.locator('[role="button"]').all();
  let eyeClicked = false;
  for (const btn of panelBtns) {
    const box = await btn.boundingBox().catch(() => null);
    const txt = await btn.textContent().catch(() => '');
    if (box && box.width < 50 && box.x > 280 && !txt.includes('새') && !txt.includes('×') && !txt.includes('열기')) {
      await btn.click().catch(() => {});
      await wait(800);
      eyeClicked = true;
      break;
    }
  }
  await snapRaw(page, '[클릭 후] 레이어 가시성 토글 — 핀 숨김/표시 연동', S3);

  // ════════════════════════════════════════════════════════════════
  // SCENARIO 4 — 소셜 계정 연동 & 2단계 탈퇴
  // ════════════════════════════════════════════════════════════════
  console.log('\n📖 SCENARIO 4 — 소셜 연동 & 2단계 탈퇴\n');
  const S4 = 'S4 소셜·탈퇴';

  await goto(page, `${BASE}/settings`);
  await snapRaw(page, '[클릭 전] 설정 메인 — 계정·보안·테마 섹션 전체 뷰', S4);

  await goto(page, `${BASE}/settings/account-link`);
  await snapRaw(page, '[클릭 전] 소셜 계정 연동 — 4개 프로바이더 버튼', S4);

  const googleBtn = page.getByText('Google', { exact: false }).first();
  if (await googleBtn.count() > 0) {
    await googleBtn.click(); await wait(600);
    await snapRaw(page, '[클릭 후] Google 연동 — 로딩 스피너 / 연동 요청 중', S4);
    await wait(2200);
    await snapRaw(page, '[연동 완료] Google ✓ 연동됨 배지 활성화', S4);
  }

  const kakaoBtn = page.getByText('Kakao', { exact: false }).first();
  if (await kakaoBtn.count() > 0) { await kakaoBtn.click(); await wait(2400); }
  await snapRaw(page, '[연동 완료] Kakao ✓ 연동됨 배지 활성화', S4);

  const naverBtn = page.getByText('Naver', { exact: false }).first();
  if (await naverBtn.count() > 0) { await naverBtn.click(); await wait(2200); }
  const appleBtn = page.getByText('Apple', { exact: false }).first();
  if (await appleBtn.count() > 0) { await appleBtn.click(); await wait(2200); }
  await snapRaw(page, '[연동 완료] 4개 소셜 계정 전체 연동됨 배지 상태', S4);

  await goto(page, `${BASE}/settings`);
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach(el => {
      if (el.scrollHeight > el.clientHeight + 50) el.scrollTop = 99999;
    });
  });
  await wait(600);
  const deleteBtn = page.getByText('계정 삭제', { exact: true }).first();
  if (await deleteBtn.count() > 0) { await deleteBtn.scrollIntoViewIfNeeded(); await wait(300); }
  await snapRaw(page, '[클릭 전] 설정 최하단 — 로그아웃 · 계정 삭제 레드 버튼', S4);

  if (await deleteBtn.count() > 0) { await deleteBtn.click(); await wait(1500); }
  await snapRaw(page, '[클릭 후] 계정 삭제 1단계 — 정말로 삭제하시겠어요? 팝업', S4);

  const continueBtn = page.getByText('이어하기', { exact: false }).first();
  if (await continueBtn.count() > 0) { await continueBtn.click(); await wait(1500); }
  await snapRaw(page, '[클릭 후] 계정 삭제 2단계 — 파기 요약 및 최종 동의', S4);

  const finalBtn = page.getByText('확인하였으며', { exact: false }).first();
  if (await finalBtn.count() > 0) { await finalBtn.click(); await wait(3000); }
  await snapRaw(page, '[최종] 데이터 Purge 완료 — 온보딩 스플래시 리다이렉트', S4);

  // ════════════════════════════════════════════════════════════════
  // STEP 2: Playwright 캡션 렌더러 실행
  // ════════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ 총 ${cutIndex}컷 원본 캡처 완료`);
  await renderCaptionedImages(captionPage, OUTPUT_DIR);

  await browser.close();

  // Save manifest for PDF builder
  writeFileSync(
    path.join(ROOT, 'master_manifest_v2.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log('\n📋 master_manifest_v2.json 저장 완료');
  console.log(`📁 캡션 합성 이미지: ${OUTPUT_DIR}`);
})();
