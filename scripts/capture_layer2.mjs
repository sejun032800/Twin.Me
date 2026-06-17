import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE_URL = 'http://localhost:19006';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();

  await page.goto(`${BASE_URL}/history`, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(1500);

  // 지도 탭
  await page.getByText('지도', { exact: false }).first().click().catch(() => {});
  await wait(1500);

  // GPS 모달 닫기
  await page.getByText('알겠어요').first().click().catch(() => {});
  await wait(800);

  // accessibilityLabel로 햄버거 버튼 탐색
  const hamBtn = page.locator('[aria-label="레이어 관리 패널 열기"]').first();
  const cnt = await hamBtn.count();
  console.log(`accessibilityLabel 버튼 발견: ${cnt}`);

  if (cnt > 0) {
    await hamBtn.click();
    await wait(1500);
    const panelOpen = await page.getByText('레이어 관리').count() > 0;
    console.log(`레이어 패널 열림: ${panelOpen}`);
  } else {
    // Debug: log all aria-labels on page
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[aria-label]')).map(e => e.getAttribute('aria-label'))
    );
    console.log('찾을 수 있는 aria-labels:', labels.slice(0, 20));

    // Find by direct DOM — look for the three-line hamburger structure
    // The hamburger button contains three View children (hamburgerLine)
    // Try clicking at position based on styling: right:12, top:60 within map area
    // Map area starts after segmented tabs — approx y=120 on the page
    // So button center is at x = 393-12-20=361, y = 120+60+20=200
    const box = await page.locator('body').boundingBox();
    await page.mouse.click(361, 200);
    await wait(1200);
    console.log('좌표 클릭 (361, 200)');

    const panelOpen2 = await page.getByText('레이어 관리').count() > 0;
    console.log(`레이어 패널 열림 (2): ${panelOpen2}`);

    if (!panelOpen2) {
      // Dump the DOM structure near that area
      const elementsNear = await page.evaluate(() => {
        const elements = [];
        document.querySelectorAll('*').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.left > 300 && rect.top > 150 && rect.top < 280 && rect.width < 80) {
            elements.push({
              tag: el.tagName,
              class: el.className?.substring(0, 50),
              'aria-label': el.getAttribute('aria-label'),
              role: el.getAttribute('role'),
              text: el.textContent?.trim().substring(0, 30),
              rect: { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) }
            });
          }
        });
        return elements.slice(0, 15);
      });
      console.log('근처 요소들:', JSON.stringify(elementsNear, null, 2));
    }
  }

  await page.screenshot({ path: path.join(ROOT, 'tmp_screenshot_4.png') });
  console.log('✅ [4] 저장');
  await browser.close();
})();
