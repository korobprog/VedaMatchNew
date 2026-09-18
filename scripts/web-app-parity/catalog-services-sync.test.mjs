// Раунд 002, Н-нов-3: белый список (`CATALOG_SERVICES`) чинит Б1, но заводит
// новый тихий отказ — добавление сервиса в каталог (`apps/api/prisma/seed.cjs`)
// без синхронной правки `CATALOG_SERVICES` молча выкидывает его из паритета
// (никакой другой тест этого не ловит: `card-content.test.mjs` сверяет
// `SERVICE_NAMES` с `CATALOG_SERVICES` из того же файла, а не с сидом).
//
// Тест читает сам `seed.cjs` (без сети — обычный `readFileSync`) и сверяет
// множества слагов с учётом документированных исключений
// (`CATALOG_SERVICES_WITHOUT_SEED_ENTRY` — например, `vacancies`: полноценный
// раздел без плитки в каталоге навигации, см. комментарий в
// `changed-paths-to-services.mjs`).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_SERVICES,
  CATALOG_SERVICES_WITHOUT_SEED_ENTRY,
} from './changed-paths-to-services.mjs';

const SEED_PATH = fileURLToPath(
  new URL('../../apps/api/prisma/seed.cjs', import.meta.url),
);

/**
 * Слаги каталога из `seed.cjs`. Список `services` объявлен до
 * `async function main()` — дальше в файле `slug:` встречается в
 * совершенно других сущностях (разделы/рубрики/теги Библиотеки, рецепты
 * Здоровья), которые сервисами каталога не являются и не должны попасть в
 * выборку.
 */
function catalogSlugsFromSeed() {
  const source = readFileSync(SEED_PATH, 'utf8');
  const mainStart = source.indexOf('async function main');
  if (mainStart === -1) {
    throw new Error('seed.cjs: не нашли "async function main" — формат файла изменился');
  }
  const servicesBlock = source.slice(0, mainStart);
  return [...servicesBlock.matchAll(/slug:\s*'([a-z0-9-]+)'/g)].map((match) => match[1]);
}

test('seed.cjs действительно содержит записи каталога (регэксп/путь не сломались)', () => {
  const slugs = catalogSlugsFromSeed();
  assert.ok(slugs.length >= 10, `нашли только ${slugs.length} слагов — проверить регэксп/путь`);
  assert.ok(slugs.includes('union'), 'union обязан быть в каталоге');
});

test('CATALOG_SERVICES синхронизирован с seed.cjs (кроме документированных исключений)', () => {
  const seedSlugs = catalogSlugsFromSeed();
  const withoutDocumentedExceptions = CATALOG_SERVICES.filter(
    (service) => !CATALOG_SERVICES_WITHOUT_SEED_ENTRY.includes(service),
  );

  // Падает в обе стороны: новый сервис появился в seed.cjs, но забыли
  // добавить в CATALOG_SERVICES (тринадцатый сервис молча выпал бы из
  // паритета — ровно тот случай, ради которого тест и заводится) — или
  // наоборот, слаг в CATALOG_SERVICES придуман и не документирован как
  // исключение.
  assert.deepEqual(
    [...withoutDocumentedExceptions].sort(),
    [...seedSlugs].sort(),
  );
});

test('документированные исключения — сами не в seed.cjs (иначе они не исключение)', () => {
  const seedSlugs = new Set(catalogSlugsFromSeed());
  for (const service of CATALOG_SERVICES_WITHOUT_SEED_ENTRY) {
    assert.ok(
      !seedSlugs.has(service),
      `${service} помечен исключением, но на самом деле есть в seed.cjs — запись из списка исключений нужно убрать`,
    );
    assert.ok(
      CATALOG_SERVICES.includes(service),
      `${service} помечен исключением, но отсутствует в CATALOG_SERVICES`,
    );
  }
});
