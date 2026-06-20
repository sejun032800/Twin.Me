/**
 * UI Book Screenshot Capture Script
 * Captures 15 shots per theme (light + dark) using Playwright
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:19006';
const VIEWPORT = { width: 390, height: 844 }; // iPhone 14 dimensions
const WAIT_MS = 3500;

const SHOTS = [
  // 1구간: 온보딩 및 첫 진입
  { id: '01', label: '앱 스플래시 화면', route: '/(auth)/splash', wait: 2000 },
  { id: '02', label: '온보딩 1단계 서비스 소개', route: '/(auth)/ingestion', wait: 3000 },
  { id: '03', label: '온보딩 카카오톡 업로드 가이드', route: '/(auth)/matching', wait: 2500 },
  { id: '04', label: 'AI 룸 최초 진입 웰컴 버블', route: '/(tabs)', wait: 4000, tab: 'chat', chatType: 'ai' },
  { id: '05', label: '분석가 룸 최초 진입 웰컴 버블', route: '/(tabs)', wait: 4000, tab: 'chat', chatType: 'analyst' },
  // 2구간: 메인 탭
  { id: '06', label: '홈 탭 DNAScoreCard 전체', route: '/(tabs)', wait: 4000 },
  { id: '07', label: 'AI 코칭 카드 TypingIndicator', route: '/(tabs)', wait: 4000, scrollY: 300 },
  { id: '08', label: '채팅 메인 인터페이스', route: '/(tabs)/chat', wait: 4000 },
  { id: '09', label: '주간 리포트 모달 Best 모먼트', route: '/(tabs)', wait: 4000, modal: 'weeklyReport' },
  { id: '10', label: '히스토리 지도 롱프레스 오버레이', route: '/(tabs)/history', wait: 4000, segment: 'map' },
  { id: '11', label: '지도 데이트 핀 + 코스 카드', route: '/(tabs)/history', wait: 4500, segment: 'mapActive' },
  { id: '12', label: '설정 메인 인덱스', route: '/(tabs)/settings', wait: 3000 },
  { id: '13', label: '구독 플랜 프리미엄 CTA', route: '/(tabs)/settings', wait: 3500, scrollY: 400 },
  { id: '14', label: '소셜 계정 연동 화면', route: '/(tabs)/settings/account-link', wait: 3000 },
  { id: '15', label: '기억 삭제 섹션 클린 상태', route: '/(tabs)/settings', wait: 3500, scrollY: 800 },
];

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForAppReady(page) {
  // Wait for React Native Web to render
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await delay(1500);
}

async function captureShot(page, shot, theme, outDir) {
  const url = `${BASE_URL}${shot.route}`;

  console.log(`  [${theme}] Shot ${shot.id}: ${shot.label}`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await waitForAppReady(page);
    await delay(shot.wait || WAIT_MS);

    // Scroll if needed
    if (shot.scrollY) {
      await page.evaluate((y) => window.scrollTo(0, y), shot.scrollY);
      await delay(500);
    }

    const filename = `shot_${shot.id}_${theme}.png`;
    const filepath = path.join(outDir, filename);
    await page.screenshot({ path: filepath, fullPage: false });
    console.log(`    ✓ Saved: ${filename}`);
    return filepath;
  } catch (err) {
    console.error(`    ✗ Failed shot ${shot.id}: ${err.message}`);
    // Take fallback screenshot
    const filename = `shot_${shot.id}_${theme}_fallback.png`;
    const filepath = path.join(outDir, filename);
    try {
      await page.screenshot({ path: filepath, fullPage: false });
    } catch (_) {}
    return filepath;
  }
}

async function main() {
  const lightDir = path.join(__dirname, '../assets/screenshots/light');
  const darkDir = path.join(__dirname, '../assets/screenshots/dark');
  fs.mkdirSync(lightDir, { recursive: true });
  fs.mkdirSync(darkDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const lightFiles = [];
  const darkFiles = [];

  for (const theme of ['light', 'dark']) {
    console.log(`\n━━━ ${theme.toUpperCase()} MODE ━━━`);
    const colorScheme = theme === 'light' ? 'light' : 'dark';
    const context = await browser.newContext({
      viewport: VIEWPORT,
      colorScheme,
      deviceScaleFactor: 2,
      locale: 'ko-KR',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });

    const page = await context.newPage();

    // Inject color scheme override into localStorage before navigation
    await page.addInitScript(`
      Object.defineProperty(window, '__EXPO_ROUTER_INITIAL_URL__', {
        get: () => undefined, configurable: true
      });
      // Override matchMedia to force color scheme
      const _originalMatchMedia = window.matchMedia;
      window.matchMedia = (query) => {
        if (query === '(prefers-color-scheme: dark)') {
          return {
            matches: ${colorScheme === 'dark'},
            media: query,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
            addListener: () => {},
            removeListener: () => {},
          };
        }
        if (query === '(prefers-color-scheme: light)') {
          return {
            matches: ${colorScheme === 'light'},
            media: query,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
            addListener: () => {},
            removeListener: () => {},
          };
        }
        return _originalMatchMedia(query);
      };
    `);

    const outDir = theme === 'light' ? lightDir : darkDir;
    const files = theme === 'light' ? lightFiles : darkFiles;

    for (const shot of SHOTS) {
      const fp = await captureShot(page, shot, theme, outDir);
      files.push({ id: shot.id, label: shot.label, path: fp });
    }

    await context.close();
  }

  await browser.close();

  // Write manifest
  const manifest = { light: lightFiles, dark: darkFiles };
  fs.writeFileSync(
    path.join(__dirname, '../assets/screenshots/manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log('\n✅ All screenshots captured!');
  console.log(`Light: ${lightFiles.length} shots → ${lightDir}`);
  console.log(`Dark:  ${darkFiles.length} shots → ${darkDir}`);
}

main().catch(console.error);
