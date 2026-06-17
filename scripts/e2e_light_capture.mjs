/**
 * Twin.me 2.0 — E2E 유저 여정 라이트 모드 캡처
 * colorScheme: 'light' + 라이트 테마 캡션 바
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.join(__dirname, '..');
const BASE   = 'http://localhost:19006';
const VP     = { width: 393, height: 852 };
const SCALE  = 2;
const CAP_H  = 84;

const SECTION = {
  ONBOARD : { color: '#7C3AED', label: '온보딩 진입' },
  CHAT    : { color: '#9333EA', label: '채팅 & 리포트' },
  PAYWALL : { color: '#DB2777', label: '페이월 & 결제' },
  MEMORY  : { color: '#0284C7', label: '추억 & 무드 피드' },
  MAP     : { color: '#059669', label: '데이트 지도' },
  SETTING : { color: '#D97706', label: '설정 & 계정 관리' },
  DELETE  : { color: '#DC2626', label: '2단계 회원 탈퇴' },
};

let idx = 0;
const manifest = [];
const wait = ms => new Promise(r => setTimeout(r, ms));

async function injectFont(page) {
  await page.addStyleTag({
    url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;700&display=swap',
  }).catch(() => {});
  await page.evaluate(() => {
    const s = document.createElement('style');
    s.textContent = `* { font-family: "Noto Sans KR","SpoqaHanSansNeo-Regular",
                         "Apple SD Gothic Neo","Malgun Gothic",sans-serif !important; }`;
    document.head.appendChild(s);
  }).catch(() => {});
}

async function goto(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(1600);
  await injectFont(page);
  await wait(400);
}

async function dismissModal(page, texts = ['알겠어요', '닫기', '확인']) {
  for (const t of texts) {
    const el = page.getByText(t, { exact: false }).first();
    if (await el.count() > 0) { await el.click().catch(() => {}); await wait(500); break; }
  }
}

async function snap(page, caption, section) {
  idx++;
  const raw = path.join(ROOT, `light_raw_${String(idx).padStart(2, '0')}.png`);
  await page.screenshot({ path: raw, fullPage: false });
  manifest.push({ idx, rawFile: raw, caption, section });
  console.log(`  📸 [${String(idx).padStart(2, '0')}] ${caption}`);
}

// ── 라이트 테마 캡션 바 렌더러 ──────────────────────────────────────────────
async function renderCaptions(capPage, outDir) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log('🎨 캡션 합성 — 라이트 테마 캡션 바\n');

  for (const entry of manifest) {
    const { idx: i, rawFile, caption, section } = entry;
    if (!existsSync(rawFile)) continue;

    const b64 = readFileSync(rawFile).toString('base64');
    const { color, label } = SECTION[section] ?? { color: '#7C3AED', label: section };

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#F8F9FC; display:flex; flex-direction:column;
         align-items:center; width:${VP.width}px; }
  img.sc { width:${VP.width}px; height:${VP.height}px; display:block; object-fit:cover; }
  .bar {
    width:${VP.width}px; min-height:${CAP_H}px;
    background:#FFFFFF;
    border-top:3px solid ${color};
    box-shadow: 0 -1px 0 #E5E7EB;
    display:flex; align-items:center;
    padding:0 14px; gap:10px;
    font-family:"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  }
  .num {
    background:${color}; color:#FFFFFF;
    font-weight:700; font-size:15px;
    padding:5px 11px; border-radius:7px;
    flex-shrink:0; white-space:nowrap;
  }
  .cap {
    color:#111827; font-size:13.5px; font-weight:400;
    line-height:1.45; flex:1;
  }
  .sec {
    color:${color}; font-size:10.5px; font-weight:600;
    white-space:nowrap; flex-shrink:0;
    text-align:right; max-width:90px;
    line-height:1.4;
  }
</style>
</head>
<body>
  <img class="sc" src="data:image/png;base64,${b64}"/>
  <div class="bar">
    <span class="num">${String(i).padStart(2,'0')}</span>
    <span class="cap">${caption}</span>
    <span class="sec">${label}</span>
  </div>
</body>
</html>`;

    await capPage.setContent(html, { waitUntil: 'networkidle' });
    await wait(900);

    const out = path.join(outDir, `light_captioned_${String(i).padStart(2,'0')}.png`);
    await capPage.screenshot({
      path: out,
      clip: { x:0, y:0, width: VP.width, height: VP.height + CAP_H },
    });
    entry.captionedFile = out;
    console.log(`  ✅ [${String(i).padStart(2,'0')}] 합성 완료`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log('\n☀️  Twin.me 2.0 — 라이트 모드 E2E 유저 여정 캡처 시작');
  console.log('   iPhone 14 뷰포트 393×852 @2x  |  colorScheme: light\n');
  console.log('═'.repeat(60));

  const OUT_DIR = path.join(ROOT, 'light_captioned');
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  const ctx = await browser.newContext({
    viewport: VP,
    deviceScaleFactor: SCALE,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
               'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    colorScheme: 'light',   // ← 라이트 모드
  });

  const capCtx = await browser.newContext({
    viewport: { width: VP.width, height: VP.height + CAP_H },
    deviceScaleFactor: SCALE,
    colorScheme: 'light',
  });
  const capPage = await capCtx.newPage();
  const page    = await ctx.newPage();

  // ── 1. 온보딩 진입 ──────────────────────────────────────────────────────
  console.log('\n[ 1. 온보딩 진입 ]');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await wait(1400);
  await injectFont(page);
  await snap(page, '1. 앱 최초 진입 — 스플래시 로딩 & 온보딩 게스트 시작 화면', 'ONBOARD');

  // ── 2. 채팅 목록 ────────────────────────────────────────────────────────
  console.log('\n[ 2. 채팅 & 리포트 ]');
  await goto(page, `${BASE}/chat`);
  await snap(page, '2. 채팅 목록 — 분석가 트윈이 주간 리포트 도착 배너 노출', 'CHAT');

  // ── 3. 트윈이 챗룸 ──────────────────────────────────────────────────────
  await page.getByText('분석가 트윈이', { exact: false }).first().click().catch(() => {});
  await wait(2000);
  await injectFont(page);
  await snap(page, '3. 분석가 트윈이 챗룸 — 주간 리포트 도착 버블 & 환영 메시지', 'CHAT');

  // ── 4. 주간 리포트 HardLock 블러 잠금 ──────────────────────────────────
  console.log('\n[ 3. 페이월 & 결제 ]');
  await page.getByText('탭하여 전체 리포트 보기', { exact: false }).first().click().catch(async () => {
    await page.getByText('주간 연애 리포트', { exact: false }).first().click().catch(() => {});
  });
  await wait(2200);
  await snap(page, '4. 주간 연애 리포트 — HardLock 블러 잠금 대시보드 (무료 버전)', 'PAYWALL');

  // ── 5. 결제 넛지 팝업 ───────────────────────────────────────────────────
  const lockTargets = ['비밀 로그', '프리미엄 전용', '잠금 해제', '전체 보기', 'PREMIUM', 'Premium'];
  let nudgeOpened = false;
  for (const t of lockTargets) {
    const el = page.getByText(t, { exact: false }).first();
    if (await el.count() > 0) { await el.click().catch(() => {}); await wait(1400); nudgeOpened = true; break; }
  }
  if (!nudgeOpened) { await page.mouse.click(196, 550); await wait(1400); }
  await snap(page, '5. 결제 넛지 팝업 — Coffee Break 구독 업그레이드 유도 CTA', 'PAYWALL');

  // ── 6. 결제 성공 → 블러 해제 ────────────────────────────────────────────
  for (const t of ['Coffee Break', '구독', '업그레이드', '결제', 'Subscribe', '₩']) {
    const el = page.getByText(t, { exact: false }).first();
    if (await el.count() > 0) { await el.click().catch(() => {}); await wait(2500); break; }
  }
  await snap(page, '6. 결제 성공 → 스프링 모션 → 블러 0px 해제 — 인포그래픽 스탯 전면 활성화', 'PAYWALL');

  // ── 7. 추억 월 ──────────────────────────────────────────────────────────
  console.log('\n[ 4. 추억 & 무드 피드 ]');
  await goto(page, `${BASE}/history`);
  await snap(page, '7. 추억 월 — 감정별 기억 아카이브 폴라로이드 기본 상태', 'MEMORY');

  // ── 8. 무드 피드 전환 ───────────────────────────────────────────────────
  await page.getByText('무드 피드', { exact: false }).first().click().catch(() => {});
  await wait(1600);
  await injectFont(page);
  await snap(page, '8. 🧭 무드 피드 전환 — 익명 커뮤니티 데이트 코스 카드 리스트', 'MEMORY');

  // ── 9. 무드 필터 토글 ───────────────────────────────────────────────────
  for (const t of ['내 현재 OOTD', 'OOTD', '무드 필터', '필터']) {
    const el = page.getByText(t, { exact: false }).first();
    if (await el.count() > 0) { await el.click().catch(() => {}); await wait(1000); break; }
  }
  await snap(page, '9. 무드 필터 토글 — OOTD & 무드 조건 동적 필터링 적용 카드 리스트', 'MEMORY');

  // ── 10. 데이트 지도 ─────────────────────────────────────────────────────
  console.log('\n[ 5. 데이트 지도 ]');
  await page.getByText('지도', { exact: false }).first().click().catch(() => {});
  await wait(2200);
  await injectFont(page);
  await dismissModal(page, ['알겠어요', '서울로 이동', '확인']);
  await wait(800);
  await snap(page, '10. 🗺️ 데이트 지도 — 멀티 레이어 핀 & AI 추천 경로선 렌더', 'MAP');

  // ── 11. 레이어 컨트롤 패널 ──────────────────────────────────────────────
  const hamBtn = page.locator('[aria-label="레이어 관리 패널 열기"]').first();
  if (await hamBtn.count() > 0) { await hamBtn.click(); await wait(1400); }
  else { await page.mouse.click(362, 195); await wait(1400); }
  await snap(page, '11. ≡ 레이어 컨트롤 패널 — 계획·시크릿 레이어 드로어 오픈', 'MAP');

  // ── 12. 설정 메인 ───────────────────────────────────────────────────────
  console.log('\n[ 6. 설정 & 계정 관리 ]');
  await goto(page, `${BASE}/settings`);
  await snap(page, '12. 설정 탭 — 계정·보안·테마·알림 전체 섹션 메인 뷰', 'SETTING');

  // ── 13. 소셜 연동 초기 → 완료 ──────────────────────────────────────────
  await goto(page, `${BASE}/settings/account-link`);
  await snap(page, '13. 소셜 계정 연동 — 4개 프로바이더 버튼 초기 상태', 'SETTING');

  for (const p of ['Google', 'Kakao', 'Naver', 'Apple']) {
    const btn = page.getByText(p, { exact: false }).first();
    if (await btn.count() > 0) { await btn.click().catch(() => {}); await wait(2400); }
  }
  await snap(page, '14. 소셜 계정 연동 완료 — Google·Kakao·Naver·Apple 4개 배지 활성', 'SETTING');

  // ── 14~16. 2단계 계정 삭제 ──────────────────────────────────────────────
  console.log('\n[ 7. 2단계 회원 탈퇴 ]');
  await goto(page, `${BASE}/settings`);
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach(el => {
      if (el.scrollHeight > el.clientHeight + 100) el.scrollTop = 99999;
    });
  });
  await wait(700);

  const delBtn = page.getByText('계정 삭제', { exact: true }).first();
  if (await delBtn.count() > 0) { await delBtn.scrollIntoViewIfNeeded().catch(() => {}); await wait(400); }
  await snap(page, '15. 설정 최하단 — 로그아웃 · 계정 삭제 레드 버튼 노출 상태', 'DELETE');

  if (await delBtn.count() > 0) { await delBtn.click().catch(() => {}); await wait(1600); }
  await snap(page, '16. 계정 삭제 1단계 — "정말로 삭제하시겠어요?" 경고 알림', 'DELETE');

  const step2 = page.getByText('이어하기', { exact: false }).first();
  if (await step2.count() > 0) { await step2.click().catch(() => {}); await wait(1600); }
  await snap(page, '17. 계정 삭제 2단계 — 데이터 파기 요약 & 최종 동의 모달', 'DELETE');

  // ── 캡션 합성 ────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ 총 ${idx}컷 원본 캡처 완료`);
  await renderCaptions(capPage, OUT_DIR);
  await browser.close();

  writeFileSync(path.join(ROOT, 'light_manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\n📋 light_manifest.json 저장 완료');
  console.log(`📁 캡션 합성 디렉토리: ${OUT_DIR}`);
})();
