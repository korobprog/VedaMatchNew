/**
 * «Поднять плеер» (VED-194). Полоса плеера лежит `fixed` у нижнего края и
 * закрывает собственный нижний ряд полноэкранных разделов — кнопки ленты
 * «Вдохновения» в первую очередь: эта страница занимает ровно `100dvh` и
 * отступ `body` под полосу ей не помогает. Кнопка на самой полосе поднимает
 * её над таким рядом; выбор помним на устройстве, как и свёрнутость.
 *
 * Высота подъёма — в globals.css (`--vm-player-lift`), рядом с остальными
 * размерами полосы: её замеряют в браузере вместе с ними.
 */

export const LIFTED_KEY = "vedamatch:music-player-lifted";

/** Разбор сохранённого значения: поднята только при явной «1». */
export function parseLifted(raw: string | null | undefined): boolean {
  return raw === "1";
}

export function serializeLifted(lifted: boolean): string {
  return lifted ? "1" : "0";
}

/** Имя кнопки говорит, что она сделает, а `aria-pressed` — в каком она сейчас. */
export function liftButtonLabel(lifted: boolean): string {
  return lifted ? "Опустить плеер к краю экрана" : "Поднять плеер над нижними кнопками";
}
