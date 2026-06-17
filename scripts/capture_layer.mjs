/**
 * Shot 4 레이어 패널 최종 정밀 촬영
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE_URL = 'http://localhost:19006';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  console.log('🗺️  지도 레이어 패널 촬영...');
  await page.goto(`${BASE_URL}/history`, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(1500);

  // 지도 탭 클릭
  await page.getByText('지도', { exact: false }).first().click().catch(() => {});
  await wait(1500);

  // GPS 모달 닫기
  await page.getByText('알겠어요', { exact: false }).first().click().catch(() => {});
  await wait(600);

  // ≡ 버튼: 오른쪽 상단 영역을 직접 좌표 클릭 (393×852 viewport 기준)
  // Screenshot에서 ≡는 약 x=360, y=200 에 위치
  await page.mouse.click(362, 195);
  await wait(1500);

  // 레이어 패널이 열렸는지 확인
  const layerPanel = await page.getByText('레이어 관리', { exact: false }).count();
  console.log(`  레이어 패널 열림: ${layerPanel > 0}`);

  if (layerPanel === 0) {
    // Try slightly different coordinates
    await page.mouse.click(358, 190);
    await wait(1200);
    const layerPanel2 = await page.getByText('레이어 관리', { exact: false }).count();
    console.log(`  2차 시도 후 레이어 패널: ${layerPanel2 > 0}`);
  }

  await page.screenshot({ path: path.join(ROOT, 'tmp_screenshot_4.png') });
  console.log('  ✅ [4] 저장');

  await browser.close();
})();
