// Серверный клиент публичного «Радио VM». Отдельно от браузерного
// `music-radio-client.ts`: с сервера адрес API берётся из API_INTERNAL_URL, а
// не из NEXT_PUBLIC_API_URL (см. lib/api-base.ts), и cookie не нужны.
import type { MusicRadioSharedTrackDto } from "@vedamatch/shared";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/**
 * Запись, которой поделились (VED-718): карточка ссылки в мессенджере
 * собирается на сервере в `generateMetadata`, до первого байта страницы, и
 * спрашивать эфир приходится здесь, без браузерного http-client. null —
 * записи нет или API не ответил: превью останется без картинки, но уже без
 * карточки портала.
 */
export async function getSharedRadioTrack(
  trackId: string,
): Promise<MusicRadioSharedTrackDto | null> {
  try {
    const res = await fetch(
      `${API_URL}/music/radio/public/track/${encodeURIComponent(trackId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as MusicRadioSharedTrackDto;
  } catch {
    return null;
  }
}
