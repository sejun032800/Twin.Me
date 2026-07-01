// ─── Local Notification Service — Daily + Weekly Push Scheduling ─────────────
//
// Uses expo-notifications for on-device scheduled alerts.
// Daily: 22:00 "오늘 대화 업로드 리마인더"
// Weekly: 토요일 09:00 "추억 명대사" random quote

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { HighlightCard } from './kakaoHighlightService';

const DAILY_ID   = 'twin-me-daily-kakao-reminder';
const WEEKLY_ID  = 'twin-me-weekly-quote-reminder';
const MASTER_QUESTION_ID = 'twin-me-master-question-tonight';

// ── Permission request ────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ── Cancel all managed notifications ─────────────────────────────────────────

export async function cancelAllManagedNotifications(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_ID);
  } catch {}
  try {
    await Notifications.cancelScheduledNotificationAsync(WEEKLY_ID);
  } catch {}
}

// ── Daily 10pm reminder ───────────────────────────────────────────────────────

export async function scheduleDailyReminder(partnerName: string): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_ID);
  } catch {}

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_ID,
      content: {
        title: 'Twin.me',
        body: `오늘 ${partnerName}님과의 대화는 어땠나요? 저에게도 알려주세요! 💬 카톡 대화 업로드하기`,
        sound: true,
        badge: 1,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 22,
        minute: 0,
      },
    });
  } catch {}
}

// ── Weekly quote reminder ─────────────────────────────────────────────────────

export async function scheduleWeeklyQuoteReminder(
  cards: HighlightCard[],
  partnerName: string,
): Promise<void> {
  if (Platform.OS === 'web') return;
  if (cards.length === 0) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(WEEKLY_ID);
  } catch {}

  const pick = cards[Math.floor(Math.random() * cards.length)];
  const quote = pick.text.length > 40 ? pick.text.slice(0, 40) + '…' : pick.text;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: WEEKLY_ID,
      content: {
        title: '[Twin.me 추억 배너]',
        body: `${partnerName}님이 말했었죠: "${quote}" ✨`,
        sound: true,
        badge: 1,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 7,   // 토요일 (1=Sun…7=Sat in Expo)
        hour: 9,
        minute: 0,
      },
    });
  } catch {}
}

// ── FUN-REP-002 §2.1: 그날 밤 마스터 커플 질문 실시간 푸시 ────────────────────
// 주간 리포트에서 분리되어, 그 감정이 살아있는 당일 밤(기본 21:00)에 1회 발송된다.

export async function scheduleMasterQuestionPush(question: string, hour = 21): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await Notifications.cancelScheduledNotificationAsync(MASTER_QUESTION_ID);
  } catch {}

  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  // 이미 지난 시각이면 5분 뒤 즉시 발송 (그날 밤이 끝나기 전 최대한 살아있는 감정으로 전달)
  if (target.getTime() <= now.getTime()) {
    target.setTime(now.getTime() + 5 * 60 * 1000);
  }

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: MASTER_QUESTION_ID,
      content: {
        title: '🎯 분석가 트윈이의 오늘 밤 맞춤 질문',
        body: question,
        sound: true,
        badge: 1,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: target,
      },
    });
  } catch {}
}

// ── Bootstrap — configure channel + handler ───────────────────────────────────
// Call once at app startup (e.g., inside _layout.tsx useEffect).

export function bootstrapNotifications(): void {
  if (Platform.OS === 'web') return;

  // Android: create channel
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('twin-me', {
      name: 'Twin.me 알림',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D946EF',
    }).catch(() => {});
  }

  // Show notifications when app is foregrounded
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      priority: Notifications.AndroidNotificationPriority.DEFAULT,
    }),
  });
}
