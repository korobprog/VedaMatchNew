import type { DashaPeriod, DashaState, GrahaId } from '@vedamatch/shared';
import { nakshatraFraction, nakshatraOf } from './rashi';

/**
 * Вимшоттари-даша — периоды планет, отсчитываемые от положения Луны при рождении.
 *
 * Цикл ровно 120 лет, поделённых между девятью грахами в фиксированном порядке.
 * Накшатра Луны задаёт, чей период идёт первым, а доля уже пройденной накшатры —
 * сколько от него осталось: человек рождается в середине чьего-то периода, а не в
 * его начале.
 */

/** Порядок и длительности в годах. Сумма — 120, это и есть «вимшоттари». */
const DASHA_SEQUENCE: Array<[GrahaId, number]> = [
  ['ketu', 7],
  ['venus', 20],
  ['sun', 6],
  ['moon', 10],
  ['mars', 7],
  ['rahu', 18],
  ['jupiter', 16],
  ['saturn', 19],
  ['mercury', 17],
];

export const VIMSHOTTARI_TOTAL_YEARS = DASHA_SEQUENCE.reduce(
  (sum, [, years]) => sum + years,
  0,
);

/**
 * Юлианский год. Традиция знает и савана-год в 360 суток; выбор смещает границы
 * периодов на несколько дней за десятилетия, поэтому константа названа явно, а не
 * растворена в коде.
 */
export const DASHA_YEAR_DAYS = 365.25;
const DAY_MS = 24 * 60 * 60 * 1000;

const yearsToMs = (years: number) => years * DASHA_YEAR_DAYS * DAY_MS;

/** Владыка накшатры: Ашвини — Кету, дальше по кругу из девяти. */
export function nakshatraLord(nakshatra: number): GrahaId {
  return DASHA_SEQUENCE[(nakshatra - 1) % 9][0];
}

function sequenceFrom(lord: GrahaId): Array<[GrahaId, number]> {
  const start = DASHA_SEQUENCE.findIndex(([graha]) => graha === lord);
  return [...DASHA_SEQUENCE.slice(start), ...DASHA_SEQUENCE.slice(0, start)];
}

/**
 * Махадаши на весь цикл от рождения.
 *
 * Первый период урезан: к моменту рождения он уже частично прошёл. Остаток равен
 * непройденной доле накшатры Луны, умноженной на полную длительность периода.
 */
export function mahadashas(
  bornAt: Date,
  moonSiderealLongitude: number,
): DashaPeriod[] {
  const nakshatra = nakshatraOf(moonSiderealLongitude);
  const sequence = sequenceFrom(nakshatraLord(nakshatra));
  const elapsedFraction = nakshatraFraction(moonSiderealLongitude);

  const periods: DashaPeriod[] = [];
  let cursor = bornAt.getTime();

  sequence.forEach(([lord, years], index) => {
    const duration =
      index === 0 ? yearsToMs(years) * (1 - elapsedFraction) : yearsToMs(years);
    const endsAt = cursor + duration;
    periods.push({
      lord,
      startsAt: new Date(cursor).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
    });
    cursor = endsAt;
  });

  return periods;
}

/**
 * Антардаши внутри махадаши. Порядок тот же и начинается с владыки самой махадаши;
 * длительность каждой пропорциональна её доле в 120-летнем круге.
 */
export function antardashas(mahadasha: DashaPeriod): DashaPeriod[] {
  const start = new Date(mahadasha.startsAt).getTime();
  const end = new Date(mahadasha.endsAt).getTime();
  const fullMahadashaYears = DASHA_SEQUENCE.find(
    ([graha]) => graha === mahadasha.lord,
  )![1];

  // Первая махадаша урезана балансом рождения; её антардаши сжимаются в той же
  // пропорции, иначе они выйдут за конец периода.
  const scale = (end - start) / yearsToMs(fullMahadashaYears);

  const periods: DashaPeriod[] = [];
  const sequence = sequenceFrom(mahadasha.lord);
  let cursor = start;

  sequence.forEach(([lord, years], index) => {
    const duration =
      yearsToMs((fullMahadashaYears * years) / VIMSHOTTARI_TOTAL_YEARS) * scale;
    // Последний подпериод закрывается точно концом махадаши: накопленная за
    // девять сложений ошибка иначе оставляет миллисекундную щель.
    const endsAt =
      index === sequence.length - 1 ? end : Math.min(cursor + duration, end);
    periods.push({
      lord,
      startsAt: new Date(cursor).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
    });
    cursor = endsAt;
  });

  return periods;
}

/**
 * Полное состояние даш на момент `now`. Урезанная первая махадаша означает, что
 * подпериоды у неё начинаются не с начала: человек застаёт их в середине.
 */
export function dashaState(
  bornAt: Date,
  moonSiderealLongitude: number,
  now: Date,
): DashaState | null {
  const periods = mahadashas(bornAt, moonSiderealLongitude);
  const time = now.getTime();

  const currentMahadasha = periods.find(
    (period) => new Date(period.endsAt).getTime() > time,
  );
  // Цикл покрывает 120 лет от рождения; за его пределами периодов уже нет.
  if (!currentMahadasha) return null;

  const subPeriods = antardashas(currentMahadasha);
  const currentAntardasha =
    subPeriods.find((period) => new Date(period.endsAt).getTime() > time) ??
    subPeriods[subPeriods.length - 1];

  return {
    mahadashas: periods,
    antardashas: subPeriods,
    currentMahadasha,
    currentAntardasha,
  };
}
