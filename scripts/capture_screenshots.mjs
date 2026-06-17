/**
 * Twin.me 웹 검수 스크린샷 자동화 v2
 * iPhone 14 뷰포트 (393×852) — 5개 핵심 화면 정밀 캡처
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE_URL = 'http://localhost:19006';

const VIEWPORT = { width: 393, height: 852 };
const DEVICE_SCALE = 2;

const shots = [];

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function shot(page, name, idx) {
  const filename = path.join(ROOT, `tmp_screenshot_${idx}.png`);
  await page.screenshot({ path: filename, fullPage: false });
  shots.push({ file: filename, label: name });
  console.log(`  ✅ [${idx}] ${name} → ${filename}`);
  return filename;
}

async function goto(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(1800);
}

(async () => {
  console.log('\n🎬 Playwright 캡처 시작 v2 (iPhone 14 / 393×852)\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    colorScheme: 'dark',
  });

  const page = await context.newPage();

  // ── SHOT 1: 온보딩 스플래시/로딩 스크린 ────────────────────────────────────
  console.log('📸 [1/5] 온보딩/로딩 스크린...');
  await goto(page, `${BASE_URL}`);
  // Wait for the animated splash bars to render
  await wait(600);
  await shot(page, '온보딩 로딩 스크린', 1);

  // ── SHOT 2: AI 트윈이 챗룸 (채팅 목록) ───────────────────────────────────
  console.log('📸 [2/5] AI 트윈이 챗룸...');
  await goto(page, `${BASE_URL}/chat`);
  // click through to 분석가 트윈이 room to see the report banner
  const analystRoom = page.getByText('분석가 트윈이', { exact: false }).first();
  if (await analystRoom.count() > 0) {
    await analystRoom.click();
    await wait(1800);
  }
  await shot(page, 'AI 분석가 트윈이 챗룸', 2);

  // ── SHOT 3: 주간 리포트 페이월 모달 ─────────────────────────────────────
  console.log('📸 [3/5] 주간 리포트 페이월 모달...');
  // We're already in the analyst chat room — find the ReportArrivalBanner
  // Try clicking any report banner
  const reportBanner = page.getByText('연애 리포트가 도착했습니다', { exact: false }).first();
  if (await reportBanner.count() > 0) {
    await reportBanner.click();
    await wait(1500);
  } else {
    // Try scrolling up to find the banner at the top
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(500);
    // Look for the report banner which has "📅" emoji
    const allElements = await page.locator('*').filter({ hasText: '리포트' }).all();
    for (const el of allElements) {
      const tag = await el.evaluate(e => e.tagName);
      if (tag !== 'HTML' && tag !== 'BODY') {
        await el.click().catch(() => {});
        await wait(1500);
        break;
      }
    }
  }
  // Check if modal opened, if not try clicking the report card bubble
  const modalVisible = await page.locator('text=주간 연애 리포트').count() > 0
    || await page.locator('text=리포트 잠금').count() > 0
    || await page.locator('text=프리미엄').count() > 0;
  if (!modalVisible) {
    // Go back to chat list and try direct navigation to analyst chat
    await goto(page, `${BASE_URL}/chat`);
    const analystRoomAgain = page.getByText('분석가 트윈이', { exact: false }).first();
    if (await analystRoomAgain.count() > 0) {
      await analystRoomAgain.click();
      await wait(2000);
    }
    // Try finding any pressable with 리포트 text
    const reportElements = await page.locator('[role="button"], button').all();
    for (const el of reportElements) {
      const txt = await el.textContent().catch(() => '');
      if (txt && txt.includes('리포트')) {
        await el.click().catch(() => {});
        await wait(1800);
        break;
      }
    }
  }
  await shot(page, '주간 리포트 페이월 모달', 3);

  // ── SHOT 4: 데이트 지도 레이어 패널 ─────────────────────────────────────
  console.log('📸 [4/5] 데이트 지도 레이어 패널...');
  await goto(page, `${BASE_URL}/history`);
  // Click on "지도" tab in history segmented control
  const mapTab = page.getByText('지도', { exact: false }).first();
  if (await mapTab.count() > 0) {
    await mapTab.click();
    await wait(2000);
  }
  // Now find the layer control button (top-right area, shows "레이어 관리" when tapped)
  // The LayerFilterChips or 레이어 control panel button
  const layerBtns = await page.locator('[role="button"], button').all();
  let layerOpened = false;
  for (const btn of layerBtns) {
    const txt = await btn.textContent().catch(() => '');
    if (txt && (txt.includes('레이어') || txt.includes('🗂') || txt.includes('layer'))) {
      await btn.click().catch(() => {});
      await wait(1000);
      layerOpened = true;
      break;
    }
    // Check bounding box for top-right button
    const box = await btn.boundingBox().catch(() => null);
    if (box && box.x > 300 && box.y < 200 && box.width < 60) {
      await btn.click().catch(() => {});
      await wait(1000);
      layerOpened = true;
      break;
    }
  }
  if (!layerOpened) {
    // Try pressing 'l' key or look for hamburger-like element
    // Find any element with "레이어" text
    const layerText = page.getByText('레이어', { exact: false });
    if (await layerText.count() > 0) {
      await layerText.first().click().catch(() => {});
      await wait(1000);
    }
  }
  await shot(page, '데이트 지도 레이어 패널', 4);

  // ── SHOT 5: 설정 계정 삭제 팝업 ─────────────────────────────────────────
  console.log('📸 [5/5] 설정 계정 삭제 팝업...');
  await goto(page, `${BASE_URL}/settings`);

  // Scroll to bottom of settings via JavaScript (ScrollView)
  await page.evaluate(() => {
    // Try various scroll targets
    const scrollables = document.querySelectorAll('[data-testid], [role="scrollbar"]');
    document.querySelectorAll('*').forEach(el => {
      if (el.scrollHeight > el.clientHeight + 100) {
        el.scrollTop = el.scrollHeight;
      }
    });
    window.scrollTo(0, document.body.scrollHeight);
  });
  await wait(800);

  // Find 계정 삭제 button by text
  const deleteBtn = page.getByText('계정 삭제', { exact: true }).first();
  if (await deleteBtn.count() > 0) {
    await deleteBtn.scrollIntoViewIfNeeded();
    await wait(500);
    await deleteBtn.click();
    await wait(1500);
    // Step 1 modal should be open — capture it
    const step1Visible = await page.getByText('계정을 삭제').count() > 0
      || await page.getByText('정말 삭제').count() > 0
      || await page.getByText('계정 삭제').count() > 1;
    console.log(`    계정 삭제 모달 열림: ${step1Visible}`);
  } else {
    // Try to scroll to find the button
    await page.keyboard.press('End');
    await wait(500);
    // Re-evaluate scroll
    await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      all.reverse().forEach(el => {
        if (el.scrollHeight > el.clientHeight) el.scrollTop = 99999;
      });
    });
    await wait(800);
    const deleteBtnRetry = page.getByText('계정 삭제', { exact: true }).first();
    if (await deleteBtnRetry.count() > 0) {
      await deleteBtnRetry.click();
      await wait(1500);
    }
  }
  await shot(page, '설정 계정 삭제 팝업', 5);

  await browser.close();

  console.log('\n✅ 스크린샷 5장 완료');
  console.log('📁 저장 위치:');
  shots.forEach(s => console.log(`   ${s.file}`));

  const { writeFileSync } = await import('fs');
  writeFileSync(
    path.join(ROOT, 'tmp_shots.json'),
    JSON.stringify(shots, null, 2)
  );
  console.log('\n🔗 tmp_shots.json 저장 완료');
})();
