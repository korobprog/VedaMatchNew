/**
 * Логика плавающих кнопок прокрутки (VED-265) — отдельно от компонента: сами
 * правила видимости и цели прокрутки не завязаны на DOM и легко проверяются
 * юнит-тестом, а `ScrollNavButtons` только читает `window`/`document` и
 * зовёт эти функции.
 */

/** Снимок прокрутки страницы — то немногое, что нужно, чтобы решить, что
 *  показывать. `scrollHeight`/`clientHeight` — как у `document.documentElement`. */
export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface ScrollButtonsVisibility {
  /** «Промотать наверх до конца». */
  toTop: boolean;
  /** «Промотать на одну десятую вверх». */
  upTenth: boolean;
  /** «Промотать на одну десятую вниз». */
  downTenth: boolean;
  /** «Промотать вниз до конца». */
  toBottom: boolean;
}

/** Запас на погрешность округления (дробные пиксели при зуме/масштабе). */
const EPSILON = 1;

/** Насколько вообще можно прокрутить — 0, если содержимое короче экрана. */
function maxScrollTop(metrics: ScrollMetrics): number {
  return Math.max(0, metrics.scrollHeight - metrics.clientHeight);
}

/**
 * Видимость четырёх кнопок (чек-лист VED-265): «На одну десятую» видны
 * всегда, кроме края, к которому они и так ведут, — «вверх» пропадает в
 * самом верху, «вниз» в самом низу. «До конца» пропадает вместе с ними у
 * своего края: в самом верху нет смысла в «до конца вверх», в самом низу —
 * в «до конца вниз». Если страница короче экрана и крутить вообще некуда —
 * не показываются все четыре разом.
 */
export function scrollButtonsVisibility(
  metrics: ScrollMetrics,
): ScrollButtonsVisibility {
  const max = maxScrollTop(metrics);
  const atTop = metrics.scrollTop <= EPSILON;
  const atBottom = metrics.scrollTop >= max - EPSILON;
  return {
    toTop: !atTop,
    upTenth: !atTop,
    downTenth: !atBottom,
    toBottom: !atBottom,
  };
}

export type ScrollNavAction = "top" | "bottom" | "up-tenth" | "down-tenth";

/**
 * Куда прокрутить (значение для `scrollTo({ top })`), зажато в границы
 * `[0, maxScrollTop]` — так вызывающему не нужно знать про край отдельно.
 *
 * Шаг «на одну десятую» считается от всей прокручиваемой длины
 * (`maxScrollTop`), а не от видимой высоты экрана: «одна десятая длины»
 * в чек-листе — про длину ленты, а не про то, сколько влезло на экран.
 * Ровно десять нажатий подряд проходят весь путь от начала до конца.
 */
export function nextScrollTop(
  metrics: ScrollMetrics,
  action: ScrollNavAction,
): number {
  const max = maxScrollTop(metrics);
  const step = max / 10;
  const raw =
    action === "top"
      ? 0
      : action === "bottom"
        ? max
        : action === "up-tenth"
          ? metrics.scrollTop - step
          : metrics.scrollTop + step;
  return Math.min(max, Math.max(0, raw));
}
