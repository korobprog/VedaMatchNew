/**
 * Подсказка «ряд прокручивается» (VED-535): при заходе в Медиатеку ряд
 * «Каталог, Избранное, Плейлисты…» на телефоне сам уезжает влево до конца —
 * «на всю длину количества клавиш», а не на один пункт, — стоит там несколько
 * секунд и плавно возвращается. Не чаще раза в день: каждый заход — уже не
 * подсказка, а раздражение.
 */

export const RAIL_NUDGE_KEY = "vedamatch:music-rail-nudge";

/**
 * Сколько ряд стоит сдвинутым, прежде чем вернуться. Считается от начала
 * сдвига: ехать теперь не на один пункт, а до конца ряда, и сама дорога
 * занимает заметную часть этого времени.
 */
export const RAIL_NUDGE_HOLD_MS = 3000;

/**
 * На сколько сдвинуть ряд: на всю прокручиваемую длину, чтобы показать
 * последний пункт. Ноль — ехать некуда.
 */
export function railNudgeDistance(input: {
  scrollWidth: number;
  clientWidth: number;
}): number {
  return Math.max(0, Math.floor(input.scrollWidth - input.clientWidth));
}

/** Местная дата «ГГГГ-ММ-ДД»: день — по часам человека, а не по UTC. */
export function localDay(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Показывать ли подсказку: сегодня её ещё не было и ряду есть куда ехать. */
export function shouldNudgeRail(input: {
  lastDay: string | null;
  now: Date;
  scrollable: boolean;
  reducedMotion: boolean;
}): boolean {
  if (!input.scrollable || input.reducedMotion) return false;
  return input.lastDay !== localDay(input.now);
}
