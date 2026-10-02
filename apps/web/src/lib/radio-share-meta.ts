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
 *   — `openGraph.images` никогда не пуст: превью — всегда собственная
 *     карточка записи `/radio/og-image` с названием (и с обложкой, когда она
 *     есть). Пустой список перекрывал opengraph-image.png из корня (картинки
 *     VedaMatch быть не должно), но без картинки мессенджер берёт логотип
 *     сайта из своей заглушки — выходит то же самое.
 *
 * Обложка записи в `og:image` напрямую не уходит: она лежит в хранилище за
 * подписью со сроком жизни, и мессенджер, пришедший за превью часами позже,
 * получал 403 и оставлял превью без картинки. Поэтому обложка вшивается в
 * карточку (`/radio/og-image`) — адрес свой, без подписи, и размеры кадра
 * известны заранее. Размеры (`width`/`height`/`type`) объявлять обязательно:
 * без них WhatsApp рисует маленький квадратный эскиз и обрезает кадр по
 * центру, срезая заголовок.
 */
import type { Metadata } from "next";
import type { MusicTrackDto } from "@vedamatch/shared";

export const RADIO_TITLE = "Радио VedaMatch";
export const RADIO_DESCRIPTION =
  "Киртаны, бхаджаны и записи с программ круглые сутки — слушайте без регистрации и установите приложение VedaMatch.";
export const RADIO_OG_DESCRIPTION =
  "Киртаны, бхаджаны и записи с программ круглые сутки — слушайте без регистрации.";

/**
 * Версия превью в адресах страницы и кадра. Мессенджеры кэшируют карточку
 * ссылки по адресу страницы, а картинку — по адресу картинки, и держат кэш
 * сутки: пока адреса не меняются, ни одна правка превью не видна в чате
 * (так WhatsApp держал старый кадр у «Вдохновения», VED-357), а Телеграм —
 * и вовсе помнит превью без картинки, если в момент первого запроса кадр не
 * отдался. Смена версии меняет оба адреса и заставляет краулера прийти заново.
 */
export const PREVIEW_VERSION = "3";

/** Размеры кадра `/radio/og-image` — ровно столько же, сколько в метатегах. */
export const OG_CARD_WIDTH = 1200;
export const OG_CARD_HEIGHT = 630;

/** «Название — Исполнитель»; без исполнителя — одно название. */
export function sharedTrackTitle(track: MusicTrackDto): string {
  const artist = track.artist?.name ?? track.artistCredit ?? null;
  return artist ? `${track.title} — ${artist}` : track.title;
}

/** Собственная карточка записи вместо подписной обложки — `/radio/og-image`. */
export function sharedTrackCardPath(trackId: string): string {
  return `/radio/og-image?track=${encodeURIComponent(trackId)}&v=${PREVIEW_VERSION}`;
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
  const image = track ? sharedTrackCardPath(track.id) : null;
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
      images: image
        ? [
            {
              url: image,
              type: "image/jpeg",
              width: OG_CARD_WIDTH,
              height: OG_CARD_HEIGHT,
              alt: heading,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: heading,
      description: RADIO_OG_DESCRIPTION,
      images: image ? [image] : [],
    },
  };
}
