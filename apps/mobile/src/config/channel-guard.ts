/**
 * Правило слоя возможностей (VED-207): решение «что можно этой сборке»
 * принимается один раз, в `capabilities.ts`.
 *
 * Смысл не в красоте, а в том, что разбросанные `if (channel === 'site')`
 * невозможно пересмотреть целиком. Когда ревью витрины потребует убрать ещё
 * одну функцию, менять надо одну таблицу, а не искать проверки по экранам —
 * и не пропустить ту, что осталась в редко открываемом месте.
 *
 * Правило ловит СРАВНЕНИЕ с каналом, а не чтение `variant.channel`: сам
 * канал — обычные данные сборки, из него, например, склеивается адрес
 * манифеста (`self-update-client.ts`). Запрещено именно ветвление поведения
 * мимо таблицы.
 *
 * Модуль чистый: получает пары «путь → исходник», файлы читает вызывающий.
 */

import { stripComments } from './source-text';

/**
 * `channel === 'store'`, `variant.channel !== "site"`, `'site' === channel`.
 * Без флага `g`: регулярка переиспользуется между файлами.
 */
const CHANNEL_COMPARISON =
  /[Cc]hannel\s*[!=]==?\s*['"](?:site|store)['"]|['"](?:site|store)['"]\s*[!=]==?\s*\w*[Cc]hannel/;

/**
 * Где сравнивать с каналом можно и нужно. Пути от корня `apps/mobile`.
 *
 * `capabilities.ts` — сама таблица. `channel-shims/resolve.cjs` — второй,
 * сборочный слой того же решения: он выкидывает модуль запрещённой
 * возможности из графа Metro и по устройству обязан смотреть на канал сам,
 * до того как рантайм вообще появится.
 */
export const CHANNEL_DECISION_ALLOWLIST: readonly string[] = [
  'src/config/capabilities.ts',
  'channel-shims/resolve.cjs',
];

export interface ChannelCheckViolation {
  file: string;
  line: number;
  text: string;
}

export interface SourceFile {
  /** Путь от корня `apps/mobile`, с прямыми слэшами. */
  path: string;
  source: string;
}

/**
 * Файлы, где поведение ветвится по каналу мимо таблицы возможностей.
 * Тесты (`*.spec.ts`) вызывающий код сюда не передаёт: они обязаны проверять
 * оба канала поимённо.
 */
export function findDirectChannelChecks(
  files: readonly SourceFile[],
  allowlist: readonly string[] = CHANNEL_DECISION_ALLOWLIST,
): ChannelCheckViolation[] {
  const violations: ChannelCheckViolation[] = [];
  for (const file of files) {
    if (allowlist.includes(file.path)) continue;
    // Ищем в коде без комментариев (`source-text.ts` сохраняет нумерацию
    // строк), а показываем настоящую строку файла: в комментариях примеры
    // запрещённого написаны специально.
    const original = file.source.split('\n');
    stripComments(file.source)
      .split('\n')
      .forEach((text, index) => {
        if (CHANNEL_COMPARISON.test(text)) {
          violations.push({ file: file.path, line: index + 1, text: original[index].trim() });
        }
      });
  }
  return violations;
}
