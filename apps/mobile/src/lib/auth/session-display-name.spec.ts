import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Правило портала «Имя пользователя наружу» (CLAUDE.md) для приложения.
 *
 * У человека два имени: мирское `name` и необязательное духовное
 * `spiritualName`. Наружу идёт `resolveDisplayName` — духовное, если оно
 * заполнено. Сервер это соблюдает в каждом DTO (`chat-dto.ts`,
 * `people.service.ts` и соседи), поэтому всё, что приходит с сервера чужим
 * человеком, уже правильное: `member.user.name`, `request.user.name`,
 * `participant.user.name` трогать не нужно.
 *
 * Ломается это на СВОЁМ человеке — там, где имя берётся из сессии, а не из
 * ответа сервера. До VED-332 сессия знала только мирское имя, и когда
 * `displayName` завели, часть экранов осталась на прежнем поле: «Аккаунт»
 * показывал «Маму Тхакур дас», соседняя вкладка «Сервисы» — «Максим
 * Коробков», а в собственном пузыре переписки до ответа сервера стояло
 * мирское имя и менялось на духовное после (раунд оценки 001, дефекты 1 и 2).
 *
 * Одним тестом на один экран этот класс ошибок не закрыть: завтра появится
 * третий экран. Поэтому тест ищет нарушение во ВСЁМ дереве исходников —
 * как `contrast.spec.ts` стережёт цвета во всех экранах сразу.
 */

const SRC = join(__dirname, '..', '..');

/**
 * `user.name` / `user?.name` — но только когда слева от `user` НЕ точка:
 * `event.user.name`, `member.user.name`, `participant.user.name` приходят с
 * сервера уже собранными и под правило не подпадают.
 */
const OWN_NAME = /(?<![.\w])user\??\.name\b/;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.spec.')) continue;
    found.push(path);
  }
  return found;
}

/** Файлы, которые берут человека из сессии, — только их и касается правило. */
function sessionConsumers(): { path: string; source: string }[] {
  return sourceFiles(SRC)
    .map((path) => ({ path, source: readFileSync(path, 'utf8') }))
    .filter(({ source }) => source.includes('useSession('));
}

function offendingLines(source: string): string[] {
  return source
    .split('\n')
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => OWN_NAME.test(line) && !line.startsWith('*') && !line.startsWith('//'))
    .map(({ line, number }) => `${number}: ${line}`);
}

describe('имя своего человека наружу', () => {
  it('экраны действительно берут человека из сессии — тесту есть что проверять', () => {
    // Страховка от «зелено, потому что ничего не нашлось»: если обход дерева
    // сломается, тест обязан упасть, а не молча объявить правило соблюдённым.
    expect(sessionConsumers().length).toBeGreaterThan(3);
  });

  it('ни один экран не показывает мирское имя вместо `displayName`', () => {
    const offenders = sessionConsumers()
      .map(({ path, source }) => ({ path: path.slice(SRC.length + 1), lines: offendingLines(source) }))
      .filter(({ lines }) => lines.length > 0);

    // Сообщение перечисляет файл и строку: иначе на упавшем тесте непонятно,
    // где именно вернулось мирское имя.
    expect(offenders.map(({ path, lines }) => `${path} → ${lines.join('; ')}`)).toEqual([]);
  });

  it('проверка отличает своё имя от пришедшего с сервера', () => {
    expect(OWN_NAME.test('{user?.name ?? «Аккаунт»}')).toBe(true);
    expect(OWN_NAME.test('author: { id: user.id, name: user.name }')).toBe(true);
    expect(OWN_NAME.test('setTypingName(event.user.name)')).toBe(false);
    expect(OWN_NAME.test('<ChatAvatar name={member.user.name} />')).toBe(false);
    expect(OWN_NAME.test('a.user.name.localeCompare(b.user.name)')).toBe(false);
    // `displayName` — не `name`, и на него правило не срабатывает.
    expect(OWN_NAME.test('{user?.displayName ?? «Аккаунт»}')).toBe(false);
  });
});
