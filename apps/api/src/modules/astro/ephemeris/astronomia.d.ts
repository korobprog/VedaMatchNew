// astronomia ships no type declarations. Declared here narrowly — only the surface
// the ephemeris provider actually uses, so a breaking upstream change fails to compile
// instead of silently returning `any`.

declare module 'astronomia/base' {
  const base: {
    JDEToJulianYear(jde: number): number;
    pmod(x: number, y: number): number;
  };
  export default base;
}

declare module 'astronomia/julian' {
  const julian: { DateToJD(date: Date): number };
  export default julian;
}

declare module 'astronomia/deltat' {
  const deltat: { deltaT(decimalYear: number): number };
  export default deltat;
}

declare module 'astronomia/nutation' {
  const nutation: {
    /** @returns [Δψ, Δε] in radians. */
    nutation(jde: number): [number, number];
    meanObliquity(jde: number): number;
  };
  export default nutation;
}

declare module 'astronomia/sidereal' {
  const sidereal: {
    /** Apparent sidereal time at Greenwich, in seconds of time. */
    apparent(jd: number): number;
  };
  export default sidereal;
}

declare module 'astronomia/planetposition' {
  export class Planet {
    constructor(series: unknown);
    position(jde: number): { lon: number; lat: number; range: number };
  }
  const planetposition: { Planet: typeof Planet };
  export default planetposition;
}

declare module 'astronomia/solar' {
  const solar: {
    apparentVSOP87(
      earth: unknown,
      jde: number,
    ): { lon: number; lat: number; range: number };
  };
  export default solar;
}

declare module 'astronomia/moonposition' {
  const moonposition: {
    position(jde: number): { lon: number; lat: number; range: number };
    /** Mean ascending node of the lunar orbit, radians. */
    node(jde: number): number;
  };
  export default moonposition;
}

declare module 'astronomia/elliptic' {
  const elliptic: {
    /** Apparent geocentric equatorial position, radians. */
    position(
      planet: unknown,
      earth: unknown,
      jde: number,
    ): { ra: number; dec: number };
  };
  export default elliptic;
}

declare module 'astronomia/apparent' {
  const apparent: {
    /**
     * Видимое место звезды: прецессия с собственным движением, нутация, аберрация.
     * Собственные движения — РАДИАНЫ в год обычными числами, вопреки JSDoc пакета,
     * который обещает sexagesimal-объекты: внутри они складываются с радианами
     * напрямую, и объект даёт NaN.
     */
    position(
      eqFrom: { ra: number; dec: number },
      epochFrom: number,
      epochTo: number,
      properMotionRa: number,
      properMotionDec: number,
    ): { ra: number; dec: number };
  };
  export default apparent;
}

declare module 'astronomia/coord' {
  export class Equatorial {
    constructor(ra: number, dec: number);
    ra: number;
    dec: number;
    toEcliptic(obliquity: number): { lon: number; lat: number };
  }
  const coord: { Equatorial: typeof Equatorial };
  export default coord;
}

declare module 'astronomia/data/vsop87Dearth' {
  const series: unknown;
  export default series;
}
declare module 'astronomia/data/vsop87Dmercury' {
  const series: unknown;
  export default series;
}
declare module 'astronomia/data/vsop87Dvenus' {
  const series: unknown;
  export default series;
}
declare module 'astronomia/data/vsop87Dmars' {
  const series: unknown;
  export default series;
}
declare module 'astronomia/data/vsop87Djupiter' {
  const series: unknown;
  export default series;
}
declare module 'astronomia/data/vsop87Dsaturn' {
  const series: unknown;
  export default series;
}
