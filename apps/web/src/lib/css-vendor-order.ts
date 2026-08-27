/**
 * Проверка порядка вендорных префиксов в таблице стилей.
 *
 * Lightning CSS — CSS-конвейер Next 16 — считает `-webkit-foo` и `foo` одним
 * свойством. Если стандартная строка стоит раньше префиксной, он видит её
 * перекрытой и выбрасывает из сборки: в браузер уезжает только префиксная
 * запись, а Chrome её не понимает. Ошибка молчаливая — исходник выглядит
 * правильным, стили «просто не работают».
 *
 * Правило одно: `-webkit-` идёт первым, стандартное свойство — последним.
 * Так уже написаны маски у `.glass-edge` и `.service-edge`, так теперь
 * написан `backdrop-filter` у `.glass` и `.glass-light`.
 */

export interface VendorOrderIssue {
  /** Свойство без префикса, например `backdrop-filter`. */
  property: string;
  /** Номер строки со стандартной записью, 1-based. */
  line: number;
}

const BLOCK = /\{([^{}]*)\}/g;
const DECLARATION = /^\s*(-?[a-zA-Z][\w-]*)\s*:/;

/**
 * Находит блоки, где стандартное свойство объявлено раньше своего
 * `-webkit-` двойника. Разбор нарочно наивный: берём только внутренние
 * блоки `{...}` без вложенности — объявления живут ровно в них.
 */
export function findLateVendorPrefixes(css: string): VendorOrderIssue[] {
  const issues: VendorOrderIssue[] = [];

  for (const block of css.matchAll(BLOCK)) {
    const body = block[1];
    const bodyStart = (block.index ?? 0) + 1;
    const seen = new Map<string, number>();

    let offset = 0;
    for (const part of body.split(";")) {
      const property = DECLARATION.exec(part)?.[1];
      if (property) {
        if (property.startsWith("-webkit-")) {
          const standard = property.slice("-webkit-".length);
          const earlier = seen.get(standard);
          if (earlier !== undefined) {
            issues.push({
              property: standard,
              line: css.slice(0, earlier).split("\n").length,
            });
          }
        } else if (!seen.has(property)) {
          seen.set(property, bodyStart + offset + part.indexOf(property));
        }
      }
      offset += part.length + 1;
    }
  }

  return issues;
}
