import apparent from 'astronomia/apparent';
import base from 'astronomia/base';
import coord from 'astronomia/coord';
import deltat from 'astronomia/deltat';
import julian from 'astronomia/julian';
import nutation from 'astronomia/nutation';

/**
 * Аянамша Лахири (читрапакша) — угол между тропическим и сидерическим зодиаком.
 *
 * Считается по определению, давшему ей имя: «читра пакша» значит «со стороны Читры»,
 * то есть сидерический зодиак закреплён так, чтобы звезда Читра (Спика, α Девы)
 * стояла ровно на 180°. Отсюда аянамша = видимая тропическая долгота Спики − 180°.
 *
 * Астрометрия Спики взята из SIMBAD (ICRS, эпоха J2000) — это внешний источник,
 * а не зашитая на память константа. Собственное движение учитывается: за век Спика
 * смещается заметно больше, чем точность, которая нам нужна.
 *
 * ВАЖНО. Официальная константа Индийского комитета календарной реформы и это
 * определение расходятся примерно на 1′: комитет зафиксировал круглое значение на
 * эпоху, а не буквальное положение звезды. Полтора десятка угловых секунд разницы
 * не двигают ни знак (30°), ни накшатру (13°20′), ни паду (3°20′) — кроме случаев,
 * когда планета стоит в пределах минуты от границы. См. `AYANAMSA_CONVENTION_NOTE`.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const ARCSEC = RAD / 3600;

/** SIMBAD, идентификатор `* alf Vir`. ICRS, равноденствие и эпоха J2000. */
const SPICA = {
  raDeg: 201.2982473615632,
  decDeg: -11.161319485111932,
  /** μα·cosδ, миллисекунды дуги в год — так отдаёт SIMBAD. */
  pmRaMas: -42.35,
  pmDecMas: -30.67,
} as const;

export const AYANAMSA_CONVENTION_NOTE =
  'Читрапакша по определению «Спика на 180°». Расходится с официальной ' +
  'константой ICRC примерно на 1 угловую минуту; требует подтверждения по ' +
  'опубликованной таблице перед выходом из беты.';

/** UTC → Julian Ephemeris Day. */
export function jdeFromDate(at: Date): number {
  const jd = julian.DateToJD(at);
  return jd + deltat.deltaT(base.JDEToJulianYear(jd)) / 86400;
}

/** Видимая тропическая эклиптическая долгота Спики на дату, градусы. */
export function spicaLongitude(jde: number): number {
  const epochTo = base.JDEToJulianYear(jde);
  const from = new coord.Equatorial(SPICA.raDeg * RAD, SPICA.decDeg * RAD);

  // SIMBAD публикует μα·cosδ, а нужен собственно μα. Единицы — радианы в год
  // обычными числами: JSDoc astronomia обещает sexagesimal-объекты, но внутри
  // они складываются с радианами напрямую и дают NaN.
  const muRa = (SPICA.pmRaMas / Math.cos(SPICA.decDeg * RAD) / 1000) * ARCSEC;
  const muDec = (SPICA.pmDecMas / 1000) * ARCSEC;

  const to = apparent.position(from, 2000, epochTo, muRa, muDec);
  const trueObliquity = nutation.meanObliquity(jde) + nutation.nutation(jde)[1];
  const ecliptic = new coord.Equatorial(to.ra, to.dec).toEcliptic(
    trueObliquity,
  );
  return normalize360(ecliptic.lon * DEG);
}

/** Аянамша на момент времени, градусы. */
export function lahiriAyanamsa(jde: number): number {
  return normalize360(spicaLongitude(jde) - 180);
}

/** Тропическая долгота → сидерическая. */
export function toSidereal(
  tropicalLongitude: number,
  ayanamsa: number,
): number {
  return normalize360(tropicalLongitude - ayanamsa);
}

/**
 * Приведение угла к [0, 360).
 *
 * Короткое замыкание для уже корректных значений — не микрооптимизация, а
 * необходимость. Идиоматичное `((x % 360) + 360) % 360` для малого x прибавляет 360
 * и вычитает обратно, теряя младшие биты: 3.3333333333333335 превращается в число
 * чуть меньше себя. На границах делений круга этого хватает, чтобы floor сорвался
 * на единицу вниз и планета попала не в ту наваму. Реальные долготы почти всегда
 * уже лежат в диапазоне, так что ветка нормализации срабатывает редко.
 */
export function normalize360(degrees: number): number {
  if (degrees >= 0 && degrees < 360) return degrees;
  return ((degrees % 360) + 360) % 360;
}
