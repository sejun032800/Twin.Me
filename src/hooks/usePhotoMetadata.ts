import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

export interface PhotoMeta {
  id: string;
  uri: string;
  lat: number;
  lng: number;
  formattedTime: string;
}

// ── GPS helpers ───────────────────────────────────────────────────────────────

/**
 * Convert EXIF DMS array [degrees, minutes, seconds] + hemisphere ref to decimal degrees.
 */
function dmsToDecimal(dms: number | number[], ref: string): number {
  const arr = Array.isArray(dms) ? dms : [dms, 0, 0];
  const decimal = (arr[0] ?? 0) + (arr[1] ?? 0) / 60 + (arr[2] ?? 0) / 3600;
  return ref === 'S' || ref === 'W' ? -decimal : decimal;
}

/**
 * Normalize EXIF GPS from both iOS (flat keys) and Android (nested GPS object).
 */
function parseGPS(exif: Record<string, any>): { lat: number; lng: number } | null {
  // iOS / standard flat EXIF
  if (exif.GPSLatitude !== undefined && exif.GPSLongitude !== undefined) {
    const lat = dmsToDecimal(exif.GPSLatitude, exif.GPSLatitudeRef ?? 'N');
    const lng = dmsToDecimal(exif.GPSLongitude, exif.GPSLongitudeRef ?? 'E');
    if (lat !== 0 || lng !== 0) return { lat, lng };
  }

  // Android nested GPS object
  const gps = exif.GPS ?? exif['{GPS}'];
  if (gps) {
    const lat = dmsToDecimal(
      gps.Latitude ?? gps.GPSLatitude ?? 0,
      gps.LatitudeRef ?? gps.GPSLatitudeRef ?? 'N',
    );
    const lng = dmsToDecimal(
      gps.Longitude ?? gps.GPSLongitude ?? 0,
      gps.LongitudeRef ?? gps.GPSLongitudeRef ?? 'E',
    );
    if (lat !== 0 || lng !== 0) return { lat, lng };
  }

  return null;
}

/**
 * Parse EXIF datetime string ("YYYY:MM:DD HH:MM:SS") into "YYYY.MM.DD HH:mm" format.
 * Example output: "2026.06.12 18:30"
 */
function parseDateTime(exif: Record<string, any>): string {
  const raw =
    exif.DateTimeOriginal ??
    exif.DateTime ??
    exif.DateTimeDigitized ??
    exif.GPSDateStamp;

  const pad = (n: number) => String(n).padStart(2, '0');

  const fmt = (d: Date) =>
    `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

  if (!raw) return fmt(new Date());

  // EXIF uses colons as date separators: "YYYY:MM:DD HH:MM:SS"
  const iso = String(raw).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    // If parse fails, return today's timestamp so the pin still renders
    return fmt(new Date());
  }
  return fmt(date);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Hook for picking a photo from the library and extracting EXIF metadata.
 *
 * Usage:
 *   const { pickPhoto } = usePhotoMetadata();
 *   pickPhoto((meta) => { ... }, fallbackCenter);
 */
export function usePhotoMetadata() {
  const pickPhoto = async (
    onSuccess: (meta: PhotoMeta) => void,
    /** Fallback map center used when the photo has no GPS EXIF data */
    fallbackCenter?: { lat: number; lng: number },
  ) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '사진 라이브러리 접근 권한이 필요합니다.\n설정에서 권한을 허용해 주세요.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      exif: true,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const exif = asset.exif as Record<string, any> | undefined;

    const gps = exif ? parseGPS(exif) : null;
    const formattedTime = exif
      ? parseDateTime(exif)
      : new Date().toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });

    if (gps) {
      onSuccess({
        id: Date.now().toString(),
        uri: asset.uri,
        lat: gps.lat,
        lng: gps.lng,
        formattedTime,
      });
      return;
    }

    // No GPS data — prompt the user
    Alert.alert(
      '📍 위치 정보 없는 사진',
      '위치 정보가 없는 사진입니다. 직접 장소를 지정할까요?',
      [
        {
          text: '현재 지도 중심으로 등록',
          onPress: () => {
            const center = fallbackCenter ?? { lat: 37.5512, lng: 126.9882 };
            onSuccess({
              id: Date.now().toString(),
              uri: asset.uri,
              lat: center.lat,
              lng: center.lng,
              formattedTime,
            });
          },
        },
        { text: '취소', style: 'cancel' },
      ],
    );
  };

  return { pickPhoto };
}
