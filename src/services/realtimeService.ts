// Realtime couple chat socket — Supabase Realtime stub.
// Replace the simulation block with actual Supabase / Firebase RTDB subscription
// when the backend is provisioned.

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

const PARTNER_SAMPLE_MSGS = [
  '보고 싶었어 💕',
  '지금 뭐해?',
  '오늘 어떻게 됐어?',
  '나 퇴근했어!',
  '오늘 저녁 같이 먹을래? 🍜',
  '사랑해 🥰',
  '방금 생각났는데 너 그때 했던 말 아직도 기억나',
];

let _simulationTimer: ReturnType<typeof setTimeout> | null = null;

export function initChatroomRealtimeSocket(
  coupleId: string,
  onMessage: RealtimeListener,
): () => void {
  // ── Production (Supabase Realtime) ──────────────────────────────────────────
  // const channel = supabase
  //   .channel(`couple-${coupleId}`)
  //   .on('postgres_changes', {
  //     event: 'INSERT',
  //     schema: 'public',
  //     table: 'messages',
  //     filter: `couple_id=eq.${coupleId}`,
  //   }, (payload) => onMessage(payload.new as RealtimeIncomingMessage))
  //   .subscribe();
  // return () => { supabase.removeChannel(channel); };

  // ── Simulation (no backend yet) ──────────────────────────────────────────────
  const delay = 10_000 + Math.random() * 8_000;
  _simulationTimer = setTimeout(() => {
    onMessage({
      id: `partner-rt-${Date.now()}`,
      type: 'normal',
      text: PARTNER_SAMPLE_MSGS[Math.floor(Math.random() * PARTNER_SAMPLE_MSGS.length)],
      timestamp: Date.now(),
    });
  }, delay);

  return () => {
    if (_simulationTimer) {
      clearTimeout(_simulationTimer);
      _simulationTimer = null;
    }
  };
}

// ── Media upload stub ──────────────────────────────────────────────────────────
// Replace with actual Supabase Storage / Firebase Storage upload.
export async function uploadMediaFile(
  uri: string,
  type: 'image' | 'video',
  onProgress: (pct: number) => void,
): Promise<string> {
  // Production:
  // const path = `couples/${coupleId}/${type}/${Date.now()}`;
  // const blob = await (await fetch(uri)).blob();
  // const { data, error } = await supabase.storage.from('media').upload(path, blob);
  // if (error) throw error;
  // return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;

  const steps = type === 'video' ? 28 : 14;
  for (let i = 1; i <= steps; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, type === 'video' ? 130 : 65));
    onProgress(Math.min(Math.round((i / steps) * 100), 99));
  }
  onProgress(100);
  return uri;
}
