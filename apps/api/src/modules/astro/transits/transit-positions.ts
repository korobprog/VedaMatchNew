import type { AstroTransitPositionsDto } from '@vedamatch/shared';
import type { EphemerisProvider } from '../ephemeris/ephemeris-provider';
import { jdeFromDate, lahiriAyanamsa, toSidereal } from '../vedic/ayanamsa';
import {
  degreeInRashi,
  nakshatraOf,
  navamsaRashiOf,
  rashiOf,
} from '../vedic/rashi';

/**
 * Положения всех девяти грах на произвольный момент — транзиты для карты.
 *
 * Та же цепочка, что у натальной карты (эфемериды → аянамша Лахири → деления),
 * только без лагны и домов: небо на момент одно для всех, а от какого знака
 * считать дома — от лагны, от Луны, в D1 или D9 — решает тот, кто рисует.
 * Поэтому ответ не персональный и не требует данных рождения.
 */
export function computeTransitPositions(
  ephemeris: EphemerisProvider,
  at: Date,
): AstroTransitPositionsDto {
  const ayanamsa = lahiriAyanamsa(jdeFromDate(at));
  const grahas = ephemeris.positions(at).map((position) => {
    const longitude = toSidereal(position.longitude, ayanamsa);
    return {
      graha: position.body,
      longitude,
      degreeInRashi: degreeInRashi(longitude),
      rashi: rashiOf(longitude),
      nakshatra: nakshatraOf(longitude),
      navamsaRashi: navamsaRashiOf(longitude),
      retrograde: position.speed < 0,
    };
  });
  return { at: at.toISOString(), ayanamsa, grahas };
}

/**
 * Границы, в которых принимается момент транзита. Эфемериды считают и шире,
 * но карта транзитов — про жизнь человека: век назад и век вперёд хватает с
 * запасом, а явная граница не даёт запросу уйти в даты, где аянамша и узлы
 * уже не проверялись.
 */
export const TRANSIT_MIN_AT = new Date('1900-01-01T00:00:00.000Z');
export const TRANSIT_MAX_AT = new Date('2100-12-31T23:59:59.999Z');

/**
 * Момент из query-параметра. Пусто — «сейчас». null — строка не дата или
 * вне границ; контроллер превращает это в 400, а не молча подставляет «сейчас»:
 * карта на чужую дату, выданная за запрошенную, хуже ошибки.
 */
export function parseTransitMoment(
  raw: string | undefined,
  now: Date,
): Date | null {
  if (raw === undefined || raw.trim() === '') return now;
  // Только ISO с датой: `new Date('5')` и прочие вольности разбора не нужны.
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw.trim())) return null;
  const at = new Date(raw.trim());
  if (Number.isNaN(at.getTime())) return null;
  if (at < TRANSIT_MIN_AT || at > TRANSIT_MAX_AT) return null;
  return at;
}
