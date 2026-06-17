/**
 * Shot 3 & 4 정밀 재촬영
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE_URL = 'http://localhost:19006';
const VIEWPORT = { width: 393, height: 852 };

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
async function goto(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(1800);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  // ── FIX SHOT 3: 주간 리포트 풀스크린 모달 ──────────────────────────────────
  console.log('🎯 [3] 주간 리포트 모달 정밀 촬영...');
  await goto(page, `${BASE_URL}/chat`);
  // Enter analyst chat room
  await page.getByText('분석가 트윈이', { exact: false }).first().click();
  await wait(2000);

  // Click "탭하여 전체 리포트 보기" inside the ReportCardBubble
  const reportLink = page.getByText('탭하여 전체 리포트 보기', { exact: false }).first();
  if (await reportLink.count() > 0) {
    await reportLink.click();
    await wait(2500);
    console.log('  리포트 링크 클릭 성공');
  } else {
    // Try clicking the report card bubble itself
    const bubble = page.getByText('주간 연애 리포트', { exact: false }).first();
    if (await bubble.count() > 0) {
      await bubble.click();
      await wait(2500);
      console.log('  리포트 카드 버블 클릭 성공');
    }
  }
  // Take shot
  await page.screenshot({ path: path.join(ROOT, 'tmp_screenshot_3.png') });
  console.log('  ✅ [3] 저장');

  // ── FIX SHOT 4: 지도 레이어 패널 (GPS 모달 닫기 → 레이어 버튼 클릭) ─────────
  console.log('🎯 [4] 지도 레이어 패널 정밀 촬영...');
  await goto(page, `${BASE_URL}/history`);

  // 지도 탭 클릭
  const mapTab = page.getByText('지도', { exact: false }).first();
  if (await mapTab.count() > 0) {
    await mapTab.click();
    await wait(1500);
  }

  // GPS 팝업이 열려있으면 "알겠어요" 버튼으로 닫기
  const gpsOk = page.getByText('알겠어요', { exact: false }).first();
  if (await gpsOk.count() > 0) {
    await gpsOk.click();
    await wait(800);
    console.log('  GPS 모달 닫음');
  }
  // Also try clicking backdrop to dismiss
  const pressables = await page.locator('[role="button"]').all();
  for (const btn of pressables) {
    const txt = await btn.textContent().catch(() => '');
    if (txt && txt.includes('알겠')) {
      await btn.click().catch(() => {});
      await wait(500);
      break;
    }
  }
  await wait(800);

  // Click the ≡ hamburger / layer button (top-right, bounding box > 330px x)
  const allBtns = await page.locator('[role="button"], button').all();
  let layerClicked = false;
  for (const btn of allBtns) {
    const box = await btn.boundingBox().catch(() => null);
    if (box && box.x > 330 && box.y > 100 && box.y < 300 && box.width < 60) {
      await btn.click().catch(() => {});
      await wait(1200);
      layerClicked = true;
      console.log(`  레이어 버튼 클릭 (x=${box.x.toFixed(0)}, y=${box.y.toFixed(0)})`);
      break;
    }
  }
  if (!layerClicked) {
    console.log('  레이어 버튼 미발견 — 현재 화면 그대로 촬영');
  }
  await page.screenshot({ path: path.join(ROOT, 'tmp_screenshot_4.png') });
  console.log('  ✅ [4] 저장');

  await browser.close();

  // Update shots.json labels
  const shots = JSON.parse(readFileSync(path.join(ROOT, 'tmp_shots.json'), 'utf8'));
  shots[2].label = '주간 리포트 페이월 모달';
  shots[3].label = '데이트 지도 레이어 패널';
  writeFileSync(path.join(ROOT, 'tmp_shots.json'), JSON.stringify(shots, null, 2));
  console.log('\n✅ 정밀 재촬영 완료');
})();
