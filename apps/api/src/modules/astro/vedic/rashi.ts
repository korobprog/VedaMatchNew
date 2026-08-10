import type { NakshatraIndex, RashiIndex } from '@vedamatch/shared';

export { NAKSHATRA_NAMES, RASHI_NAMES } from '@vedamatch/shared';
import { normalize360 } from './ayanamsa';

/**
 * Деления сидерического круга. Всё здесь — арифметика по долготе, без астрономии:
 * астрономия закончилась в слое эфемерид, аянамша применена, дальше только счёт.
 */

export const RASHI_SIZE = 30;
/** 27 накшатр по 13°20′. */
export const NAKSHATRA_SIZE = 360 / 27;
/** Пада — четверть накшатры, 3°20′. */
export const PADA_SIZE = NAKSHATRA_SIZE / 4;
/** Навамша — девятая часть знака, 3°20′. Совпадает с падой не случайно. */
export const NAVAMSA_SIZE = RASHI_SIZE / 9;

/**
 * Номер деления при разбиении круга на `divisions` частей, считая от нуля.
 *
 * Умножение идёт ДО деления сознательно. Наивное `floor(lon / (360 / 27))`
 * округляется вниз на круглых границах: константа 360/27 не представима в двоичной
 * дробью, и, например, `10 / (30 / 9)` даёт 2.9999999999999996 вместо трёх. Границы
 * навамш приходятся ровно на 10° и 20° внутри знака, так что промах там не
 * умозрительный. При умножении сначала `10 * 108` даёт целое, и деление точное.
 */
function divisionIndex(siderealLongitude: number, divisions: number): number {
  return Math.floor((normalize360(siderealLongitude) * divisions) / 360);
}

/** Раши, 1..12. */
export function rashiOf(siderealLongitude: number): RashiIndex {
  return divisionIndex(siderealLongitude, 12) + 1;
}

/** Градусы внутри знака, [0, 30). */
export function degreeInRashi(siderealLongitude: number): number {
  return (
    normalize360(siderealLongitude) -
    (rashiOf(siderealLongitude) - 1) * RASHI_SIZE
  );
}

/** Накшатра, 1..27. */
export function nakshatraOf(siderealLongitude: number): NakshatraIndex {
  return divisionIndex(siderealLongitude, 27) + 1;
}

/** Пада, 1..4. Пад в круге 108 — столько же, сколько навамш, и это не совпадение. */
export function padaOf(siderealLongitude: number): number {
  return (divisionIndex(siderealLongitude, 108) % 4) + 1;
}

/** Доля пройденной накшатры, [0, 1). От неё считается баланс первой махадаши. */
export function nakshatraFraction(siderealLongitude: number): number {
  const exact = (normalize360(siderealLongitude) * 27) / 360;
  return exact - Math.floor(exact);
}

/**
 * Знак в варге D9 (навамша).
 *
 * Обычно правило излагают через стихию: огненные знаки начинают навамшу с Меши,
 * земные с Макары, воздушные с Тулы, водные с Карки. Прямой счёт навамш по всему
 * кругу даёт ровно тот же результат: 108 навамш по 3°20′, а 108 кратно 12, поэтому
 * начало каждого знака попадает точно туда, куда предписывает правило стихий.
 */
export function navamsaRashiOf(siderealLongitude: number): RashiIndex {
  return (divisionIndex(siderealLongitude, 108) % 12) + 1;
}

/** Бхава по целым знакам: дом планеты считается от знака лагны, 1..12. */
export function wholeSignBhava(
  planetRashi: RashiIndex,
  lagnaRashi: RashiIndex,
): number {
  return ((planetRashi - lagnaRashi + 12) % 12) + 1;
}
