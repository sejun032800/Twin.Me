/**
 * Twin.me 2.0 전기능 인터랙션 완벽검수 — 마스터 캡처 자동화
 *
 * 4개 시나리오 × 비포/애프터 = 총 ~20컷
 * iPhone 14 뷰포트 393×852 @2x
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, rmSync, existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = 'http://localhost:19006';
const VP = { width: 393, height: 852 };
const SCALE = 2;

let cutIndex = 0;
const manifest = [];   // { file, caption, scenario }

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function snap(page, caption, scenario) {
  cutIndex++;
  const file = path.join(ROOT, `cut_${String(cutIndex).padStart(2, '0')}.png`);
  await page.screenshot({ path: file, fullPage: false });
  manifest.push({ file, caption, scenario });
  console.log(`  📸 [${cutIndex}] ${caption}`);
  return file;
}

async function goto(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(1500);
}

async function dismissGPSModal(page) {
  const ok = page.getByText('알겠어요', { exact: false }).first();
  if (await ok.count() > 0) { await ok.click(); await wait(600); }
}

(async () => {
  console.log('\n🚀 Twin.me 2.0 전기능 인터랙션 완벽검수 시작\n');
  console.log('━'.repeat(60));

  // Clean up old cuts
  for (let i = 1; i <= 30; i++) {
    const f = path.join(ROOT, `cut_${String(i).padStart(2, '0')}.png`);
    if (existsSync(f)) rmSync(f);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: VP,
    deviceScaleFactor: SCALE,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();

  // ══════════════════════════════════════════════════════════════════════
  // SCENARIO 1 — 주간 연애 리포트 배너 & 페이월 시나리오
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n📖 SCENARIO 1 — 주간 리포트 배너 & 페이월\n');
  const S1 = 'S1 주간 리포트 & 페이월';

  // 1-1: 채팅 목록 (배너 노출 전)
  await goto(page, `${BASE}/chat`);
  await snap(page, '[클릭 전] 채팅 목록 — 분석가 트윈이 배너 노출', S1);

  // 1-2: 트윈이 채팅방 진입 (리포트 카드 버블 노출)
  await page.getByText('분석가 트윈이', { exact: false }).first().click();
  await wait(1800);
  await snap(page, '[클릭 후] 트윈이 챗룸 — 주간 리포트 카드 버블 활성', S1);

  // 1-3: 리포트 카드 클릭 → 모달 오픈 (블러 잠금)
  await page.getByText('탭하여 전체 리포트 보기', { exact: false }).first().click();
  await wait(2000);
  await snap(page, '[클릭 후] WeeklyReportModal 오픈 — HardLock 블러 잠금 상태', S1);

  // 1-4: 블러 잠금 영역 클릭 → Paywall Nudge 팝업
  // Click "비밀 로그" CTA button
  const auditCta = page.getByText('비밀 로그', { exact: false }).first();
  if (await auditCta.count() > 0) {
    await auditCta.click();
    await wait(1500);
  } else {
    // Tap any locked section
    const lockOverlay = page.locator('text=프리미엄 전용').first();
    if (await lockOverlay.count() > 0) {
      await lockOverlay.click();
      await wait(1500);
    }
  }
  await snap(page, '[클릭 후] PaywallNudge 팝업 — 프리미엄 업그레이드 넛지', S1);

  // 1-5: 팝업 내 가상 결제 버튼 클릭 → 언락 애니메이션
  // Find subscribe/결제 button
  const buyBtn = page.getByText('구독', { exact: false }).first();
  const coffeeBtn = page.getByText('Coffee Break', { exact: false }).first();
  const premiumBtn = page.getByText('업그레이드', { exact: false }).first();
  if (await coffeeBtn.count() > 0) {
    await coffeeBtn.click(); await wait(1500);
  } else if (await buyBtn.count() > 0) {
    await buyBtn.click(); await wait(1500);
  } else if (await premiumBtn.count() > 0) {
    await premiumBtn.click(); await wait(1500);
  }
  // Close nudge modal if still open
  const closeNudge = page.getByRole('button', { name: '닫기' }).first();
  if (await closeNudge.count() > 0) { await closeNudge.click(); await wait(800); }
  await snap(page, '[결제 시뮬레이션] 구독 버튼 클릭 후 페이월 최종 상태', S1);

  // ══════════════════════════════════════════════════════════════════════
  // SCENARIO 2 — 익명 무드 피드 & 데이트 지도 담기
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n📖 SCENARIO 2 — 무드 피드 & 지도 담기\n');
  const S2 = 'S2 무드 피드 & 지도 담기';

  // 2-1: history 기본 진입 (추억 월)
  await goto(page, `${BASE}/history`);
  await snap(page, '[클릭 전] 추억 월 탭 — 기본 진입 상태', S2);

  // 2-2: 무드 피드 세그먼트 탭 클릭
  await page.getByText('무드 피드', { exact: false }).first().click();
  await wait(1500);
  await snap(page, '[클릭 후] 🧭 무드 피드 세그먼트 전환 — 피드 리스트 렌더', S2);

  // 2-3: OOTD 필터 토글 클릭
  const ootdToggle = page.getByText('내 현재 OOTD', { exact: false }).first();
  if (await ootdToggle.count() > 0) {
    await ootdToggle.click();
    await wait(1200);
  } else {
    const filterSwitch = page.locator('[role="switch"], [aria-label*="OOTD"]').first();
    if (await filterSwitch.count() > 0) { await filterSwitch.click(); await wait(1200); }
  }
  await snap(page, '[클릭 후] OOTD & 무드 필터 토글 활성 — 조건부 피드 필터링', S2);

  // 2-4: 첫 번째 코스 카드의 "지도에 담기" CTA 클릭
  const ctaBtn = page.getByText('이 코스 내 지도에 담기', { exact: false }).first();
  if (await ctaBtn.count() > 0) {
    await ctaBtn.click();
    await wait(800); // catch animation mid-frame
    await snap(page, '[클릭 후] 🧭 지도에 담기 CTA — 핑크 하트 펄스 애니메이션 포착', S2);
    await wait(1000);
  } else {
    await snap(page, '[스캔] 피드 카드 CTA 버튼 검색 상태', S2);
  }

  // 2-5: 지도 탭으로 전환
  await page.getByText('지도', { exact: false }).first().click();
  await wait(2000);
  await dismissGPSModal(page);
  await wait(800);
  await snap(page, '[클릭 후] 🗺️ 지도 세그먼트 전환 — Bulk Insert 핀 & 경로선', S2);

  // ══════════════════════════════════════════════════════════════════════
  // SCENARIO 3 — 지도 멀티 레이어 컨트롤 패널
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n📖 SCENARIO 3 — 지도 레이어 컨트롤 패널\n');
  const S3 = 'S3 레이어 컨트롤 패널';

  // 3-1: 지도 뷰 — 햄버거 버튼 클릭 전
  await snap(page, '[클릭 전] 지도 뷰 — ≡ 햄버거 버튼 비활성 상태', S3);

  // 3-2: 햄버거 버튼 클릭 → 레이어 패널 오픈
  const hamBtn = page.locator('[aria-label="레이어 관리 패널 열기"]').first();
  if (await hamBtn.count() > 0) {
    await hamBtn.click();
    await wait(1200);
  }
  await snap(page, '[클릭 후] 레이어 관리 드로어 패널 슬라이드 인', S3);

  // 3-3: 새 계획 레이어 추가 버튼 클릭
  const addLayer = page.getByText('새 계획 레이어', { exact: false }).first();
  if (await addLayer.count() > 0) {
    await addLayer.click();
    await wait(1000);
    await snap(page, '[클릭 후] + 새 계획 레이어 추가 — 인라인 편집 입력 필드', S3);
  }

  // 3-4: 눈동자(visibility) 아이콘 클릭 — 레이어 숨김 토글
  // Find first visible eye icon toggle in the panel
  await wait(500);
  // The eye icons are in layerRow with an aria-label or role
  const eyeIcons = await page.locator('[aria-label*="가시성"], [aria-label*="보기"], [aria-label*="숨기기"]').all();
  if (eyeIcons.length > 0) {
    await eyeIcons[0].click();
    await wait(1000);
  } else {
    // Find by position — eye icons are at the right side of each layer row
    // They appear as small circle buttons in the LayerControlPanel
    const panelBtns = await page.locator('[role="button"]').all();
    let eyeClicked = false;
    for (const btn of panelBtns) {
      const box = await btn.boundingBox().catch(() => null);
      const txt = await btn.textContent().catch(() => '');
      // Eye icon buttons are small (< 40px) and on the right side of panel
      if (box && box.width < 50 && box.x > 280 && !txt.includes('새') && !txt.includes('×')) {
        await btn.click().catch(() => {});
        await wait(800);
        eyeClicked = true;
        break;
      }
    }
    if (!eyeClicked) {
      // Trigger by looking at toggle switches in layer panel
      const switches = await page.locator('[role="switch"]').all();
      if (switches.length > 0) {
        await switches[0].click().catch(() => {});
        await wait(800);
      }
    }
  }
  await snap(page, '[클릭 후] 레이어 가시성 토글 — 핀 숨김/표시 연동', S3);

  // ══════════════════════════════════════════════════════════════════════
  // SCENARIO 4 — 소셜 계정 연동 & 2단계 탈퇴
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n📖 SCENARIO 4 — 소셜 연동 & 2단계 탈퇴\n');
  const S4 = 'S4 소셜 연동 & 계정 탈퇴';

  // 4-1: 설정 페이지 진입
  await goto(page, `${BASE}/settings`);
  await snap(page, '[클릭 전] 설정 메인 — 계정·보안·테마 섹션 전체 뷰', S4);

  // 4-2: 소셜 계정 연동 페이지
  await goto(page, `${BASE}/settings/account-link`);
  await snap(page, '[클릭 전] 소셜 계정 연동 페이지 — 4개 프로바이더 버튼', S4);

  // 4-3: Google 연동 버튼 클릭
  const googleBtn = page.getByText('Google', { exact: false }).first();
  if (await googleBtn.count() > 0) {
    await googleBtn.click();
    await wait(600); // catch loading spinner
    await snap(page, '[클릭 후] Google 연동 — 로딩 스피너 / 연동 요청 중', S4);
    await wait(2000); // wait for mock to complete
    await snap(page, '[연동 완료] Google ✓ 연동됨 배지 활성화', S4);
  }

  // 4-4: Kakao 연동
  const kakaoBtn = page.getByText('Kakao', { exact: false }).first();
  if (await kakaoBtn.count() > 0) {
    await kakaoBtn.click();
    await wait(2000);
    await snap(page, '[연동 완료] Kakao ✓ 연동됨 배지 활성화', S4);
  }

  // 4-5: Naver + Apple 연동 (quick)
  const naverBtn = page.getByText('Naver', { exact: false }).first();
  if (await naverBtn.count() > 0) { await naverBtn.click(); await wait(2000); }
  const appleBtn = page.getByText('Apple', { exact: false }).first();
  if (await appleBtn.count() > 0) { await appleBtn.click(); await wait(2000); }
  await snap(page, '[연동 완료] 4개 소셜 계정 전체 연동됨 배지 상태', S4);

  // 4-6: 설정 최하단 이동 → 계정 삭제 버튼
  await goto(page, `${BASE}/settings`);
  // scroll to bottom
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach(el => {
      if (el.scrollHeight > el.clientHeight + 50) el.scrollTop = 99999;
    });
  });
  await wait(600);
  const deleteBtn = page.getByText('계정 삭제', { exact: true }).first();
  if (await deleteBtn.count() > 0) {
    await deleteBtn.scrollIntoViewIfNeeded();
    await wait(400);
  }
  await snap(page, '[클릭 전] 설정 최하단 — 로그아웃 · 계정 삭제 레드 버튼', S4);

  // 4-7: 계정 삭제 클릭 → 1단계 모달
  if (await deleteBtn.count() > 0) {
    await deleteBtn.click();
    await wait(1500);
  }
  await snap(page, '[클릭 후] 계정 삭제 1단계 — 정말로 삭제하시겠어요? 경고 팝업', S4);

  // 4-8: 이어하기 클릭 → 2단계 모달
  const continueBtn = page.getByText('이어하기', { exact: false }).first();
  if (await continueBtn.count() > 0) {
    await continueBtn.click();
    await wait(1500);
    await snap(page, '[클릭 후] 계정 삭제 2단계 — 파기 요약 및 최종 동의 확인', S4);
  }

  // 4-9: 최종 동의 버튼 클릭 → Purge 후 온보딩 리다이렉트
  const finalBtn = page.getByText('확인하였으며', { exact: false }).first();
  if (await finalBtn.count() > 0) {
    await finalBtn.click();
    await wait(3000); // wait for navigation
    await snap(page, '[최종] 데이터 Purge 완료 — 온보딩 스플래시로 리다이렉트', S4);
  } else {
    await snap(page, '[확인] 2단계 동의 버튼 탐색 상태', S4);
  }

  // ══════════════════════════════════════════════════════════════════════
  await browser.close();

  console.log('\n' + '═'.repeat(60));
  console.log(`✅ 총 ${cutIndex}컷 캡처 완료`);
  manifest.forEach((m, i) =>
    console.log(`  [${String(i + 1).padStart(2, '0')}] ${m.scenario} | ${m.caption}`)
  );

  writeFileSync(
    path.join(ROOT, 'master_manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log('\n📋 master_manifest.json 저장 완료');
})();
