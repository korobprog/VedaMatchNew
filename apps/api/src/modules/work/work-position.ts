/**
 * Порядок карточек в колонке — дробный индекс.
 *
 * Целочисленный порядок («первая, вторая, третья») заставляет переписать всю
 * колонку на каждое перетаскивание: двадцать строк вместо одной, и гонка,
 * стоит открыть доску в двух вкладках. Дробный меняет ровно одну строку —
 * новая позиция это середина между соседями.
 *
 * Плата за это одна: середина между близкими числами когда-нибудь совпадёт с
 * соседом (double держит ~15 значащих цифр, а каждая вставка в одно и то же
 * место делит зазор пополам — примерно полсотни вставок подряд). Тогда
 * колонка перенумеровывается целиком; это редкий случай, и он здесь же.
 */

/** Шаг между соседями при добавлении в конец или начало. */
export const WORK_POSITION_STEP = 1024;

/**
 * Меньше этого зазор считается схлопнувшимся. Не «равно нулю»: два числа
 * могут различаться на последнюю значащую цифру, их середина совпадёт с одним
 * из них, и карточка встанет на место соседа с непредсказуемым порядком.
 */
export const WORK_POSITION_MIN_GAP = 1e-6;

/**
 * Позиция между соседями. `before` — карточка выше (меньшая позиция),
 * `after` — ниже. `null` означает край колонки.
 *
 * Возвращённое число не проверяется на схлопывание: это делает
 * `needsRebalance` до вставки, потому что решение «перенумеровать колонку»
 * принимается не здесь, а там, где есть вся колонка.
 */
export function positionBetween(
  before: number | null,
  after: number | null,
): number {
  if (before === null && after === null) return 0;
  if (before === null) return (after as number) - WORK_POSITION_STEP;
  if (after === null) return before + WORK_POSITION_STEP;
  return (before + after) / 2;
}

/** Зазор между соседями схлопнулся — вставлять между ними нельзя. */
export function needsRebalance(
  before: number | null,
  after: number | null,
): boolean {
  if (before === null || after === null) return false;
  return after - before < WORK_POSITION_MIN_GAP;
}

/**
 * Ровные позиции для колонки из `count` карточек: 0, 1024, 2048…
 * Порядок сохраняется, зазор восстанавливается.
 */
export function rebalancedPositions(count: number): number[] {
  const positions: number[] = [];
  for (let index = 0; index < count; index += 1) {
    positions.push(index * WORK_POSITION_STEP);
  }
  return positions;
}

/**
 * Куда встанет карточка среди уже разложенных — с учётом того, что запрос
 * называет соседей по id, а не по числу.
 *
 * Соседи, а не индекс: пока запрос летел, доску мог поменять другой человек, и
 * «поставить третьей» промахнётся, а «между этими двумя» — нет. Если соседа
 * уже нет в колонке (его унесли), считаем, что его края и не было.
 */
export function resolveMovePosition(
  ordered: Array<{ id: string; position: number }>,
  afterTaskId: string | null | undefined,
  beforeTaskId: string | null | undefined,
): { position: number; rebalance: boolean } {
  // Пропавший сосед (его унесли, пока запрос летел) — то же самое, что не
  // названный: индекс −1, и граница считается краем колонки.
  const indexOf = (id: string | null | undefined): number =>
    id ? ordered.findIndex((item) => item.id === id) : -1;

  const afterIndex = indexOf(afterTaskId);
  const beforeIndex = indexOf(beforeTaskId);

  // Названа одна граница — вторую берём у фактического соседа: иначе карточка
  // улетает на целый шаг за соседнюю и обгоняет её при следующей вставке.
  let before: number | null = null;
  let after: number | null = null;
  if (afterIndex >= 0) {
    before = ordered[afterIndex].position;
    after =
      beforeIndex >= 0
        ? ordered[beforeIndex].position
        : (ordered[afterIndex + 1]?.position ?? null);
  } else if (beforeIndex >= 0) {
    after = ordered[beforeIndex].position;
    before = ordered[beforeIndex - 1]?.position ?? null;
  } else if (ordered.length > 0) {
    // Ни одной границы: карточка едет в конец колонки. Начало было бы
    // неожиданнее — в трекерах новая задача появляется снизу.
    before = ordered[ordered.length - 1].position;
  }

  return {
    position: positionBetween(before, after),
    rebalance: needsRebalance(before, after),
  };
}
