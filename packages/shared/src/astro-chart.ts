import type { AstroTimeAccuracy } from './astro';

/** Девять грах джйотиша. Раху и Кету — лунные узлы, не тела. */
export type GrahaId =
  | 'sun'
  | 'moon'
  | 'mercury'
  | 'venus'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'rahu'
  | 'ketu';

/** Раши — знак сидерического зодиака, 1..12 от Меши. */
export type RashiIndex = number;

/** Накшатра, 1..27 от Ашвини. */
export type NakshatraIndex = number;

/**
 * Названия живут в shared, а не в сервисе: их читают и расчёт, и интерфейс.
 * Двадцать семь накшатр, продублированных в двух местах, разойдутся при первой же
 * правке. Индексация — от нуля, то есть `RASHI_NAMES[rashi - 1]`.
 */
export const RASHI_NAMES = Object.freeze([
  'Меша',
  'Вришабха',
  'Митхуна',
  'Карка',
  'Симха',
  'Канья',
  'Тула',
  'Вришчика',
  'Дхану',
  'Макара',
  'Кумбха',
  'Мина',
]);

export const NAKSHATRA_NAMES = Object.freeze([
  'Ашвини',
  'Бхарани',
  'Криттика',
  'Рохини',
  'Мригашира',
  'Ардра',
  'Пунарвасу',
  'Пушья',
  'Ашлеша',
  'Магха',
  'Пурва Пхалгуни',
  'Уттара Пхалгуни',
  'Хаста',
  'Читра',
  'Свати',
  'Вишакха',
  'Анурадха',
  'Джьештха',
  'Мула',
  'Пурва Ашадха',
  'Уттара Ашадха',
  'Шравана',
  'Дхаништха',
  'Шатабхиша',
  'Пурва Бхадрапада',
  'Уттара Бхадрапада',
  'Ревати',
]);

export const GRAHA_NAMES: Readonly<Record<GrahaId, string>> = Object.freeze({
  sun: 'Сурья',
  moon: 'Чандра',
  mercury: 'Будха',
  venus: 'Шукра',
  mars: 'Мангала',
  jupiter: 'Гуру',
  saturn: 'Шани',
  rahu: 'Раху',
  ketu: 'Кету',
});

/** Краткие обозначения для тесных ячеек карты. */
export const GRAHA_ABBR: Readonly<Record<GrahaId, string>> = Object.freeze({
  sun: 'Су',
  moon: 'Ча',
  mercury: 'Бу',
  venus: 'Шу',
  mars: 'Ма',
  jupiter: 'Гу',
  saturn: 'Ша',
  rahu: 'Ра',
  ketu: 'Ке',
});

export interface GrahaPosition {
  graha: GrahaId;
  /** Сидерическая долгота, градусы [0, 360). */
  longitude: number;
  /** Градусы внутри знака, [0, 30). */
  degreeInRashi: number;
  rashi: RashiIndex;
  nakshatra: NakshatraIndex;
  /** Пада — четверть накшатры, 1..4. */
  pada: number;
  /** Знак в варге D9. Отсутствует у Раху и Кету не бывает — считается для всех. */
  navamsaRashi: RashiIndex;
  /** Бхава от лагны, 1..12. null, когда время рождения неизвестно. */
  bhava: number | null;
  retrograde: boolean;
  /** Астангата — сожжение близостью к Солнцу. */
  combust: boolean;
}

export interface DashaPeriod {
  lord: GrahaId;
  startsAt: string;
  endsAt: string;
}

export interface DashaState {
  /** Махадаши на 120 лет от рождения. */
  mahadashas: DashaPeriod[];
  /** Антардаши внутри текущей махадаши. */
  antardashas: DashaPeriod[];
  currentMahadasha: DashaPeriod;
  currentAntardasha: DashaPeriod;
}

export interface VedicChart {
  /** Момент, на который построена карта. */
  bornAtUtc: string;
  timeAccuracy: AstroTimeAccuracy;
  ayanamsa: number;
  /** Лагна. null, когда время или место рождения неизвестны. */
  lagna: {
    longitude: number;
    rashi: RashiIndex;
    nakshatra: NakshatraIndex;
    pada: number;
  } | null;
  grahas: GrahaPosition[];
  /** Накшатра Луны — от неё отсчитываются даши. */
  moonNakshatra: NakshatraIndex;
  /** null, когда время неизвестно: даши от Луны на полдень посчитать нельзя. */
  dasha: DashaState | null;
  /** Отпечаток входных данных и версии движка; ключ вечного кэша. */
  fingerprint: string;
  engineVersion: string;
}
