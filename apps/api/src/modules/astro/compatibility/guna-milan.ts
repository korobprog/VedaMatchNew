import {
  GUNA_MILAN_KOOTA_MAX,
  GUNA_MILAN_KOOTA_TITLES,
  GUNA_MILAN_MAX_TOTAL,
  PURPOSE_KOOTAS,
  gunaMilanMaxFor,
} from '@vedamatch/shared';
import type {
  AstroCompatibilityPurpose,
  Gender,
  GunaMilanKoota,
  GunaMilanKootaKey,
  GunaMilanScore,
  NakshatraIndex,
  RashiIndex,
} from '@vedamatch/shared';
import {
  areYoniEnemies,
  friendshipOf,
  ganaOf,
  nadiOf,
  RASHI_LORD,
  temperamentOf,
  vashyaGroupOf,
  yoniOf,
  type Friendship,
  type Gana,
} from './guna-milan-tables';

/**
 * Гуна-милан (аштакута) — восемь традиционных критериев совместимости по Луне,
 * максимум 36 очков. Расчёт целиком по уже построенным картам: только знак и
 * накшатра Луны каждого человека, никакой новой астрономии.
 */

export interface MoonPlacement {
  rashi: RashiIndex;
  nakshatra: NakshatraIndex;
  /** Пол человека, не животного йони — влияет только на гана-куту (см. ниже). */
  gender: Gender | null;
}

/**
 * Веса, набор кут по целям и названия живут в общем пакете: по ним же
 * витрина на лендинге показывает, чем расчёт для дела короче сватовского.
 */
const KOOTA_TITLES = GUNA_MILAN_KOOTA_TITLES;

/** Максимум очков для цели: сумма весов её кут. */
export const maxPointsFor = gunaMilanMaxFor;

// Переэкспорт для соседей модуля и тестов: таблицы общие, но обращаться к
// ним из астрологии естественнее через её же файл расчёта.
export { GUNA_MILAN_KOOTA_MAX, GUNA_MILAN_MAX_TOTAL, PURPOSE_KOOTAS };

/**
 * Считает все восемь кут и складывает те, что относятся к цели. Неучтённые
 * остаются в ответе с `counted: false`: человеку видно и что посчитали, и
 * что для этой цели считать не стали.
 */
export function computeGunaMilan(
  a: MoonPlacement,
  b: MoonPlacement,
  purpose: AstroCompatibilityPurpose = 'family',
): GunaMilanScore {
  const counted = new Set(PURPOSE_KOOTAS[purpose]);
  const kootas: GunaMilanKoota[] = [
    scoreTemperament(a, b),
    scoreVashya(a, b),
    scoreTara(a, b),
    scoreYoni(a, b),
    scoreGrahaMaitri(a, b),
    scoreGana(a, b),
    scoreBhakoot(a, b),
    scoreNadi(a, b),
  ].map((row) => ({ ...row, counted: counted.has(row.key) }));

  const totalPoints = kootas
    .filter((row) => row.counted)
    .reduce((sum, row) => sum + row.points, 0);
  const maxPoints = maxPointsFor(purpose);

  return {
    purpose,
    kootas,
    totalPoints,
    maxPoints,
    percent: maxPoints === 0 ? 0 : Math.round((totalPoints / maxPoints) * 100),
  };
}

/**
 * Кута до того, как стало известно, идёт ли она в итог: `counted` проставляет
 * computeGunaMilan, когда узнает цель. Сами счётчики про цель не знают —
 * астрономия от неё не зависит.
 */
type Koota = Omit<GunaMilanKoota, 'counted'>;

function koota(key: GunaMilanKootaKey, points: number, note: string): Koota {
  return {
    key,
    title: KOOTA_TITLES[key],
    points,
    maxPoints: GUNA_MILAN_KOOTA_MAX[key],
    note,
  };
}

/** Переосмысленная варна: та же группа стихии — 1 очко, разная — 0. Без иерархии. */
function scoreTemperament(a: MoonPlacement, b: MoonPlacement): Koota {
  const same = temperamentOf(a.rashi) === temperamentOf(b.rashi);
  return koota(
    'temperament',
    same ? 1 : 0,
    same ? 'Один тип темперамента по Луне' : 'Разные типы темперамента по Луне',
  );
}

/** Совпадение природной группы знака: 2 очка при совпадении, иначе 0. */
function scoreVashya(a: MoonPlacement, b: MoonPlacement): Koota {
  const same = vashyaGroupOf(a.rashi) === vashyaGroupOf(b.rashi);
  return koota(
    'vashya',
    same ? 2 : 0,
    same
      ? 'Естественное взаимное притяжение'
      : 'Взаимное притяжение слабее выражено',
  );
}

// Благоприятные позиции: Sampat(2), Kshema(4), Sadhaka(6), Mitra(8), Parama Mitra(9).
// Остальные — Janma(1), Vipat(3), Pratyak(5), Vadha(7) — неблагоприятны по умолчанию.
const GOOD_TARA = new Set([2, 4, 6, 8, 9]);

/** Позиция накшатры B, если считать от накшатры A, 1..9 (три полных цикла по 9). */
function taraPosition(fromNakshatra: number, toNakshatra: number): number {
  const countedInclusive = ((toNakshatra - fromNakshatra + 27) % 27) + 1;
  return ((countedInclusive - 1) % 9) + 1;
}

/** Считается в обе стороны и суммируется: направление имеет значение. */
function scoreTara(a: MoonPlacement, b: MoonPlacement): Koota {
  const forward = taraPosition(a.nakshatra, b.nakshatra);
  const backward = taraPosition(b.nakshatra, a.nakshatra);
  const scoreOf = (position: number) => (GOOD_TARA.has(position) ? 1.5 : 0);
  const points = scoreOf(forward) + scoreOf(backward);

  return koota(
    'tara',
    points,
    points === 3
      ? 'Благоприятная звёздная совместимость в обе стороны'
      : points === 0
        ? 'Звёздная совместимость слабая в обе стороны'
        : 'Звёздная совместимость благоприятна лишь с одной стороны',
  );
}

function scoreYoni(a: MoonPlacement, b: MoonPlacement): Koota {
  const yoniA = yoniOf(a.nakshatra);
  const yoniB = yoniOf(b.nakshatra);

  if (yoniA.animal === yoniB.animal) {
    const sameGender = yoniA.isMale === yoniB.isMale;
    return koota(
      'yoni',
      sameGender ? 4 : 3,
      'Природная близость высокая: общий животный символ накшатры',
    );
  }
  if (areYoniEnemies(yoniA.animal, yoniB.animal)) {
    return koota(
      'yoni',
      0,
      'Природные символы накшатр традиционно считаются враждебными',
    );
  }
  return koota('yoni', 2, 'Природная близость нейтральная');
}

const FRIENDSHIP_SCORE: Record<string, number> = {
  'friend:friend': 5,
  'friend:neutral': 4,
  'neutral:friend': 4,
  'neutral:neutral': 3,
  'friend:enemy': 2,
  'enemy:friend': 2,
  'neutral:enemy': 1,
  'enemy:neutral': 1,
  'enemy:enemy': 0,
};

function combineFriendship(x: Friendship, y: Friendship): number {
  return FRIENDSHIP_SCORE[`${x}:${y}`];
}

function scoreGrahaMaitri(a: MoonPlacement, b: MoonPlacement): Koota {
  const lordA = RASHI_LORD[a.rashi - 1];
  const lordB = RASHI_LORD[b.rashi - 1];
  if (lordA === lordB) {
    return koota('grahaMaitri', 5, 'Один и тот же владыка знака у обоих');
  }

  const points = combineFriendship(
    friendshipOf(lordA, lordB),
    friendshipOf(lordB, lordA),
  );
  return koota(
    'grahaMaitri',
    points,
    points >= 4
      ? 'Владыки знаков дружественны друг другу'
      : points >= 2
        ? 'Владыки знаков нейтральны друг к другу'
        : 'Владыки знаков традиционно недружественны',
  );
}

/** Строки — «мужская», столбцы — «женская» гана; направление задаёт пол людей. */
const GANA_ASYMMETRIC: Record<Gana, Record<Gana, number>> = {
  deva: { deva: 6, manushya: 5, rakshasa: 1 },
  manushya: { deva: 6, manushya: 6, rakshasa: 0 },
  rakshasa: { deva: 0, manushya: 0, rakshasa: 6 },
};

/** Без известного пола — по более благоприятному из двух направлений таблицы. */
function ganaSymmetric(x: Gana, y: Gana): number {
  return Math.max(GANA_ASYMMETRIC[x][y], GANA_ASYMMETRIC[y][x]);
}

function scoreGana(a: MoonPlacement, b: MoonPlacement): Koota {
  const ganaA = ganaOf(a.nakshatra);
  const ganaB = ganaOf(b.nakshatra);

  let points: number;
  if (a.gender === 'male' && b.gender === 'female') {
    points = GANA_ASYMMETRIC[ganaA][ganaB];
  } else if (a.gender === 'female' && b.gender === 'male') {
    points = GANA_ASYMMETRIC[ganaB][ganaA];
  } else {
    points = ganaSymmetric(ganaA, ganaB);
  }

  return koota(
    'gana',
    points,
    points >= 5
      ? 'Складом характера близки'
      : points >= 1
        ? 'Складом характера различаются, но не противоположны'
        : 'Складом характера заметно различаются',
  );
}

/** Позиции 2/12, 5/9, 6/8 друг от друга — традиционно неблагоприятны. */
const BHAKOOT_DOSHA_POSITIONS = new Set([2, 12, 5, 9, 6, 8]);

function scoreBhakoot(a: MoonPlacement, b: MoonPlacement): Koota {
  const position = ((b.rashi - a.rashi + 12) % 12) + 1;
  const dosha = BHAKOOT_DOSHA_POSITIONS.has(position);
  return koota(
    'bhakoot',
    dosha ? 0 : 7,
    dosha
      ? 'Знаки стоят в традиционно напряжённом положении друг к другу'
      : 'Знаки стоят в благоприятном положении друг к другу',
  );
}

function scoreNadi(a: MoonPlacement, b: MoonPlacement): Koota {
  const same = nadiOf(a.nakshatra) === nadiOf(b.nakshatra);
  return koota(
    'nadi',
    same ? 0 : 8,
    same
      ? 'Одна и та же надь — по традиции требует особого внимания'
      : 'Разные надьи — благоприятно с точки зрения жизненной энергии',
  );
}
