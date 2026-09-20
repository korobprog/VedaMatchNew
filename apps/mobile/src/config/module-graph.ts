/**
 * Обход графа модулей приложения (VED-207) — дешёвая замена настоящему
 * бандлу для проверок сборки витрины.
 *
 * Зачем: в APK попадает не то, что видно на экране, а то, до чего Metro
 * дотянулся импортами. Проверка «в store-сборке нет кода самообновления и
 * призывов к оплате» честна только если считает достижимые модули, а не
 * читает `src/**` целиком — иначе она либо ловит ложные срабатывания на
 * заведомо непопадающем коде, либо вовсе ничего не проверяет. Настоящий
 * `expo export` в юнит-тесте — минуты и сотни мегабайт, обход импортов —
 * доли секунды.
 *
 * Обход намеренно приблизительный и в безопасную сторону: спецификаторы
 * ищутся регуляркой прямо по тексту, вместе с теми, что упомянуты в
 * комментариях. Лишний модуль в графе даст лишнюю проверку, пропущенный —
 * дыру, поэтому ошибаемся в сторону «больше».
 *
 * Файловая система не трогается: чтение и резолв передаются извне, поэтому
 * модуль чистый и тестируется на выдуманном дереве.
 */

/** Спецификаторы `from '...'`, `import '...'`, `require('...')`, `import('...')`. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"]([^'"\n]+)['"]/g;

export function parseImportSpecifiers(source: string): string[] {
  const found = new Set<string>();
  // Своя копия регулярки: глобальная хранит `lastIndex` между вызовами.
  const re = new RegExp(SPECIFIER.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) found.add(match[1]);
  return [...found];
}

export interface ModuleGraphDeps {
  /** Исходник модуля или `null`, если файла нет. */
  readSource(file: string): string | null;
  /**
   * Путь модуля по спецификатору из `fromFile` или `null` — внешний пакет,
   * несуществующий файл, ассет. Сюда же прячется подмена канала
   * (`channel-shims/resolve.cjs`): резолвер вызывающего кода отдаёт путь
   * заглушки вместо настоящего модуля.
   */
  resolve(fromFile: string, specifier: string): string | null;
}

/**
 * Все модули, достижимые из точек входа. Возвращает отсортированный список,
 * чтобы сообщения упавших проверок не прыгали от запуска к запуску.
 */
export function walkModuleGraph(entries: readonly string[], deps: ModuleGraphDeps): string[] {
  const seen = new Set<string>();
  const queue = [...entries];

  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = deps.readSource(file);
    if (source == null) continue;
    for (const specifier of parseImportSpecifiers(source)) {
      const next = deps.resolve(file, specifier);
      if (next && !seen.has(next)) queue.push(next);
    }
  }

  return [...seen].sort();
}
