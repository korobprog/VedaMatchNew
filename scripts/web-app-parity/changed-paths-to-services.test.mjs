import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATALOG_SERVICES,
  EXCLUDED_SERVICES,
  groupChangedPathsByService,
  servicesFromPaths,
} from './changed-paths-to-services.mjs';

test('веб-путь без маршрутной группы → сервис', () => {
  assert.deepEqual(
    servicesFromPaths(['apps/web/src/app/library/page.tsx']),
    ['library'],
  );
});

test('веб-путь внутри маршрутной группы Next.js → сервис', () => {
  assert.deepEqual(
    servicesFromPaths(['apps/web/src/app/(portal)/market/page.tsx']),
    ['market'],
  );
});

test('веб-путь с несколькими вложенными группами → сервис', () => {
  assert.deepEqual(
    servicesFromPaths(['apps/web/src/app/(portal)/(sub)/market/page.tsx']),
    ['market'],
  );
});

test('путь компонентов веба → сервис', () => {
  assert.deepEqual(
    servicesFromPaths(['apps/web/src/components/market/price-tag.tsx']),
    ['market'],
  );
});

test('путь API-модуля → сервис', () => {
  assert.deepEqual(
    servicesFromPaths(['apps/api/src/modules/market/market.controller.ts']),
    ['market'],
  );
});

// Раунд 001, Б1: чёрный список пропускал 22 из 40 карточек на живой истории
// main на несервисные папки — первая папка после известного префикса
// становилась «сервисом», даже когда сервисом каталога не была. Белый
// список (`CATALOG_SERVICES`) — единственный барьер, который это чинит.
// Слаги ниже — буквально те, что нашёл evaluator на 30 последних мержах.
test('несервисные папки веба и API не попадают в список (раунд 001, Б1)', () => {
  const noise = [
    'apps/web/src/app/admin/music/catalog/page.tsx',
    'apps/web/src/app/notifications/page.tsx',
    'apps/web/src/components/landing/Services.tsx',
    'apps/web/src/app/app/page.tsx',
    'apps/web/src/app/vaishnava/page.tsx',
    'apps/web/src/app/pwa/register.ts',
    'apps/api/src/modules/audit/admin-audit.service.ts',
    'apps/api/src/modules/users/users.controller.ts',
    'apps/web/src/app/m/page.tsx',
    'apps/web/src/app/share/page.tsx',
    // Отдельно найденный evaluator'ом краевой случай: API-маршрут Next.js
    // `app/api/...` даёт слаг `api`, а не `health` — исключение `health`
    // не срабатывает уровнем выше. Белый список чинит и его.
    'apps/web/src/app/api/health/route.ts',
  ];
  for (const path of noise) {
    assert.deepEqual(servicesFromPaths([path]), [], `${path} не должен давать карточку`);
  }
});

// Раунд 003: добавлен 13-й слаг, `vacancies` («Вакансии») — свой модуль
// API, свой маршрут и своя папка компонентов, но нет плитки в каталоге
// навигации (`seed.cjs`) — документированное исключение, см.
// `CATALOG_SERVICES_WITHOUT_SEED_ENTRY` в changed-paths-to-services.mjs и
// catalog-services-sync.test.mjs.
//
// VED-238, VED-116: 14-й слаг — `blog` («Блог-лента»), обычный сервис
// каталога с записью `Service` в сиде.
test('все 14 сервисов каталога распознаются (белый список литералами)', () => {
  const expected = [
    'union',
    'vedabase',
    'motivation',
    'library',
    'astro',
    'market',
    'chat',
    'music',
    'work',
    'notices',
    'wellness',
    'travel',
    'vacancies',
    'blog',
  ];
  assert.deepEqual([...CATALOG_SERVICES].sort(), [...expected].sort());
  for (const service of expected) {
    assert.deepEqual(
      servicesFromPaths([`apps/web/src/app/${service}/page.tsx`]),
      [service],
      `${service} должен распознаваться`,
    );
  }
});

// Раунд 001, Н2: тест итерировал сам EXCLUDED_SERVICES и проверял его же —
// мутация 'auth' → 'authX' оставляла сьют зелёным, потому что тест просто
// пошёл проверять другой (несуществующий) слаг. Фикс — литеральный список
// в самом тесте, а не производный от проверяемой константы.
test('EXCLUDED_SERVICES — точный литеральный список портальной инфраструктуры', () => {
  assert.deepEqual(EXCLUDED_SERVICES, [
    'auth',
    'moderation',
    'communities',
    'health',
    'stats',
    'assistant',
  ]);
});

test('каждый пункт списка исключений (путь литералом) не даёт сервис', () => {
  const paths = [
    'apps/api/src/modules/auth/x.ts',
    'apps/api/src/modules/moderation/x.ts',
    'apps/api/src/modules/communities/x.ts',
    'apps/api/src/modules/health/x.ts',
    'apps/api/src/modules/stats/x.ts',
    'apps/api/src/modules/assistant/x.ts',
  ];
  for (const path of paths) {
    assert.deepEqual(servicesFromPaths([path]), [], `${path} должен быть исключён`);
  }
});

test('несервисный путь не попадает в список', () => {
  assert.deepEqual(
    servicesFromPaths(['packages/shared/src/index.ts', '.github/workflows/ci.yml']),
    [],
  );
});

test('файл прямо в корне app/ или группы — не сервис', () => {
  assert.deepEqual(
    servicesFromPaths([
      'apps/web/src/app/layout.tsx',
      'apps/web/src/app/(portal)/layout.tsx',
    ]),
    [],
  );
});

test('файл прямо в корне apps/api/src/modules/ (без подпапки) — не сервис', () => {
  assert.deepEqual(servicesFromPaths(['apps/api/src/modules/README.md']), []);
});

// Раунд 001 (мутация evaluator'а «index >= length - 1» → «index >= length»):
// без белого списка эта граница ловилась почти всегда, но если имя
// файла-без-вложенности совпадает со слагом каталога, белый список её
// пропустит — нужен прямой тест именно на этот случай.
test('слаг каталога как файл без вложенности — не сервис (граничный случай off-by-one)', () => {
  assert.deepEqual(servicesFromPaths(['apps/web/src/app/market']), []);
  assert.deepEqual(servicesFromPaths(['apps/api/src/modules/market']), []);
});

test('один и тот же сервис из веба и API схлопывается в одну запись', () => {
  assert.deepEqual(
    servicesFromPaths([
      'apps/web/src/app/market/page.tsx',
      'apps/api/src/modules/market/market.controller.ts',
      'apps/web/src/components/market/price-tag.tsx',
    ]),
    ['market'],
  );
});

test('путь apps/mobile/** не считается вебом', () => {
  assert.deepEqual(
    servicesFromPaths(['apps/mobile/src/app/(tabs)/services.tsx']),
    [],
  );
});

test('несколько разных сервисов сохраняют порядок появления', () => {
  assert.deepEqual(
    servicesFromPaths([
      'apps/api/src/modules/notices/notices.controller.ts',
      'apps/web/src/app/(portal)/market/page.tsx',
    ]),
    ['notices', 'market'],
  );
});

test('пустой и не-массивовый вход не бросает исключение', () => {
  assert.deepEqual(servicesFromPaths([]), []);
  assert.deepEqual(servicesFromPaths(undefined), []);
});

// Раунд 001, Н3: карточка одного сервиса не должна нести пути другого —
// `groupChangedPathsByService` даёт run.mjs пути именно этого сервиса.
test('groupChangedPathsByService группирует пути по сервису, без чужих путей', () => {
  const grouped = groupChangedPathsByService([
    'apps/web/src/app/admin/music/catalog/page.tsx', // шум, не сервис
    'apps/web/src/app/(portal)/market/page.tsx',
    'apps/api/src/modules/market/market.controller.ts',
    'apps/api/src/modules/notices/notices.controller.ts',
  ]);

  assert.deepEqual([...grouped.keys()], ['market', 'notices']);
  assert.deepEqual(grouped.get('market'), [
    'apps/web/src/app/(portal)/market/page.tsx',
    'apps/api/src/modules/market/market.controller.ts',
  ]);
  assert.deepEqual(grouped.get('notices'), [
    'apps/api/src/modules/notices/notices.controller.ts',
  ]);
});

test('groupChangedPathsByService на пустом входе — пустая карта', () => {
  const grouped = groupChangedPathsByService([]);
  assert.equal(grouped.size, 0);
});

test('изменения только в тестах сервиса карточку не порождают (VED-285)', () => {
  // Живое ложное срабатывание: PR #413 тронул из портальной части только спеку.
  assert.deepEqual(
    servicesFromPaths(['apps/api/src/modules/chat/calls/chat-calls.service.spec.ts']),
    [],
  );
  assert.deepEqual(
    servicesFromPaths(['apps/web/src/components/market/__tests__/card.tsx']),
    [],
  );
  assert.deepEqual(servicesFromPaths(['apps/web/src/app/music/player.test.tsx']), []);
});

test('код рядом с тестом карточку порождает, но сам тест в её путях не упомянут', () => {
  const grouped = groupChangedPathsByService([
    'apps/api/src/modules/chat/chat-messages.service.spec.ts',
    'apps/api/src/modules/chat/chat-messages.service.ts',
  ]);
  assert.deepEqual([...grouped.keys()], ['chat']);
  assert.deepEqual(grouped.get('chat'), [
    'apps/api/src/modules/chat/chat-messages.service.ts',
  ]);
});

test('«spec» и «test» внутри имени папки или файла тестом не считаются', () => {
  assert.deepEqual(
    servicesFromPaths(['apps/web/src/app/market/specs/page.tsx']),
    ['market'],
  );
  assert.deepEqual(
    servicesFromPaths(['apps/api/src/modules/chat/latest-news.ts']),
    ['chat'],
  );
});
