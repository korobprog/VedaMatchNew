// Серверный клиент публичного «Радио VM». Отдельно от браузерного
// `music-radio-client.ts`: с сервера адрес API берётся из API_INTERNAL_URL, а
// не из NEXT_PUBLIC_API_URL (см. lib/api-base.ts), и cookie не нужны.
import type { MusicRadioSharedTrackDto } from "@vedamatch/shared";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** Пауза перед повтором запроса записи для превью. */
const RETRY_DELAY_MS = 200;

/**
 * Запись, которой поделились (VED-718): карточка ссылки в мессенджере
 * собирается на сервере в `generateMetadata`, до первого байта страницы, и
 * спрашивать эфир приходится здесь, без браузерного http-client. null —
 * записи нет или API не ответил: превью останется без картинки, но уже без
 * карточки портала.
 *
 * Ответ API — единственный источник названия для превью, и мессенджер
 * запоминает карточку первого ответа на сутки: один сбой на первом крауле —
 * и в чате сутки висит превью без трека и исполнителя (так МАХ в VED-718
 * показывал карточку портала). Поэтому транзиентный сбой (сеть, 5xx)
 * повторяем один раз; 404 — записи действительно нет, повтор не поможет.
 */
export async function getSharedRadioTrack(
  trackId: string,
): Promise<MusicRadioSharedTrackDto | null> {
  const url = `${API_URL}/music/radio/public/track/${encodeURIComponent(trackId)}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return (await res.json()) as MusicRadioSharedTrackDto;
      if (res.status < 500) return null;
    } catch {
      // Сеть не ответила — пробуем ещё раз.
    }
    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  return null;
}
