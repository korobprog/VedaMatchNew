/**
 * Карточка ссылки на запись радио в мессенджерах (VED-718).
 *
 * «Поделиться» ведёт на `/radio?track=…`, и превью обязано показывать саму
 * запись: название с исполнителем и её картинку. Раньше `<title>` оставался
 * общим «Радио VedaMatch» — мессенджер, читающий его (МАХ), показывал
 * название трека, — а у записи без обложки `og:image` не было вовсе, и
 * мессенджеры рисовали свою заглушку с логотипом сайта.
 *
 * Отсюда два правила, нарушать нельзя:
 *   — заголовок материала идёт и в `<title>`, и в `og:title`;
 *   — `openGraph.images` никогда не пуст: у записи без обложки — её
 *     собственная карточка `/radio/og-image` с названием. Пустой список
 *     перекрывал opengraph-image.png из корня (картинки VedaMatch быть не
 *     должно), но без картинки мессенджер берёт логотип сайта из своей
 *     заглушки — выходит то же самое.
 */
import type { Metadata } from "next";
import type { MusicTrackDto } from "@vedamatch/shared";

export const RADIO_TITLE = "Радио VedaMatch";
export const RADIO_DESCRIPTION =
  "Киртаны, бхаджаны и записи с программ круглые сутки — слушайте без регистрации и установите приложение VedaMatch.";
export const RADIO_OG_DESCRIPTION =
  "Киртаны, бхаджаны и записи с программ круглые сутки — слушайте без регистрации.";

/**
 * Версия раскладки карточки в её адресе. Мессенджеры кэшируют картинку по
 * адресу: после смены карточки старая могла бы жить в их кэше сутки (так
 * WhatsApp держал старый кадр у «Вдохновения», VED-357).
 */
export const OG_CARD_VERSION = "1";

/** «Название — Исполнитель»; без исполнителя — одно название. */
export function sharedTrackTitle(track: MusicTrackDto): string {
  const artist = track.artist?.name ?? track.artistCredit ?? null;
  return artist ? `${track.title} — ${artist}` : track.title;
}

/** Собственная карточка записи вместо обложки — `/radio/og-image`. */
export function sharedTrackCardPath(trackId: string): string {
  return `/radio/og-image?track=${encodeURIComponent(trackId)}&v=${OG_CARD_VERSION}`;
}

/**
 * Мета-теги страницы `/radio?track=…`. `track === null` — записи нет:
 * превью остаётся без картинки (`images: []` перекрывает карточку портала),
 * но и без логотипа VedaMatch.
 */
export function sharedTrackMetadata(
  track: MusicTrackDto | null,
): Metadata {
  const heading = track ? sharedTrackTitle(track) : RADIO_TITLE;
  const image = track
    ? track.coverUrl ?? sharedTrackCardPath(track.id)
    : null;
  return {
    // Корень — тоже с названием: часть мессенджеров показывает `<title>`, и
    // общий заголовок прятал песню.
    title: { absolute: heading },
    description: RADIO_DESCRIPTION,
    openGraph: {
      type: "website",
      siteName: "VedaMatch",
      title: heading,
      description: RADIO_OG_DESCRIPTION,
      images: image ? [{ url: image, alt: heading }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: heading,
      description: RADIO_OG_DESCRIPTION,
      images: image ? [image] : [],
    },
  };
}
