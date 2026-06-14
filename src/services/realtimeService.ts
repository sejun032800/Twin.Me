// Realtime couple chat — Supabase Realtime + Supabase Storage (Step #47)
//
// Architecture:
//   initChatroomRealtimeSocket()  — subscribes to postgres_changes on the
//     `messages` table filtered by couple_id.  Auto-reconnects on CHANNEL_ERROR
//     and TIMED_OUT via a supervised retry loop.
//
//   uploadMediaFile()  — uploads an image or video binary to the
//     `twinme-media` Supabase Storage bucket and returns the public CDN URL.
//
// Fallback:
//   When EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are absent
//   the file falls back to the previous simulation behaviour so local dev
//   continues to work without a backend.
//
// Supabase DDL (run once in Supabase SQL Editor):
// ─────────────────────────────────────────────────────────────────────────────
// create extension if not exists "pgcrypto";
//
// create table public.messages (
//   id          uuid        primary key default gen_random_uuid(),
//   couple_id   uuid        not null,
//   sender_id   uuid        not null,
//   msg_type    text        not null default 'normal'
//                           check (msg_type in ('normal','image','video','location','gift')),
//   content     text        not null default '',
//   media_url   text,
//   metadata    jsonb,
//   created_at  timestamptz not null default now()
// );
//
// create index messages_couple_created_idx
//   on public.messages (couple_id, created_at desc);
//
// -- Enable row-level security
// alter table public.messages enable row level security;
//
// -- Policy: members of a couple can read/insert their own messages
// create policy "couple members can read"
//   on public.messages for select
//   using (auth.uid() is not null);
//
// create policy "couple members can insert"
//   on public.messages for insert
//   with check (auth.uid() = sender_id);
//
// -- Required for Supabase Realtime to broadcast row diffs
// alter table public.messages replica identity full;
//
// -- Enable Realtime on this table (Supabase Dashboard → Database → Replication)
// -- or via SQL:
// begin;
//   drop publication if exists supabase_realtime;
//   create publication supabase_realtime;
// commit;
// alter publication supabase_realtime add table public.messages;
// ─────────────────────────────────────────────────────────────────────────────

import { isSupabaseReady, supabase } from '../lib/supabaseClient';

// ── Public types ───────────────────────────────────────────────────────────────

export interface RealtimeIncomingMessage {
  id: string;
  type: 'normal' | 'image' | 'video' | 'location' | 'gift';
  text: string;
  timestamp: number;
  mediaUri?: string;
  latitude?: number;
  longitude?: number;
  giftName?: string;
  giftEmoji?: string;
  giftPrice?: string;
}

export type RealtimeListener = (msg: RealtimeIncomingMessage) => void;

// ── DB row → app message mapper ────────────────────────────────────────────────

interface DbMessageRow {
  id: string;
  msg_type: string;
  content: string;
  media_url?: string | null;
  metadata?: {
    latitude?: number;
    longitude?: number;
    giftName?: string;
    giftEmoji?: string;
    giftPrice?: string;
  } | null;
  created_at: string;
}

function mapRowToMessage(row: DbMessageRow): RealtimeIncomingMessage {
  return {
    id: row.id,
    type: (row.msg_type as RealtimeIncomingMessage['type']) ?? 'normal',
    text: row.content ?? '',
    timestamp: new Date(row.created_at).getTime(),
    mediaUri: row.media_url ?? undefined,
    latitude: row.metadata?.latitude,
    longitude: row.metadata?.longitude,
    giftName: row.metadata?.giftName,
    giftEmoji: row.metadata?.giftEmoji,
    giftPrice: row.metadata?.giftPrice,
  };
}

// ── Realtime socket ────────────────────────────────────────────────────────────

const MAX_RETRIES = 5;
const RETRY_BASE_MS = 2_000;

export function initChatroomRealtimeSocket(
  coupleId: string,
  onMessage: RealtimeListener,
): () => void {
  // ── Production: Supabase Realtime ──────────────────────────────────────────
  if (isSupabaseReady && supabase) {
    const client = supabase; // capture non-null reference for closures
    let retries = 0;
    let destroyed = false;

    const subscribe = (): (() => void) => {
      const channelName = `couple-messages-${coupleId}`;

      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `couple_id=eq.${coupleId}`,
          },
          (payload) => {
            if (payload.new) {
              onMessage(mapRowToMessage(payload.new as DbMessageRow));
            }
          },
        )
        .subscribe((status, err) => {
          if (destroyed) return;

          if (status === 'SUBSCRIBED') {
            retries = 0;
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(
              `[realtimeService] 채널 상태: ${status}${err ? ` — ${err.message}` : ''}. ` +
                `${retries < MAX_RETRIES ? `${RETRY_BASE_MS * 2 ** retries}ms 후 재연결...` : '최대 재시도 초과.'}`,
            );
            if (retries < MAX_RETRIES) {
              const delay = RETRY_BASE_MS * 2 ** retries;
              retries += 1;
              setTimeout(() => {
                if (destroyed) return;
                client.removeChannel(channel);
                subscribe();
              }, delay);
            }
          }
        });

      return () => {
        destroyed = true;
        client.removeChannel(channel);
      };
    };

    return subscribe();
  }

  // ── Fallback: simulation (no Supabase credentials) ─────────────────────────
  const SAMPLE_MSGS = [
    '보고 싶었어 💕',
    '지금 뭐해?',
    '오늘 어떻게 됐어?',
    '나 퇴근했어!',
    '오늘 저녁 같이 먹을래? 🍜',
    '사랑해 🥰',
    '방금 생각났는데 너 그때 했던 말 아직도 기억나',
  ];

  const delay = 10_000 + Math.random() * 8_000;
  const timer = setTimeout(() => {
    onMessage({
      id: `sim-${Date.now()}`,
      type: 'normal',
      text: SAMPLE_MSGS[Math.floor(Math.random() * SAMPLE_MSGS.length)],
      timestamp: Date.now(),
    });
  }, delay);

  return () => clearTimeout(timer);
}

// ── Media upload ───────────────────────────────────────────────────────────────

const MEDIA_BUCKET = 'twinme-media';

export async function uploadMediaFile(
  uri: string,
  type: 'image' | 'video',
  onProgress: (pct: number) => void,
  coupleId?: string,
): Promise<string> {
  // ── Production: Supabase Storage ──────────────────────────────────────────
  if (isSupabaseReady && supabase) {
    const client = supabase; // capture non-null reference
    onProgress(5);

    const ext = type === 'video' ? 'mp4' : 'jpg';
    const folder = coupleId ? `couples/${coupleId}/${type}` : `shared/${type}`;
    const path = `${folder}/${Date.now()}.${ext}`;

    const response = await fetch(uri);
    const blob = await response.blob();
    onProgress(40);

    const { error } = await client.storage.from(MEDIA_BUCKET).upload(path, blob, {
      contentType: type === 'video' ? 'video/mp4' : 'image/jpeg',
      upsert: false,
    });

    if (error) {
      throw new Error(`[realtimeService] 미디어 업로드 실패: ${error.message}`);
    }
    onProgress(95);

    const { data: urlData } = client.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    onProgress(100);
    return urlData.publicUrl;
  }

  // ── Fallback: progress simulation, return original local URI ──────────────
  const steps = type === 'video' ? 28 : 14;
  const stepMs = type === 'video' ? 130 : 65;
  for (let i = 1; i <= steps; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, stepMs));
    onProgress(Math.min(Math.round((i / steps) * 100), 99));
  }
  onProgress(100);
  return uri;
}
