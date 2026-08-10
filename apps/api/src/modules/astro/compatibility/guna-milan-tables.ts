import type { GrahaId, RashiIndex } from '@vedamatch/shared';

/**
 * Справочные таблицы гуна-милана.
 *
 * У расчёта эфемерид есть внешний эталон (JPL Horizons), у гуна-милана — нет:
 * это не физика, а свод правил традиции, и разные школы приводят слегка разные
 * числа. Ниже — где я уверен твёрдо (это стандартные таблицы джйотиша вообще,
 * используемые далеко не только в гуна-милане), а где сознательно упрощено из-за
 * разночтений источников. Второе помечено явно и требует сверки с практикующим
 * астрологом или опубликованной таблицей перед выходом из беты — тот же принцип,
 * что и у `AYANAMSA_CONVENTION_NOTE`.
 */

export const GUNA_MILAN_VERIFICATION_NOTE =
  'Таблицы вашья и йони упрощены до целых знаков/животных без пограничных ' +
  'случаев классических текстов. Числовые баллы отдельных крит приведены по ' +
  'наиболее распространённым источникам, но для гуна-милана нет внешнего ' +
  'эталона вроде JPL — требуется сверка с практикующим астрологом перед ' +
  'выходом из беты.';

// ---------------------------------------------------------------------------
// Уверенно: планетарная дружба (Парашара) — стандартная таблица джйотиша,
// используется далеко за пределами гуна-милана.
// ---------------------------------------------------------------------------

export type Friendship = 'friend' | 'neutral' | 'enemy';

const PLANETARY_FRIENDSHIP: Record<
  string,
  Partial<Record<string, Friendship>>
> = {
  sun: {
    moon: 'friend',
    mars: 'friend',
    jupiter: 'friend',
    mercury: 'neutral',
    venus: 'enemy',
    saturn: 'enemy',
  },
  moon: {
    sun: 'friend',
    mercury: 'friend',
    mars: 'neutral',
    jupiter: 'neutral',
    venus: 'neutral',
    saturn: 'neutral',
  },
  mars: {
    sun: 'friend',
    moon: 'friend',
    jupiter: 'friend',
    venus: 'neutral',
    saturn: 'neutral',
    mercury: 'enemy',
  },
  mercury: {
    sun: 'friend',
    venus: 'friend',
    mars: 'neutral',
    jupiter: 'neutral',
    saturn: 'neutral',
    moon: 'enemy',
  },
  jupiter: {
    sun: 'friend',
    moon: 'friend',
    mars: 'friend',
    saturn: 'neutral',
    mercury: 'enemy',
    venus: 'enemy',
  },
  venus: {
    mercury: 'friend',
    saturn: 'friend',
    mars: 'neutral',
    jupiter: 'neutral',
    sun: 'enemy',
    moon: 'enemy',
  },
  saturn: {
    mercury: 'friend',
    venus: 'friend',
    jupiter: 'neutral',
    sun: 'enemy',
    moon: 'enemy',
    mars: 'enemy',
  },
};

export function friendshipOf(from: GrahaId, to: GrahaId): Friendship {
  if (from === to) return 'friend';
  return PLANETARY_FRIENDSHIP[from]?.[to] ?? 'neutral';
}

/** Владыка знака (не накшатры — накшатровый владыка уже есть в dasha.ts). */
export const RASHI_LORD: readonly GrahaId[] = [
  'mars', // Меша
  'venus', // Вришабха
  'mercury', // Митхуна
  'moon', // Карка
  'sun', // Симха
  'mercury', // Канья
  'venus', // Тула
  'mars', // Вришчика
  'jupiter', // Дхану
  'saturn', // Макара
  'saturn', // Кумбха
  'jupiter', // Мина
];

// ---------------------------------------------------------------------------
// Уверенно: 27 накшатр по 3 надьи циклом — чистая арифметика без разночтений.
// ---------------------------------------------------------------------------

export type Nadi = 'adi' | 'madhya' | 'antya';

const NADI_CYCLE: readonly Nadi[] = ['adi', 'madhya', 'antya'];

export function nadiOf(nakshatra: number): Nadi {
  return NADI_CYCLE[(nakshatra - 1) % 3];
}

// ---------------------------------------------------------------------------
// Уверенно: деление накшатр на три ганы — устойчиво воспроизводится во всех
// источниках, разночтений почти нет.
// ---------------------------------------------------------------------------

export type Gana = 'deva' | 'manushya' | 'rakshasa';

/** Индекс — накшатра минус единица. */
const GANA_BY_NAKSHATRA: readonly Gana[] = [
  'deva',
  'manushya',
  'rakshasa',
  'manushya',
  'deva',
  'manushya',
  'deva',
  'deva',
  'rakshasa',
  'manushya',
  'manushya',
  'manushya',
  'deva',
  'rakshasa',
  'deva',
  'rakshasa',
  'deva',
  'rakshasa',
  'rakshasa',
  'manushya',
  'manushya',
  'deva',
  'rakshasa',
  'rakshasa',
  'manushya',
  'manushya',
  'deva',
];

export function ganaOf(nakshatra: number): Gana {
  return GANA_BY_NAKSHATRA[nakshatra - 1];
}

// ---------------------------------------------------------------------------
// Упрощено: темперамент знака (переосмысленная варна). Прежняя иерархия
// брахман > кшатрий > вайшья > шудра снята сознательно — платформа
// несектантская. Балл остаётся тем же (1), группа — по стихии знака.
// ---------------------------------------------------------------------------

export type Temperament = 'action' | 'steadiness' | 'connection' | 'feeling';

/** Индекс — раши минус единица. Огонь/земля/воздух/вода, как в navamsaRashiOf. */
const TEMPERAMENT_BY_RASHI: readonly Temperament[] = [
  'action',
  'steadiness',
  'connection',
  'feeling',
  'action',
  'steadiness',
  'connection',
  'feeling',
  'action',
  'steadiness',
  'connection',
  'feeling',
];

export function temperamentOf(rashi: RashiIndex): Temperament {
  return TEMPERAMENT_BY_RASHI[rashi - 1];
}

// ---------------------------------------------------------------------------
// Упрощено: группы вашьи по символу знака, без пограничных половин Стрельца
// и Козерога, которые в классических текстах расходятся. Символика знака
// (кентавр = получеловек, Макара = морское существо) даёт наиболее защитимую
// интерпретацию для целых знаков.
// ---------------------------------------------------------------------------

export type VashyaGroup =
  'chatushpada' | 'manava' | 'jalachara' | 'vanachara' | 'keeta';

const VASHYA_BY_RASHI: readonly VashyaGroup[] = [
  'chatushpada', // Меша — баран
  'chatushpada', // Вришабха — бык
  'manava', // Митхуна — близнецы
  'jalachara', // Карка — краб
  'vanachara', // Симха — лев, отдельная группа
  'manava', // Канья — дева
  'manava', // Тула — весы в руках человека
  'keeta', // Вришчика — скорпион
  'manava', // Дхану — кентавр, человеческая половина
  'chatushpada', // Макара — козья половина
  'manava', // Кумбха — водолей-человек
  'jalachara', // Мина — рыбы
];

export function vashyaGroupOf(rashi: RashiIndex): VashyaGroup {
  return VASHYA_BY_RASHI[rashi - 1];
}

// ---------------------------------------------------------------------------
// Упрощено: 27 накшатр → 14 животных йони. Стандартная и широко
// воспроизводимая таблица, но точные попарные степени вражды по всей
// матрице 14×14 расходятся между источниками — используется только список
// хорошо задокументированных пар природных врагов, остальное — нейтрально.
// ---------------------------------------------------------------------------

export type YoniAnimal =
  | 'horse'
  | 'elephant'
  | 'sheep'
  | 'serpent'
  | 'dog'
  | 'cat'
  | 'rat'
  | 'cow'
  | 'buffalo'
  | 'tiger'
  | 'deer'
  | 'monkey'
  | 'mongoose'
  | 'lion';

export interface Yoni {
  animal: YoniAnimal;
  /** Мужская/женская особь животного — так задаёт традиция, не пол человека. */
  isMale: boolean;
}

/** Индекс — накшатра минус единица. */
const YONI_BY_NAKSHATRA: readonly Yoni[] = [
  { animal: 'horse', isMale: true }, // Ашвини
  { animal: 'elephant', isMale: true }, // Бхарани
  { animal: 'sheep', isMale: false }, // Криттика
  { animal: 'serpent', isMale: true }, // Рохини
  { animal: 'serpent', isMale: false }, // Мригашира
  { animal: 'dog', isMale: false }, // Ардра
  { animal: 'cat', isMale: false }, // Пунарвасу
  { animal: 'sheep', isMale: true }, // Пушья
  { animal: 'cat', isMale: true }, // Ашлеша
  { animal: 'rat', isMale: true }, // Магха
  { animal: 'rat', isMale: false }, // Пурва Пхалгуни
  { animal: 'cow', isMale: false }, // Уттара Пхалгуни
  { animal: 'buffalo', isMale: false }, // Хаста
  { animal: 'tiger', isMale: false }, // Читра
  { animal: 'buffalo', isMale: true }, // Свати
  { animal: 'tiger', isMale: true }, // Вишакха
  { animal: 'deer', isMale: false }, // Анурадха
  { animal: 'deer', isMale: true }, // Джьештха
  { animal: 'dog', isMale: true }, // Мула
  { animal: 'monkey', isMale: true }, // Пурва Ашадха
  { animal: 'mongoose', isMale: true }, // Уттара Ашадха
  { animal: 'monkey', isMale: false }, // Шравана
  { animal: 'lion', isMale: false }, // Дхаништха
  { animal: 'horse', isMale: false }, // Шатабхиша
  { animal: 'lion', isMale: true }, // Пурва Бхадрапада
  { animal: 'cow', isMale: true }, // Уттара Бхадрапада
  { animal: 'elephant', isMale: false }, // Ревати
];

export function yoniOf(nakshatra: number): Yoni {
  return YONI_BY_NAKSHATRA[nakshatra - 1];
}

/** Хорошо задокументированные пары природных врагов среди йони-животных. */
const YONI_ENEMY_PAIRS: ReadonlyArray<readonly [YoniAnimal, YoniAnimal]> = [
  ['cow', 'tiger'],
  ['elephant', 'lion'],
  ['horse', 'buffalo'],
  ['dog', 'deer'],
  ['cat', 'rat'],
  ['serpent', 'mongoose'],
  ['sheep', 'monkey'],
];

export function areYoniEnemies(a: YoniAnimal, b: YoniAnimal): boolean {
  return YONI_ENEMY_PAIRS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}
