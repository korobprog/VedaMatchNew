import type { RashiIndex } from '@vedamatch/shared';
import type { EphemerisProvider } from '../ephemeris/ephemeris-provider';
import { jdeFromDate, lahiriAyanamsa, toSidereal } from '../vedic/ayanamsa';
import { nakshatraOf, rashiOf, wholeSignBhava } from '../vedic/rashi';

/**
 * Транзитные факты дня. Единственный сигнал, который реально меняется день ото
 * дня, — положение транзитной Луны: она проходит бхаву целиком примерно за 2.25
 * суток. Остальные восемь грах стоят в доме неделями и месяцами, и для
 * ежедневной рассылки не несут новой информации по сравнению со вчерашней.
 */
export interface TransitFacts {
  moonRashi: RashiIndex;
  moonNakshatra: number;
  /** Бхава транзитной Луны относительно НАТАЛЬНОЙ лагны, 1..12. */
  moonBhava: number;
}

export function computeTransitFacts(
  ephemeris: EphemerisProvider,
  at: Date,
  natalLagnaRashi: RashiIndex,
): TransitFacts {
  const ayanamsa = lahiriAyanamsa(jdeFromDate(at));
  const moon = ephemeris.positions(at).find((p) => p.body === 'moon')!;
  const siderealLongitude = toSidereal(moon.longitude, ayanamsa);
  const rashi = rashiOf(siderealLongitude);

  return {
    moonRashi: rashi,
    moonNakshatra: nakshatraOf(siderealLongitude),
    moonBhava: wholeSignBhava(rashi, natalLagnaRashi),
  };
}

/** Ключ общей на весь портал фразы: бхава — единственное, что в ней меняется. */
export function transitPatternKey(
  facts: Pick<TransitFacts, 'moonBhava'>,
): string {
  return `moon|bhava:${facts.moonBhava}`;
}
