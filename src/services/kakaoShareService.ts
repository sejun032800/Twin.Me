/**
 * Kakao Native Share Service
 *
 * EXPO_PUBLIC_KAKAO_APP_KEY가 설정되고 @react-native-kakao/share 패키지가
 * 설치되어 있으면 카카오 네이티브 피드 템플릿으로 공유한다.
 * 그 외 모든 실패 경로(SDK 미설치, 앱 키 누락, 카카오톡 미설치, 유저 취소 제외)는
 * OS 기본 Share 시트로 자동 폴백한다.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 네이티브 빌드 설정 체크리스트 (EAS Build / Local Build)
 *   1. npm install @react-native-kakao/core @react-native-kakao/share
 *   2. .env → EXPO_PUBLIC_KAKAO_APP_KEY=카카오_네이티브앱키_여기에_입력
 *   3. .env → EXPO_PUBLIC_KAKAO_SHARE_IMAGE_URL=공개_배너_이미지_URL (선택)
 *   4. iOS: Info.plist에 LSApplicationQueriesSchemes → kakaokompassauth, kakaolink, kakaotalk 추가
 *      Android: AndroidManifest.xml queries 블록에 kakaolink scheme 추가
 *   5. app.json plugins 배열에 @react-native-kakao/core 플러그인 등록
 * ──────────────────────────────────────────────────────────────────────────
 */

import { Share } from 'react-native';

// ─── 환경 변수 ────────────────────────────────────────────────────────────────

const KAKAO_APP_KEY = process.env.EXPO_PUBLIC_KAKAO_APP_KEY ?? '';

// 브랜드 다크 네온 감성 OG 배너. 실제 CDN 업로드 후 env로 주입한다.
const SHARE_IMAGE_URL =
  process.env.EXPO_PUBLIC_KAKAO_SHARE_IMAGE_URL ??
  'https://cdn.twin.me/assets/share/og-invite-banner-dark.png';

const WEB_BASE = 'https://twin.me';

// ─── Kakao SDK 동적 로더 ──────────────────────────────────────────────────────
// require()를 동적으로 호출해 번들러가 패키지 없을 때 hard-fail하지 않도록 한다.

type SendFeedResult = { warning?: string; argumentMsg?: string };

interface KakaoShareModule {
  sendFeed: (params: KakaoFeedMessage) => Promise<SendFeedResult>;
}

let _shareModule: KakaoShareModule | null | 'NOT_INSTALLED' = null;
let _coreInitialized = false;

function resolveShareModule(): KakaoShareModule | null {
  if (_shareModule === 'NOT_INSTALLED') return null;
  if (_shareModule !== null) return _shareModule;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-kakao/share');
    _shareModule = (mod.default ?? mod) as KakaoShareModule;
    return _shareModule;
  } catch {
    _shareModule = 'NOT_INSTALLED';
    return null;
  }
}

function ensureCoreInitialized(): boolean {
  if (_coreInitialized) return true;

  if (!KAKAO_APP_KEY) {
    if (__DEV__) {
      console.warn(
        '[KakaoShare] EXPO_PUBLIC_KAKAO_APP_KEY 미설정. ' +
          '.env 파일에 EXPO_PUBLIC_KAKAO_APP_KEY=<앱키> 를 추가하세요.',
      );
    }
    return false;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('@react-native-kakao/core');
    const init = core.initialize ?? core.default?.initialize;
    if (typeof init !== 'function') return false;
    init(KAKAO_APP_KEY);
    _coreInitialized = true;
    return true;
  } catch {
    return false;
  }
}

// ─── Kakao Feed 템플릿 타입 정의 ──────────────────────────────────────────────

interface KakaoLink {
  webUrl?: string;
  mobileWebUrl?: string;
  /** Android 딥링크 쿼리 파라미터 (e.g. "inviteCode=ABC123") */
  androidExecutionParams?: string;
  /** iOS 딥링크 쿼리 파라미터 */
  iosExecutionParams?: string;
}

interface KakaoContent {
  title: string;
  imageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
  description?: string;
  link: KakaoLink;
}

interface KakaoButton {
  title: string;
  link: KakaoLink;
}

interface KakaoFeedMessage {
  content: KakaoContent;
  buttons?: KakaoButton[];
}

// ─── 피드 메시지 빌더 ─────────────────────────────────────────────────────────

function buildInviteFeed(rawCode: string): KakaoFeedMessage {
  const execParams = `inviteCode=${encodeURIComponent(rawCode)}`;
  const inviteWebUrl = `${WEB_BASE}/invite?inviteCode=${encodeURIComponent(rawCode)}`;

  const deepLink: KakaoLink = {
    webUrl: inviteWebUrl,
    mobileWebUrl: inviteWebUrl,
    androidExecutionParams: execParams,
    iosExecutionParams: execParams,
  };

  return {
    content: {
      title: 'Twin.me에서 초대장이 도착했어요! 🧬',
      description:
        `우리만의 대화 분석과 감성 AI 비서, 지금 연결해서 시작해 보세요. [초대코드: ${rawCode}]`,
      imageUrl: SHARE_IMAGE_URL,
      imageWidth: 800,
      imageHeight: 400,
      link: deepLink,
    },
    buttons: [
      {
        title: '앱에서 열기',
        link: deepLink,
      },
      {
        title: '앱 다운로드',
        link: {
          webUrl: WEB_BASE,
          mobileWebUrl: WEB_BASE,
          androidExecutionParams: execParams,
          iosExecutionParams: execParams,
        },
      },
    ],
  };
}

// ─── OS 기본 공유 시트 폴백 ───────────────────────────────────────────────────

async function shareViaOsSheet(rawCode: string): Promise<void> {
  const inviteUrl = `${WEB_BASE}/invite?inviteCode=${encodeURIComponent(rawCode)}`;
  await Share.share({
    message:
      `💕 Twin.me 초대 코드: ${rawCode}\n` +
      `우리만의 대화 분석 AI 비서, 지금 연결해요! ✨\n\n` +
      inviteUrl,
    title: 'Twin.me 초대',
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * 초대코드를 카카오톡 네이티브 피드 메시지로 공유한다.
 *
 * 실패 케이스별 처리:
 *  - SDK 패키지 미설치  → OS 시트 폴백
 *  - 앱 키 미설정       → OS 시트 폴백
 *  - 카카오톡 미설치    → OS 시트 폴백
 *  - 유저 직접 취소     → 아무 동작 없이 반환 (폴백 없음)
 *  - 그 외 네트워크·SDK 오류 → OS 시트 폴백
 */
export async function shareInviteCodeViaKakao(code: string): Promise<void> {
  const rawCode = code.replace(/\s/g, '');

  const initialized = ensureCoreInitialized();
  const shareModule = resolveShareModule();

  if (!initialized || !shareModule) {
    return shareViaOsSheet(rawCode);
  }

  try {
    const feed = buildInviteFeed(rawCode);
    await shareModule.sendFeed(feed);
  } catch (err) {
    // 유저가 직접 '취소'를 누른 경우는 폴백 없이 조용히 종료
    const isUserCancel =
      err instanceof Error &&
      (err.message.toUpperCase().includes('CANCELED') ||
        err.message.toUpperCase().includes('CANCEL'));

    if (!isUserCancel) {
      await shareViaOsSheet(rawCode);
    }
  }
}
