import {
  ASTRO_PURPOSE_TITLES,
  GUNA_MILAN_KOOTA_MAX,
  GUNA_MILAN_KOOTA_TITLES,
  PURPOSE_KOOTAS,
  gunaMilanMaxFor,
  type AstroCompatibilityPurpose,
  type GunaMilanKootaKey,
} from "@vedamatch/shared";

/**
 * Демонстрационный гуна-милан для витрины: показывает не чью-то настоящую
 * совместимость, а устройство расчёта — как цель меняет состав кут.
 *
 * Очки кут заданы одни на все цели: в сервисе они и не зависят от цели, её
 * дело — решить, какие складывать. Набор кут и веса берутся из общей таблицы
 * `PURPOSE_KOOTAS`, той же, по которой считает сервер: витрина, разошедшаяся
 * с расчётом, врала бы ровно про то, что взялась объяснять.
 */

/**
 * Придуманная пара. Очки правдоподобны и лежат в пределах веса своей куты —
 * это проверяет тест.
 */
const DEMO_POINTS: Record<GunaMilanKootaKey, number> = {
  temperament: 1,
  vashya: 2,
  tara: 3,
  yoni: 3,
  grahaMaitri: 4,
  gana: 6,
  bhakoot: 7,
  nadi: 8,
};

export interface DemoKootaRow {
  key: GunaMilanKootaKey;
  title: string;
  points: number;
  maxPoints: number;
  /** Идёт ли кута в итог этой цели. Неучтённые показываются приглушённо. */
  counted: boolean;
}

export interface DemoGunaMilan {
  purpose: AstroCompatibilityPurpose;
  title: string;
  rows: DemoKootaRow[];
  totalPoints: number;
  maxPoints: number;
  percent: number;
}

/** Все восемь кут с отметкой, идёт ли каждая в итог выбранной цели. */
export function demoGunaMilan(
  purpose: AstroCompatibilityPurpose,
): DemoGunaMilan {
  const counted = new Set(PURPOSE_KOOTAS[purpose]);
  const rows: DemoKootaRow[] = (
    Object.keys(GUNA_MILAN_KOOTA_MAX) as GunaMilanKootaKey[]
  ).map((key) => ({
    key,
    title: GUNA_MILAN_KOOTA_TITLES[key],
    points: DEMO_POINTS[key],
    maxPoints: GUNA_MILAN_KOOTA_MAX[key],
    counted: counted.has(key),
  }));

  const totalPoints = rows
    .filter((row) => row.counted)
    .reduce((sum, row) => sum + row.points, 0);
  const maxPoints = gunaMilanMaxFor(purpose);

  return {
    purpose,
    title: ASTRO_PURPOSE_TITLES[purpose],
    rows,
    totalPoints,
    maxPoints,
    percent: Math.round((totalPoints / maxPoints) * 100),
  };
}

/**
 * Чем расчёт этой цели короче сватовского — одной строкой под итогом.
 * У семьи её нет: там считаются все восемь, и объяснять нечего.
 */
export function demoPurposeNote(
  purpose: AstroCompatibilityPurpose,
): string | null {
  const dropped = (Object.keys(GUNA_MILAN_KOOTA_MAX) as GunaMilanKootaKey[])
    .filter((key) => !PURPOSE_KOOTAS[purpose].includes(key))
    .map((key) => GUNA_MILAN_KOOTA_TITLES[key].toLowerCase());
  if (dropped.length === 0) return null;
  // Не «это про брак»: у служения отпадают ещё притяжение и достаток пары, а
  // они не про брак — просто отвечают не на тот вопрос.
  return `Не считаем: ${dropped.join(", ")} — для этой цели они не о том`;
}
