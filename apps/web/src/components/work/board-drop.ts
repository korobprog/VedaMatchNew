/**
 * Куда упадёт карточка — по координатам пальца и замеренным прямоугольникам.
 *
 * Вынесено из компонента и не знает ни про DOM, ни про React: это единственная
 * часть перетаскивания, которую можно проверить тестом, а промах в ней читается
 * как «доска живёт своей жизнью».
 *
 * Готовой библиотеки здесь нет намеренно: перетаскивание одного вида карточек
 * в одном виде колонок — это полторы сотни строк, а @dnd-kit тянет в бандл
 * заметно больше и всё равно требует своей разметки. Своё решение к тому же
 * обязано иметь клавиатурный путь (кнопки «в предыдущую/следующую колонку»), а не
 * зависеть от чужой поддержки доступности.
 */

export interface ColumnRect {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CardRect {
  id: string;
  top: number;
  bottom: number;
}

/**
 * Колонка под пальцем — по всему прямоугольнику, а не по одной оси.
 *
 * Оси здесь две намеренно, хотя доска раскладывается по-разному. В ряд
 * колонки стоят на одной высоте, и попадание решает X; в столбик на телефоне
 * они одной ширины, и решает Y. Прямоугольник целиком отвечает на оба случая
 * одинаково, и раскладку знать не нужно — иначе выбор по X молча приклеивал
 * бы каждое перетаскивание к первой колонке, стоило доске встать столбиком.
 *
 * Если палец ушёл за край доски, берётся ближайшая: промахнуться мимо
 * крайней колонки легче, чем попасть, и «карточка никуда не переехала»
 * человек читает как поломку. Расстояние тоже по обеим осям — до края
 * прямоугольника, а не до его середины: у высокой колонки середина далеко от
 * того места, куда целятся.
 */
export function columnAt(
  columns: ColumnRect[],
  x: number,
  y: number,
): string | null {
  if (columns.length === 0) return null;
  const inside = columns.find(
    (column) =>
      x >= column.left &&
      x <= column.right &&
      y >= column.top &&
      y <= column.bottom,
  );
  if (inside) return inside.id;

  let nearest = columns[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const column of columns) {
    const dx = Math.max(column.left - x, 0, x - column.right);
    const dy = Math.max(column.top - y, 0, y - column.bottom);
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = column;
    }
  }
  return nearest.id;
}

/**
 * Между какими карточками встать. Границей считается середина карточки: пока
 * палец в верхней половине — встаём перед ней, в нижней — после. Граница по
 * краю давала бы мёртвую зону ровно там, куда целятся.
 *
 * Сама перетаскиваемая карточка из расчёта исключается: иначе она мешает
 * встать на своё же место и порядок дрожит.
 */
export function neighboursAt(
  cards: CardRect[],
  y: number,
  draggedId: string,
): { afterTaskId: string | null; beforeTaskId: string | null } {
  const others = cards
    .filter((card) => card.id !== draggedId)
    .sort((left, right) => left.top - right.top);

  let afterTaskId: string | null = null;
  for (const card of others) {
    const middle = (card.top + card.bottom) / 2;
    if (y < middle) {
      return { afterTaskId, beforeTaskId: card.id };
    }
    afterTaskId = card.id;
  }
  // Ниже всех — в конец колонки.
  return { afterTaskId, beforeTaskId: null };
}

/**
 * Порядковый номер места вставки — для подсветки щели между карточками.
 * 0 означает «перед первой», длина списка — «после последней».
 */
export function dropIndexAt(
  cards: CardRect[],
  y: number,
  draggedId: string,
): number {
  const others = cards
    .filter((card) => card.id !== draggedId)
    .sort((left, right) => left.top - right.top);
  let index = 0;
  for (const card of others) {
    if (y < (card.top + card.bottom) / 2) return index;
    index += 1;
  }
  return index;
}
