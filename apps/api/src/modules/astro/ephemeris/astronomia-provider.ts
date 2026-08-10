import base from 'astronomia/base';
import coord from 'astronomia/coord';
import deltat from 'astronomia/deltat';
import elliptic from 'astronomia/elliptic';
import julian from 'astronomia/julian';
import moonposition from 'astronomia/moonposition';
import nutation from 'astronomia/nutation';
import planetposition, { Planet } from 'astronomia/planetposition';
import sidereal from 'astronomia/sidereal';
import solar from 'astronomia/solar';
import earthSeries from 'astronomia/data/vsop87Dearth';
import jupiterSeries from 'astronomia/data/vsop87Djupiter';
import marsSeries from 'astronomia/data/vsop87Dmars';
import mercurySeries from 'astronomia/data/vsop87Dmercury';
import saturnSeries from 'astronomia/data/vsop87Dsaturn';
import venusSeries from 'astronomia/data/vsop87Dvenus';

import type {
  BodyPosition,
  ChartAngles,
  EphemerisProvider,
  GrahaId,
} from './ephemeris-provider';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const norm360 = (deg: number) => ((deg % 360) + 360) % 360;

/** Кратчайшая разность двух долгот, градусы в (-180, 180]. */
export const angularDelta = (a: number, b: number) =>
  ((a - b + 540) % 360) - 180;

/**
 * Серии VSOP87 типа D уже отнесены к эклиптике и равноденствию даты — именно то,
 * что нужно астрологии, без отдельного шага прецессии.
 */
const PLANET_SERIES = {
  mercury: mercurySeries,
  venus: venusSeries,
  mars: marsSeries,
  jupiter: jupiterSeries,
  saturn: saturnSeries,
} as const;

type PlanetId = keyof typeof PLANET_SERIES;

/** Шаг численного дифференцирования для скорости: полчаса в долях суток. */
const SPEED_STEP_DAYS = 0.5 / 24;

export class AstronomiaEphemerisProvider implements EphemerisProvider {
  readonly version = 'astronomia@4.2.0+vsop87d+elpMppDe';

  private readonly earth = new planetposition.Planet(earthSeries);
  private readonly planets = new Map<PlanetId, Planet>(
    (Object.keys(PLANET_SERIES) as PlanetId[]).map((id) => [
      id,
      new planetposition.Planet(PLANET_SERIES[id]),
    ]),
  );

  positions(at: Date): BodyPosition[] {
    const jde = this.jde(at);
    const before = this.longitudesAt(jde - SPEED_STEP_DAYS);
    const now = this.longitudesAt(jde);
    const after = this.longitudesAt(jde + SPEED_STEP_DAYS);

    return (Object.keys(now) as GrahaId[]).map((body) => ({
      body,
      longitude: now[body].longitude,
      latitude: now[body].latitude,
      // Центральная разность вместо односторонней: скорость нужна только для знака
      // ретроградности, но у стационарных планет односторонняя разность врёт знаком.
      speed:
        angularDelta(after[body].longitude, before[body].longitude) /
        (2 * SPEED_STEP_DAYS),
    }));
  }

  angles(at: Date, latitude: number, longitude: number): ChartAngles {
    const jd = julian.DateToJD(at);
    const jde = this.jde(at);
    const obliquity = this.trueObliquity(jde);
    // sidereal.apparent — секунды времени по Гринвичу; восточная долгота прибавляется.
    const lst = norm360((sidereal.apparent(jd) / 86400) * 360 + longitude);

    const r = lst * RAD;
    const e = obliquity * RAD;
    const p = latitude * RAD;

    const ascendant = norm360(
      Math.atan2(
        Math.cos(r),
        -(Math.sin(r) * Math.cos(e) + Math.tan(p) * Math.sin(e)),
      ) * DEG,
    );
    const midheaven = norm360(
      Math.atan2(Math.sin(r), Math.cos(r) * Math.cos(e)) * DEG,
    );

    return { ascendant, midheaven, obliquity, localSiderealTime: lst };
  }

  /** UTC → Julian Ephemeris Day. Без ΔT позиции Луны уезжают на десятки секунд дуги. */
  private jde(at: Date): number {
    const jd = julian.DateToJD(at);
    return jd + deltat.deltaT(base.JDEToJulianYear(jd)) / 86400;
  }

  private trueObliquity(jde: number): number {
    return (nutation.meanObliquity(jde) + nutation.nutation(jde)[1]) * DEG;
  }

  private longitudesAt(
    jde: number,
  ): Record<GrahaId, { longitude: number; latitude: number }> {
    const sun = solar.apparentVSOP87(this.earth, jde);
    const moon = moonposition.position(jde);
    // ELP выдаёт геометрические координаты среднего равноденствия даты: нутацию
    // по долготе добавляем сами. У планет ниже она уже учтена в elliptic.position.
    const [deltaPsi] = nutation.nutation(jde);

    const result = {
      sun: { longitude: norm360(sun.lon * DEG), latitude: sun.lat * DEG },
      moon: {
        longitude: norm360((moon.lon + deltaPsi) * DEG),
        latitude: moon.lat * DEG,
      },
    } as Record<GrahaId, { longitude: number; latitude: number }>;

    for (const [id, planet] of this.planets) {
      const { ra, dec } = elliptic.position(planet, this.earth, jde);
      const ecliptic = this.apparentEcliptic(ra, dec, jde);
      result[id] = ecliptic;
    }

    // Средний восходящий узел; Кету всегда напротив.
    const rahu = norm360(moonposition.node(jde) * DEG);
    result.rahu = { longitude: rahu, latitude: 0 };
    result.ketu = { longitude: norm360(rahu + 180), latitude: 0 };

    return result;
  }

  /**
   * elliptic.position возвращает ВИДИМЫЕ экваториальные координаты — нутация в них
   * уже заложена. Пересчёт с истинным наклоном сразу даёт видимую эклиптическую
   * долготу; добавлять Δψ здесь означало бы учесть нутацию дважды (±17″ с периодом
   * 18.6 года — ошибка, которую легко не заметить на одной тестовой дате).
   */
  private apparentEcliptic(ra: number, dec: number, jde: number) {
    const ecliptic = new coord.Equatorial(ra, dec).toEcliptic(
      this.trueObliquity(jde) * RAD,
    );
    return {
      longitude: norm360(ecliptic.lon * DEG),
      latitude: ecliptic.lat * DEG,
    };
  }
}
