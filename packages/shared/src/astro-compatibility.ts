export type AstroCompatibilityStatus = 'pending' | 'accepted' | 'declined';

/**
 * Зачем сверяют карты. Значения совпадают с намерениями Знакомств, чтобы
 * запрос из карточки анкеты передавал свою цель без перевода.
 *
 * Классический гуна-милан — сватовской: все восемь кут отвечают на вопрос о
 * браке. Для дела, дружбы и служения часть из них отвечает не на тот вопрос
 * (йони — о телесной близости, надь — о потомстве), поэтому цель не меняет
 * астрономию, а решает, какие куты идут в итог; см. PURPOSE_KOOTAS.
 */
export type AstroCompatibilityPurpose =
  | 'family'
  | 'business'
  | 'friendship'
  | 'service';

export const ASTRO_COMPATIBILITY_PURPOSES: AstroCompatibilityPurpose[] = [
  'family',
  'business',
  'friendship',
  'service',
];

/** Один из восьми критериев гуна-милана. Порядок — по традиционному весу, 1..8. */
export type GunaMilanKootaKey =
  | 'temperament'
  | 'vashya'
  | 'tara'
  | 'yoni'
  | 'grahaMaitri'
  | 'gana'
  | 'bhakoot'
  | 'nadi';

/** Традиционный вес каждой куты, сумма — 36. */
export const GUNA_MILAN_KOOTA_MAX: Record<GunaMilanKootaKey, number> = {
  temperament: 1,
  vashya: 2,
  tara: 3,
  yoni: 4,
  grahaMaitri: 5,
  gana: 6,
  bhakoot: 7,
  nadi: 8,
};

export const GUNA_MILAN_MAX_TOTAL = Object.values(GUNA_MILAN_KOOTA_MAX).reduce(
  (sum, value) => sum + value,
  0,
); // 36

/**
 * Какие куты идут в итог для каждой цели.
 *
 * Классический аштакута — сватовской: все восемь отвечают на вопрос о браке.
 * Для дела, дружбы и служения часть из них отвечает не на тот вопрос, и
 * складывать их в общий балл значило бы мерить деловое партнёрство мерой,
 * придуманной для супружества. Поэтому цель не трогает астрономию — она
 * решает, какие куты складывать.
 *
 * Что и почему отпадает:
 * - `yoni` — о телесной близости. Только семья.
 * - `nadi` — о жизненной силе и потомстве. Только семья.
 * - `bhakoot` — о достатке и благополучии пары; оставлен делу, где речь тоже
 *   о совместном достатке, и снят со служения и дружбы.
 * - `vashya` — о взаимном притяжении и влиянии; снят со служения, где важнее
 *   согласие нравов, чем притяжение.
 *
 * Остальные четыре — темперамент, тара, дружба владык знаков и склад
 * характера — говорят о согласии нравов и идут в любую цель.
 *
 * ВАЖНО: классической опоры у наборов, кроме семейного, нет — это наше
 * прочтение, и интерфейс обязан называть его прочтением, а не традицией.
 *
 * Лежит в общем пакете, а не в модуле астрологии: по этой же таблице витрина
 * на лендинге показывает, чем расчёт для дела короче сватовского, — а две
 * копии разошлись бы на первой же правке.
 */
export const PURPOSE_KOOTAS: Record<
  AstroCompatibilityPurpose,
  GunaMilanKootaKey[]
> = {
  family: [
    'temperament',
    'vashya',
    'tara',
    'yoni',
    'grahaMaitri',
    'gana',
    'bhakoot',
    'nadi',
  ],
  business: ['temperament', 'vashya', 'tara', 'grahaMaitri', 'gana', 'bhakoot'],
  friendship: ['temperament', 'vashya', 'tara', 'grahaMaitri', 'gana'],
  service: ['temperament', 'tara', 'grahaMaitri', 'gana'],
};

/** Максимум очков для цели: сумма весов её кут. */
export function gunaMilanMaxFor(purpose: AstroCompatibilityPurpose): number {
  return PURPOSE_KOOTAS[purpose].reduce(
    (sum, key) => sum + GUNA_MILAN_KOOTA_MAX[key],
    0,
  );
}

/** Названия кут для интерфейса. */
export const GUNA_MILAN_KOOTA_TITLES: Record<GunaMilanKootaKey, string> = {
  temperament: 'Темперамент',
  vashya: 'Взаимное притяжение',
  tara: 'Звёздная совместимость',
  yoni: 'Природная близость',
  grahaMaitri: 'Дружба владык знаков',
  gana: 'Склад характера',
  bhakoot: 'Совместимость знаков',
  nadi: 'Жизненная энергия',
};

/** Подписи целей для интерфейса; совпадают с намерениями Знакомств. */
export const ASTRO_PURPOSE_TITLES: Record<AstroCompatibilityPurpose, string> = {
  family: 'Семья',
  business: 'Дело',
  friendship: 'Дружба',
  service: 'Служение',
};

export interface GunaMilanKoota {
  key: GunaMilanKootaKey;
  title: string;
  /** Набранные очки. */
  points: number;
  /** Максимум для этого критерия. */
  maxPoints: number;
  /** Короткое человекочитаемое объяснение конкретно этого результата. */
  note: string;
  /**
   * Идёт ли кута в итог для выбранной цели. Неучтённые всё равно приходят
   * наружу: спрятать их значило бы скрыть, что расчёт для дела короче
   * сватовского, — а это ровно то, что человек должен видеть.
   */
  counted: boolean;
}

export interface GunaMilanScore {
  /** Ради чего сверяли: от неё зависит состав кут и максимум. */
  purpose: AstroCompatibilityPurpose;
  /** Все восемь кут, включая неучтённые для этой цели. */
  kootas: GunaMilanKoota[];
  /** Сумма очков по учтённым кутам. */
  totalPoints: number;
  /** Сумма maxPoints учтённых кут: 36 для семьи, меньше для остальных целей. */
  maxPoints: number;
  /** points/maxPoints, для прогресс-бара в интерфейсе. */
  percent: number;
}

/**
 * Только имя и аватар — то, что и так видно в Union. Знак и накшатра Луны
 * собеседника сюда сознательно не входят: именно это согласие и защищает,
 * раскрывать часть чужой карты до принятия запроса нельзя.
 */
export interface AstroCompatibilitySummary {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface AstroCompatibilityRequestDto {
  id: string;
  status: AstroCompatibilityStatus;
  /** Ради чего сверяют: её выбрал отправитель запроса. */
  purpose: AstroCompatibilityPurpose;
  createdAt: string;
  respondedAt: string | null;
  /** Собеседник: тот, кто не текущий пользователь. */
  counterpart: AstroCompatibilitySummary;
  /** true — текущий пользователь отправил запрос; false — получил. */
  isRequester: boolean;
  /** Заполнено только когда status === 'accepted'. */
  score: GunaMilanScore | null;
}

export interface CreateAstroCompatibilityRequest {
  targetUserId: string;
  /** Не задана — семья: с неё сервис начинался, и старые клиенты шлют её же. */
  purpose?: AstroCompatibilityPurpose;
}

export interface RespondAstroCompatibilityRequest {
  accept: boolean;
}

export interface AstroCompatibilityReadingDto {
  text: string | null;
  available: boolean;
  blockedBy: 'quota_exhausted' | 'ai_unavailable' | null;
}
