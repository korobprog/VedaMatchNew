/**
 * Подпись бренда на превью ссылки для мессенджеров (VED-201).
 *
 * Полоса снизу кадра: знак VedaMatch со словесной частью и строка «Скачано с
 * VedaMatch.ru». Картинку пересылают дальше отдельно от ссылки, и без этой
 * подписи по ней не понять, откуда она; ровно это и просили в карточке —
 * «нет подписи скачано в VedaMatch с логотипом».
 *
 * Лежит здесь картинкой в base64, а не файлом и не надписью, которую рисует
 * sharp, — по двум причинам сразу, и обе стоили бы пустой полосы на проде:
 *
 * 1. Шрифтов в образе нет. `apps/web/Dockerfile` собирает рантайм из
 *    `node:24-alpine`, где не стоит ни одного шрифта и нет fontconfig.
 *    Текст в SVG, отданный sharp, отрисовался бы пустотой — ровно так уже
 *    вели себя пропавшие шрифты у роликов (см. `story-brand.ts` в API,
 *    откуда взят и сам приём, и знак).
 * 2. Файл из `public/` пришлось бы искать по разным путям: в dev рабочий
 *    каталог — `apps/web`, в standalone-образе — `/app`. Промах виден
 *    только на готовом превью, которое собирается у бота в мессенджере.
 *
 * Исходник полосы — `apps/web/public/brand/logo-dark.png` (белый вариант для
 * тёмного фона) и та же строка, набранная Manrope. Отрисована один раз в
 * 2160x208 и пережата в палитру: 9,2 КБ. Ширина вдвое больше самого широкого
 * кадра превью (1080) — чтобы полоса не мылилась, когда её тянут на всю
 * ширину картинки.
 */
export const OG_FOOTER_PNG_BASE64 =
  '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' +
  'AAAASUVORK5CYII=';


/** Пропорции полосы: высота считается из ширины кадра. */
export const OG_FOOTER_ASPECT = 2160 / 208;

export function ogFooterBuffer(): Buffer {
  return Buffer.from(OG_FOOTER_PNG_BASE64, "base64");
}
