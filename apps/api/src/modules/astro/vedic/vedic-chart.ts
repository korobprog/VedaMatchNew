import { createHash } from 'node:crypto';
import type {
  AstroTimeAccuracy,
  GrahaId,
  GrahaPosition,
  VedicChart,
} from '@vedamatch/shared';
import type { EphemerisProvider } from '../ephemeris/ephemeris-provider';
import { jdeFromDate, lahiriAyanamsa, toSidereal } from './ayanamsa';
import { dashaState } from './dasha';
import {
  degreeInRashi,
  nakshatraOf,
  navamsaRashiOf,
  padaOf,
  rashiOf,
  wholeSignBhava,
} from './rashi';

/**
 * Сборка ведической карты: эфемериды дают тропическую астрономию, аянамша переводит
 * её в сидерический зодиак, дальше — деления и даши.
 *
 * Результат детерминирован: одинаковый вход даёт побайтово одинаковый выход, поэтому
 * карта кэшируется вечно по `fingerprint`.
 */

/**
 * Орбисы астангаты (сожжения) в градусах — расстояние до Солнца, ближе которого
 * граха считается сожжённой. Значения расходятся между школами; взяты
 * распространённые. Ретроградные Меркурий и Венера сгорают раньше.
 */
const COMBUSTION_ORBS: Partial<
  Record<GrahaId, { direct: number; retrograde: number }>
> = {
  moon: { direct: 12, retrograde: 12 },
  mars: { direct: 17, retrograde: 17 },
  mercury: { direct: 14, retrograde: 12 },
  jupiter: { direct: 11, retrograde: 11 },
  venus: { direct: 10, retrograde: 8 },
  saturn: { direct: 15, retrograde: 15 },
};

export interface BuildChartInput {
  bornAtUtc: Date;
  latitude: number;
  longitude: number;
  timeAccuracy: AstroTimeAccuracy;
  /** Момент, на который определяется текущая даша. */
  now?: Date;
}

export function buildVedicChart(
  ephemeris: EphemerisProvider,
  input: BuildChartInput,
): VedicChart {
  const { bornAtUtc, latitude, longitude, timeAccuracy } = input;
  const jde = jdeFromDate(bornAtUtc);
  const ayanamsa = lahiriAyanamsa(jde);

  const tropical = ephemeris.positions(bornAtUtc);
  const sidereal = new Map(
    tropical.map((position) => [
      position.body,
      toSidereal(position.longitude, ayanamsa),
    ]),
  );

  /**
   * Без времени рождения лагны нет. Карта считается на полдень, но выдавать
   * асцендент, вычисленный из выдуманного часа, нельзя: за сутки он обходит весь
   * круг, так что это была бы не приблизительная величина, а случайная.
   */
  const timeKnown = timeAccuracy !== 'unknown';
  const lagnaLongitude = timeKnown
    ? toSidereal(
        ephemeris.angles(bornAtUtc, latitude, longitude).ascendant,
        ayanamsa,
      )
    : null;
  const lagnaRashi = lagnaLongitude === null ? null : rashiOf(lagnaLongitude);

  const sunLongitude = sidereal.get('sun')!;

  const grahas: GrahaPosition[] = tropical.map((position) => {
    const longitude = sidereal.get(position.body)!;
    const rashi = rashiOf(longitude);
    return {
      graha: position.body,
      longitude,
      degreeInRashi: degreeInRashi(longitude),
      rashi,
      nakshatra: nakshatraOf(longitude),
      pada: padaOf(longitude),
      navamsaRashi: navamsaRashiOf(longitude),
      bhava: lagnaRashi === null ? null : wholeSignBhava(rashi, lagnaRashi),
      retrograde: position.speed < 0,
      combust: isCombust(
        position.body,
        longitude,
        sunLongitude,
        position.speed,
      ),
    };
  });

  const moonLongitude = sidereal.get('moon')!;

  return {
    bornAtUtc: bornAtUtc.toISOString(),
    timeAccuracy,
    ayanamsa,
    lagna:
      lagnaLongitude === null
        ? null
        : {
            longitude: lagnaLongitude,
            rashi: rashiOf(lagnaLongitude),
            nakshatra: nakshatraOf(lagnaLongitude),
            pada: padaOf(lagnaLongitude),
          },
    grahas,
    moonNakshatra: nakshatraOf(moonLongitude),
    // Даши отсчитываются от Луны, а Луна за сутки проходит больше накшатры:
    // без времени рождения периоды сдвинулись бы на годы.
    dasha: timeKnown
      ? dashaState(bornAtUtc, moonLongitude, input.now ?? new Date())
      : null,
    fingerprint: chartFingerprint(ephemeris.version, input),
    engineVersion: ephemeris.version,
  };
}

/** Угловое расстояние между долготами, градусы [0, 180]. */
function separation(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function isCombust(
  graha: GrahaId,
  longitude: number,
  sunLongitude: number,
  speed: number,
): boolean {
  const orb = COMBUSTION_ORBS[graha];
  if (!orb) return false; // Само Солнце, а также Раху и Кету, не сгорают.
  return (
    separation(longitude, sunLongitude) <
    (speed < 0 ? orb.retrograde : orb.direct)
  );
}

/**
 * Ключ вечного кэша. Версия движка входит обязательно: иначе после смены эфемерид
 * в кэше остались бы карты, посчитанные другой математикой, и отличить их было бы
 * невозможно. Точность времени тоже входит — от неё зависит наличие лагны.
 */
export function chartFingerprint(
  engineVersion: string,
  input: BuildChartInput,
): string {
  const parts = [
    engineVersion,
    input.bornAtUtc.toISOString(),
    input.latitude.toFixed(6),
    input.longitude.toFixed(6),
    input.timeAccuracy,
    'lahiri',
    'whole-sign',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}
