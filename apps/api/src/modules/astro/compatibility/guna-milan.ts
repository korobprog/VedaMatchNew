import type {
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

const KOOTA_MAX: Record<GunaMilanKootaKey, number> = {
  temperament: 1,
  vashya: 2,
  tara: 3,
  yoni: 4,
  grahaMaitri: 5,
  gana: 6,
  bhakoot: 7,
  nadi: 8,
};

export const GUNA_MILAN_MAX_TOTAL = Object.values(KOOTA_MAX).reduce(
  (sum, value) => sum + value,
  0,
); // 36

const KOOTA_TITLES: Record<GunaMilanKootaKey, string> = {
  temperament: 'Темперамент',
  vashya: 'Взаимное притяжение',
  tara: 'Звёздная совместимость',
  yoni: 'Природная близость',
  grahaMaitri: 'Дружба владык знаков',
  gana: 'Склад характера',
  bhakoot: 'Совместимость знаков',
  nadi: 'Жизненная энергия',
};

export function computeGunaMilan(
  a: MoonPlacement,
  b: MoonPlacement,
): GunaMilanScore {
  const kootas: GunaMilanKoota[] = [
    scoreTemperament(a, b),
    scoreVashya(a, b),
    scoreTara(a, b),
    scoreYoni(a, b),
    scoreGrahaMaitri(a, b),
    scoreGana(a, b),
    scoreBhakoot(a, b),
    scoreNadi(a, b),
  ];

  const totalPoints = kootas.reduce((sum, k) => sum + k.points, 0);

  return {
    kootas,
    totalPoints,
    maxPoints: GUNA_MILAN_MAX_TOTAL,
    percent: Math.round((totalPoints / GUNA_MILAN_MAX_TOTAL) * 100),
  };
}

function koota(
  key: GunaMilanKootaKey,
  points: number,
  note: string,
): GunaMilanKoota {
  return {
    key,
    title: KOOTA_TITLES[key],
    points,
    maxPoints: KOOTA_MAX[key],
    note,
  };
}

/** Переосмысленная варна: та же группа стихии — 1 очко, разная — 0. Без иерархии. */
function scoreTemperament(a: MoonPlacement, b: MoonPlacement): GunaMilanKoota {
  const same = temperamentOf(a.rashi) === temperamentOf(b.rashi);
  return koota(
    'temperament',
    same ? 1 : 0,
    same ? 'Один тип темперамента по Луне' : 'Разные типы темперамента по Луне',
  );
}

/** Совпадение природной группы знака: 2 очка при совпадении, иначе 0. */
function scoreVashya(a: MoonPlacement, b: MoonPlacement): GunaMilanKoota {
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
function scoreTara(a: MoonPlacement, b: MoonPlacement): GunaMilanKoota {
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

function scoreYoni(a: MoonPlacement, b: MoonPlacement): GunaMilanKoota {
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

function scoreGrahaMaitri(a: MoonPlacement, b: MoonPlacement): GunaMilanKoota {
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

function scoreGana(a: MoonPlacement, b: MoonPlacement): GunaMilanKoota {
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

function scoreBhakoot(a: MoonPlacement, b: MoonPlacement): GunaMilanKoota {
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

function scoreNadi(a: MoonPlacement, b: MoonPlacement): GunaMilanKoota {
  const same = nadiOf(a.nakshatra) === nadiOf(b.nakshatra);
  return koota(
    'nadi',
    same ? 0 : 8,
    same
      ? 'Одна и та же надь — по традиции требует особого внимания'
      : 'Разные надьи — благоприятно с точки зрения жизненной энергии',
  );
}
