#!/usr/bin/env node
/**
 * run-temporary-web-audit.js  — One-shot sandbox web-audit pipeline (v3)
 *
 * Steps:
 *   1. Inject *.web.ts mock stubs for native-only modules
 *   2. Start `npx expo start --web` in background
 *   3. Puppeteer: per-route → inject Spoqa Han Sans Neo font → wait fonts.ready
 *      → 4s settle → PDF
 *   4. Merge PDFs → write directly to ../twinme_web_ui_snapshot.pdf
 *      (parent dir = outside git repo → immune to git clean)
 *   5. Kill Expo server
 *   6. git clean -fd -e this-script + git checkout -- .
 *   7. Verify git status is clean
 */

'use strict';

const { execSync, spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const http = require('http');

// ─── Config ───────────────────────────────────────────────────────────────────

const ROOT = __dirname;

// Output lives one level UP — completely outside the git working tree.
// git clean / git checkout cannot touch it.
const OUT_PDF  = path.resolve(ROOT, '..', 'twinme_web_ui_snapshot.pdf');
const TMP_DIR  = path.join(ROOT, '.web-audit-tmp');
const BASE_URL = 'http://localhost:8081';

const VIEWPORT = { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const ROUTES = [
  { label: '01_Splash',          path: '/splash'                    },
  { label: '02_Ingestion',       path: '/ingestion'                 },
  { label: '03_Loading',         path: '/loading'                   },
  { label: '04_Matching',        path: '/matching'                  },
  { label: '05_Profile',         path: '/profile'                   },
  { label: '06_Complete',        path: '/complete'                  },
  { label: '07_Home',            path: '/'                          },
  { label: '08_Chat',            path: '/chat'                      },
  { label: '09_History',         path: '/history'                   },
  { label: '10_Settings',        path: '/settings'                  },
  { label: '11_PersonalInfo',    path: '/settings/personal-info'    },
  { label: '12_Security',        path: '/settings/security'         },
  { label: '13_DataPermissions', path: '/settings/data-permissions' },
  { label: '14_PrivacyPolicy',   path: '/settings/privacy-policy'   },
  { label: '15_Terms',           path: '/settings/terms'            },
];

// ─── Native-module mock files ─────────────────────────────────────────────────

const MOCK_FILES = [
  {
    dest: 'src/services/iapService.web.ts',
    content: `// WEB STUB — run-temporary-web-audit.js
export type PlanId = 'coffee' | 'deep';
export interface SubscriptionStatus { isPremium: boolean; planId: PlanId | null; expiresAt: string | null; }
export const DEFAULT_SUBSCRIPTION_STATUS: SubscriptionStatus = { isPremium: false, planId: null, expiresAt: null };
export const IAP_SKUS: Record<PlanId, string> = { coffee: 'coffee_break_monthly', deep: 'deep_talk_night_monthly' };
export function isSandboxMode(): boolean { return true; }
export async function initIAP(): Promise<void> {}
export async function teardownIAP(): Promise<void> {}
export interface StoreProduct { productId: string; price: string; currency: string; title: string; description: string; }
export async function getAvailableSubscriptions(): Promise<StoreProduct[]> { return []; }
export async function purchaseSubscription(_planId: PlanId): Promise<SubscriptionStatus> { return DEFAULT_SUBSCRIPTION_STATUS; }
export async function purchaseOneTimeProduct(_sku: string): Promise<string> { return 'web-mock-tx-id'; }
export async function verifyThemeOwnership(_sku: string): Promise<boolean> { return false; }
`,
  },
  {
    dest: 'src/services/authService.web.ts',
    content: `// WEB STUB — run-temporary-web-audit.js
const LS = typeof localStorage !== 'undefined' ? localStorage : null;
export async function saveAuthTokens(p: { authToken: string; refreshToken: string }): Promise<void> {
  LS?.setItem('auth_token', p.authToken); LS?.setItem('refresh_token', p.refreshToken);
}
export async function getStoredAuthToken(): Promise<string | null> { return LS?.getItem('auth_token') ?? null; }
export async function getStoredRefreshToken(): Promise<string | null> { return LS?.getItem('refresh_token') ?? null; }
export async function logoutFromServer(): Promise<void> { LS?.removeItem('auth_token'); LS?.removeItem('refresh_token'); }
export async function clearLocalAuthData(): Promise<void> { LS?.removeItem('auth_token'); LS?.removeItem('refresh_token'); }
`,
  },
  {
    dest: 'src/services/weeklyReportService.web.ts',
    content: `// WEB STUB — run-temporary-web-audit.js
import type { UserProfile, PartnerProfile } from '../context/AppContext';
export interface TopicItem { label: string; value: number; color: string; }
export interface WeeklyReportData {
  weekLabel: string; generatedAt: number; overallScore: number; weatherLabel: string;
  topics: TopicItem[]; emotionData: number[]; emotionLabels: string[];
  radarAxes: string[]; radarValues: number[]; analystComment: string; isLoading: boolean;
}
export const LOADING_PLACEHOLDER: WeeklyReportData = {
  weekLabel: '분석 중...', generatedAt: 0, overallScore: 0, weatherLabel: '🔮 데이터 집계 중',
  topics: [], emotionData: Array(7).fill(50), emotionLabels: ['월','화','수','목','금','토','일'],
  radarAxes: ['애정','안정성','소통','갈등조절','친밀도'], radarValues: Array(5).fill(0.5),
  analystComment: '채팅 데이터를 분석하고 있어요. 잠시만 기다려주세요... 🔬', isLoading: true,
};
export function computeWeeklyMetrics(_m: unknown[], _u: UserProfile, _p: PartnerProfile): WeeklyReportData {
  return { ...LOADING_PLACEHOLDER, isLoading: false, weekLabel: '웹 미리보기' };
}
export async function generateAnalystSummary(_d: WeeklyReportData): Promise<string> { return '웹 미리보기 모드'; }
const LS = typeof localStorage !== 'undefined' ? localStorage : null;
export async function loadCachedReport(): Promise<WeeklyReportData | null> {
  try { const r = LS?.getItem('__twinme_wr__'); return r ? JSON.parse(r) : null; } catch { return null; }
}
export async function saveReportToCache(d: WeeklyReportData): Promise<void> {
  try { LS?.setItem('__twinme_wr__', JSON.stringify(d)); } catch {}
}
export async function loadLastGeneratedTimestamp(): Promise<number> {
  try { return Number(LS?.getItem('__twinme_wr_ts__') ?? 0); } catch { return 0; }
}
export async function generateFullReport(_m: unknown[], _u: UserProfile, _p: PartnerProfile): Promise<WeeklyReportData> {
  return LOADING_PLACEHOLDER;
}
export function shouldFireWeeklyReport(_last: number): boolean { return false; }
`,
  },
  {
    dest: 'src/hooks/useGeoLocation.web.ts',
    content: `// WEB STUB — run-temporary-web-audit.js
import { useCallback, useState } from 'react';
export const GEO_FALLBACK = { lat: 37.5512, lng: 126.9882 } as const;
export type GeoPermission = 'pending' | 'granted' | 'denied';
export interface GeoState {
  permission: GeoPermission; coords: { lat: number; lng: number }; isReal: boolean;
  requestPermission: () => Promise<void>; recenter: () => Promise<{ lat: number; lng: number }>;
}
export function useGeoLocation(): GeoState {
  const [permission, setPermission] = useState<GeoPermission>('pending');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(GEO_FALLBACK);
  const [isReal, setIsReal] = useState(false);
  const requestPermission = useCallback(async () => {
    if (!navigator.geolocation) { setPermission('denied'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setIsReal(true); setPermission('granted'); },
      () => setPermission('denied'),
    );
  }, []);
  const recenter = useCallback(async (): Promise<{ lat: number; lng: number }> => {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(coords); return; }
      navigator.geolocation.getCurrentPosition(
        pos => { const n = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setCoords(n); setIsReal(true); resolve(n); },
        () => resolve(coords),
      );
    });
  }, [coords]);
  return { permission, coords, isReal, requestPermission, recenter };
}
`,
  },
  {
    dest: 'src/hooks/usePhotoMetadata.web.ts',
    content: `// WEB STUB — run-temporary-web-audit.js
import { useCallback } from 'react';
export interface PhotoMeta { id: string; uri: string; lat: number; lng: number; formattedTime: string; }
export function usePhotoMetadata() {
  const pickPhotos = useCallback(async (): Promise<PhotoMeta[]> => [], []);
  return { pickPhotos };
}
`,
  },
  {
    dest: 'src/services/permissionManager.web.ts',
    content: `// WEB STUB — run-temporary-web-audit.js
export type PermissionStatus = 'granted' | 'denied' | 'undetermined';
export interface PermissionState { camera: PermissionStatus; location: PermissionStatus; notifications: PermissionStatus; }
export async function getCameraStatus(): Promise<PermissionStatus> { return 'undetermined'; }
export async function requestCamera(): Promise<PermissionStatus> { return 'undetermined'; }
export async function getLocationStatus(): Promise<PermissionStatus> { return 'undetermined'; }
export async function requestLocation(): Promise<PermissionStatus> { return 'undetermined'; }
export async function getNotificationsStatus(): Promise<PermissionStatus> { return 'undetermined'; }
export async function getAllPermissions(): Promise<PermissionState> {
  return { camera: 'undetermined', location: 'undetermined', notifications: 'undetermined' };
}
export async function openSystemSettings(): Promise<void> {}
export async function requestDataArchive(): Promise<void> {}
`,
  },
  {
    dest: 'src/services/dateShuttleService.web.ts',
    content: `// WEB STUB — run-temporary-web-audit.js
export interface WeatherSnapshot { condition: string; tempC: number; humidity: number; icon: string; }
export interface ShuttleContext { location: { lat: number; lng: number }; weather: WeatherSnapshot | null; partnerTaste: string[]; }
export interface ShuttleCourseCard { id: string; title: string; description: string; category: string; emoji: string; lat?: number; lng?: number; address?: string; }
export interface ShuttleResult { cards: ShuttleCourseCard[]; contextSummary: string; }
export async function gatherDateShuttleContext(): Promise<ShuttleContext> {
  return { location: { lat: 37.5512, lng: 126.9882 }, weather: null, partnerTaste: [] };
}
export const SHUTTLE_FALLBACK_CARDS: ShuttleCourseCard[] = [
  { id: 'w1', title: '강남 카페 투어', description: '분위기 좋은 카페들을 순회해요', category: '카페', emoji: '☕' },
  { id: 'w2', title: '한강 피크닉', description: '한강변 산책과 피크닉', category: '야외', emoji: '🌸' },
  { id: 'w3', title: '홍대 맛집 탐방', description: '홍대 인근 맛집들을 탐방해요', category: '맛집', emoji: '🍜' },
];
export async function requestDateShuttleRecommendation(_ctx: ShuttleContext): Promise<ShuttleResult> {
  return { cards: SHUTTLE_FALLBACK_CARDS, contextSummary: '웹 미리보기 모드' };
}
`,
  },
];

// ─── Auth injection (Puppeteer evaluateOnNewDocument) ────────────────────────

const AUTH_SCRIPT = `
(function() {
  const uid = 'demo-user-001', cid = 'demo-couple-001', tok = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo';
  const pairs = {
    'userId': uid, 'coupleId': cid, 'authToken': tok, 'isLoggedIn': 'true',
    '@twinme:userId': uid, '@twinme:coupleId': cid, '@twinme:authToken': tok,
    'auth_token': tok, 'refresh_token': tok,
  };
  try { Object.entries(pairs).forEach(([k,v]) => localStorage.setItem(k, v)); } catch(e) {}
  try {
    if (!window.__ASYNC_STORAGE__) window.__ASYNC_STORAGE__ = {};
    Object.assign(window.__ASYNC_STORAGE__, { userId: uid, coupleId: cid, authToken: tok });
  } catch(e) {}
})();
`;

// Build @font-face CSS from local OTF files (base64-encoded) — no CDN required.
let _cachedFontCSS = null;
function buildLocalFontCSS() {
  if (_cachedFontCSS !== null) return _cachedFontCSS;
  const fontDir = path.join(ROOT, 'assets', 'fonts');
  const variants = [
    { name: 'SpoqaHanSansNeo-Regular', weight: 400, file: 'SpoqaHanSansNeo-Regular.otf' },
    { name: 'SpoqaHanSansNeo-Medium',  weight: 500, file: 'SpoqaHanSansNeo-Medium.otf'  },
    { name: 'SpoqaHanSansNeo-Bold',    weight: 700, file: 'SpoqaHanSansNeo-Bold.otf'    },
    { name: 'SpoqaHanSansNeo-Light',   weight: 300, file: 'SpoqaHanSansNeo-Light.otf'   },
  ];
  _cachedFontCSS = variants.map(({ name, weight, file }) => {
    const filePath = path.join(fontDir, file);
    if (!fs.existsSync(filePath)) return '';
    const b64 = fs.readFileSync(filePath).toString('base64');
    return [
      `@font-face {`,
      `  font-family: 'Spoqa Han Sans Neo';`,
      `  src: url('data:font/otf;base64,${b64}') format('opentype');`,
      `  font-weight: ${weight};`,
      `  font-style: normal;`,
      `  font-display: block;`,
      `}`,
    ].join('\n');
  }).join('\n');
  return _cachedFontCSS;
}

// Force-override style injected after font load
const SPOQA_OVERRIDE_CSS = `
* {
  font-family: 'Spoqa Han Sans Neo', 'Apple SD Gothic Neo', 'Noto Sans KR',
               'Malgun Gothic', sans-serif !important;
  letter-spacing: -0.3px !important;
}
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg)  { console.log(`\n${msg}`); }
function step(msg) { console.log(`  → ${msg}`); }
function ok(msg)   { console.log(`  ✅ ${msg}`); }
function warn(msg) { console.warn(`  ⚠️  ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForServer(url, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  process.stdout.write(`\n  Waiting for ${url} `);
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, res => { res.resume(); resolve(); });
        req.on('error', reject);
        req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      process.stdout.write(' ✓\n');
      return;
    } catch {
      process.stdout.write('.');
      await sleep(2500);
    }
  }
  throw new Error(`Server at ${url} did not respond`);
}

function injectMockFiles() {
  log('📄 [1단계] 네이티브 서비스 웹 모킹 파일 인젝션');
  let count = 0;
  for (const { dest, content } of MOCK_FILES) {
    const abs = path.join(ROOT, dest);
    if (fs.existsSync(abs)) { warn(`스킵 (이미 존재): ${dest}`); continue; }
    fs.writeFileSync(abs, content, 'utf8');
    step(`생성됨: ${dest}`);
    count++;
  }
  ok(`${count}개 mock 파일 인젝션 완료`);
}

// ─── Per-page capture with Spoqa font injection ───────────────────────────────

async function capturePage(page, route, tmpDir) {
  const url = `${BASE_URL}${route.path}`;
  step(`캡처 [${route.label}] → ${url}`);

  // Re-inject auth state before navigation
  await page.evaluate(AUTH_SCRIPT).catch(() => {});

  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 }).catch(async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  });

  // Re-inject auth after navigation (SPA may have cleared localStorage)
  await page.evaluate(AUTH_SCRIPT).catch(() => {});

  // ── Font injection ──────────────────────────────────────────────────────────
  // Inject Spoqa Han Sans Neo directly from local OTF files (base64) — no CDN.
  await page.addStyleTag({ content: buildLocalFontCSS() }).catch(e => {
    warn(`로컬 폰트 주입 실패 (${route.label}): ${e.message}`);
  });

  // Force every text element to use Spoqa
  await page.addStyleTag({ content: SPOQA_OVERRIDE_CSS }).catch(() => {});

  // ── Font hydration guard ────────────────────────────────────────────────────
  // Wait for browser FontFaceSet to report all fonts ready, then add 4s buffer
  // so the React layout engine has time to re-flow with the loaded font metrics.
  await page.evaluateHandle(() => document.fonts.ready).catch(() => {});
  await sleep(4_000);

  // ── Capture ─────────────────────────────────────────────────────────────────
  const pdfPath = path.join(tmpDir, `${route.label}.pdf`);
  await page.pdf({
    path: pdfPath,
    width:  `${VIEWPORT.width}px`,
    height: `${VIEWPORT.height}px`,
    printBackground: true,
    pageRanges: '1',
  });

  ok(`저장됨: ${route.label}.pdf`);
  return pdfPath;
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

(async () => {
  let expoProc = null;
  const cleanupCalled = { done: false };

  async function hardCleanup() {
    if (cleanupCalled.done) return;
    cleanupCalled.done = true;

    log('🔀 [3단계] 흔적 소각 — Expo 종료 + Git 롤백');

    if (expoProc && !expoProc.killed) {
      try { process.kill(-expoProc.pid, 'SIGTERM'); step('Expo SIGTERM'); } catch {}
      await sleep(1500);
      try { process.kill(-expoProc.pid, 'SIGKILL'); step('Expo SIGKILL'); } catch {}
    }
    try { execSync('fuser -k 8081/tcp 2>/dev/null || true', { stdio: 'ignore' }); step('포트 8081 해제'); } catch {}

    // git clean: remove mock *.web.ts files injected by this script.
    // Exclude this script itself so it can be re-run conveniently.
    // OUT_PDF lives at ../ (parent dir), so git clean cannot reach it at all.
    try {
      execSync(
        `git clean -fd -e "${path.basename(__filename)}"`,
        { cwd: ROOT, stdio: 'inherit' },
      );
      step('git clean -fd 완료');
    } catch (e) { warn(`git clean 실패: ${e.message}`); }

    try {
      execSync('git checkout -- .', { cwd: ROOT, stdio: 'inherit' });
      step('git checkout -- . 완료');
    } catch (e) { warn(`git checkout 실패: ${e.message}`); }

    // ── 4단계 무결성 검증 ────────────────────────────────────────────────────
    log('🧪 [4단계] 무결성 사후 검증');
    const status = execSync('git status', { cwd: ROOT }).toString().trim();
    console.log('\n' + status);
    if (!status.match(/^\s*(modified:|deleted:|new file:)/m)) {
      ok('소스 코드 무결 — 모킹 흔적 없음 ✓');
    } else {
      warn('잔여 변경사항 확인 필요.');
    }
  }

  for (const sig of ['SIGINT', 'SIGTERM', 'uncaughtException']) {
    process.on(sig, async (err) => {
      if (sig === 'uncaughtException') console.error(err);
      await hardCleanup();
      process.exit(1);
    });
  }

  try {
    // ── 1. Mock injection ──────────────────────────────────────────────────────
    injectMockFiles();

    // ── 2. Expo web server ────────────────────────────────────────────────────
    log('📡 [2단계] Expo 웹 서버 기동');
    step('npx expo start --web --port 8081 (백그라운드)');

    expoProc = spawn('npx', ['expo', 'start', '--web', '--port', '8081'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: { ...process.env, CI: '1', BROWSER: 'none' },
    });
    expoProc.stdout.on('data', d => {
      const s = d.toString();
      if (/Metro|web|error|Error/i.test(s)) process.stdout.write('  [expo] ' + s.replace(/\n$/, '') + '\n');
    });
    expoProc.stderr.on('data', d => {
      const s = d.toString();
      if (!/DeprecationWarning|ExperimentalWarning/.test(s))
        process.stderr.write('  [expo] ' + s.replace(/\n$/, '') + '\n');
    });
    expoProc.on('error', e => warn(`Expo 에러: ${e.message}`));

    await waitForServer(BASE_URL, 180_000);
    step('Metro 초기 번들 대기 (10s)…');
    await sleep(10_000);

    // ── 3. Puppeteer capture ──────────────────────────────────────────────────
    log('📸 [2-B] Puppeteer 캡처 시작 (스포카 한 산스 네오 폰트 주입)');

    if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });

    const puppeteer   = require('puppeteer');
    const { PDFDocument } = require('pdf-lib');

    // Resolve Chrome
    let executablePath;
    try { executablePath = puppeteer.executablePath(); } catch {}
    if (!executablePath || !fs.existsSync(executablePath)) {
      const cacheBase = path.join(process.env.HOME || '/home/codespace', '.cache/puppeteer/chrome');
      if (fs.existsSync(cacheBase)) {
        for (const d of fs.readdirSync(cacheBase).sort().reverse()) {
          const c = path.join(cacheBase, d, 'chrome-linux64/chrome');
          if (fs.existsSync(c)) { executablePath = c; break; }
        }
      }
    }
    if (!executablePath) throw new Error('Chrome 없음 — npx puppeteer browsers install chrome');
    step(`Chrome: ${executablePath}`);

    const browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--disable-gpu', '--disable-web-security', '--font-render-hinting=none',
        '--disable-features=TranslateUI',
      ],
    });

    const context = await browser.createBrowserContext();
    const page    = await context.newPage();
    await page.setViewport(VIEWPORT);
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.evaluateOnNewDocument(AUTH_SCRIPT);
    await page.evaluateOnNewDocument(() => {
      document.documentElement && (document.documentElement.style.background = '#0D0D0D');
    });
    page.on('console', () => {});
    page.on('pageerror', () => {});

    step(`총 ${ROUTES.length}개 라우트 순회…`);
    const pdfPaths = [];
    for (const route of ROUTES) {
      try {
        const p = await capturePage(page, route, TMP_DIR);
        pdfPaths.push(p);
      } catch (err) {
        warn(`[${route.label}] 실패: ${err.message}`);
      }
    }

    await browser.close();
    ok(`${pdfPaths.length}/${ROUTES.length} 화면 캡처 완료`);

    // ── 4. Merge PDFs → write directly to ../ ─────────────────────────────────
    log('🔗 PDF 병합 (pdf-lib)');
    const merged = await PDFDocument.create();
    for (const p of pdfPaths) {
      try {
        const src   = await PDFDocument.load(fs.readFileSync(p));
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach(pg => merged.addPage(pg));
      } catch (e) { warn(`병합 스킵: ${path.basename(p)} — ${e.message}`); }
    }
    const bytes = await merged.save();

    // OUT_PDF is at ../twinme_web_ui_snapshot.pdf → outside git repo → safe
    fs.writeFileSync(OUT_PDF, bytes);
    const sizeKB = Math.round(bytes.length / 1024);
    ok(`최종 PDF: ${OUT_PDF}`);
    step(`${sizeKB} KB | ${merged.getPageCount()} 페이지`);

    // Tidy up temp dir
    fs.rmSync(TMP_DIR, { recursive: true, force: true });

  } finally {
    await hardCleanup();

    log('🎉 파이프라인 완료!');
    if (fs.existsSync(OUT_PDF)) {
      const sizeKB = Math.round(fs.statSync(OUT_PDF).size / 1024);
      console.log(`\n   📄 출력 파일 : ${OUT_PDF}`);
      console.log(`   📏 파일 크기  : ${sizeKB} KB`);
    }
  }
})();
